const API = '/api';

export async function login(canvasUrl, username, password) {
  const r = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ canvasUrl, username, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || 'INVALID_LOGIN');
  }
  return data;
}

export async function fetchAssignments(sessionId, courseId) {
  const r = await fetch(`${API}/courses/${encodeURIComponent(courseId)}/assignments`, {
    headers: { 'X-Session-Id': sessionId },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || 'LOAD_FAILED');
  }
  return data;
}
