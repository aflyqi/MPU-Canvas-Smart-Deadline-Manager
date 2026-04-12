import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import {
  createCanvasSession,
  fetchAssignmentGroups,
  flattenAssignments,
  enrichCompletionStatus,
} from './canvasClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const PORT = Number(process.env.PORT) || 3847;
const TTL_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, { session: Awaited<ReturnType<typeof createCanvasSession>>, expires: number }>} */
const sessions = new Map();

function cleanSessions() {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (v.expires < now) sessions.delete(k);
  }
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '32kb' }));

app.post('/api/login', async (req, res) => {
  cleanSessions();
  const { canvasUrl, username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'NEED_CREDENTIALS' });
  }
  try {
    const session = await createCanvasSession(canvasUrl || 'https://canvas.example.edu', username, password);
    const sid = uuidv4();
    sessions.set(sid, { session, expires: Date.now() + TTL_MS });
    return res.json({
      sessionId: sid,
      baseUrl: session.baseUrl,
      courses: session.courses,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'INVALID_LOGIN';
    return res.status(401).json({ error: msg });
  }
});

app.get('/api/courses/:courseId/assignments', async (req, res) => {
  cleanSessions();
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;
  const raw = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const sid = typeof raw === 'string' ? raw : '';
  const entry = sessions.get(sid);
  if (!entry || entry.expires < Date.now()) {
    return res.status(401).json({ error: 'SESSION_INVALID' });
  }
  const { courseId } = req.params;
  try {
    const groups = await fetchAssignmentGroups(entry.session, courseId);
    const assignments = flattenAssignments(groups);
    assignments.sort((a, b) => {
      const ta = a.due_at ? Date.parse(a.due_at) : Infinity;
      const tb = b.due_at ? Date.parse(b.due_at) : Infinity;
      return ta - tb;
    });
    const assignmentsWithCompletion = await enrichCompletionStatus(
      entry.session,
      assignments,
      courseId
    );
    return res.json({ assignments: assignmentsWithCompletion, groups });
  } catch {
    return res.status(502).json({ error: 'LOAD_FAILED' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const dist = path.join(root, 'dist');
const hasDist = fs.existsSync(path.join(dist, 'index.html'));
if (hasDist) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Canvas DDL server http://127.0.0.1:${PORT}`);
});
