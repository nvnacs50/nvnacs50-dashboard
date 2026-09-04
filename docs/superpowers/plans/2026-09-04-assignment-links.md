# Линкове за задачи — план за имплементация

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Преподавателят генерира линк за задача; студентът го цъка, влиза с GitHub и получава private repo в `nvnacs50` от темплейт, с директен write достъп само за него.

**Architecture:** Нов Cloudflare Worker държи токена на преподавателя и е единственият, който създава repo-та. Статична страница `accept.html` е целта на линка и говори с Worker-а с токена на *студента*. Идемпотентността се пази от самия GitHub — `GET /repos/{org}/{slug}-{login}` е 200 или 404, така че няма собствена база и няма race conditions.

**Tech Stack:** Cloudflare Workers (ESM), Workers KV, vitest, ванилен JS за статичните страници, Next.js 15 (static export) за учителския изглед.

**Spec:** `docs/superpowers/specs/2026-09-04-assignment-links-design.md`

## Global Constraints

- Организация: `nvnacs50`. Никъде не се хардкодва друга.
- Име на студентско repo: `<slug>-<login>`, точно този вид, без префикс.
- `login` се взема **само** от `GET /user` с токена на студента. Ако заявката носи `username`, той се игнорира.
- Темплейтите са старите, с префикс `nvnacs50-classroom-fall2025-`. Мигрираните с кратки имена (описание „Migrated from GitHub Classroom") **не се ползват**.
- Създаваните repo-та са `private: true`, достъпът е `permission: "push"`.
- Име на Worker: `nvnacs50-assignments`. Очакван URL: `https://nvnacs50-assignments.m-avramova.workers.dev`.
- Сайт: `https://nvnacs50.github.io/nvnacs50-dashboard/`. Next.js `basePath` е `/nvnacs50-dashboard/teacher`.
- GitHub заявки носят `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28` и `User-Agent`.
- Никакъв токен не влиза в кода, в git или в лог. Токенът на преподавателя е Worker secret `GITHUB_TOKEN`; токенът на студента се ползва за две извиквания и не се записва.
- Работи се на клон `feat/assignment-links`. Спецификацията се комитва заедно с Task 1, за да не тръгва deploy от `main` заради документ.

---

### Task 1: Таблица задача → темплейт и чисти помощни функции

Тук няма мрежа. Това е ядрото, което всичко останало ползва, и единственото място, където живее картата.

**Files:**
- Create: `cloudflare-worker-assignments/assignments.js`
- Create: `cloudflare-worker-assignments/assignments.test.js`
- Create: `cloudflare-worker-assignments/package.json`

**Interfaces:**
- Consumes: нищо
- Produces:
  - `ORG` → `'nvnacs50'`
  - `TEMPLATE_PREFIX` → `'nvnacs50-classroom-fall2025-'`
  - `ASSIGNMENTS` → масив от `{slug: string, title: string, templateSuffix: string}`, 19 елемента
  - `resolveAssignment(slug: string)` → `{slug, title, template} | null`, където `template` е пълното име на repo-то
  - `studentRepoName(slug: string, login: string)` → `string`
  - `listAssignments()` → `[{slug, title}]` без `template`

- [ ] **Step 1: Създай `package.json`**

```json
{
  "name": "nvnacs50-assignments",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "vitest": "^5.0.0",
    "wrangler": "^4.129.0"
  }
}
```

Инсталирай: `cd cloudflare-worker-assignments && npm install`

- [ ] **Step 2: Напиши падащите тестове**

Файл `cloudflare-worker-assignments/assignments.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  ORG,
  ASSIGNMENTS,
  resolveAssignment,
  studentRepoName,
  listAssignments
} from './assignments.js';

describe('таблица задача → темплейт', () => {
  it('съдържа точно 19 задачи', () => {
    expect(ASSIGNMENTS).toHaveLength(19);
  });

  it('няма повтарящи се slug-ове', () => {
    const slugs = ASSIGNMENTS.map(a => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // Трите капана: съществуват дублирани темплейти с по-логични имена,
  // но реално използваните са тези. Данните идват от описанията на 422 repo-та.
  it('readability сочи темплейта с "test" в името', () => {
    expect(resolveAssignment('readability').template)
      .toBe('nvnacs50-classroom-fall2025-test-2023-fall-readability');
  });

  it('sort сочи дългия дублиран темплейт', () => {
    expect(resolveAssignment('sort').template)
      .toBe('nvnacs50-classroom-fall2025-sort-nvnacs50-classroom-fall2025-sort-sort-template');
  });

  it('volume сочи дългия дублиран темплейт', () => {
    expect(resolveAssignment('volume').template)
      .toBe('nvnacs50-classroom-fall2025-volume-nvnacs50-classroom-fall2025-volume');
  });

  it('всеки темплейт е с правилния префикс', () => {
    for (const a of ASSIGNMENTS) {
      expect(resolveAssignment(a.slug).template)
        .toMatch(/^nvnacs50-classroom-fall2025-/);
    }
  });

  it('връща null за непозната задача', () => {
    expect(resolveAssignment('nope')).toBeNull();
    expect(resolveAssignment('')).toBeNull();
    expect(resolveAssignment(null)).toBeNull();
  });

  it('не приема мигрираните кратки имена като темплейт', () => {
    for (const a of ASSIGNMENTS) {
      expect(resolveAssignment(a.slug).template).not.toBe(a.slug);
    }
  });
});

describe('studentRepoName', () => {
  it('слепва slug и login без промяна на регистъра', () => {
    expect(studentRepoName('filter-less', 'Zdravkov14')).toBe('filter-less-Zdravkov14');
  });

  it('пази тирета в username-а', () => {
    expect(studentRepoName('speller', 'Erkan-Ismailov')).toBe('speller-Erkan-Ismailov');
  });
});

describe('listAssignments', () => {
  it('не издава имената на темплейтите', () => {
    for (const a of listAssignments()) {
      expect(a).not.toHaveProperty('template');
      expect(a).not.toHaveProperty('templateSuffix');
      expect(a).toHaveProperty('slug');
      expect(a).toHaveProperty('title');
    }
  });
});

describe('ORG', () => {
  it('е nvnacs50', () => {
    expect(ORG).toBe('nvnacs50');
  });
});
```

- [ ] **Step 3: Пусни тестовете и виж, че падат**

Run: `cd cloudflare-worker-assignments && npm test`
Expected: FAIL — `Failed to resolve import "./assignments.js"`

- [ ] **Step 4: Напиши `assignments.js`**

```js
// Карта задача → темплейт за организацията nvnacs50.
//
// Извлечена е от описанията на 422 съществуващи студентски repo-та, не от
// интуиция: GitHub Classroom записва името на темплейта в описанието на всяко
// генерирано repo. Три от редовете изглеждат грешни, но не са — съществуват
// дублирани темплейти с по-логични имена, които обаче никога не са били
// използвани (readability, sort, volume). Виж спецификацията, раздел 6.
//
// Мигрираните темплейти с кратки имена (hello, speller, filter-less, ...,
// описание "Migrated from GitHub Classroom") НЕ се ползват.

export const ORG = 'nvnacs50';
export const TEMPLATE_PREFIX = 'nvnacs50-classroom-fall2025-';

export const ASSIGNMENTS = [
  { slug: 'hello',        title: 'Hello',                      templateSuffix: 'hello-2023-fall-hello-1' },
  { slug: 'mario-less',   title: 'Mario (less comfortable)',   templateSuffix: 'mario-less-2023-fall-mario-less' },
  { slug: 'mario-more',   title: 'Mario (more comfortable)',   templateSuffix: 'mario-more-2023-fall-mario-more' },
  { slug: 'cash',         title: 'Cash',                       templateSuffix: 'cash-2023-fall-cash' },
  { slug: 'credit',       title: 'Credit',                     templateSuffix: 'credit-2023-fall-credit' },
  { slug: 'scrabble',     title: 'Scrabble',                   templateSuffix: 'scrabble-scrabble-template' },
  { slug: 'readability',  title: 'Readability',                templateSuffix: 'test-2023-fall-readability' },
  { slug: 'caesar',       title: 'Caesar',                     templateSuffix: 'caesar-2023-fall-caesar' },
  { slug: 'substitution', title: 'Substitution',               templateSuffix: 'substitution-2023-fall-substitution' },
  { slug: 'sort',         title: 'Sort',                       templateSuffix: 'sort-nvnacs50-classroom-fall2025-sort-sort-template' },
  { slug: 'plurality',    title: 'Plurality',                  templateSuffix: 'plurality-2023-fall-plurality' },
  { slug: 'runoff',       title: 'Runoff',                     templateSuffix: 'runoff-2023-fall-runoff' },
  { slug: 'tideman',      title: 'Tideman',                    templateSuffix: 'tideman-2023-fall-tideman' },
  { slug: 'volume',       title: 'Volume',                     templateSuffix: 'volume-nvnacs50-classroom-fall2025-volume' },
  { slug: 'filter-less',  title: 'Filter (less comfortable)',  templateSuffix: 'filter-less-2023-fall-filter-less' },
  { slug: 'filter-more',  title: 'Filter (more comfortable)',  templateSuffix: 'filter-more-2023-fall-filter-more' },
  { slug: 'recover',      title: 'Recover',                    templateSuffix: 'recover-2023-fall-recover' },
  { slug: 'inheritance',  title: 'Inheritance',                templateSuffix: 'inheritance-inheritance-template' },
  { slug: 'speller',      title: 'Speller',                    templateSuffix: 'speller-2023-fall-speller' }
];

const BY_SLUG = new Map(ASSIGNMENTS.map(a => [a.slug, a]));

export function resolveAssignment(slug) {
  if (typeof slug !== 'string' || slug === '') return null;
  const found = BY_SLUG.get(slug);
  if (!found) return null;
  return {
    slug: found.slug,
    title: found.title,
    template: TEMPLATE_PREFIX + found.templateSuffix
  };
}

export function studentRepoName(slug, login) {
  return `${slug}-${login}`;
}

export function listAssignments() {
  return ASSIGNMENTS.map(({ slug, title }) => ({ slug, title }));
}
```

- [ ] **Step 5: Пусни тестовете и виж, че минават**

Run: `cd cloudflare-worker-assignments && npm test`
Expected: PASS, 11 теста

- [ ] **Step 6: Комитни**

```bash
git checkout -b feat/assignment-links
git add docs/superpowers/specs/2026-09-04-assignment-links-design.md \
        docs/superpowers/plans/2026-09-04-assignment-links.md \
        cloudflare-worker-assignments/
git commit -m "feat(assignments): карта задача-темплейт и чисти помощни функции"
```

---

### Task 2: Скелет на Worker-а, CORS и `GET /assignments`

**Files:**
- Create: `cloudflare-worker-assignments/worker.js`
- Create: `cloudflare-worker-assignments/worker.test.js`

**Interfaces:**
- Consumes: `ORG`, `resolveAssignment`, `studentRepoName`, `listAssignments` от `./assignments.js`
- Produces:
  - `export default { fetch(request, env) }`
  - `env.ASSIGNMENTS` — KV namespace binding, ключове `enabled:<slug>` (`'0'` = изключена) и `rate:<YYYY-MM-DDTHH>`
  - `env.GITHUB_TOKEN` — secret, токенът на преподавателя
  - Отговорите са JSON. При грешка: `{error: "<код>", message: "<текст на български>"}`

- [ ] **Step 1: Напиши падащите тестове**

Файл `cloudflare-worker-assignments/worker.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from './worker.js';

function kvStub(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: async (k) => (store.has(k) ? store.get(k) : null),
    put: async (k, v) => { store.set(k, v); },
    _store: store
  };
}

function makeEnv(overrides = {}) {
  return { GITHUB_TOKEN: 'teacher-token', ASSIGNMENTS: kvStub(), ...overrides };
}

const ORIGIN = 'https://nvnacs50.github.io';

describe('CORS', () => {
  it('отговаря на preflight от разрешен origin', async () => {
    const res = await worker.fetch(
      new Request('https://w.dev/accept', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
      makeEnv()
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('не разрешава непознат origin', async () => {
    const res = await worker.fetch(
      new Request('https://w.dev/accept', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
      makeEnv()
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('GET /assignments', () => {
  it('връща 19 задачи без имена на темплейти', async () => {
    const res = await worker.fetch(new Request('https://w.dev/assignments'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(19);
    expect(body[0]).not.toHaveProperty('template');
  });

  it('маркира изключена задача като enabled:false', async () => {
    const env = makeEnv({ ASSIGNMENTS: kvStub({ 'enabled:speller': '0' }) });
    const res = await worker.fetch(new Request('https://w.dev/assignments'), env);
    const body = await res.json();
    expect(body.find(a => a.slug === 'speller').enabled).toBe(false);
    expect(body.find(a => a.slug === 'hello').enabled).toBe(true);
  });
});

describe('маршрутизация', () => {
  it('връща 404 за непознат път', async () => {
    const res = await worker.fetch(new Request('https://w.dev/nope'), makeEnv());
    expect(res.status).toBe(404);
  });

  it('не приема GET на /accept', async () => {
    const res = await worker.fetch(new Request('https://w.dev/accept'), makeEnv());
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Пусни тестовете и виж, че падат**

Run: `cd cloudflare-worker-assignments && npm test worker.test.js`
Expected: FAIL — `Failed to resolve import "./worker.js"`

- [ ] **Step 3: Напиши скелета на `worker.js`**

```js
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
```

- [ ] **Step 4: Пусни тестовете и виж, че минават**

Run: `cd cloudflare-worker-assignments && npm test`
Expected: PASS

- [ ] **Step 5: Комитни**

```bash
git add cloudflare-worker-assignments/worker.js cloudflare-worker-assignments/worker.test.js
git commit -m "feat(assignments): скелет на Worker-а, CORS и GET /assignments"
```

---

### Task 3: `POST /accept` — създаване на repo и достъп

Сърцето на всичко. Осемте стъпки от спецификацията, раздел 5.1.

**Files:**
- Modify: `cloudflare-worker-assignments/worker.js`
- Modify: `cloudflare-worker-assignments/worker.test.js`

**Interfaces:**
- Consumes: `gh`, `bearer`, `json`, `fail` от Task 2; `resolveAssignment`, `studentRepoName` от Task 1
- Produces: `POST /accept`, тяло `{assignment: string}`, отговор `{repo: string, url: string, created: boolean}`

- [ ] **Step 1: Напиши падащите тестове**

Добави в `worker.test.js`:

```js
// Помощник: пуска поредица от отговори по ред на извикване и записва заявките.
function mockGitHub(responses) {
  const calls = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {},
                 body: init.body ? JSON.parse(init.body) : null });
    const next = responses.shift();
    if (!next) throw new Error(`Неочаквана заявка: ${init.method || 'GET'} ${url}`);
    return new Response(next.body === undefined ? null : JSON.stringify(next.body),
                        { status: next.status });
  });
  return calls;
}

