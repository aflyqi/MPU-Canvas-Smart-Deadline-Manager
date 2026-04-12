const STORAGE_KEY = 'canvas-ddl:v1';

function normalizeBaseUrl(u) {
  try {
    const s = String(u || '').trim();
    const x = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return `${x.protocol}//${x.hostname}${x.port ? `:${x.port}` : ''}`;
  } catch {
    return String(u || '').trim();
  }
}

export function loadSavedCourseIds(baseUrl) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const map = data?.byBaseUrl && typeof data.byBaseUrl === 'object' ? data.byBaseUrl : {};
    const key = normalizeBaseUrl(baseUrl);
    const ids = map[key];
    return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCourseIds(baseUrl, courseIds) {
  const key = normalizeBaseUrl(baseUrl);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : { byBaseUrl: {} };
    if (!data.byBaseUrl || typeof data.byBaseUrl !== 'object') data.byBaseUrl = {};
    data.byBaseUrl[key] = [...new Set(courseIds.map(String))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}
