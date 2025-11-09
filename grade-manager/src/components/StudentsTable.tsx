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
    switch (status) {
      case 'passed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            ✅ Passed
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            ⏳ In Progress
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            ❌ Failed
          </span>
        );
    }
  };

  const formatLastActive = (dateString?: string) => {
    if (!dateString) return 'Never';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('bg-BG', { month: 'short', day: 'numeric' });
  };

  if (processedStudents.length === 0) {
    return (
      <div className="text-center py-12">
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
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">Няма студенти</h3>
        <p className="mt-1 text-sm text-gray-500">
          {searchQuery || filterStatus !== 'all'
            ? 'Няма студенти, които отговарят на филтрите'
            : 'Няма налични данни за студенти'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-white shadow-sm rounded-lg border border-gray-200">
      {/* Table Header */}
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
        <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                className="absolute top-0 left-0 w-full px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
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
                      className="h-8 w-8 rounded-full ring-2 ring-gray-200"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {student.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        @{student.username}
                      </p>
                    </div>
                  </div>

                  {/* Progress column */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            student.progressPercentage === 100
                              ? 'bg-green-600'
                              : student.progressPercentage >= 50
                              ? 'bg-blue-600'
                              : 'bg-yellow-600'
                          }`}
                          style={{ width: `${student.progressPercentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700 min-w-[3rem] text-right">
                        {student.progressPercentage}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {student.completedCount}/{student.totalAssignments} завършени
                    </p>
                  </div>

                  {/* Last Active column */}
                  <div className="col-span-2">
                    <p className="text-sm text-gray-700">
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
                      className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
        <p className="text-sm text-gray-700">
          Показани <span className="font-medium">{processedStudents.length}</span> от{' '}
          <span className="font-medium">{students.length}</span> студенти
        </p>
      </div>
    </div>
  );
}
