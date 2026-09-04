// Cloudflare Worker: създава студентски repo-та от темплейт в организацията.
//
// Единственото място, където живее токенът на преподавателя. Токенът на
// студента идва в Authorization заглавието и се ползва само за да се установи
// кой е той и за да се приеме поканата — не се записва никъде.

import { ORG, resolveAssignment, studentRepoName, listAssignments } from './assignments.js';

const ALLOWED_ORIGINS = ['https://nvnacs50.github.io', 'http://localhost:3000'];
const GITHUB = 'https://api.github.com';
const USER_AGENT = 'nvnacs50-assignments-worker';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/assignments') {
      if (request.method !== 'GET') return fail(request, 405, 'method_not_allowed', 'Само GET.');
      return handleList(request, env);
    }

    if (url.pathname === '/accept') {
      if (request.method !== 'POST') return fail(request, 405, 'method_not_allowed', 'Само POST.');
      return handleAccept(request, env);
    }

    if (url.pathname === '/admin/toggle') {
      if (request.method !== 'POST') return fail(request, 405, 'method_not_allowed', 'Само POST.');
      return handleToggle(request, env);
    }

    return fail(request, 404, 'not_found', 'Няма такъв адрес.');
  }
};

async function handleList(request, env) {
  const assignments = listAssignments();
  const enabled = await Promise.all(
    assignments.map(a => env.ASSIGNMENTS.get(`enabled:${a.slug}`))
  );
  return json(
    request,
    200,
    assignments.map((a, i) => ({ ...a, enabled: enabled[i] !== '0' }))
  );
}

async function handleAccept(request, env) {
  const studentToken = bearer(request);
  if (!studentToken) {
    return fail(request, 401, 'no_token', 'Влез с GitHub, за да получиш задачата.');
  }

  const body = await request.json().catch(() => ({}));
  const assignment = resolveAssignment(body && body.assignment);
  if (!assignment) {
    return fail(request, 400, 'unknown_assignment',
      'Този линк е невалиден. Пиши на преподавателя.');
  }

  // Истинският потребител идва оттук и само оттук. Каквото и да носи тялото
  // на заявката, то не участва в името на repo-то.
  const userRes = await gh('/user', { token: studentToken });
  if (!userRes.ok) {
    return fail(request, 401, 'bad_token', 'Влизането е изтекло. Влез отново.');
  }
  const login = (await userRes.json()).login;

  if (await env.ASSIGNMENTS.get(`enabled:${assignment.slug}`) === '0') {
    return fail(request, 403, 'assignment_closed',
      'Записването за тази задача е затворено.');
  }

  if (!(await underRateLimit(env))) {
    return fail(request, 429, 'rate_limited',
      'Твърде много заявки в момента. Опитай след няколко минути.');
  }

  const repo = studentRepoName(assignment.slug, login);
  const teacherToken = env.GITHUB_TOKEN;

  const existing = await gh(`/repos/${ORG}/${repo}`, { token: teacherToken });
  let created = false;

  if (existing.status === 404) {
    const generated = await gh(`/repos/${ORG}/${assignment.template}/generate`, {
      token: teacherToken,
      method: 'POST',
      body: { owner: ORG, name: repo, private: true }
    });
    if (generated.status === 422) {
      return fail(request, 409, 'name_taken',
        'Има repo с това име, което не е твое. Пиши на преподавателя.');
    }
    if (!generated.ok) {
      return fail(request, 502, 'generate_failed',
        'GitHub отказа да създаде repo-то. Пиши на преподавателя.');
    }
    created = true;
    await bumpRateLimit(env);
  } else if (!existing.ok) {
    return fail(request, 502, 'lookup_failed',
      'GitHub не отговаря в момента. Опитай пак след минута.');
  }

  // Ако предишен опит е спрял тук, повторното цъкане минава по този път
  // и довършва достъпа върху вече създаденото repo.
  const collaborator = await gh(`/repos/${ORG}/${repo}/collaborators/${login}`, {
    token: teacherToken,
    method: 'PUT',
    body: { permission: 'push' }
  });

  if (collaborator.status === 201) {
    const invitation = await collaborator.json();
    // Без това GitHub праща имейл-покана и студентът трябва да я приеме ръчно.
    await gh(`/user/repository_invitations/${invitation.id}`, {
      token: studentToken,
      method: 'PATCH'
    });
  } else if (collaborator.status !== 204) {
    return fail(request, 502, 'access_failed',
      'Repo-то е създадено, но достъпът не бе даден. Пиши на преподавателя.');
  }

  return json(request, 200, { repo, url: `https://github.com/${ORG}/${repo}`, created });
}

const RATE_LIMIT_PER_HOUR = 200;

// Груб предпазител срещу изтекъл линк, попаднал в грешни ръце. Не е атомичен —
// при едновременни заявки може да пропусне някоя, което е приемливо за таван,
// чиято цел е да спре хиляди, а не да брои точно.
function rateKey() {
  return `rate:${new Date().toISOString().slice(0, 13)}`;
}

async function underRateLimit(env) {
  const current = parseInt((await env.ASSIGNMENTS.get(rateKey())) || '0', 10);
  return current < RATE_LIMIT_PER_HOUR;
}

async function bumpRateLimit(env) {
  const key = rateKey();
  const current = parseInt((await env.ASSIGNMENTS.get(key)) || '0', 10);
  await env.ASSIGNMENTS.put(key, String(current + 1), { expirationTtl: 7200 });
}

async function handleToggle(request, env) {
  const token = bearer(request);
  if (!token) return fail(request, 401, 'no_token', 'Липсва токен.');

  const membership = await gh(`/user/memberships/orgs/${ORG}`, { token });
  if (!membership.ok) {
    return fail(request, 403, 'not_admin', 'Само преподавател може да прави това.');
  }
  if ((await membership.json()).role !== 'admin') {
    return fail(request, 403, 'not_admin', 'Само преподавател може да прави това.');
  }

  const body = await request.json().catch(() => ({}));
  const assignment = resolveAssignment(body && body.assignment);
  if (!assignment) return fail(request, 400, 'unknown_assignment', 'Няма такава задача.');

  await env.ASSIGNMENTS.put(`enabled:${assignment.slug}`, body.enabled ? '1' : '0');
  return json(request, 200, { slug: assignment.slug, enabled: !!body.enabled });
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(request, status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
  });
}

function fail(request, status, error, message) {
  return json(request, status, { error, message });
}

function bearer(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function gh(path, { token, method = 'GET', body } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT
  };
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${GITHUB}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

export { bearer, gh, json, fail, corsHeaders };
