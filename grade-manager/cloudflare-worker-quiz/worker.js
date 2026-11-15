/**
 * Cloudflare Worker - CS50 Quiz (server-side)
 *
 * Всичко чувствително живее тук, а не в браузъра:
 *  - паролата за достъп до теста и паролата за отключване (secrets)
 *  - въпросите с верните отговори (secret Gist, ID-то е secret)
 *  - оценяването (клиентът никога не получава верните отговори)
 *  - резултатите (Gist ID + GitHub token са secrets; четене/триене само за преподавател)
 *
 * Endpoints (всички POST, JSON, header "Authorization: Bearer <GitHub OAuth token на потребителя>"):
 *   /access  { facultyNumber, password }       -> { ticket }
 *   /start   { ticket }                        -> { session, questions:[{id,question,answers}], timeLimit, startedAt }
 *   /unlock  { session, password }             -> { ok }
 *   /submit  { session, answers:[int|null], tabSwitches } -> { score,total,percentage,timeTaken,completedAt,review:[...] }
 *   /results {}                                -> { results:[...] }   (само преподавател)
 *   /delete  { username }                      -> { success }         (само преподавател)
 *
 * Secrets (wrangler secret put ...):
 *   GITHUB_TOKEN             - PAT на преподавателя със scope "gist"
 *   QUIZ_RESULTS_GIST_ID     - secret Gist с quiz-results.json
 *   QUIZ_QUESTIONS_GIST_ID   - secret Gist с въпросите (Moodle XML)
 *   QUIZ_ACCESS_PASSWORD     - парола за достъп до теста
 *   TEACHER_UNLOCK_PASSWORD  - парола за отключване след смяна на таб
 *   SESSION_SECRET           - дълъг случаен низ за подписване на сесиите
 * Vars (wrangler.toml [vars]):
 *   ALLOWED_ORIGINS          - списък с origins, разделени със запетая
 *   TEACHER_LOGINS           - GitHub потребителски имена на преподавателите, разделени със запетая
 */

const QUESTION_COUNT = 25;
const TIME_LIMIT_SECONDS = 25 * 60;
const SUBMIT_GRACE_SECONDS = 120;      // толеранс за бавна мрежа при автоматично предаване
const ACCESS_TICKET_TTL_SECONDS = 30 * 60;
const QUESTIONS_CACHE_TTL_MS = 10 * 60 * 1000;
const RESULTS_FILE = 'quiz-results.json';

// Кеш в паметта на isolate-а (не е гарантиран, но спестява заявки към GitHub)
let questionsCache = { questions: null, fetchedAt: 0 };
const userCache = new Map(); // token -> { user, expires }

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }
    if (origin && !isAllowedOrigin(origin, env)) {
      return json({ error: 'Origin not allowed' }, 403, cors);
    }

    const missing = ['GITHUB_TOKEN', 'QUIZ_RESULTS_GIST_ID', 'QUIZ_QUESTIONS_GIST_ID',
      'QUIZ_ACCESS_PASSWORD', 'TEACHER_UNLOCK_PASSWORD', 'SESSION_SECRET'].filter(k => !env[k]);
    if (missing.length) {
      return json({ error: 'Worker not configured: ' + missing.join(', ') }, 500, cors);
    }

    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    try {
      const body = await request.json().catch(() => ({}));

      // Всички endpoints изискват валиден GitHub token на потребителя
      const user = await getGitHubUser(request.headers.get('Authorization'));
      if (!user) {
        return json({ error: 'Невалидна или липсваща GitHub автентикация' }, 401, cors);
      }

      switch (path) {
        case '/access':  return await handleAccess(body, user, env, cors);
        case '/start':   return await handleStart(body, user, env, cors);
        case '/unlock':  return await handleUnlock(body, user, env, cors);
        case '/submit':  return await handleSubmit(body, user, env, cors);
        case '/results': return await handleResults(user, env, cors);
        case '/delete':  return await handleDelete(body, user, env, cors);
        default:         return json({ error: 'Not found' }, 404, cors);
      }
    } catch (error) {
      console.error('Worker error:', error);
      return json({ error: 'Internal server error' }, 500, cors);
    }
  }
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleAccess(body, user, env, cors) {
  const facultyNumber = String(body.facultyNumber || '').trim();
  if (!/^\d{3}-\d{6}$/.test(facultyNumber)) {
    return json({ error: 'Невалиден факултетен номер' }, 400, cors);
  }
  if (!(await safeEqual(String(body.password || ''), env.QUIZ_ACCESS_PASSWORD))) {
    return json({ error: 'Грешна парола' }, 401, cors);
  }

  const results = await readResults(env);
  const previous = results.find(r => r.username === user.login);
  if (previous) {
    return json({ error: 'Вече сте решавали този тест', previous: publicResult(previous) }, 409, cors);
  }

  const ticket = await sign({
    t: 'access',
    u: user.login,
    f: facultyNumber,
    exp: Date.now() + ACCESS_TICKET_TTL_SECONDS * 1000
  }, env.SESSION_SECRET);

  return json({ ticket, username: user.login }, 200, cors);
}