function acceptRequest(assignment, extra = {}) {
  return new Request('https://w.dev/accept', {
    method: 'POST',
    headers: { Origin: ORIGIN, Authorization: 'Bearer student-token',
               'Content-Type': 'application/json' },
    body: JSON.stringify({ assignment, ...extra })
  });
}

describe('POST /accept', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('отказва без Authorization', async () => {
    const res = await worker.fetch(
      new Request('https://w.dev/accept', { method: 'POST', body: '{}' }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('отказва непозната задача, преди да пипне GitHub', async () => {
    const calls = mockGitHub([]);
    const res = await worker.fetch(acceptRequest('../../etc/passwd'), makeEnv());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unknown_assignment');
    expect(calls).toHaveLength(0);
  });

  it('пълен път: създава repo, добавя достъп и приема поканата', async () => {
    const calls = mockGitHub([
      { status: 200, body: { login: 'Zdravkov14' } },   // GET /user
      { status: 404, body: {} },                         // repo не съществува
      { status: 201, body: { name: 'filter-less-Zdravkov14' } }, // generate
      { status: 201, body: { id: 999 } },                // PUT collaborators
      { status: 204 }                                    // PATCH invitation
    ]);

    const res = await worker.fetch(acceptRequest('filter-less'), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      repo: 'filter-less-Zdravkov14',
      url: 'https://github.com/nvnacs50/filter-less-Zdravkov14',
      created: true
    });

    const generate = calls[2];
    expect(generate.url).toBe(
      'https://api.github.com/repos/nvnacs50/nvnacs50-classroom-fall2025-filter-less-2023-fall-filter-less/generate');
    expect(generate.body).toEqual({ owner: 'nvnacs50', name: 'filter-less-Zdravkov14', private: true });
    expect(generate.headers.Authorization).toBe('Bearer teacher-token');

    expect(calls[3].body).toEqual({ permission: 'push' });

    // Поканата се приема с токена на СТУДЕНТА, не на преподавателя
    expect(calls[4].url).toBe('https://api.github.com/user/repository_invitations/999');
    expect(calls[4].method).toBe('PATCH');
    expect(calls[4].headers.Authorization).toBe('Bearer student-token');
  });

  it('игнорира username, подаден в тялото', async () => {
    const calls = mockGitHub([
      { status: 200, body: { login: 'realstudent' } },
      { status: 404, body: {} },
      { status: 201, body: {} },
      { status: 204 }
    ]);
    await worker.fetch(acceptRequest('hello', { username: 'victim', login: 'victim' }), makeEnv());
    expect(calls[2].body.name).toBe('hello-realstudent');
  });

  it('идемпотентност: съществуващо repo не се пресъздава', async () => {
    const calls = mockGitHub([
      { status: 200, body: { login: 'Zdravkov14' } },
      { status: 200, body: { name: 'speller-Zdravkov14' } },  // вече съществува
      { status: 204 }                                          // PUT → вече collaborator
    ]);
    const res = await worker.fetch(acceptRequest('speller'), makeEnv());
    expect(await res.json()).toMatchObject({ created: false, repo: 'speller-Zdravkov14' });
    expect(calls.some(c => c.url.endsWith('/generate'))).toBe(false);
  });

  it('204 от collaborators не води до PATCH на покана', async () => {
    const calls = mockGitHub([
      { status: 200, body: { login: 'a' } },
      { status: 200, body: {} },
      { status: 204 }
    ]);
    await worker.fetch(acceptRequest('recover'), makeEnv());
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
  });

  it('невалиден токен на студента → 401', async () => {
    mockGitHub([{ status: 401, body: { message: 'Bad credentials' } }]);
    const res = await worker.fetch(acceptRequest('hello'), makeEnv());
    expect(res.status).toBe(401);
  });

  it('заето име при generate → 409 с обяснение', async () => {
    mockGitHub([
      { status: 200, body: { login: 'a' } },
      { status: 404, body: {} },
      { status: 422, body: { message: 'name already exists' } }
    ]);
    const res = await worker.fetch(acceptRequest('cash'), makeEnv());
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/преподавател/);
  });
});
```

- [ ] **Step 2: Пусни тестовете и виж, че падат**

Run: `cd cloudflare-worker-assignments && npm test`
Expected: FAIL — `/accept` връща 404

- [ ] **Step 3: Добави маршрута в `worker.js`**

В `fetch`, преди `return fail(request, 404, ...)`:

```js
    if (url.pathname === '/accept') {
      if (request.method !== 'POST') return fail(request, 405, 'method_not_allowed', 'Само POST.');
      return handleAccept(request, env);
    }
```

- [ ] **Step 4: Напиши `handleAccept`**

```js
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
```

- [ ] **Step 5: Пусни тестовете и виж, че минават**

Run: `cd cloudflare-worker-assignments && npm test`
Expected: PASS

- [ ] **Step 6: Комитни**

```bash
git add cloudflare-worker-assignments/
git commit -m "feat(assignments): POST /accept — създава repo от темплейт и дава достъп"
```

---

### Task 4: Изключване на задача и почасов лимит

**Files:**
- Modify: `cloudflare-worker-assignments/worker.js`
- Modify: `cloudflare-worker-assignments/worker.test.js`

**Interfaces:**
- Consumes: всичко от Task 3
- Produces: `POST /admin/toggle`, тяло `{assignment: string, enabled: boolean}`; KV ключове `enabled:<slug>` и `rate:<YYYY-MM-DDTHH>`

- [ ] **Step 1: Напиши падащите тестове**

Добави в `worker.test.js`:

```js
describe('изключена задача', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('връща 403 и не пипа GitHub', async () => {
    const calls = mockGitHub([{ status: 200, body: { login: 'a' } }]);
    const env = makeEnv({ ASSIGNMENTS: kvStub({ 'enabled:speller': '0' }) });
    const res = await worker.fetch(acceptRequest('speller'), env);
    expect(res.status).toBe(403);
    expect(calls.some(c => c.url.endsWith('/generate'))).toBe(false);
  });
});

