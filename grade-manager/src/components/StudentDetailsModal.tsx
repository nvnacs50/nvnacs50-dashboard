'use client';

import { useEffect, useState } from 'react';
import type { StudentDetails } from '../lib/github-classroom-api';

interface StudentDetailsModalProps {
  student: StudentDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function StudentDetailsModal({
  student,
  isOpen,
  onClose,
}: StudentDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'in_progress' | 'failed'>('all');

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !student) return null;

  const filteredAssignments = student.assignments.filter((assignment) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'completed') return assignment.status === 'success';
    if (activeTab === 'in_progress')
      return assignment.status === 'in_progress' || assignment.status === 'no_tests';
    if (activeTab === 'failed') return assignment.status === 'failure';
    return true;
  });

  const completedCount = student.assignments.filter((a) => a.status === 'success').length;
  const inProgressCount = student.assignments.filter(
    (a) => a.status === 'in_progress' || a.status === 'no_tests'
  ).length;
  const failedCount = student.assignments.filter((a) => a.status === 'failure').length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return '✅';
      case 'failure':
        return '❌';
      case 'in_progress':
        return '⏳';
      case 'no_tests':
        return '📋';
      default:
        return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-ok-soft border-ok-soft';
      case 'failure':
        return 'bg-danger-soft border-danger-soft';
      case 'in_progress':
        return 'bg-warn-soft border-warn-soft';
      default:
        return 'bg-sunken border-line';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Днес';
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `Преди ${diffDays} дни`;
    return date.toLocaleDateString('bg-BG', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Create activity chart
  const maxActivity = Math.max(...student.commitActivity, 1);
  const chartHeight = 40;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink bg-opacity-75 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-surface rounded-card shadow-lift transform transition-all">
          {/* Header */}
          <div className="bg-sunken px-6 py-4 border-b border-line rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={student.avatarUrl}
                  alt={student.name}
                  className="h-16 w-16 rounded-pill ring-4 ring-white"
                />
                <div>
                  <h3 className="text-xl font-bold text-ink">{student.name}</h3>
                  <p className="text-sm text-ink-soft">@{student.username}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted">
                      {student.totalCommits} total commits
                    </span>
                    <span className="text-muted">•</span>
                    <a
                      href={`https://github.com/${student.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:text-primary"
                    >
                      GitHub Profile →
                    </a>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-muted hover:text-muted transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Progress Summary */}
          <div className="px-6 py-4 bg-surface border-b border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink-soft">Общ прогрес</span>
              <span className="text-lg font-bold text-ink">
                {student.completedCount}/{student.totalAssignments} ({student.progressPercentage}%)
              </span>
            </div>
            <div className="flex-1 bg-sunken rounded-pill h-3">
              <div
                className="bg-progress h-3 rounded-pill transition-all"
                style={{ width: `${student.progressPercentage}%` }}
              />
            </div>
            <p className="text-xs text-muted mt-2">
              Последна активност: {formatDate(student.lastActive)}
            </p>
          </div>

          {/* Activity Chart */}
          <div className="px-6 py-4 bg-sunken border-b border-line">
            <h4 className="text-sm font-medium text-ink-soft mb-3">
              📈 Commit активност (последните 14 дни)
            </h4>
            <div className="flex items-end gap-1" style={{ height: `${chartHeight}px` }}>
              {student.commitActivity.map((count, index) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary rounded-t transition-all hover:bg-primary"
                    style={{
                      height: count > 0 ? `${(count / maxActivity) * chartHeight}px` : '2px',
                      minHeight: '2px',
                    }}
                    title={`${count} commits`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-muted">14 дни назад</span>
              <span className="text-xs text-muted">Днес</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-6 py-3 bg-surface border-b border-line">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-box text-sm font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-primary-soft text-primary'
                    : 'text-ink-soft hover:bg-sunken'
                }`}
              >
                Всички ({student.assignments.length})
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`px-4 py-2 rounded-box text-sm font-medium transition-colors ${
                  activeTab === 'completed'
                    ? 'bg-ok-soft text-ok'
                    : 'text-ink-soft hover:bg-sunken'
                }`}
              >
                Завършени ({completedCount})
              </button>
              <button
                onClick={() => setActiveTab('in_progress')}
                className={`px-4 py-2 rounded-box text-sm font-medium transition-colors ${
                  activeTab === 'in_progress'
                    ? 'bg-warn-soft text-warn'
                    : 'text-ink-soft hover:bg-sunken'
                }`}
              >
                В процес ({inProgressCount})
              </button>
              <button
                onClick={() => setActiveTab('failed')}
                className={`px-4 py-2 rounded-box text-sm font-medium transition-colors ${
                  activeTab === 'failed'
                    ? 'bg-danger-soft text-danger'
                    : 'text-ink-soft hover:bg-sunken'
                }`}
              >
                Неуспешни ({failedCount})
              </button>
            </div>
          </div>

          {/* Assignments List */}
          <div className="px-6 py-4 max-h-96 overflow-y-auto">
            <div className="space-y-3">
              {filteredAssignments.length === 0 ? (
                <p className="text-center text-muted py-8">Няма задачи в тази категория</p>
              ) : (
                filteredAssignments.map((assignment, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-box border transition-all ${getStatusColor(
                      assignment.status
                    )}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getStatusIcon(assignment.status)}</span>
                          <h5 className="font-medium text-ink">{assignment.name}</h5>
                        </div>
                        <p className="text-xs text-muted mt-1">Repo: {assignment.repoName}</p>
                        {assignment.lastCommitMessage && (
                          <p className="text-sm text-ink-soft mt-2 italic">
                            "{assignment.lastCommitMessage}"
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xs text-muted">{formatDate(assignment.lastCommitDate)}</p>
                        <a
                          href={`https://github.com/nvnacs50/${assignment.repoName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:text-primary mt-1 inline-block"
                        >
                          Виж →
                        </a>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-sunken px-6 py-4 border-t border-line rounded-b-2xl flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-surface border border-line rounded-box text-sm font-medium text-ink-soft hover:bg-sunken transition-colors"
            >
              Затвори
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