async function handleStart(body, user, env, cors) {
  const ticket = await verify(body.ticket, env.SESSION_SECRET);
  if (!ticket || ticket.t !== 'access' || ticket.u !== user.login || ticket.exp < Date.now()) {
    return json({ error: 'Невалиден или изтекъл достъп. Въведете паролата отново.' }, 401, cors);
  }

  const results = await readResults(env);
  if (results.find(r => r.username === user.login)) {
    return json({ error: 'Вече сте решавали този тест' }, 409, cors);
  }

  const allQuestions = await loadQuestions(env);
  if (allQuestions.length === 0) {
    return json({ error: 'Няма налични въпроси' }, 500, cors);
  }

  // Случаен избор на въпроси + случаен ред на отговорите (на сървъра)
  const picked = shuffle(allQuestions.map((_, i) => i)).slice(0, Math.min(QUESTION_COUNT, allQuestions.length));
  const sessionQuestions = picked.map(qi => {
    const q = allQuestions[qi];
    const perm = shuffle(q.answers.map((_, i) => i)); // perm[displayIndex] = originalIndex
    return { i: qi, p: perm };
  });

  const startedAt = Date.now();
  const session = await sign({
    t: 'session',
    u: user.login,
    f: ticket.f,
    s: startedAt,
    n: randomId(),
    q: sessionQuestions
  }, env.SESSION_SECRET);

  const questions = sessionQuestions.map((sq, idx) => {
    const q = allQuestions[sq.i];
    return {
      id: idx,
      question: q.question,
      answers: sq.p.map(orig => q.answers[orig])
    };
  });

  return json({
    session,
    questions,
    timeLimit: TIME_LIMIT_SECONDS,
    startedAt: new Date(startedAt).toISOString()
  }, 200, cors);
}

async function handleUnlock(body, user, env, cors) {
  const session = await verify(body.session, env.SESSION_SECRET);
  if (!session || session.t !== 'session' || session.u !== user.login) {
    return json({ error: 'Невалидна сесия' }, 401, cors);
  }
  if (!(await safeEqual(String(body.password || ''), env.TEACHER_UNLOCK_PASSWORD))) {
    return json({ error: 'Грешна парола' }, 401, cors);
  }
  return json({ ok: true }, 200, cors);
}

async function handleSubmit(body, user, env, cors) {
  const session = await verify(body.session, env.SESSION_SECRET);
  if (!session || session.t !== 'session' || session.u !== user.login) {
    return json({ error: 'Невалидна сесия' }, 401, cors);
  }

  const now = Date.now();
  const elapsedSeconds = Math.floor((now - session.s) / 1000);
  if (elapsedSeconds > TIME_LIMIT_SECONDS + SUBMIT_GRACE_SECONDS) {
    return json({ error: 'Времето за теста е изтекло. Резултатът не е приет.' }, 410, cors);
  }

  const allQuestions = await loadQuestions(env);
  const answers = Array.isArray(body.answers) ? body.answers : [];

  let score = 0;
  const review = session.q.map((sq, idx) => {
    const q = allQuestions[sq.i];
    if (!q) {
      return { question: '(въпросът вече не съществува)', userAnswer: null, isCorrect: false };
    }
    const displayIdx = Number.isInteger(answers[idx]) ? answers[idx] : null;
    const originalIdx = displayIdx !== null && displayIdx >= 0 && displayIdx < sq.p.length ? sq.p[displayIdx] : null;
    const isCorrect = originalIdx !== null && originalIdx === q.correctAnswer;
    if (isCorrect) score++;
    return {
      question: q.question,
      userAnswer: originalIdx !== null ? q.answers[originalIdx] : null,
      isCorrect
    };
  });

  const total = session.q.length;
  const percentage = ((score / total) * 100).toFixed(2);
  const completedAt = new Date(now).toISOString();
  const timeTaken = Math.min(elapsedSeconds, TIME_LIMIT_SECONDS);

  const record = {
    username: user.login,
    facultyNumber: session.f,
    timestamp: completedAt,
    score,
    total,
    percentage,
    startedAt: new Date(session.s).toISOString(),
    completedAt,
    timeTaken,
    tabSwitches: Number.isInteger(body.tabSwitches) ? Math.max(0, body.tabSwitches) : 0,
    submittedAt: new Date().toISOString()
  };

  // Проверка непосредствено преди запис (само един опит на потребител)
  const results = await readResults(env);
  if (results.find(r => r.username === user.login)) {
    return json({ error: 'Вече сте решавали този тест' }, 409, cors);
  }
  results.push(record);
  await writeResults(env, results);

  return json({ score, total, percentage, timeTaken, completedAt, review }, 200, cors);
}

async function handleResults(user, env, cors) {
  if (!isTeacher(user, env)) {
    return json({ error: 'Само за преподаватели' }, 403, cors);
  }
  const results = await readResults(env);
  return json({ results }, 200, cors);
}

