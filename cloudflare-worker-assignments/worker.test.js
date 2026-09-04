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
      { status: 200, body: { login: 'Zdravkov14' } },
      { status: 404, body: {} },
      { status: 201, body: { name: 'filter-less-Zdravkov14' } },
      { status: 201, body: { id: 999 } },
      { status: 204 }
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
      { status: 200, body: { name: 'speller-Zdravkov14' } },
      { status: 204 }
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