describe('почасов лимит', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('връща 429 при достигнат таван', async () => {
    const hour = new Date().toISOString().slice(0, 13);
    const env = makeEnv({ ASSIGNMENTS: kvStub({ [`rate:${hour}`]: '200' }) });
    mockGitHub([{ status: 200, body: { login: 'a' } }]);
    const res = await worker.fetch(acceptRequest('hello'), env);
    expect(res.status).toBe(429);
  });

  it('брои само реални създавания, не повторни цъквания', async () => {
    const env = makeEnv();
    const hour = new Date().toISOString().slice(0, 13);
    mockGitHub([
      { status: 200, body: { login: 'a' } },
      { status: 200, body: {} },   // вече съществува
      { status: 204 }
    ]);
    await worker.fetch(acceptRequest('hello'), env);
    expect(await env.ASSIGNMENTS.get(`rate:${hour}`)).toBeNull();
  });
});

describe('POST /admin/toggle', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  function toggleRequest(assignment, enabled) {
    return new Request('https://w.dev/admin/toggle', {
      method: 'POST',
      headers: { Origin: ORIGIN, Authorization: 'Bearer teacher-oauth',
                 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignment, enabled })
    });
  }

  it('отказва на не-админ', async () => {
    mockGitHub([{ status: 200, body: { role: 'member' } }]);
    const res = await worker.fetch(toggleRequest('speller', false), makeEnv());
    expect(res.status).toBe(403);
  });

  it('отказва на човек извън организацията', async () => {
    mockGitHub([{ status: 404, body: {} }]);
    const res = await worker.fetch(toggleRequest('speller', false), makeEnv());
    expect(res.status).toBe(403);
  });

  it('админ изключва задача', async () => {
    mockGitHub([{ status: 200, body: { role: 'admin' } }]);
    const env = makeEnv();
    const res = await worker.fetch(toggleRequest('speller', false), env);
    expect(res.status).toBe(200);
    expect(await env.ASSIGNMENTS.get('enabled:speller')).toBe('0');
  });

  it('админ включва задача обратно', async () => {
    mockGitHub([{ status: 200, body: { role: 'admin' } }]);
    const env = makeEnv({ ASSIGNMENTS: kvStub({ 'enabled:speller': '0' }) });
    await worker.fetch(toggleRequest('speller', true), env);
    expect(await env.ASSIGNMENTS.get('enabled:speller')).toBe('1');
  });
});
```

- [ ] **Step 2: Пусни тестовете и виж, че падат**

Run: `cd cloudflare-worker-assignments && npm test`
Expected: FAIL — изключената задача връща 200, `/admin/toggle` връща 404

- [ ] **Step 3: Добави проверките в `handleAccept`**

Веднага след реда `const login = (await userRes.json()).login;`:

```js
  if (await env.ASSIGNMENTS.get(`enabled:${assignment.slug}`) === '0') {
    return fail(request, 403, 'assignment_closed',
      'Записването за тази задача е затворено.');
  }

  if (!(await underRateLimit(env))) {
    return fail(request, 429, 'rate_limited',
      'Твърде много заявки в момента. Опитай след няколко минути.');
  }
