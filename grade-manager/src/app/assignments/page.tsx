'use client';

import { useState, useEffect } from 'react';
import { cacheManager } from '../../lib/cache-manager';
import { Student } from '../../lib/github-classroom-api';

const WORKER_URL = 'https://nvnacs50-assignments.m-avramova.workers.dev';
const SITE_BASE = 'https://nvnacs50.github.io/nvnacs50-dashboard';

// В коя седмица от CS50 попада всяка задача. Оттам идва и цветът на реда —
// не е украса, а информация: 1 функции · 2 масиви · 3 алгоритми ·
// 4 памет · 5 структури от данни.
const WEEK: Record<string, number> = {
  hello: 1, 'mario-less': 1, 'mario-more': 1, cash: 1, credit: 1,
  scrabble: 2, readability: 2, caesar: 2, substitution: 2,
  sort: 3, plurality: 3, runoff: 3, tideman: 3,
  volume: 4, 'filter-less': 4, 'filter-more': 4, recover: 4,
  inheritance: 5, speller: 5,
};

const WEEK_LABEL: Record<number, string> = {
  1: 'Функции', 2: 'Масиви', 3: 'Алгоритми', 4: 'Памет', 5: 'Структури от данни',
};

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

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const peak = counts ? Math.max(1, ...Object.values(counts)) : 1;
  const openCount = assignments.filter(a => a.enabled).length;

  // Разбивка по седмици за лентата най-горе.
  const byWeek = [1, 2, 3, 4, 5].map(week => ({
    week,
    label: WEEK_LABEL[week],
    count: counts
      ? assignments
          .filter(a => WEEK[a.slug] === week)
          .reduce((sum, a) => sum + (counts[a.slug] || 0), 0)
      : 0,
  }));

  return (
    <div className="min-h-screen bg-ground font-ui text-ink">
      <div className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-6">

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Линкове за задачи</h1>
            <p className="mt-1 text-sm text-muted max-w-prose">
              Дай линка на студентите. Който го отвори, получава private repo с достъп само за него.
            </p>
          </div>
          <a
            href="/nvnacs50-dashboard/teacher"
            className="rounded-box border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong"
          >
            ← Към таблото
          </a>
        </header>

        {error && (
          <div className="rounded-box border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Обобщение: колко задачи са раздадени и как се разпределят по седмици */}
        <section className="rounded-card border border-line bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {counts ? 'Раздадени задачи' : 'Задачи в курса'}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {counts ? total : assignments.length}
                <span className="ml-2 text-sm font-medium text-muted">
                  {counts ? 'repo-та в организацията' : 'готови за раздаване'}
                </span>
              </p>
            </div>
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink tabular-nums">{openCount}</span> от{' '}
              <span className="tabular-nums">{assignments.length}</span> задачи приемат записване
            </p>
          </div>

          {counts && total > 0 && (
            <>
              <div className="mt-4 flex h-2 gap-1 overflow-hidden rounded-pill">
                {byWeek.filter(w => w.count > 0).map(w => (
                  <span
                    key={w.week}
                    className="h-full rounded-pill"
                    style={{ width: `${(w.count / total) * 100}%`, background: `var(--wk${w.week})` }}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                {byWeek.map(w => (
                  <span key={w.week} className="flex items-center gap-2 text-xs text-muted">
                    <i
                      className="h-2 w-2 rounded-pill"
                      style={{ background: `var(--wk${w.week})` }}
                      aria-hidden="true"
                    />
                    Седмица {w.week} · {w.label}
                    <b className="font-semibold text-ink tabular-nums">{w.count}</b>
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Списъкът */}
        <section className="rounded-card border border-line bg-surface shadow-card overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-muted">Зареждане…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse tabular-nums">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-5 py-3.5 text-left text-xs font-medium text-muted">Задача</th>
                    <th className="px-5 py-3.5 text-left text-xs font-medium text-muted">Приели</th>
                    <th className="px-5 py-3.5 text-left text-xs font-medium text-muted">Линк</th>
                    <th className="px-5 py-3.5 text-left text-xs font-medium text-muted">Записване</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => {
                    const week = WEEK[a.slug] ?? 1;
                    const n = counts ? counts[a.slug] || 0 : null;
                    return (
                      <tr key={a.slug} className="border-b border-line last:border-b-0">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-box text-sm font-bold"
                              style={{ background: `var(--wk${week}-soft)`, color: `var(--wk${week})` }}
                              title={`Седмица ${week} · ${WEEK_LABEL[week]}`}
                            >
                              {week}
                            </span>
                            <span>
                              <span className="block text-sm font-semibold leading-tight">{a.title}</span>
                              <span className="block font-mono text-xs text-muted">{a.slug}</span>
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          {n === null ? (
                            <span className="text-sm text-muted">—</span>
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <b className="w-6 text-sm font-bold">{n}</b>
                              <span className="h-1.5 w-20 overflow-hidden rounded-pill bg-sunken">
                                <i
                                  className="block h-full rounded-pill"
                                  style={{ width: `${(n / peak) * 100}%`, background: `var(--wk${week})` }}
                                />
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => copy(a.slug)}
                            className="rounded-chip border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-primary hover:text-primary"
                          >
                            {copied === a.slug ? '✓ Копирано' : 'Копирай'}
                          </button>
                        </td>

                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => toggle(a.slug, !a.enabled)}
                            disabled={toggling === a.slug}
                            className="rounded-pill px-3 py-1 text-xs font-bold transition-opacity disabled:opacity-40"
                            style={
                              a.enabled
                                ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
                                : { background: 'var(--off-soft)', color: 'var(--off)' }
                            }
                          >
                            {a.enabled ? 'Отворено' : 'Затворено'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {counts === null && !loading && (
          <p className="text-xs text-muted">
            Броят приели се показва, след като заредиш таблото поне веднъж.
          </p>
        )}
      </div>
    </div>
  );
}
