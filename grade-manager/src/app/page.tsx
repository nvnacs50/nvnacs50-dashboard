'use client';

import { useState, useEffect, useCallback } from 'react';
import { GitHubClassroomAPI, Student, StudentDetails } from '../lib/github-classroom-api';
import StudentsTable from '../components/StudentsTable';
import StudentDetailsModal from '../components/StudentDetailsModal';
import CacheStatusBanner from '../components/CacheStatusBanner';
import { exportStudents } from '../lib/export';

type ViewMode = 'github' | 'csv';

export default function TeacherDashboard() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('github');

  // GitHub API state
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Cache state
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);
  const [cacheSource, setCacheSource] = useState<'indexeddb' | 'static-cache' | 'live-api' | null>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'in_progress' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'progress' | 'lastActive'>('name');

  // Student details modal
  const [selectedStudent, setSelectedStudent] = useState<StudentDetails | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'excel' | 'csv'>('excel');

  // Check authentication
  useEffect(() => {
    const storedToken = localStorage.getItem('gh_token');
    const storedUser = localStorage.getItem('gh_user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      setIsAuthenticated(true);
    }
  }, []);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('gh_token');
    localStorage.removeItem('gh_user');
    localStorage.removeItem('gh_role');
    window.location.href = '/nvnacs50-dashboard/';
  };

  // Load students from GitHub (with caching)
  const loadStudentsFromGitHub = useCallback(async (forceSync = false) => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const api = new GitHubClassroomAPI(token);

      let fetchedStudents: Student[];

      if (forceSync) {
        // Force sync ignores all caches
        fetchedStudents = await api.forceSync((current, total) => {
          setLoadingProgress({ current, total });
        });
      } else {
        // Use hybrid caching strategy
        fetchedStudents = await api.getAllStudents((current, total) => {
          setLoadingProgress({ current, total });
        });
      }

      setStudents(fetchedStudents);

      // Update cache state from API
      setCacheTimestamp(api.lastSyncTimestamp);
      setCacheSource(api.lastDataSource);
    } catch (err: any) {
      console.error('Error loading students:', err);
      setError(err.message || 'Failed to load students from GitHub');
    } finally {
      setLoading(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  }, [token]);

  // Auto-load on mount
  useEffect(() => {
    if (token && students.length === 0) {
      loadStudentsFromGitHub(false);
    }
  }, [token, students.length, loadStudentsFromGitHub]);

  // Handle student click
  const handleStudentClick = async (student: Student) => {
    if (!token) return;

    setLoadingDetails(true);
    setShowModal(true);

    try {
      const api = new GitHubClassroomAPI(token);
      const details = await api.getStudentDetails(student.username);

      if (details) {
        setSelectedStudent(details);
      }
    } catch (err) {
      console.error('Error loading student details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Handle export
  const handleExport = () => {
    const filteredStudents = students.filter((s) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!s.name.toLowerCase().includes(query) && !s.username.toLowerCase().includes(query)) {
          return false;
        }
      }

      if (filterStatus !== 'all' && s.status !== filterStatus) {
        return false;
      }

      return true;
    });

    exportStudents({
      format: exportFormat,
      students: filteredStudents,
      includeAll: filterStatus === 'all' && !searchQuery,
    });

    setShowExportModal(false);
  };

  // Calculate statistics
  const avgProgress = students.length
    ? Math.round(students.reduce((sum, s) => sum + s.progressPercentage, 0) / students.length)
    : 0;

  const stats = {
    total: students.length,
    passed: students.filter((s) => s.status === 'passed').length,
    inProgress: students.filter((s) => s.status === 'in_progress').length,
    failed: students.filter((s) => s.status === 'failed').length,
  };

  // Render login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-ground flex items-center justify-center p-4 font-ui">
        <div className="bg-surface rounded-card border border-line shadow-lift p-8 max-w-sm w-full text-center">
          <h2 className="text-xl font-bold text-ink">Табло на курса</h2>
          <p className="mt-1 text-sm text-muted font-mono">nvnacs50 · CS50</p>
          <p className="mt-6 text-sm text-ink-soft">
            Влизането е изтекло. Влез отново, за да видиш студентите.
          </p>
          <button
            onClick={handleLogout}
            className="mt-5 w-full rounded-box bg-primary px-6 py-3 font-bold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Влез с GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground font-ui text-ink">
      {/* Navigation */}
      <nav className="bg-surface border-b border-line">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Табло на курса</h1>
              <p className="text-xs text-muted font-mono">nvnacs50 · CS50</p>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-2">
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="h-8 w-8 rounded-pill ring-1 ring-line"
                  />
                  <span className="text-sm font-semibold text-ink-soft">{user.login}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="inline-flex items-center rounded-box border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-line-strong"
              >
                <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Изход
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* View Mode Toggle */}
        <div className="mb-6 flex items-center justify-between">
          <div className="inline-flex rounded-box border border-line bg-surface p-1">
            <button
              onClick={() => setViewMode('github')}
              className={`rounded-chip px-4 py-1.5 text-sm font-semibold transition-colors ${
                viewMode === 'github' ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink'
              }`}
            >
              От GitHub
            </button>
            <button
              onClick={() => setViewMode('csv')}
              className={`rounded-chip px-4 py-1.5 text-sm font-semibold transition-colors ${
                viewMode === 'csv' ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink'
              }`}
            >
              От файл
            </button>
          </div>
        </div>

        {viewMode === 'github' ? (
          <>
            {/* Cache Status Banner */}
            <CacheStatusBanner
              timestamp={cacheTimestamp}
              source={cacheSource}
              onSync={() => loadStudentsFromGitHub(true)}
              isLoading={loading}
            />

            {/* Controls Bar */}
            <div className="mb-6 flex flex-wrap items-center gap-4">
              {/* Search */}
              <div className="flex-1 min-w-[300px]">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg
                      className="h-5 w-5 text-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Търси по име или username…"
                    className="block w-full rounded-box border border-line bg-surface py-2 pl-10 pr-3 text-sm placeholder-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="rounded-box border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft focus:border-primary focus:outline-none"
              >
                <option value="all">Всички студенти</option>
                <option value="passed">Само взелите</option>
                <option value="in_progress">В процес</option>
                <option value="failed">Изостават</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-box border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft focus:border-primary focus:outline-none"
              >
                <option value="name">Подредба по име</option>
                <option value="progress">Подредба по напредък</option>
                <option value="lastActive">Подредба по активност</option>
              </select>

              {/* Sync Button - removed, now in CacheStatusBanner */}

              {/* Assignment Links Button */}
              <a
                href="/nvnacs50-dashboard/teacher/assignments"
                className="inline-flex items-center rounded-box bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Линкове за задачи
              </a>

              {/* Quiz Results Button */}
              <a
                href="/nvnacs50-dashboard/teacher/quiz-results"
                className="inline-flex items-center rounded-box border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-line-strong"
              >
                Quiz резултати
              </a>

              {/* Export Button */}
              {students.length > 0 && (
                <button
                  onClick={() => setShowExportModal(true)}
                  className="inline-flex items-center rounded-box border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-line-strong"
                >
                  <svg
                    className="-ml-1 mr-2 h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Изтегли
                </button>
              )}
            </div>

            {/* Statistics Cards */}
            {students.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Студенти</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">{stats.total}</p>
                  <div className="mt-3 h-1 overflow-hidden rounded-pill bg-sunken">
                    <div
                      className="h-full rounded-pill bg-progress"
                      style={{ width: `${avgProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    среден напредък <b className="font-semibold text-ink tabular-nums">{avgProgress}%</b>
                  </p>
                </div>

                {[
                  { label: 'Взели', value: stats.passed, color: 'var(--ok)' },
                  { label: 'В процес', value: stats.inProgress, color: 'var(--warn)' },
                  { label: 'Изостават', value: stats.failed, color: 'var(--danger)' },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-card border border-line bg-surface p-5 shadow-card">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tile.label}</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: tile.color }}>
                      {tile.value}
                    </p>
                    <div className="mt-3 h-1 overflow-hidden rounded-pill bg-sunken">
                      <div
                        className="h-full rounded-pill"
                        style={{
                          width: `${stats.total ? (tile.value / stats.total) * 100 : 0}%`,
                          background: tile.color,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted tabular-nums">
                      {stats.total ? Math.round((tile.value / stats.total) * 100) : 0}% от групата
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="rounded-card border border-line bg-surface p-12 text-center shadow-card">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-pill border-2 border-line border-t-primary"></div>
                <p className="font-semibold text-ink-soft">Зареждаме студентите от GitHub…</p>
                {loadingProgress.total > 0 && (
                  <p className="mt-2 text-sm text-muted tabular-nums">
                    {loadingProgress.current} от {loadingProgress.total}
                  </p>
                )}
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="mb-6 rounded-box border border-danger-soft bg-danger-soft p-4 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Students Table */}
            {!loading && students.length > 0 && (
              <StudentsTable
                students={students}
                onStudentClick={handleStudentClick}
                searchQuery={searchQuery}
                filterStatus={filterStatus}
                sortBy={sortBy}
              />
            )}

            {/* Empty State */}
            {!loading && students.length === 0 && !error && (
              <div className="rounded-card border border-line bg-surface p-12 text-center shadow-card">
                <svg
                  className="mx-auto h-12 w-12 text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                <h3 className="mt-3 text-sm font-semibold text-ink">Още няма заредени студенти</h3>
                <p className="mt-1 text-sm text-muted">
                  Натисни „Синхронизирай“, за да ги изтеглиш от организацията.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-card border border-line bg-surface p-12 text-center shadow-card">
            <h3 className="text-lg font-semibold text-ink">Качване от файл</h3>
            <p className="mt-2 text-sm text-muted">Още не е готово.</p>
          </div>
        )}
      </main>

      {/* Student Details Modal */}
      <StudentDetailsModal
        student={selectedStudent}
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedStudent(null);
        }}
      />

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-ink/40 transition-opacity"
            onClick={() => setShowExportModal(false)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-lift">
              <h3 className="mb-4 text-lg font-bold text-ink">Изтегляне на данните</h3>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-ink-soft">
                    Формат
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="excel"
                        checked={exportFormat === 'excel'}
                        onChange={(e) => setExportFormat(e.target.value as any)}
                        className="h-4 w-4 border-line text-primary focus:ring-primary"
                      />
                      <span className="ml-2 text-sm text-ink-soft">Excel (.xlsx) — препоръчано</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="csv"
                        checked={exportFormat === 'csv'}
                        onChange={(e) => setExportFormat(e.target.value as any)}
                        className="h-4 w-4 border-line text-primary focus:ring-primary"
                      />
                      <span className="ml-2 text-sm text-ink-soft">CSV (.csv)</span>
                    </label>
                  </div>
                </div>

                <div className="rounded-box border border-line bg-sunken p-3">
                  <p className="text-sm text-ink-soft">
                    {filterStatus !== 'all' || searchQuery
                      ? `Само филтрираните: ${students.filter((s) => {
                          if (searchQuery) {
                            const query = searchQuery.toLowerCase();
                            if (
                              !s.name.toLowerCase().includes(query) &&
                              !s.username.toLowerCase().includes(query)
                            ) {
                              return false;
                            }
                          }
                          return filterStatus === 'all' || s.status === filterStatus;
                        }).length} студенти`
                      : `Всички ${students.length} студенти`}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="rounded-box border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-line-strong"
                >
                  Откажи
                </button>
                <button
                  onClick={handleExport}
                  className="rounded-box bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  Изтегли
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