async function handleDelete(body, user, env, cors) {
  if (!isTeacher(user, env)) {
    return json({ error: 'Само за преподаватели' }, 403, cors);
  }
  const username = String(body.username || '').trim();
  if (!username) {
    return json({ error: 'Username is required' }, 400, cors);
  }
  const results = await readResults(env);
  const updated = results.filter(r => r.username !== username);
  if (updated.length === results.length) {
    return json({ error: 'Резултат не е намерен' }, 404, cors);
  }
  await writeResults(env, updated);
  return json({ success: true, message: 'Резултатът е изтрит успешно!' }, 200, cors);
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

async function getGitHubUser(authHeader) {
  const match = /^(?:Bearer|token)\s+(\S+)$/i.exec(authHeader || '');
  if (!match) return null;
  const token = match[1];

  const cached = userCache.get(token);
  if (cached && cached.expires > Date.now()) return cached.user;

  const res = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'CS50-Quiz-Worker'
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.login) return null;

  const user = { login: data.login, id: data.id };
  userCache.set(token, { user, expires: Date.now() + 60 * 1000 });
  if (userCache.size > 500) userCache.clear();
  return user;
}

function isTeacher(user, env) {
  const logins = String(env.TEACHER_LOGINS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return logins.includes(user.login.toLowerCase());
}

function gistHeaders(env, extra = {}) {
  return {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'CS50-Quiz-Worker',
    ...extra
  };
}

async function readResults(env) {
  const res = await fetch(`https://api.github.com/gists/${env.QUIZ_RESULTS_GIST_ID}`, {
    headers: gistHeaders(env)
  });
  if (!res.ok) throw new Error(`Results gist fetch failed: ${res.status}`);
  const data = await res.json();
  const content = data.files?.[RESULTS_FILE]?.content;
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeResults(env, results) {
  const res = await fetch(`https://api.github.com/gists/${env.QUIZ_RESULTS_GIST_ID}`, {
    method: 'PATCH',
    headers: gistHeaders(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ files: { [RESULTS_FILE]: { content: JSON.stringify(results, null, 2) } } })
  });
  if (!res.ok) throw new Error(`Results gist update failed: ${res.status}`);
}

async function loadQuestions(env) {
  if (questionsCache.questions && Date.now() - questionsCache.fetchedAt < QUESTIONS_CACHE_TTL_MS) {
    return questionsCache.questions;
  }
  const res = await fetch(`https://api.github.com/gists/${env.QUIZ_QUESTIONS_GIST_ID}`, {
    headers: gistHeaders(env)
  });
  if (!res.ok) throw new Error(`Questions gist fetch failed: ${res.status}`);
  const data = await res.json();
  const files = Object.values(data.files || {});
  const xmlFile = files.find(f => /\.xml$/i.test(f.filename)) || files[0];
  if (!xmlFile) throw new Error('Questions gist has no files');

  let xml = xmlFile.content;
  if (xmlFile.truncated && xmlFile.raw_url) {
    const raw = await fetch(xmlFile.raw_url, { headers: gistHeaders(env) });
    xml = await raw.text();
  }

  const questions = parseMoodleXML(xml);
  questionsCache = { questions, fetchedAt: Date.now() };
  return questions;
}

// ---------------------------------------------------------------------------
// Moodle XML parser (Workers нямат DOMParser; форматът е прост и генериран от наши скриптове)
// ---------------------------------------------------------------------------

function parseMoodleXML(xml) {
  const questions = [];
  const questionRe = /<question\s+type="multichoice"\s*>([\s\S]*?)<\/question>/g;
  let m;
  while ((m = questionRe.exec(xml)) !== null) {
    const block = m[1];
    const textMatch = /<questiontext[^>]*>\s*<text>([\s\S]*?)<\/text>/.exec(block);
    if (!textMatch) continue;
    const question = xmlText(textMatch[1]);

    const answers = [];
    let correctAnswer = -1;
    const answerRe = /<answer\s+fraction="([\d.]+)"[^>]*>\s*<text>([\s\S]*?)<\/text>/g;
    let a;
    while ((a = answerRe.exec(block)) !== null) {
      const fraction = parseFloat(a[1]);
      if (fraction === 100) correctAnswer = answers.length;
      answers.push(xmlText(a[2]));
    }
    if (answers.length === 0 || correctAnswer === -1) continue;

    questions.push({ question, answers, correctAnswer });
  }
  return questions;
}

function xmlText(raw) {
  const s = raw.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(s);
  if (cdata) return cdata[1].trim();
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Signing (HMAC-SHA256, base64url) - stateless сесии
// ---------------------------------------------------------------------------

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

async function sign(payload, secret) {
  const data = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

async function verify(token, secret) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = b64urlDecode(token.slice(dot + 1));
  if (!sig) return null;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data));
  if (!ok) return null;
  try {
    const bytes = b64urlDecode(data);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const ua = new Uint8Array(ha), ub = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  try {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function shuffle(arr) {
  const a = [...arr];
  const rnd = new Uint32Array(a.length);
  crypto.getRandomValues(rnd);
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return b64url(b);
}

function publicResult(r) {
  return { score: r.score, total: r.total, percentage: r.percentage, timestamp: r.timestamp };
}

function isAllowedOrigin(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(origin, env) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin && isAllowedOrigin(origin, env)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
