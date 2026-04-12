const STORAGE_KEY = 'canvas-ddl-lang';

export function getStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch {
    /* ignore */
  }
  return 'en';
}

export function setStoredLang(lang) {
  try {
    if (lang === 'zh' || lang === 'en') localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export const locales = {
  en: {
    brandSub: 'Assignment deadlines · Session login',
    loginTitle: 'Connect to Canvas',
    loginIntro:
      'Sign in with your school account. Your session is used only to load courses and assignments. Selected courses can be remembered on this device (not your password).',
    canvasUrl: 'Canvas URL',
    username: 'Username',
    password: 'Password',
    login: 'Sign in',
    loggingIn: 'Signing in…',
    pickTitle: 'Choose courses',
    connected: 'Connected to',
    selectAll: 'Select all',
    clear: 'Clear',
    viewDdl: 'View deadlines',
    noCourses: 'No courses found. Try again later.',
    courseLabel: 'Course',
    pickOneCourse: 'Select at least one course.',
    ddlTitle: 'Deadlines',
    ddlSubtitle: 'Sorted by due date · earliest first',
    showPastDue: 'Show past-due work',
    filterByCourse: 'Filter',
    allCourses: 'All courses',
    loadingAssignments: 'Loading assignments…',
    noAssignments: 'No assignments',
    noAssignmentsFiltered: 'Nothing matches this filter. Try showing past-due items.',
    overdue: 'Past due',
    doneAria: 'Done',
    footer: 'For personal use · Course choices are saved locally without your password',
    reselectCourses: 'Change courses',
    logout: 'Log out',
    sessionInvalid: 'Session expired. Please sign in again.',
    loadFailed: 'Failed to load',
    langLabel: 'Language',
    noDue: 'No due date',
    errors: {
      invalidLogin: 'Incorrect username or password.',
      needCanvasUrl: 'Please enter your Canvas URL.',
      invalidCanvasUrl: 'Invalid Canvas URL.',
      loginPageError: 'Could not load the login page. Check the Canvas URL and login path.',
      loginUnavailable: 'Unable to sign in. Please try again later.',
      generic: 'Something went wrong.',
      needCredentials: 'Please enter your username and password.',
    },
  },
  zh: {
    brandSub: '作业截止一览 · 会话登录',
    loginTitle: '连接 Canvas',
    loginIntro:
      '使用学校账号登录；会话仅用于拉取课程与作业。可在本机记住所选课程（不含密码）。',
    canvasUrl: 'Canvas 地址',
    username: '账号',
    password: '密码',
    login: '登录',
    loggingIn: '正在登录…',
    pickTitle: '选择要关注的课程',
    connected: '已连接',
    selectAll: '全选',
    clear: '清空',
    viewDdl: '查看截止',
    noCourses: '未解析到课程，请稍后再试。',
    courseLabel: '课程',
    pickOneCourse: '请至少选择一门课程。',
    ddlTitle: '作业截止',
    ddlSubtitle: '按截止时间升序 · 越靠上越紧急',
    showPastDue: '显示已逾期作业',
    filterByCourse: '按科目筛选',
    allCourses: '全部科目',
    loadingAssignments: '正在加载作业…',
    noAssignments: '暂无作业',
    noAssignmentsFiltered: '当前筛选下无作业（可开启「显示已逾期」）',
    overdue: '已逾期',
    doneAria: '已完成',
    footer: '仅供个人使用 · 科目选择保存在本机，不含密码',
    reselectCourses: '重选科目',
    logout: '登出',
    sessionInvalid: '会话无效，请重新登录',
    loadFailed: '加载失败',
    langLabel: '语言',
    noDue: '无截止时间',
    errors: {
      invalidLogin: '账号或密码错误。',
      needCanvasUrl: '请填写 Canvas 地址。',
      invalidCanvasUrl: 'Canvas 地址无效。',
      loginPageError: '无法读取登录页，请检查地址与登录方式。',
      loginUnavailable: '暂时无法登录，请稍后再试。',
      generic: '出错了。',
      needCredentials: '请填写账号和密码。',
    },
  },
};

export function t(lang) {
  return locales[lang] || locales.en;
}

export function translateError(message, lang) {
  const L = t(lang).errors;
  const raw = String(message || '').trim();
  if (!raw) return L.generic;
  if (raw === 'INVALID_LOGIN') return L.invalidLogin;
  if (raw === 'NEED_CANVAS_URL') return L.needCanvasUrl;
  if (raw === 'INVALID_CANVAS_URL') return L.invalidCanvasUrl;
  if (raw === 'LOGIN_PAGE_ERROR') return L.loginPageError;
  const http = /^LOGIN_HTTP_(\d+)$/.exec(raw);
  if (http) {
    const code = Number(http[1]);
    if (code === 400 || code === 401 || code === 403) return L.invalidLogin;
    return L.loginUnavailable;
  }
  if (raw === 'NEED_CREDENTIALS') return t(lang).errors.needCredentials;
  if (raw === 'PICK_ONE') return t(lang).pickOneCourse;
  if (raw === 'SESSION_INVALID') return t(lang).sessionInvalid;
  if (raw === 'LOAD_FAILED') return t(lang).loadFailed;
  return raw;
}
