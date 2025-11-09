import * as XLSX from 'xlsx';
import type { Student } from './github-classroom-api';

const CS50_ASSIGNMENTS = [
  'hello',
  'mario',
  'cash/credit',
  'scrabble',
  'readability',
  'caesar/substitution',
  'sort',
  'plurality',
  'runoff/tideman',
  'volume',
  'filter',
  'recover',
  'inheritance',
  'speller',
];

export function exportToExcel(students: Student[], filename?: string) {
  // Prepare data for Excel
  const data = students.map((student) => {
    const row: any = {
      'Име': student.name,
      'Username': student.username,
    };

    // Add assignment columns
    CS50_ASSIGNMENTS.forEach((assignmentName) => {
      const assignment = student.assignments.find((a) =>
        a.name.toLowerCase().includes(assignmentName.split('/')[0])
      );

      if (assignment) {
        row[assignmentName] = assignment.status === 'success' ? '✓' : assignment.status === 'failure' ? '✗' : '○';
      } else {
        row[assignmentName] = '-';
      }
    });

    row['Завършени'] = `${student.completedCount}/${student.totalAssignments}`;
    row['Процент'] = `${student.progressPercentage}%`;
    row['Статус'] = student.status === 'passed' ? 'Passed' : student.status === 'failed' ? 'Failed' : 'In Progress';
    row['Последна активност'] = student.lastActive
      ? new Date(student.lastActive).toLocaleDateString('bg-BG')
      : 'N/A';

    return row;
  });

  // Create worksheet
  const ws = XLSX.utils.json_to_sheet(data);

  // Auto-adjust column widths
  const colWidths: any[] = [];
  const headers = Object.keys(data[0] || {});

  headers.forEach((header, i) => {
    const maxLength = Math.max(
      header.length,
      ...data.map((row) => String(row[header] || '').length)
    );
    colWidths[i] = { wch: Math.min(Math.max(maxLength + 2, 10), 30) };
  });

  ws['!cols'] = colWidths;

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');

  // Add statistics sheet
  const statsData = [
    { Метрика: 'Общо студенти', Стойност: students.length },
    {
      Метрика: 'Passed',
      Стойност: students.filter((s) => s.status === 'passed').length,
    },
    {
      Метрика: 'In Progress',
      Стойност: students.filter((s) => s.status === 'in_progress').length,
    },
    {
      Метрика: 'Failed',
      Стойност: students.filter((s) => s.status === 'failed').length,
    },
    {
      Метрика: 'Средна завършеност',
      Стойност:
        Math.round(
          students.reduce((sum, s) => sum + s.progressPercentage, 0) / students.length
        ) + '%',
    },
  ];

  const statsWs = XLSX.utils.json_to_sheet(statsData);
  statsWs['!cols'] = [{ wch: 25 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, statsWs, 'Statistics');

  // Generate filename
  const finalFilename =
    filename || `grades_${new Date().toISOString().split('T')[0]}.xlsx`;

  // Download file
  XLSX.writeFile(wb, finalFilename);
}

export function exportToCSV(students: Student[], filename?: string) {
  // Prepare CSV data
  const headers = [
    'Име',
    'Username',
    ...CS50_ASSIGNMENTS,
    'Завършени',
    'Процент',
    'Статус',
    'Последна активност',
  ];

  const rows = students.map((student) => {
    const row = [
      student.name,
      student.username,
    ];

    // Add assignment statuses
    CS50_ASSIGNMENTS.forEach((assignmentName) => {
      const assignment = student.assignments.find((a) =>
        a.name.toLowerCase().includes(assignmentName.split('/')[0])
      );

      if (assignment) {
        row.push(assignment.status === 'success' ? 'Pass' : assignment.status === 'failure' ? 'Fail' : 'In Progress');
      } else {
        row.push('Not Started');
      }
    });

    row.push(`${student.completedCount}/${student.totalAssignments}`);
    row.push(`${student.progressPercentage}%`);
    row.push(student.status === 'passed' ? 'Passed' : student.status === 'failed' ? 'Failed' : 'In Progress');
    row.push(
      student.lastActive ? new Date(student.lastActive).toLocaleDateString('bg-BG') : 'N/A'
    );

    return row;
  });

  // Convert to CSV
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  // Create Blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    filename || `grades_${new Date().toISOString().split('T')[0]}.csv`
  );
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export interface ExportOptions {
  format: 'excel' | 'csv';
  includeAll: boolean;
  students: Student[];
  filename?: string;
}

export function exportStudents(options: ExportOptions) {
  const { format, students, filename } = options;

  if (format === 'excel') {
    exportToExcel(students, filename);
  } else {
    exportToCSV(students, filename);
  }
}
