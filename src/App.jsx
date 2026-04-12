import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { login, fetchAssignments } from './api.js';
import { loadSavedCourseIds, saveCourseIds } from './storage.js';
import { getStoredLang, setStoredLang, t, translateError } from './i18n.js';

function GridBg() {
  return (
    <div className="grid-bg" aria-hidden>
      <motion.div
        className="orb orb-a"
        animate={{ x: [0, 40, 0], y: [0, -30, 0], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="orb orb-b"
        animate={{ x: [0, -50, 0], y: [0, 35, 0], opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="grid-lines" />
    </div>
  );
}

function isPastDue(iso) {
  if (!iso) return false;
  return Date.parse(iso) < Date.now();
}

export default function App() {
  const [lang, setLang] = useState(() => getStoredLang());
  const tr = useMemo(() => t(lang), [lang]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    setStoredLang(lang);
  }, [lang]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [lang]
  );

  const formatDue = useCallback(
    (iso) => {
      if (!iso) return tr.noDue;
      try {
        return dateFmt.format(new Date(iso));
      } catch {
        return iso;
      }
    },
    [dateFmt, tr.noDue]
  );

  const [canvasUrl, setCanvasUrl] = useState('https://canvas.institution.edu');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [courses, setCourses] = useState([]);

  /** @type {'login' | 'pick' | 'ddl'} */
  const [view, setView] = useState('login');
  const [pickedIds, setPickedIds] = useState(() => new Set());
  const [mergedAssignments, setMergedAssignments] = useState([]);
  const [loadingDdl, setLoadingDdl] = useState(false);
  const [filterCourseId, setFilterCourseId] = useState('all');
  const [showPastDue, setShowPastDue] = useState(false);

  const selectedCoursesOrdered = useMemo(() => {
    const set = pickedIds;
    return courses.filter((c) => set.has(c.id));
  }, [courses, pickedIds]);

  const displayedAssignments = useMemo(() => {
    let list = mergedAssignments;
    if (filterCourseId !== 'all') {
      list = list.filter((a) => a.courseId === filterCourseId);
    }
    if (!showPastDue) {
      list = list.filter((a) => !isPastDue(a.due_at));
    }
    return list;
  }, [mergedAssignments, filterCourseId, showPastDue]);

  const loadAssignmentsForIds = useCallback(
    async (ids, courseList, sidOverride) => {
      const sid = sidOverride ?? sessionId;
      if (!ids.length) {
        setMergedAssignments([]);
        return;
      }
      if (!sid) {
        setErr('SESSION_INVALID');
        return;
      }
      setLoadingDdl(true);
      setErr('');
      try {
        const results = await Promise.all(ids.map((id) => fetchAssignments(sid, id)));
        const merged = [];
        ids.forEach((id, idx) => {
          const course = courseList.find((c) => c.id === id);
          const name = course?.shortName || id;
          for (const a of results[idx].assignments || []) {
            merged.push({ ...a, courseId: id, courseName: name });
          }
        });
        merged.sort((a, b) => {
          const ta = a.due_at ? Date.parse(a.due_at) : Infinity;
          const tb = b.due_at ? Date.parse(b.due_at) : Infinity;
          return ta - tb;
        });
        setMergedAssignments(merged);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : 'LOAD_FAILED');
        setMergedAssignments([]);
      } finally {
        setLoadingDdl(false);
      }
    },
    [sessionId]
  );

  function applySavedSelectionAndRoute(data) {
    const list = data.courses || [];
    const saved = loadSavedCourseIds(data.baseUrl);
    const valid = saved.filter((id) => list.some((c) => c.id === id));
    if (valid.length > 0) {
      setPickedIds(new Set(valid));
      setView('ddl');
      setFilterCourseId('all');
      setShowPastDue(false);
      loadAssignmentsForIds(valid, list, data.sessionId);
    } else {
      const pre = new Set(saved.filter((id) => list.some((c) => c.id === id)));
      setPickedIds(pre);
      setView('pick');
      setMergedAssignments([]);
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const data = await login(canvasUrl.trim(), username.trim(), password);
      setSessionId(data.sessionId);
      setBaseUrl(data.baseUrl);
      setCourses(data.courses || []);
      setPassword('');
      applySavedSelectionAndRoute(data);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'INVALID_LOGIN');
    } finally {
      setBusy(false);
    }
  }

  function togglePick(id) {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllPick() {
    setPickedIds(new Set(courses.map((c) => c.id)));
  }

  function clearPick() {
    setPickedIds(new Set());
  }

  function confirmPick() {
    const ids = courses.filter((c) => pickedIds.has(c.id)).map((c) => c.id);
    if (!ids.length) {
      setErr('PICK_ONE');
      return;
    }
    setErr('');
    saveCourseIds(baseUrl, ids);
    setView('ddl');
    setFilterCourseId('all');
    setShowPastDue(false);
    loadAssignmentsForIds(ids, courses);
  }

  function goReselectCourses() {
    setView('pick');
    setErr('');
    setMergedAssignments([]);
  }

  function logout() {
    setSessionId('');
    setBaseUrl('');
    setCourses([]);
    setPickedIds(new Set());
    setMergedAssignments([]);
    setView('login');
    setErr('');
    setFilterCourseId('all');
    setShowPastDue(false);
  }

  const loggedIn = Boolean(sessionId);

  return (
    <div className="app">
      <GridBg />
      <header className="top">
        <motion.div
          className="brand"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="logo-dot" />
          <div>
            <div className="brand-title">Canvas DDL</div>
            <div className="brand-sub">{tr.brandSub}</div>
          </div>
        </motion.div>
        <div className="top-right">
          <div className="lang-switch" role="group" aria-label={tr.langLabel}>
            <button
              type="button"
              className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={`lang-btn ${lang === 'zh' ? 'active' : ''}`}
              onClick={() => setLang('zh')}
            >
              中文
            </button>
          </div>
          {loggedIn && (
            <motion.div
              className="top-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {view === 'ddl' && (
                <button type="button" className="btn ghost" onClick={goReselectCourses}>
                  {tr.reselectCourses}
                </button>
              )}
              <button type="button" className="btn ghost" onClick={logout}>
                {tr.logout}
              </button>
            </motion.div>
          )}
        </div>
      </header>

      <main className={`main ${view === 'ddl' ? 'main-wide' : ''}`}>
        <AnimatePresence mode="wait">
          {view === 'login' && (
            <motion.section
              key="login"
              className="panel hero"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <div className="hero-copy">
                <h1>{tr.loginTitle}</h1>
                <p>{tr.loginIntro}</p>
              </div>
              <form className="form" onSubmit={onLogin}>
                <label className="field">
                  <span>{tr.canvasUrl}</span>
                  <input
                    value={canvasUrl}
                    onChange={(e) => setCanvasUrl(e.target.value)}
                    placeholder="https://canvas.example.edu"
                    autoComplete="url"
                    required
                  />
                </label>
                <label className="field">
                  <span>{tr.username}</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </label>
                <label className="field">
                  <span>{tr.password}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                {err && (
                  <motion.p className="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {translateError(err, lang)}
                  </motion.p>
                )}
                <motion.button
                  type="submit"
                  className="btn primary"
                  disabled={busy}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {busy ? tr.loggingIn : tr.login}
                </motion.button>
              </form>
            </motion.section>
          )}

          {view === 'pick' && (
            <motion.section
              key="pick"
              className="panel dash pick-panel"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <div className="dash-head">
                <div>
                  <h2>{tr.pickTitle}</h2>
                  <p className="muted">
                    {tr.connected} <span className="mono">{baseUrl}</span>
                  </p>
                </div>
                <div className="pick-actions">
                  <button type="button" className="btn ghost sm" onClick={selectAllPick}>
                    {tr.selectAll}
                  </button>
                  <button type="button" className="btn ghost sm" onClick={clearPick}>
                    {tr.clear}
                  </button>
                </div>
              </div>
              {err && <p className="error pick-err">{translateError(err, lang)}</p>}
              {courses.length === 0 ? (
                <div className="empty-courses">
                  <p>{tr.noCourses}</p>
                </div>
              ) : (
                <ul className="pick-list">
                  {courses.map((c, i) => (
                    <motion.li
                      key={c.id}
                      className={`pick-item ${pickedIds.has(c.id) ? 'checked' : ''}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <label className="pick-label">
                        <input
                          type="checkbox"
                          checked={pickedIds.has(c.id)}
                          onChange={() => togglePick(c.id)}
                        />
                        <span className="pick-body">
                          <span className="course-code">{c.courseCode || tr.courseLabel}</span>
                          <span className="course-name">{c.shortName}</span>
                          {c.term && <span className="course-term">{c.term}</span>}
                        </span>
                      </label>
                    </motion.li>
                  ))}
                </ul>
              )}
              <div className="pick-footer">
                <motion.button
                  type="button"
                  className="btn primary"
                  onClick={confirmPick}
                  disabled={!courses.length}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {tr.viewDdl}
                </motion.button>
              </div>
            </motion.section>
          )}

          {view === 'ddl' && (
            <motion.section
              key="ddl"
              className="panel dash ddl-panel"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <div className="ddl-head">
                <div>
                  <h2>{tr.ddlTitle}</h2>
                  <p className="muted">{tr.ddlSubtitle}</p>
                </div>
                <label className="toggle-past">
                  <input
                    type="checkbox"
                    checked={showPastDue}
                    onChange={(e) => setShowPastDue(e.target.checked)}
                  />
                  <span>{tr.showPastDue}</span>
                </label>
              </div>
              {err && <p className="error ddl-err">{translateError(err, lang)}</p>}
              <div className="ddl-layout">
                <aside className="ddl-sidebar">
                  <div className="sb-title">{tr.filterByCourse}</div>
                  <button
                    type="button"
                    className={`sb-btn ${filterCourseId === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterCourseId('all')}
                  >
                    {tr.allCourses}
                  </button>
                  {selectedCoursesOrdered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`sb-btn ${filterCourseId === c.id ? 'active' : ''}`}
                      onClick={() => setFilterCourseId(c.id)}
                    >
                      {c.shortName}
                    </button>
                  ))}
                </aside>
                <div className="ddl-main">
                  {loadingDdl ? (
                    <div className="empty ddl-loading">
                      <motion.div
                        className="spinner"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                      />
                      <p>{tr.loadingAssignments}</p>
                    </div>
                  ) : (
                    <ul className="assign-list ddl-assign-list">
                      {displayedAssignments.length === 0 && !err && (
                        <li className="assign-row empty-row">
                          {mergedAssignments.length === 0
                            ? tr.noAssignments
                            : tr.noAssignmentsFiltered}
                        </li>
                      )}
                      {displayedAssignments.map((a, j) => (
                        <motion.li
                          key={`${a.courseId}-${a.id}`}
                          className={`assign-row ${isPastDue(a.due_at) ? 'past-due' : ''}`}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: j * 0.02 }}
                        >
                          <div className="assign-row-inner">
                            <div className="assign-left">
                              <div className="assign-main">
                                <span className="pill course-pill">{a.courseName}</span>
                                <a href={a.html_url} target="_blank" rel="noreferrer" className="assign-title">
                                  {a.name}
                                </a>
                                {a.groupName && <span className="pill">{a.groupName}</span>}
                              </div>
                              <div className="assign-meta">
                                <span className={`due ${a.due_at ? '' : 'muted'}`}>
                                  {formatDue(a.due_at)}
                                  {isPastDue(a.due_at) && (
                                    <span className="badge-late">{tr.overdue}</span>
                                  )}
                                </span>
                                {a.lock_explanation && (
                                  <span className="lock">{a.lock_explanation}</span>
                                )}
                              </div>
                            </div>
                            {a.workComplete === true && (
                              <div className="assign-done" title={tr.doneAria} aria-label={tr.doneAria}>
                                <span className="done-check">✓</span>
                              </div>
                            )}
                          </div>
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="foot">
        <span>{tr.footer}</span>
      </footer>

      <style>{`
        .app {
          min-height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
        }
        .grid-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
        }
        .orb {
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 50%;
          filter: blur(80px);
        }
        .orb-a {
          left: -120px;
          top: -80px;
          background: radial-gradient(circle at 30% 30%, rgba(124, 92, 255, 0.9), transparent 60%);
        }
        .orb-b {
          right: -160px;
          top: 10%;
          background: radial-gradient(circle at 50% 50%, rgba(46, 230, 214, 0.75), transparent 55%);
        }
        .grid-lines {
          position: absolute;
          inset: 0;
          background-image: linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at center, black 0%, transparent 72%);
          opacity: 0.5;
        }
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 28px clamp(20px, 4vw, 48px) 8px;
          position: relative;
          z-index: 1;
          gap: 12px;
          flex-wrap: wrap;
        }
        .top-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .top-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .lang-switch {
          display: inline-flex;
          border-radius: 10px;
          border: 1px solid var(--border);
          overflow: hidden;
          background: rgba(0, 0, 0, 0.15);
        }
        .lang-btn {
          border: none;
          background: transparent;
          color: var(--muted);
          padding: 8px 12px;
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 600;
          font-family: inherit;
        }
        .lang-btn:hover {
          color: var(--text);
        }
        .lang-btn.active {
          background: var(--surface2);
          color: var(--text);
        }
        .brand {
          display: flex;
          gap: 14px;
          align-items: center;
        }
        .logo-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          box-shadow: 0 0 24px rgba(124, 92, 255, 0.55);
        }
        .brand-title {
          font-weight: 700;
          letter-spacing: 0.02em;
          font-size: 1.15rem;
        }
        .brand-sub {
          font-size: 0.85rem;
          color: var(--muted);
          margin-top: 2px;
        }
        .main {
          flex: 1;
          padding: 12px clamp(20px, 4vw, 48px) 40px;
          max-width: 1120px;
          width: 100%;
          margin: 0 auto;
        }
        .main-wide {
          max-width: 1200px;
        }
        .panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          backdrop-filter: blur(18px);
        }
        .hero {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: clamp(24px, 4vw, 48px);
          padding: clamp(24px, 3vw, 40px);
        }
        @media (max-width: 880px) {
          .hero {
            grid-template-columns: 1fr;
          }
        }
        .hero-copy h1 {
          margin: 0 0 12px;
          font-size: clamp(1.6rem, 3vw, 2rem);
          letter-spacing: -0.02em;
        }
        .hero-copy p {
          margin: 0 0 16px;
          color: var(--muted);
          line-height: 1.6;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 8px 4px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.88rem;
          color: var(--muted);
        }
        .field input {
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: rgba(0, 0, 0, 0.25);
          color: var(--text);
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .field input:focus {
          border-color: rgba(124, 92, 255, 0.55);
          box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.18);
        }
        .btn {
          border: none;
          border-radius: 12px;
          padding: 12px 18px;
          cursor: pointer;
          font-weight: 600;
          transition: opacity 0.2s, transform 0.15s;
        }
        .btn.sm {
          padding: 8px 14px;
          font-size: 0.88rem;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn.primary {
          background: linear-gradient(135deg, var(--accent), #5a3ddb);
          color: #fff;
          margin-top: 4px;
        }
        .btn.ghost {
          background: var(--surface2);
          color: var(--text);
          border: 1px solid var(--border);
        }
        .error {
          color: #ffb4c4;
          font-size: 0.9rem;
          margin: 0;
        }
        .pick-err,
        .ddl-err {
          margin-bottom: 12px;
        }
        .dash {
          padding: clamp(20px, 2.5vw, 32px);
        }
        .dash-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .dash-head h2 {
          margin: 0 0 6px;
          font-size: 1.35rem;
        }
        .pick-actions {
          display: flex;
          gap: 8px;
        }
        .muted {
          color: var(--muted);
          font-size: 0.9rem;
          margin: 0;
        }
        .mono {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.82rem;
          word-break: break-all;
        }
        .empty-courses {
          padding: 14px;
          border-radius: 14px;
          border: 1px dashed var(--border);
          color: var(--muted);
          font-size: 0.9rem;
          line-height: 1.55;
        }
        .pick-list {
          list-style: none;
          margin: 16px 0 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: min(50vh, 520px);
          overflow: auto;
        }
        .pick-item {
          border-radius: 14px;
          border: 1px solid var(--border);
          background: rgba(0, 0, 0, 0.18);
          transition: border-color 0.2s, background 0.2s;
        }
        .pick-item.checked {
          border-color: rgba(46, 230, 214, 0.45);
          background: rgba(46, 230, 214, 0.06);
        }
        .pick-label {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 14px;
          cursor: pointer;
        }
        .pick-label input {
          margin-top: 4px;
          accent-color: var(--accent2);
        }
        .pick-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pick-footer {
          margin-top: 20px;
          display: flex;
          justify-content: flex-end;
        }
        .course-code {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: rgba(255, 255, 255, 0.45);
        }
        .course-name {
          font-weight: 600;
          line-height: 1.35;
        }
        .course-term {
          font-size: 0.8rem;
          color: var(--muted);
        }
        .ddl-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }
        .ddl-head h2 {
          margin: 0 0 4px;
          font-size: 1.35rem;
        }
        .toggle-past {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.85);
          cursor: pointer;
          user-select: none;
        }
        .toggle-past input {
          accent-color: var(--accent2);
          width: 18px;
          height: 18px;
        }
        .ddl-layout {
          display: grid;
          grid-template-columns: minmax(200px, 260px) 1fr;
          gap: 20px;
          margin-top: 16px;
        }
        @media (max-width: 720px) {
          .ddl-layout {
            grid-template-columns: 1fr;
          }
          .ddl-sidebar {
            flex-direction: row;
            flex-wrap: wrap;
            max-height: none;
          }
        }
        .ddl-sidebar {
          border-radius: 14px;
          border: 1px solid var(--border);
          background: rgba(0, 0, 0, 0.2);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: min(65vh, 640px);
          overflow: auto;
        }
        .sb-title {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
          padding: 4px 8px;
        }
        .sb-btn {
          text-align: left;
          border: 1px solid transparent;
          border-radius: 10px;
          padding: 10px 12px;
          background: transparent;
          color: var(--text);
          cursor: pointer;
          font-size: 0.88rem;
          line-height: 1.35;
          transition: background 0.2s, border-color 0.2s;
        }
        .sb-btn:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .sb-btn.active {
          border-color: rgba(124, 92, 255, 0.5);
          background: rgba(124, 92, 255, 0.12);
        }
        .ddl-main {
          border-radius: 14px;
          border: 1px solid var(--border);
          background: rgba(0, 0, 0, 0.18);
          min-height: 320px;
          padding: 12px 14px;
        }
        .ddl-loading {
          min-height: 280px;
        }
        .empty {
          color: var(--muted);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          text-align: center;
          padding: 12px;
        }
        .spinner {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 3px solid rgba(255, 255, 255, 0.15);
          border-top-color: var(--accent2);
        }
        .ddl-assign-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: min(58vh, 620px);
          overflow: auto;
        }
        .assign-row {
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          padding: 12px 14px;
        }
        .assign-row-inner {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }
        .assign-left {
          flex: 1;
          min-width: 0;
        }
        .assign-done {
          flex-shrink: 0;
          padding-top: 2px;
        }
        .done-check {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(46, 200, 130, 0.18);
          color: #5ee9a0;
          font-size: 1rem;
          font-weight: 700;
          line-height: 1;
          box-shadow: 0 0 20px rgba(46, 200, 130, 0.15);
        }
        .assign-row.past-due {
          opacity: 0.92;
          border-color: rgba(255, 120, 140, 0.25);
        }
        .empty-row {
          border-style: dashed;
          background: transparent;
          text-align: center;
        }
        .assign-main {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
        }
        .course-pill {
          background: rgba(46, 230, 214, 0.15) !important;
          color: rgba(200, 255, 248, 0.95) !important;
          max-width: 100%;
          word-break: break-word;
        }
        .assign-title {
          font-weight: 600;
          border-bottom: 1px solid transparent;
        }
        .assign-title:hover {
          border-bottom-color: rgba(255, 255, 255, 0.25);
        }
        .pill {
          font-size: 0.72rem;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(124, 92, 255, 0.2);
          color: rgba(255, 255, 255, 0.85);
        }
        .assign-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.86rem;
        }
        .due {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          color: rgba(255, 255, 255, 0.88);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .due.muted {
          color: var(--muted);
        }
        .badge-late {
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 6px;
          background: rgba(255, 100, 120, 0.25);
          color: #ffc9d2;
          font-family: 'DM Sans', sans-serif;
        }
        .lock {
          color: rgba(255, 200, 120, 0.95);
          line-height: 1.45;
        }
        .foot {
          padding: 20px clamp(20px, 4vw, 48px) 32px;
          color: rgba(255, 255, 255, 0.38);
          font-size: 0.82rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