```

Веднага след `created = true;`:

```js
    await bumpRateLimit(env);
```

- [ ] **Step 4: Добави лимита и маршрута за toggle**

Помощните функции в края на `worker.js`:

```js
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
```

И маршрута в `fetch`, преди 404:

```js
    if (url.pathname === '/admin/toggle') {
      if (request.method !== 'POST') return fail(request, 405, 'method_not_allowed', 'Само POST.');
      return handleToggle(request, env);
    }
```

- [ ] **Step 5: Пусни тестовете и виж, че минават**

Run: `cd cloudflare-worker-assignments && npm test`
Expected: PASS

- [ ] **Step 6: Комитни**

```bash
git add cloudflare-worker-assignments/
git commit -m "feat(assignments): изключване на задача и почасов лимит"
```

---

### Task 5: Deploy на Worker-а и проверка с истински GitHub

Първият момент, в който се разбира дали fine-grained token-ът стига. Ако `generate` върне 403, резервният вариант е classic PAT с `repo` scope (спецификация, раздел 8).

**Files:**
- Create: `cloudflare-worker-assignments/wrangler.toml`
- Create: `cloudflare-worker-assignments/README.md`

**Interfaces:**
- Consumes: `worker.js`
- Produces: работещ Worker на `https://nvnacs50-assignments.m-avramova.workers.dev`; неговият URL става стойност на `ASSIGNMENTS_WORKER_URL` в Task 7

