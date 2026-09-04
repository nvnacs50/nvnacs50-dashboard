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
  return fail(request, 501, 'not_implemented', 'Още не е готово.');
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
