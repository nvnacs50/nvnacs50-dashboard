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