- [ ] **Step 1: Създай KV namespace**

```bash
cd cloudflare-worker-assignments
npx wrangler kv namespace create ASSIGNMENTS
```

Изходът съдържа `id = "..."`. Запиши го — влиза в следващата стъпка.

- [ ] **Step 2: Създай `wrangler.toml`**

Замени `<KV_ID>` с id-то от предната стъпка:

```toml
name = "nvnacs50-assignments"
main = "worker.js"
compatibility_date = "2026-09-01"

[[kv_namespaces]]
binding = "ASSIGNMENTS"
id = "<KV_ID>"

# GITHUB_TOKEN е secret, не се записва тук:
#   npx wrangler secret put GITHUB_TOKEN
```

- [ ] **Step 3: Сложи токена като secret**

Това го прави преподавателят — стойността се въвежда скрито:

```bash
npx wrangler secret put GITHUB_TOKEN
```

- [ ] **Step 4: Deploy**

```bash
npx wrangler deploy
```

Запиши URL-а от изхода.

- [ ] **Step 5: Провери `GET /assignments`**

```bash
curl -s https://nvnacs50-assignments.m-avramova.workers.dev/assignments | head -c 400
```

Expected: JSON масив с 19 обекта, всеки с `slug`, `title`, `enabled: true`

- [ ] **Step 6: Провери целия път с истинско създаване**

Преподавателят пуска това със *своя* OAuth токен от браузъра (localStorage, ключ `gh_token`), за да мине като „студент":

```bash
curl -s -X POST https://nvnacs50-assignments.m-avramova.workers.dev/accept \
  -H "Authorization: Bearer <твоят gh_token от браузъра>" \
  -H "Content-Type: application/json" \
  -d '{"assignment":"hello"}'
```

Expected: `{"repo":"hello-<твоят username>","url":"https://github.com/nvnacs50/hello-<username>","created":true}`

Ако върне `generate_failed`: fine-grained token-ът не стига. Направи classic PAT с `repo` scope и повтори Step 3 и Step 4.

- [ ] **Step 7: Провери идемпотентността и почисти**

Пусни същата команда втори път — очаква се `"created":false` и същият URL.

После изтрий тестовото repo от GitHub (Settings → Danger Zone → Delete this repository), защото ще обърка учителското табло.

- [ ] **Step 8: Напиши `README.md` и комитни**

Файл `cloudflare-worker-assignments/README.md`:

