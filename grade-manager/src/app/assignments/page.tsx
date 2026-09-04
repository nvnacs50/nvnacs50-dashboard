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
