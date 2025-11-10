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
  const stats = {
    total: students.length,
    passed: students.filter((s) => s.status === 'passed').length,
    inProgress: students.filter((s) => s.status === 'in_progress').length,
    failed: students.filter((s) => s.status === 'failed').length,
  };

  // Render login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg mb-4">
              <span className="text-3xl">📊</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">GitHub Classroom Dashboard</h2>
            <p className="text-gray-600 mb-6">За преподаватели</p>
            <p className="text-sm text-gray-500">Моля, влезте отново</p>
            <button
              onClick={handleLogout}
              className="mt-4 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              Вход
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                <span className="text-xl">📊</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">GitHub Classroom</h1>
                <p className="text-xs text-gray-500">Teacher Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-2">
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="h-8 w-8 rounded-full ring-2 ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{user.login}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
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
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              onClick={() => setViewMode('github')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'github'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🔗 GitHub API
            </button>
            <button
              onClick={() => setViewMode('csv')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'csv'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📄 CSV Upload
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
                      className="h-5 w-5 text-gray-400"
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
                    placeholder="Search students..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              {/* Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <option value="all">All Students</option>
                <option value="passed">Passed Only</option>
                <option value="in_progress">In Progress</option>
                <option value="failed">Failed</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <option value="name">Sort by Name</option>
                <option value="progress">Sort by Progress</option>
                <option value="lastActive">Sort by Last Active</option>
              </select>

              {/* Sync Button - removed, now in CacheStatusBanner */}

              {/* Export Button */}
              {students.length > 0 && (
                <button
                  onClick={() => setShowExportModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
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
                  Export
                </button>
              )}
            </div>

            {/* Statistics Cards */}
            {students.length > 0 && (
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
                          <dt className="text-sm font-medium text-gray-500 truncate">Total Students</dt>
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
                        <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center">
                          <span className="text-2xl">✅</span>
                        </div>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Passed</dt>
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
                          <span className="text-2xl">⏳</span>
                        </div>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">In Progress</dt>
                          <dd className="text-3xl font-bold text-yellow-600">{stats.inProgress}</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="h-12 w-12 bg-red-100 rounded-xl flex items-center justify-center">
                          <span className="text-2xl">❌</span>
                        </div>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Failed</dt>
                          <dd className="text-3xl font-bold text-red-600">{stats.failed}</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600 font-medium">Loading students from GitHub...</p>
                {loadingProgress.total > 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Processing {loadingProgress.current} of {loadingProgress.total} students
                  </p>
                )}
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">{error}</div>
                  </div>
                </div>
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
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
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
                <h3 className="mt-2 text-sm font-medium text-gray-900">No students loaded</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Click "Sync GitHub" to load students from the organization
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <h3 className="text-lg font-medium text-gray-900">CSV Mode</h3>
            <p className="text-gray-500 mt-2">
              CSV upload functionality will be preserved from the original dashboard
            </p>
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
            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
            onClick={() => setShowExportModal(false)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Export Data</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Format:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="excel"
                        checked={exportFormat === 'excel'}
                        onChange={(e) => setExportFormat(e.target.value as any)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700">Excel (.xlsx) - Recommended</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="csv"
                        checked={exportFormat === 'csv'}
                        onChange={(e) => setExportFormat(e.target.value as any)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700">CSV (.csv)</span>
                    </label>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    {filterStatus !== 'all' || searchQuery
                      ? `Exporting filtered students (${students.filter((s) => {
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
                        }).length} students)`
                      : `Exporting all students (${students.length} students)`}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Download Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
