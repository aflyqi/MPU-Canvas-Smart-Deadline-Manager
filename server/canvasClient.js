import got from 'got';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';

function normalizeBaseUrl(input) {
  let u = String(input || '').trim();
  if (!u) throw new Error('NEED_CANVAS_URL');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  const parsed = new URL(u);
  if (!parsed.hostname) throw new Error('INVALID_CANVAS_URL');
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
}

async function getCsrfToken(cookieJar, origin) {
  const cookies = await cookieJar.getCookies(origin);
  const c = cookies.find((x) => x.key === '_csrf_token');
  if (!c?.value) return null;
  try {
    return decodeURIComponent(c.value);
  } catch {
    return c.value;
  }
}

function canvasJsonHeaders(cookieJar, origin) {
  return async () => {
    const token = await getCsrfToken(cookieJar, origin);
    const h = {
      Accept: 'application/json+canvas-string-ids, application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    };
    if (token) {
      h['X-CSRF-Token'] = token;
    }
    return h;
  };
}

function parseNextFromLinkHeader(linkHeader) {
  if (!linkHeader) return null;
  const parts = String(linkHeader).split(',');
  for (const p of parts) {
    const m = p.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

function extractPlannerCoursesFromHtml(html) {
  const marker = '"STUDENT_PLANNER_COURSES":';
  const i = html.indexOf(marker);
  if (i === -1) return null;
  let start = i + marker.length;
  while (start < html.length && /\s/.test(html[start])) start++;
  if (html[start] !== '[') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let quote = '';
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        const jsonSlice = html.slice(start, j + 1);
        try {
          return JSON.parse(jsonSlice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function createCanvasSession(baseUrlInput, username, password) {
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const origin = baseUrl;
  const cookieJar = new CookieJar();

  const client = got.extend({
    prefixUrl: baseUrl,
    cookieJar,
    followRedirect: true,
    https: { rejectUnauthorized: true },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    timeout: { request: 60000 },
    hooks: {
      beforeError: [
        (error) => {
          const b = error.response?.body;
          if (typeof b === 'string' && b.length > 500) {
            error.message = `${error.message} (${b.slice(0, 200)}…)`;
          }
          return error;
        },
      ],
    },
  });

  const loginPage = await client.get('login/ldap', { responseType: 'text' });
  const $ = cheerio.load(loginPage.body);
  const authenticityToken =
    $('input[name="authenticity_token"]').attr('value') ||
    $('meta[name="csrf-token"]').attr('content') ||
    null;
  if (!authenticityToken) {
    throw new Error('LOGIN_PAGE_ERROR');
  }

  const form = new URLSearchParams({
    utf8: '\u2713',
    authenticity_token: authenticityToken,
    redirect_to_ssl: '1',
    'pseudonym_session[unique_id]': username,
    'pseudonym_session[password]': password,
    'pseudonym_session[remember_me]': '0',
  });

  // 登录成功常返回 302/303/307 等到 `/?login_success=1`。若跟随重定向，307/308 会保留 POST，
  // 对仅接受 GET 的首页再 POST 会得到 404。必须用「不继承 extend 默认 followRedirect」的独立请求，
  // 并 maxRedirects: 0，避免仍去 POST `/?login_success=1`。
  const loginPageUrl = new URL('login/ldap', `${baseUrl}/`).href;
  const loginRes = await got.post(loginPageUrl, {
    cookieJar,
    followRedirect: false,
    maxRedirects: 0,
    throwHttpErrors: false,
    body: form.toString(),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Origin: baseUrl,
      Referer: `${baseUrl}/login/ldap`,
      'Upgrade-Insecure-Requests': '1',
    },
    timeout: { request: 60000 },
    https: { rejectUnauthorized: true },
  });

  const sc = loginRes.statusCode;
  const redirectOk = sc === 301 || sc === 302 || sc === 303 || sc === 307 || sc === 308;
  if (!redirectOk && sc !== 200) {
    if (sc === 400 || sc === 401 || sc === 403) {
      throw new Error('INVALID_LOGIN');
    }
    throw new Error(`LOGIN_HTTP_${sc}`);
  }

  const hdrs = canvasJsonHeaders(cookieJar, origin);

  try {
    await client.get('api/v1/users/self', {
      responseType: 'json',
      headers: await hdrs(),
    });
  } catch {
    throw new Error('INVALID_LOGIN');
  }

  let courses = [];
  try {
    const r = await client.get('api/v1/dashboard/dashboard_cards', {
      responseType: 'json',
      headers: await hdrs(),
    });
    const body = r.body;
    if (Array.isArray(body)) {
      courses = body.map((c) => {
        const id = c.id;
        return {
          id: String(id),
          shortName: c.shortName ?? c.short_name ?? c.name ?? `课程 ${id}`,
          longName: c.originalName ?? c.original_name ?? c.longName ?? c.shortName ?? String(id),
          courseCode: c.course_code ?? c.courseCode ?? null,
          term: c.term ?? c.enrollment_term_id ?? null,
          href: c.href ?? `/courses/${id}`,
        };
      });
    }
  } catch {
    /* fallback below */
  }

  if (!courses.length) {
    const home = await client.get('', { responseType: 'text' });
    const planner = extractPlannerCoursesFromHtml(home.body);
    if (Array.isArray(planner)) {
      courses = planner.map((c) => ({
        id: String(c.id),
        shortName: c.shortName ?? c.longName ?? String(c.id),
        longName: c.longName ?? c.shortName ?? String(c.id),
        courseCode: c.courseCode ?? null,
        term: c.term ?? null,
        href: c.href ?? `/courses/${c.id}`,
      }));
    }
  }

  return {
    baseUrl,
    cookieJar,
    getHeaders: hdrs,
    courses,
  };
}

export async function fetchAssignmentGroups(session, courseId) {
  const { baseUrl, cookieJar, getHeaders } = session;

  const client = got.extend({
    prefixUrl: baseUrl,
    cookieJar,
    followRedirect: true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    timeout: { request: 120000 },
  });

  const first = new URL(`/api/v1/courses/${courseId}/assignment_groups`, `${baseUrl}/`);
  first.searchParams.append('exclude_assignment_submission_types[]', 'wiki_page');
  first.searchParams.append('exclude_response_fields[]', 'description');
  first.searchParams.append('exclude_response_fields[]', 'rubric');
  first.searchParams.append('include[]', 'assignments');
  first.searchParams.append('include[]', 'discussion_topic');
  first.searchParams.set('override_assignment_dates', 'true');
  first.searchParams.set('per_page', '100');

  const groups = [];
  let pathWithQuery = first.pathname.slice(1) + first.search;

  while (pathWithQuery) {
    const res = await client.get(pathWithQuery, {
      responseType: 'json',
      headers: await getHeaders(),
    });
    const chunk = res.body;
    if (Array.isArray(chunk)) groups.push(...chunk);
    const nextAbs = parseNextFromLinkHeader(res.headers.link);
    if (!nextAbs) break;
    const nu = new URL(nextAbs);
    pathWithQuery = nu.pathname.slice(1) + nu.search;
  }

  return groups;
}

export function flattenAssignments(assignmentGroups) {
  const out = [];
  for (const g of assignmentGroups) {
    const list = g.assignments;
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      const st = a.submission_types;
      out.push({
        id: a.id,
        name: a.name,
        html_url: a.html_url,
        due_at: a.due_at,
        lock_at: a.lock_at,
        unlock_at: a.unlock_at,
        locked_for_user: a.locked_for_user,
        lock_explanation: a.lock_explanation ?? null,
        points_possible: a.points_possible,
        submission_types: st,
        workflow_state: a.workflow_state,
        groupName: g.name ?? null,
        quiz_id: a.quiz_id != null ? String(a.quiz_id) : null,
      });
    }
  }
  return out;
}

/** 仅 GET 页面，不修改 Canvas 任何数据 */
function resolveCanvasUrl(baseUrl, maybeRelative) {
  const s = String(maybeRelative || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(s.replace(/^\//, ''), base).href;
}

function extractQuizIdFromUrl(url) {
  const m = String(url || '').match(/\/quizzes\/(\d+)/i);
  return m ? m[1] : null;
}

function extractAssignmentIdFromUrl(url) {
  const m = String(url || '').match(/\/assignments\/(\d+)/i);
  return m ? m[1] : null;
}

/**
 * 判断本条应去哪个页面做只读完成度检测
 * - Quiz：`quiz_id` 或 submission_types 含 online_quiz 或 URL 含 /quizzes/
 * - Assignment：URL 含 /assignments/（且不按 Quiz 处理时）
 */
function classifyWorkItem(baseUrl, courseId, a) {
  const url = String(a.html_url || '');
  const types = Array.isArray(a.submission_types) ? a.submission_types : [];
  const isQuizType =
    Boolean(a.quiz_id) ||
    types.includes('online_quiz') ||
    /\/quizzes\/\d+/i.test(url);
  if (isQuizType) {
    const qid = a.quiz_id || extractQuizIdFromUrl(url);
    if (!qid) return { kind: 'unknown' };
    const u = `${baseUrl}/courses/${courseId}/quizzes/${qid}`;
    return { kind: 'quiz', url: u, quizId: qid };
  }
  if (/\/assignments\/\d+/i.test(url)) {
    return { kind: 'assignment', url: resolveCanvasUrl(baseUrl, url) };
  }
  const aid = extractAssignmentIdFromUrl(url);
  if (aid) {
    return { kind: 'assignment', url: `${baseUrl}/courses/${courseId}/assignments/${aid}` };
  }
  return { kind: 'unknown' };
}

function parseAssignmentPageComplete(html) {
  const $ = cheerio.load(html);
  const inProgress = $('span').toArray().some((el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    return t === 'In Progress' || /^in progress$/i.test(t);
  });
  // 有 In Progress → 未完成；没有 → 视为已完成（按需求）
  return !inProgress;
}

function parseQuizPageComplete(html) {
  const compact = String(html).replace(/\s+/g, ' ');
  if (/Last Attempt Details\s*[:：]/i.test(compact)) return true;
  if (/Submission Details\s*[:：]/i.test(compact)) return true;
  if (/Submission\s+Details\s*[:：]/i.test(compact)) return true;
  try {
    const $ = cheerio.load(html);
    const hit = $('div, span, h1, h2, h3, h4, strong, b').toArray().some((el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length > 400) return false;
      return (
        /Last Attempt Details\s*[:：]/i.test(t) || /Submission Details\s*[:：]/i.test(t)
      );
    });
    if (hit) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * 测验页常为前端渲染，首屏 HTML 可能没有 Submission Details；用只读 API 判断是否已提交完成。
 * GET /api/v1/courses/:course_id/quizzes/:quiz_id/submissions
 */
async function quizCompleteViaApi(session, courseId, quizId) {
  const { baseUrl, cookieJar, getHeaders } = session;
  const path = `api/v1/courses/${courseId}/quizzes/${quizId}/submissions`;
  try {
    const res = await got.get(`${baseUrl.replace(/\/$/, '')}/${path}`, {
      cookieJar,
      headers: await getHeaders(),
      responseType: 'json',
      timeout: { request: 20000 },
      https: { rejectUnauthorized: true },
      searchParams: { per_page: 50 },
    });
    const list = res.body?.quiz_submissions;
    if (!Array.isArray(list) || list.length === 0) return false;
    return list.some((qs) => {
      const st = qs.workflow_state;
      if (st === 'complete' || st === 'pending_review') return true;
      if (qs.finished_at) return true;
      return false;
    });
  } catch {
    return false;
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  for (let i = 0; i < items.length; i += limit) {
    const slice = items.slice(i, i + limit);
    const part = await Promise.all(slice.map((item, j) => fn(item, i + j)));
    part.forEach((v, j) => {
      out[i + j] = v;
    });
  }
  return out;
}

/**
 * 对每条作业只读 GET 详情页，解析是否已完成。
 * workComplete: true 已完成 | false 未完成 | null 无法判断（非 assignment/quiz 或请求失败）
 */
export async function enrichCompletionStatus(session, assignments, courseId) {
  const { baseUrl, cookieJar, getHeaders } = session;
  const hdrs = await getHeaders();
  const htmlHeaders = {
    ...hdrs,
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  };

  const fetchHtml = async (url) => {
    const res = await got.get(url, {
      cookieJar,
      followRedirect: true,
      responseType: 'text',
      headers: htmlHeaders,
      timeout: { request: 25000 },
      https: { rejectUnauthorized: true },
    });
    return res.body;
  };

  return mapPool(assignments, 4, async (a) => {
    const cls = classifyWorkItem(baseUrl, courseId, a);
    if (cls.kind === 'unknown') {
      return { ...a, workComplete: null, completionKind: null };
    }
    try {
      const html = await fetchHtml(cls.url);
      if (cls.kind === 'quiz') {
        let done = parseQuizPageComplete(html);
        if (!done && cls.quizId) {
          done = await quizCompleteViaApi(session, courseId, cls.quizId);
        }
        return { ...a, workComplete: done, completionKind: 'quiz' };
      }
      const done = parseAssignmentPageComplete(html);
      return { ...a, workComplete: done, completionKind: 'assignment' };
    } catch {
      return { ...a, workComplete: null, completionKind: cls.kind };
    }
  });
}
