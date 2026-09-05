'use client';

import { useState, useEffect } from 'react';

interface QuizResult {
  username: string;
  facultyNumber?: string;
  startedAt?: string;
  completedAt?: string;
  timestamp: string;
  score: number;
  total: number;
  percentage: string;
  timeTaken?: number;
  answers?: Array<{
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
}

export default function QuizResultsPage() {
  const [results, setResults] = useState<QuizResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'date'>('date');
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; username: string; confirmInput: string }>({
    show: false,
    username: '',
    confirmInput: ''
  });

  useEffect(() => {
    loadResults();
  }, []);

  useEffect(() => {
    filterAndSortResults();
  }, [results, searchQuery, sortBy]);

  async function loadResults() {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('gh_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const gistId = 'decf38f65f3a2dcd46771afec0069d06'; // QUIZ_RESULTS_GIST_ID
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const gistData = await response.json();
      const content = gistData.files['quiz-results.json']?.content || '[]';
      const parsedResults = JSON.parse(content);

      setResults(parsedResults);
    } catch (err: any) {
      console.error('Error loading results:', err);
      setError(err.message || 'Failed to load quiz results');
    } finally {
      setLoading(false);
    }
  }

  function filterAndSortResults() {
    let filtered = [...results];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.username.toLowerCase().includes(query) ||
        (r.facultyNumber && r.facultyNumber.includes(query))
      );
    }

    // Sort
    if (sortBy === 'score') {
      filtered.sort((a, b) => b.score - a.score);
    } else {
      filtered.sort((a, b) =>
        new Date(b.completedAt || b.timestamp).getTime() -
        new Date(a.completedAt || a.timestamp).getTime()
      );
    }

    setFilteredResults(filtered);
  }

  function generateEmail(facultyNumber?: string): string {
    if (!facultyNumber) return 'N/A';
    const username = facultyNumber.replace('-', '');
    return `${username}@naval-acad.bg`;
  }

  function formatTime(seconds?: number): string {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatDate(isoString?: string): string {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleString('bg-BG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getScoreClass(percentage: number): string {
    if (percentage >= 90) return 'bg-ok-soft text-ok';
    if (percentage >= 75) return 'bg-primary-soft text-primary';
    if (percentage >= 50) return 'bg-warn-soft text-warn';
    return 'bg-danger-soft text-danger';
  }

  function exportToCSV() {
    const headers = ['#', 'Потребителско име', 'Фак. номер', 'Имейл адрес', 'Състояние', 'Започнат на', 'Приключен', 'Изминало време (сек)', 'Оценка/25.00', 'Процент'];
    const rows = filteredResults.map((result, index) => [
      index + 1,
      result.username,
      result.facultyNumber || 'N/A',
      generateEmail(result.facultyNumber),
      'Завършен',
      result.startedAt || result.timestamp,
      result.completedAt || result.timestamp,
      result.timeTaken || 0,
      `${result.score}/25.00`,
      result.percentage + '%'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quiz-results-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function showDeleteModal(username: string) {
    setDeleteModal({
      show: true,
      username,
      confirmInput: ''
    });
  }

  function closeDeleteModal() {
    setDeleteModal({
      show: false,
      username: '',
      confirmInput: ''
    });
  }

  async function handleDelete() {
    if (deleteModal.confirmInput !== deleteModal.username) {
      alert('Потребителското име не съвпада!');
      return;
    }

    try {
      // Use Cloudflare Worker to delete (it has the Gist owner's token)
      const workerUrl = 'https://quiz-results-saver.m-avramova.workers.dev/delete';

      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: deleteModal.username
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to delete: ${response.status}`);
      }

      // Update local state - filter out deleted result
      const updatedResults = results.filter(r => r.username !== deleteModal.username);
      setResults(updatedResults);
      closeDeleteModal();

      alert(`✅ Резултатът на ${deleteModal.username} е изтрит успешно!`);
    } catch (err: any) {
      console.error('Error deleting result:', err);
      alert('Грешка при изтриване: ' + (err.message || 'Unknown error'));
    }
  }

  // Calculate stats
  const stats = {
    total: results.length,
    avgScore: results.length > 0
      ? (results.reduce((sum, r) => sum + parseFloat(r.percentage), 0) / results.length).toFixed(1)
      : '0',
    passed: results.filter(r => parseFloat(r.percentage) >= 50).length,
    avgTime: results.length > 0 && results.some(r => r.timeTaken)
      ? Math.floor(results.reduce((sum, r) => sum + (r.timeTaken || 0), 0) / results.length)
      : 0
  };

  return (
    <div className="min-h-screen bg-sunken">
      {/* Navigation */}
      <nav className="bg-surface border-b border-line shadow-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-progress rounded-card flex items-center justify-center shadow-card">
                <span className="text-xl">📝</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-ink">Quiz Резултати</h1>
                <p className="text-xs text-muted">CS50 Тест</p>
              </div>
            </div>
            <a
              href="/nvnacs50-dashboard/teacher/"
              className="inline-flex items-center px-4 py-2 border border-line shadow-card text-sm font-medium rounded-box text-ink-soft bg-surface hover:bg-sunken"
            >
              ← Назад към Dashboard
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics Cards */}
        {!loading && results.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <div className="bg-surface overflow-hidden shadow-card rounded-box border border-line">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 bg-primary-soft rounded-card flex items-center justify-center">
                      <span className="text-2xl">👥</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-muted truncate">Общо студенти</dt>
                      <dd className="text-3xl font-bold text-ink">{stats.total}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface overflow-hidden shadow-card rounded-box border border-line">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 bg-primary-soft rounded-card flex items-center justify-center">
                      <span className="text-2xl">📊</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-muted truncate">Среден резултат</dt>
                      <dd className="text-3xl font-bold text-primary">{stats.avgScore}%</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface overflow-hidden shadow-card rounded-box border border-line">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 bg-ok-soft rounded-card flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-muted truncate">Положили (≥50%)</dt>
                      <dd className="text-3xl font-bold text-ok">{stats.passed}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface overflow-hidden shadow-card rounded-box border border-line">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 bg-warn-soft rounded-card flex items-center justify-center">
                      <span className="text-2xl">⏱️</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-muted truncate">Средно време</dt>
                      <dd className="text-3xl font-bold text-warn">{formatTime(stats.avgTime)}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Търси по име или фак. номер..."
                className="block w-full pl-10 pr-3 py-2 border border-line rounded-box leading-5 bg-surface placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
              />
            </div>
          </div>

          <button
            onClick={() => setSortBy('score')}
            className={`px-4 py-2 border rounded-box text-sm font-medium transition-colors ${
              sortBy === 'score'
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-soft border-line hover:bg-sunken'
            }`}
          >
            Сортирай по точки
          </button>

          <button
            onClick={() => setSortBy('date')}
            className={`px-4 py-2 border rounded-box text-sm font-medium transition-colors ${
              sortBy === 'date'
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-soft border-line hover:bg-sunken'
            }`}
          >
            Сортирай по дата
          </button>

          {filteredResults.length > 0 && (
            <button
              onClick={exportToCSV}
              className="inline-flex items-center px-4 py-2 border border-line shadow-card text-sm font-medium rounded-box text-ink-soft bg-surface hover:bg-sunken"
            >
              <svg className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              📥 Експорт CSV
            </button>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-surface rounded-box shadow-card border border-line p-12 text-center">
            <div className="inline-block animate-spin rounded-pill h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-ink-soft font-medium">Зареждане на резултати...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-danger-soft border border-danger-soft rounded-box p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-danger" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-danger">Error</h3>
                <div className="mt-2 text-sm text-danger">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* No Results */}
        {!loading && !error && results.length === 0 && (
          <div className="bg-surface rounded-box shadow-card border border-line p-12 text-center">
            <p className="text-ink-soft">📭 Няма резултати от тестове</p>
          </div>
        )}

        {/* Results Table */}
        {!loading && !error && filteredResults.length > 0 && (
          <div className="bg-surface rounded-box shadow-card border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-sunken">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">#</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Потребителско име</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Фак. номер</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Имейл адрес</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Състояние</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Започнат на</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Приключен</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Изминало време</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Оценка/25.00</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Действия</th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-gray-200">
                  {filteredResults.map((result, index) => {
                    const percentage = parseFloat(result.percentage);
                    return (
                      <tr key={result.username} className="hover:bg-sunken">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-ink">{index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-ink">{result.username}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{result.facultyNumber || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{generateEmail(result.facultyNumber)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-pill bg-ok-soft text-ok">
                            Завършен
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{formatDate(result.startedAt || result.timestamp)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{formatDate(result.completedAt || result.timestamp)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{formatTime(result.timeTaken)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-pill ${getScoreClass(percentage)}`}>
                            {result.score}/25.00 ({result.percentage}%)
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => showDeleteModal(result.username)}
                            className="inline-flex items-center px-3 py-1.5 border border-danger-soft shadow-card text-sm font-medium rounded-box text-danger bg-danger-soft hover:bg-danger-soft transition-colors"
                          >
                            🗑️ Изтрий
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-box shadow-lift p-6 max-w-md w-full mx-4">
            <div className="text-center mb-4">
              <div className="text-5xl mb-3">⚠️</div>
              <h2 className="text-2xl font-bold text-danger mb-2">Изтриване на резултат</h2>
              <p className="text-ink-soft mb-4">
                Сигурни ли сте, че искате да изтриете резултата на <strong>{deleteModal.username}</strong>?
              </p>
              <p className="text-sm text-muted mb-4">
                Това действие е необратимо. За да потвърдите, моля въведете потребителското име:
              </p>
            </div>

            <div className="mb-4">
              <input
                type="text"
                value={deleteModal.confirmInput}
                onChange={(e) => setDeleteModal({ ...deleteModal, confirmInput: e.target.value })}
                placeholder="Въведете потребителско име"
                className="block w-full px-4 py-3 border border-line rounded-box leading-5 bg-surface placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-danger focus:border-danger text-center font-medium"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeDeleteModal}
                className="flex-1 px-4 py-2 border border-line shadow-card text-sm font-medium rounded-box text-ink-soft bg-surface hover:bg-sunken"
              >
                Отказ
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteModal.confirmInput !== deleteModal.username}
                className={`flex-1 px-4 py-2 border shadow-card text-sm font-medium rounded-box ${
                  deleteModal.confirmInput === deleteModal.username
                    ? 'bg-danger text-white border-danger hover:bg-danger'
                    : 'bg-sunken text-muted border-line cursor-not-allowed'
                }`}
              >
                🗑️ Изтрий
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