```markdown
# nvnacs50-assignments

Създава студентски repo-та от темплейт — заместител на пенсионирания GitHub Classroom.

Дизайн: `docs/superpowers/specs/2026-09-04-assignment-links-design.md`

## Endpoints

- `GET /assignments` — списък със задачи, публичен
- `POST /accept` — Bearer токен на студента, тяло `{"assignment":"filter-less"}`
- `POST /admin/toggle` — Bearer токен на преподавател (org admin)

## Настройка

    npx wrangler kv namespace create ASSIGNMENTS   # id-то влиза в wrangler.toml
    npx wrangler secret put GITHUB_TOKEN           # fine-grained PAT, виж по-долу
    npx wrangler deploy

Токенът е fine-grained, resource owner `nvnacs50`, **All repositories**,
Repository permissions: Administration (write), Contents (write), Metadata (read).
Организационни права не са нужни.

Изтича на 2027-09-05. Когато изтече, Worker-ът спира тихо — `/accept` започва
да връща `generate_failed`.

## Тестове

    npm install && npm test
```

```bash
git add cloudflare-worker-assignments/wrangler.toml cloudflare-worker-assignments/README.md
git commit -m "chore(assignments): wrangler конфигурация и документация"
```

---

### Task 6: Страницата, която студентът отваря

**Files:**
- Create: `grade-manager/public/accept.html`

**Interfaces:**
- Consumes: `CONFIG.ASSIGNMENTS_WORKER_URL`, `CONFIG.GITHUB_CLIENT_ID`, `CONFIG.REDIRECT_URI` от `config.js` (добавя се в Task 7); `POST /accept` от Task 3
- Produces: `sessionStorage.pending_assignment` — slug, който `callback.html` чете в Task 7

- [ ] **Step 1: Създай `accept.html`**

Оформлението следва `callback.html` — същият градиент и бяла карта, за да не изглежда като чужд сайт.

```html
<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Задача — CS50</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh; display: flex; align-items: center;
      justify-content: center; padding: 20px;
    }
    .card {
      background: white; padding: 3rem 2rem; border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;
      max-width: 460px; width: 100%;
    }
    h1 { color: #333; font-size: 1.5rem; margin-bottom: 0.25rem; }
    .slug { color: #667eea; font-family: monospace; font-size: 1.1rem; margin-bottom: 1.5rem; }
    p { color: #666; font-size: 0.95rem; line-height: 1.5; }
    .btn {
      display: inline-block; margin-top: 1.5rem; padding: 0.85rem 1.75rem;
      background: #667eea; color: white; border: none; border-radius: 8px;
      font-size: 1rem; font-weight: 600; cursor: pointer; text-decoration: none;
    }
    .btn:hover { background: #5a67d8; }
    .spinner {
      border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%;
      width: 44px; height: 44px; animation: spin 1s linear infinite; margin: 1.5rem auto 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error {
      background: #fff5f5; border: 1px solid #fc8181; color: #c53030;
      padding: 1rem; border-radius: 6px; margin-top: 1.5rem; font-size: 0.9rem;
    }
    .repo { font-family: monospace; color: #333; font-size: 0.95rem; margin-top: 0.5rem; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="heading">Задача</h1>
    <div class="slug" id="slug"></div>

    <div id="intro" hidden>
      <p>Влез с GitHub, за да получиш своето repo за тази задача.</p>
      <button class="btn" id="login">Влез с GitHub</button>
    </div>

    <div id="working" hidden>
      <p id="working-text">Подготвяме repo-то ти...</p>
      <div class="spinner"></div>
    </div>

    <div id="done" hidden>
      <p id="done-text"></p>
      <div class="repo" id="repo-name"></div>
      <a class="btn" id="open" href="#">Отвори repo-то</a>
    </div>

    <div class="error" id="error" hidden></div>
  </div>

  <script src="config.js"></script>
  <script>
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('a') || '';

    const el = (id) => document.getElementById(id);
    const show = (id) => { el(id).hidden = false; };
    const hide = (id) => { el(id).hidden = true; };

    function showError(message) {
      hide('working'); hide('intro');
      el('error').textContent = message;
      show('error');
    }

    el('slug').textContent = slug;

    if (!slug) {
      showError('Линкът е непълен. Пиши на преподавателя.');
    } else {
      start();
    }

    async function start() {
      // Заглавието идва от Worker-а, за да не се дублира списъкът със задачи тук.
      try {
        const res = await fetch(`${CONFIG.ASSIGNMENTS_WORKER_URL}/assignments`);
        const list = await res.json();
        const found = list.find(a => a.slug === slug);
        if (found) el('heading').textContent = found.title;
      } catch (e) {
        // Заглавието е козметика — ако не се зареди, продължаваме със slug-а.
      }

      const token = localStorage.getItem('gh_token');
      if (token) {
        accept(token);
      } else {
        show('intro');
      }
    }

    el('login').addEventListener('click', () => {
      // callback.html връща тук по тази следа, за да не се пипат
      // регистрираните callback URL-и на OAuth App-а.
      sessionStorage.setItem('pending_assignment', slug);

      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);

      const url = 'https://github.com/login/oauth/authorize'
        + `?client_id=${CONFIG.GITHUB_CLIENT_ID}`
        + `&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}`
        + `&scope=${encodeURIComponent('read:user repo')}`
        + `&state=${state}`;
      window.location.href = url;
    });

    async function accept(token) {
      hide('intro');
      show('working');

      let res, data;
      try {
        res = await fetch(`${CONFIG.ASSIGNMENTS_WORKER_URL}/accept`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignment: slug })
        });
        data = await res.json();
      } catch (e) {
        showError('Няма връзка със сървъра. Провери интернета и опитай пак.');
        return;
      }

      if (res.status === 401) {
        localStorage.removeItem('gh_token');
        hide('working');
        show('intro');
        el('intro').querySelector('p').textContent =
          'Влизането е изтекло. Влез отново, за да получиш задачата.';
        return;
      }

      if (!res.ok) {
        showError(data.message || 'Нещо се обърка. Пиши на преподавателя.');
        return;
      }

      hide('working');
      el('done-text').textContent = data.created
        ? 'Готово! Ето твоето repo:'
        : 'Вече имаш repo за тази задача:';
      el('repo-name').textContent = data.repo;
      el('open').href = data.url;
      show('done');
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Провери локално, че страницата се държи прилично без задача**

```bash
cd grade-manager/public && npx --yes http-server -p 8081 -c-1
```

Отвори `http://localhost:8081/accept.html` (без `?a=`).
Expected: показва „Линкът е непълен. Пиши на преподавателя."

