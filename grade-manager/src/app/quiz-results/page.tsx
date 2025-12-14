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

      const gistId = '***REMOVED***'; // QUIZ_RESULTS_GIST_ID
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
    if (percentage >= 90) return 'bg-green-100 text-green-800';
    if (percentage >= 75) return 'bg-blue-100 text-blue-800';
    if (percentage >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
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
      const token = localStorage.getItem('gh_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const gistId = '***REMOVED***'; // QUIZ_RESULTS_GIST_ID

      // Filter out the deleted result
      const updatedResults = results.filter(r => r.username !== deleteModal.username);

      // Update Gist
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: {
            'quiz-results.json': {
              content: JSON.stringify(updatedResults, null, 2)
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to update Gist: ${response.status}`);
      }

      // Update local state
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
    passed: results.filter(r => parseFloat(r.percentage) >= 60).length,
    avgTime: results.length > 0 && results.some(r => r.timeTaken)
      ? Math.floor(results.reduce((sum, r) => sum + (r.timeTaken || 0), 0) / results.length)
      : 0
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                <span className="text-xl">📝</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Quiz Резултати</h1>
                <p className="text-xs text-gray-500">CS50 Тест</p>
              </div>
            </div>
            <a
              href="/nvnacs50-dashboard/teacher/"
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
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
            <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">👥</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Общо студенти</dt>
                      <dd className="text-3xl font-bold text-gray-900">{stats.total}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">📊</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Среден резултат</dt>
                      <dd className="text-3xl font-bold text-purple-600">{stats.avgScore}%</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Положили (≥60%)</dt>
                      <dd className="text-3xl font-bold text-green-600">{stats.passed}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">⏱️</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Средно време</dt>
                      <dd className="text-3xl font-bold text-yellow-600">{formatTime(stats.avgTime)}</dd>
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
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Търси по име или фак. номер..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>

          <button
            onClick={() => setSortBy('score')}
            className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
              sortBy === 'score'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Сортирай по точки
          </button>

          <button
            onClick={() => setSortBy('date')}
            className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
              sortBy === 'date'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Сортирай по дата
          </button>

          {filteredResults.length > 0 && (
            <button
              onClick={exportToCSV}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Зареждане на резултати...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* No Results */}
        {!loading && !error && results.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-600">📭 Няма резултати от тестове</p>
          </div>
        )}

        {/* Results Table */}
        {!loading && !error && filteredResults.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Потребителско име</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Фак. номер</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Имейл адрес</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Състояние</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Започнат на</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Приключен</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Изминало време</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Оценка/25.00</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredResults.map((result, index) => {
                    const percentage = parseFloat(result.percentage);
                    return (
                      <tr key={result.username} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{result.username}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.facultyNumber || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{generateEmail(result.facultyNumber)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Завършен
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(result.startedAt || result.timestamp)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(result.completedAt || result.timestamp)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatTime(result.timeTaken)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getScoreClass(percentage)}`}>
                            {result.score}/25.00 ({result.percentage}%)
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => showDeleteModal(result.username)}
                            className="inline-flex items-center px-3 py-1.5 border border-red-300 shadow-sm text-sm font-medium rounded-lg text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
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
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="text-center mb-4">
              <div className="text-5xl mb-3">⚠️</div>
              <h2 className="text-2xl font-bold text-red-600 mb-2">Изтриване на резултат</h2>
              <p className="text-gray-600 mb-4">
                Сигурни ли сте, че искате да изтриете резултата на <strong>{deleteModal.username}</strong>?
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Това действие е необратимо. За да потвърдите, моля въведете потребителското име:
              </p>
            </div>

            <div className="mb-4">
              <input
                type="text"
                value={deleteModal.confirmInput}
                onChange={(e) => setDeleteModal({ ...deleteModal, confirmInput: e.target.value })}
                placeholder="Въведете потребителско име"
                className="block w-full px-4 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-center font-medium"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeDeleteModal}
                className="flex-1 px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
              >
                Отказ
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteModal.confirmInput !== deleteModal.username}
                className={`flex-1 px-4 py-2 border shadow-sm text-sm font-medium rounded-lg ${
                  deleteModal.confirmInput === deleteModal.username
                    ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                    : 'bg-gray-300 text-gray-500 border-gray-300 cursor-not-allowed'
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
