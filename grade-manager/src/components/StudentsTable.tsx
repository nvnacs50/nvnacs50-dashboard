'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo } from 'react';
import type { Student } from '../lib/github-classroom-api';

interface StudentsTableProps {
  students: Student[];
  onStudentClick: (student: Student) => void;
  searchQuery: string;
  filterStatus: 'all' | 'passed' | 'in_progress' | 'failed';
  sortBy: 'name' | 'progress' | 'lastActive';
}

export default function StudentsTable({
  students,
  onStudentClick,
  searchQuery,
  filterStatus,
  sortBy,
}: StudentsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter and sort students
  const processedStudents = useMemo(() => {
    let filtered = students;

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.username.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter((s) => s.status === filterStatus);
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'progress':
          return b.progressPercentage - a.progressPercentage;
        case 'lastActive':
          const dateA = a.lastActive ? new Date(a.lastActive).getTime() : 0;
          const dateB = b.lastActive ? new Date(b.lastActive).getTime() : 0;
          return dateB - dateA;
        default:
          return 0;
      }
    });

    return filtered;
  }, [students, searchQuery, filterStatus, sortBy]);

  // Virtualization
  const rowVirtualizer = useVirtualizer({
    count: processedStudents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 10,
  });

  const getStatusBadge = (status: Student['status']) => {
    const pill = 'inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-bold';
    switch (status) {
      case 'passed':
        return <span className={`${pill} bg-ok-soft text-ok`}>Взел</span>;
      case 'in_progress':
        return <span className={`${pill} bg-warn-soft text-warn`}>В процес</span>;
      case 'failed':
        return <span className={`${pill} bg-danger-soft text-danger`}>Изостава</span>;
    }
  };

  const formatLastActive = (dateString?: string) => {
    if (!dateString) return 'никога';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `преди ${diffMins} мин`;
    if (diffHours < 24) return `преди ${diffHours} ч`;
    if (diffDays < 7) return `преди ${diffDays} дни`;
    return date.toLocaleDateString('bg-BG', { month: 'short', day: 'numeric' });
  };

  if (processedStudents.length === 0) {
    return (
      <div className="text-center py-12">
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
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <h3 className="mt-2 text-sm font-semibold text-ink">Няма студенти</h3>
        <p className="mt-1 text-sm text-muted">
          {searchQuery || filterStatus !== 'all'
            ? 'Няма студенти, които отговарят на филтрите'
            : 'Няма налични данни за студенти'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-surface shadow-card rounded-card border border-line">
      {/* Table Header */}
      <div className="px-6 py-3.5 border-b border-line">
        <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted">
          <div className="col-span-3">Име</div>
          <div className="col-span-3">Прогрес</div>
          <div className="col-span-2">Последна активност</div>
          <div className="col-span-2">Статус</div>
          <div className="col-span-2 text-right">Действия</div>
        </div>
      </div>

      {/* Virtualized Table Body */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: '600px' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const student = processedStudents[virtualRow.index];

            return (
              <div
                key={student.id}
                className="absolute top-0 left-0 w-full px-6 py-4 border-b border-line last:border-b-0 hover:bg-sunken transition-colors cursor-pointer"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onStudentClick(student)}
              >
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Name column */}
                  <div className="col-span-3 flex items-center gap-3">
                    <img
                      src={student.avatarUrl}
                      alt={student.name}
                      className="h-9 w-9 rounded-pill ring-1 ring-line"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">
                        {student.name}
                      </p>
                      <p className="text-xs text-muted truncate font-mono">
                        @{student.username}
                      </p>
                    </div>
                  </div>

                  {/* Progress column */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-sunken rounded-pill h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-pill bg-progress transition-all"
                          style={{ width: `${student.progressPercentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-ink min-w-[3rem] text-right tabular-nums">
                        {student.progressPercentage}%
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-1 tabular-nums">
                      {student.completedCount}/{student.totalAssignments} завършени
                    </p>
                  </div>

                  {/* Last Active column */}
                  <div className="col-span-2">
                    <p className="text-sm text-ink-soft">
                      {formatLastActive(student.lastActive)}
                    </p>
                  </div>

                  {/* Status column */}
                  <div className="col-span-2">{getStatusBadge(student.status)}</div>

                  {/* Actions column */}
                  <div className="col-span-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStudentClick(student);
                      }}
                      className="inline-flex items-center rounded-chip border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-primary hover:text-primary"
                    >
                      <svg
                        className="h-4 w-4 mr-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      Виж
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3.5 border-t border-line">
        <p className="text-sm text-muted">
          Показани <span className="font-semibold text-ink tabular-nums">{processedStudents.length}</span> от{' '}
          <span className="font-semibold text-ink tabular-nums">{students.length}</span> студенти
        </p>
      </div>
    </div>
  );
}