Спри сървъра. Пълната проверка е в Task 7, след като `config.js` знае за Worker-а.

- [ ] **Step 3: Комитни**

```bash
git add grade-manager/public/accept.html
git commit -m "feat(assignments): страница accept.html за студента"
```

---

### Task 7: Свързване — config, callback и deploy

**Files:**
- Modify: `grade-manager/public/config.js`
- Modify: `grade-manager/public/student/config.js`
- Modify: `grade-manager/public/callback.html`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: URL-а на Worker-а от Task 5; `sessionStorage.pending_assignment` от Task 6
- Produces: `CONFIG.ASSIGNMENTS_WORKER_URL` — ползва се и от Task 8

- [ ] **Step 1: Добави Worker-а в двата конфига**

В `grade-manager/public/config.js` и `grade-manager/public/student/config.js`, вътре в обекта `CONFIG`, след `OAUTH_PROXY_URL`:

```js
  // Worker, който създава студентски repo-та от темплейт
  ASSIGNMENTS_WORKER_URL: 'https://nvnacs50-assignments.m-avramova.workers.dev',
```

- [ ] **Step 2: Върни студента към задачата след логин**

В `grade-manager/public/callback.html`, в `handleCallback`, веднага след реда
`localStorage.setItem('gh_role', orgRole);` и **преди** разпределянето по роля:

```js
        // Ако логинът е започнал от линк за задача, връщаме се там,
        // вместо в таблото.
        const pendingAssignment = sessionStorage.getItem('pending_assignment');
        if (pendingAssignment) {
          sessionStorage.removeItem('pending_assignment');
          statusEl.textContent = 'Подготвяме задачата...';
          setTimeout(() => {
            window.location.href =
              `${basePath}/accept.html?a=${encodeURIComponent(pendingAssignment)}`;
          }, 300);
          return;
        }
```

- [ ] **Step 3: Качвай `accept.html` при deploy**

В `.github/workflows/deploy.yml`, в стъпката „Prepare deployment structure", след реда
`cp grade-manager/public/config.js deploy-output/`:

```yaml
          cp grade-manager/public/accept.html deploy-output/
```

- [ ] **Step 4: Провери потока локално**

```bash
cd grade-manager/public && npx --yes http-server -p 8081 -c-1
```

Отвори `http://localhost:8081/accept.html?a=hello`.
Expected: заглавието се сменя на „Hello" (значи Worker-ът отговаря и CORS-ът работи от `localhost:8081`).

Ако браузърът блокира заявката с CORS грешка: добави `http://localhost:8081` в `ALLOWED_ORIGINS` в `worker.js` и deploy-ни пак, или направи проверката направо на публикувания сайт след Step 5.

- [ ] **Step 5: Комитни**

```bash
git add grade-manager/public/config.js grade-manager/public/student/config.js \
        grade-manager/public/callback.html .github/workflows/deploy.yml
git commit -m "feat(assignments): свързване на accept.html с Worker-а и OAuth потока"
```

---

### Task 8: Учителски изглед със списък линкове

**Files:**
- Create: `grade-manager/src/app/assignments/page.tsx`
- Modify: `grade-manager/src/app/page.tsx:327` (до бутона „Quiz Резултати")

**Interfaces:**
- Consumes: `GET /assignments` и `POST /admin/toggle` от Worker-а; `cacheManager.getFromCache<Student[]>('students')` от `../../lib/cache-manager`
- Produces: маршрут `/nvnacs50-dashboard/teacher/assignments`

- [ ] **Step 1: Създай страницата**

Файл `grade-manager/src/app/assignments/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { cacheManager } from '../../lib/cache-manager';
import { Student } from '../../lib/github-classroom-api';

const WORKER_URL = 'https://nvnacs50-assignments.m-avramova.workers.dev';
const SITE_BASE = 'https://nvnacs50.github.io/nvnacs50-dashboard';

interface AssignmentRow {
  slug: string;
  title: string;
  enabled: boolean;
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${WORKER_URL}/assignments`);
      if (!res.ok) throw new Error('Worker-ът не отговаря');
      const rows: AssignmentRow[] = await res.json();
      setAssignments(rows);

      // Броят приели се смята от кеша, който таблото вече е напълнило —
      // нула допълнителни заявки към GitHub. Ако кешът е празен, показваме "—".
      //
      // Броим по префикс срещу известните slug-ове, а НЕ като режем repo-то
      // при последното тире: има студенти с тире в username-а
      // (speller-Erkan-Ismailov), които така биха се преброили погрешно.
      // Нито един slug не е префикс на друг, така че съвпадението е еднозначно.
      const students = await cacheManager.getFromCache<Student[]>('students');
      if (students) {
        const tally: Record<string, number> = {};
        for (const row of rows) {
          tally[row.slug] = students.filter(student =>
            student.assignments.some(assignment =>
              (assignment.repoName || '').toLowerCase().startsWith(`${row.slug}-`)
            )
          ).length;
        }
        setCounts(tally);
      }
    } catch (e: any) {
      setError(e.message || 'Неуспешно зареждане');
    } finally {
      setLoading(false);
    }
  }

  function linkFor(slug: string) {
    return `${SITE_BASE}/accept.html?a=${slug}`;
  }

  async function copy(slug: string) {
    await navigator.clipboard.writeText(linkFor(slug));
    setCopied(slug);
    setTimeout(() => setCopied(null), 1500);
  }

  async function toggle(slug: string, enabled: boolean) {
    const token = localStorage.getItem('gh_token');
    if (!token) {
      setError('Влизането е изтекло. Влез отново.');
      return;
    }

    setToggling(slug);
    try {
      const res = await fetch(`${WORKER_URL}/admin/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment: slug, enabled })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Неуспешна промяна');
      }
      setAssignments(prev => prev.map(a => (a.slug === slug ? { ...a, enabled } : a)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Линкове за задачи</h1>
            <p className="text-sm text-gray-600 mt-1">
              Дай линка на студентите. Който го отвори, получава private repo с достъп само за него.
            </p>
          </div>
          <a
            href="/nvnacs50-dashboard/teacher"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            ← Към таблото
          </a>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-gray-500">Зареждане...</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Задача</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Приели</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Линк</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Записване</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assignments.map(a => (
                  <tr key={a.slug} className={a.enabled ? '' : 'bg-gray-50'}>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{a.title}</div>
                      <div className="text-xs text-gray-500 font-mono">{a.slug}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {counts ? (counts[a.slug] || 0) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => copy(a.slug)}
                        className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm text-blue-700 bg-blue-50 hover:bg-blue-100"
                      >
                        {copied === a.slug ? '✓ Копирано' : 'Копирай линка'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggle(a.slug, !a.enabled)}
                        disabled={toggling === a.slug}
                        className={
                          a.enabled
                            ? 'px-3 py-1.5 rounded-lg text-sm text-green-700 bg-green-50 border border-green-300 hover:bg-green-100 disabled:opacity-50'
                            : 'px-3 py-1.5 rounded-lg text-sm text-gray-600 bg-gray-100 border border-gray-300 hover:bg-gray-200 disabled:opacity-50'
                        }
                      >
                        {a.enabled ? 'Отворено' : 'Затворено'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {counts === null && !loading && (
          <p className="mt-4 text-xs text-gray-500">
            Броят приели се показва, след като заредиш таблото поне веднъж.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Добави бутон в таблото**

В `grade-manager/src/app/page.tsx`, непосредствено преди коментара `{/* Quiz Results Button */}` на ред 327:

```tsx
              {/* Assignment Links Button */}
              <a
                href="/nvnacs50-dashboard/teacher/assignments"
                className="inline-flex items-center px-4 py-2 border border-blue-300 shadow-sm text-sm font-medium rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                🔗 Линкове за задачи
              </a>

```

- [ ] **Step 3: Провери, че се билдва**

```bash
cd grade-manager && npm run build
```

Expected: билдът минава и в изхода се вижда маршрут `/assignments`

- [ ] **Step 4: Комитни**

```bash
git add grade-manager/src/app/assignments/page.tsx grade-manager/src/app/page.tsx
git commit -m "feat(assignments): учителски изглед с линкове и превключвател"
```

---

### Task 9: Проверка от край до край

**Files:** няма промени; това е приемателен тест

- [ ] **Step 1: Слей и публикувай**

```bash
git checkout main && git merge --no-ff feat/assignment-links
git push origin main
```

Изчакай GitHub Actions да завърши deploy-а.

- [ ] **Step 2: Провери учителския изглед**

Отвори `https://nvnacs50.github.io/nvnacs50-dashboard/teacher/assignments`.
Expected: 19 реда, всичките „Отворено", работещ бутон за копиране.

- [ ] **Step 3: Провери с истински студентски акаунт**

Отвори копирания линк в прозорец „инкогнито" и влез с акаунт, който **не е** член на организацията.

Expected: repo-то се създава, студентът вижда линк към него и го отваря без да е приемал покана по имейл.

- [ ] **Step 4: Провери, че резултатът е точно този от скрийншота**

В `https://github.com/nvnacs50/<slug>-<username>/settings/access`:

Expected: Private repository; Direct access — 1 entity; студентът с `Role: write` и етикет `Outside Collaborator`

- [ ] **Step 5: Провери, че таблото го вижда**

Отвори учителското табло и пусни синхронизация.
Expected: новото repo се появява като задача на този студент

- [ ] **Step 6: Провери затварянето**

Затвори задачата от учителския изглед, отвори линка пак с друг акаунт.
Expected: „Записването за тази задача е затворено."

Отвори я обратно.

- [ ] **Step 7: Почисти**

Изтрий тестовите repo-та, създадени в стъпки 3 и 6.

---

## Проверка на плана спрямо спецификацията

| Раздел от спецификацията | Покрит от |
|---|---|
| 5.1 Worker, `GET /assignments` | Task 2 |
| 5.1 Worker, `POST /accept` (стъпки 1–8) | Task 3, Task 4 |
| 5.1 Worker, `POST /admin/toggle` | Task 4 |
| 5.2 `accept.html` | Task 6 |
| 5.3 промяна в `callback.html` | Task 7 |
| 5.4 учителски изглед | Task 8 |
| 5.5 конфигурация и deploy | Task 7 |
| 6 таблица задача → темплейт | Task 1 |
| 7 състояние (KV, идемпотентност) | Task 3, Task 4 |
| 8 сигурност | Task 3 (username от `/user`), Task 4 (admin, лимит), Task 5 (secret) |
| 9 грешки | Task 3, Task 6 |
| 10 тестове | Task 1–4, Task 9 |
| 11 ръчни стъпки | Task 5 |
