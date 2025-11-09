'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';

interface StudentGrade {
  githubUsername: string;
  rosterIdentifier: string;
  assignmentName: string;
  pointsAwarded: number;
  maxPoints: number;
  submissionTimestamp: string;
}

interface StudentSummary {
  name: string;
  assignments: { [assignmentName: string]: { points: number; maxPoints: number } };
  totalPercentage: number;
  hasPassed: boolean;
}

// CS50 assignment choice groups - student must complete at least ONE from each group
const CS50_CHOICE_GROUPS = [
  ['mario-less', 'mario-more'],
  ['cash', 'credit'],
  ['caesar', 'substitution'],
  ['filter-less', 'filter-more'],
  ['runoff', 'tideman'],
];

// Check if student has passed based on SUBMITTED assignments only
function checkStudentPass(
  studentAssignments: { [key: string]: { points: number; maxPoints: number } },
  allSubmittedAssignments: string[]
): boolean {
  // Find which choice groups are relevant (at least one assignment from group was submitted)
  const relevantChoiceGroups = CS50_CHOICE_GROUPS.filter(group => 
    group.some(assignment => allSubmittedAssignments.includes(assignment))
  );
  
  // Find required assignments (submitted but not in any choice group)
  const requiredAssignments = allSubmittedAssignments.filter(assignment => 
    !relevantChoiceGroups.some(group => group.includes(assignment))
  );
  
  // Check all required assignments - student must have perfect score
  for (const required of requiredAssignments) {
    const grade = studentAssignments[required];
    if (!grade || grade.points !== grade.maxPoints || grade.maxPoints === 0) {
      return false;
    }
  }
  
  // Check each relevant choice group - student must have perfect score on AT LEAST ONE
  for (const group of relevantChoiceGroups) {
    // Get all scores this student has from this group
    const scoresInGroup = group
      .filter(assignment => studentAssignments[assignment])
      .map(assignment => ({
        name: assignment,
        ...studentAssignments[assignment]
      }));
    
    if (scoresInGroup.length === 0) {
      // Student didn't submit any from this group
      return false;
    }
    
    // Check if student has perfect score on at least one assignment from this group
    const hasPerfectInGroup = scoresInGroup.some(grade => 
      grade.points === grade.maxPoints && grade.maxPoints > 0
    );
    
    if (!hasPerfectInGroup) {
      return false;
    }
  }
  
  return true;
}

export default function GradeManager() {
  const [students, setStudents] = useState<{ [studentName: string]: StudentSummary }>({});
  const [assignments, setAssignments] = useState<string[]>([]);
  const [user, setUser] = useState<{ login: string; avatar_url: string } | null>(null);

  useEffect(() => {
    // Load user data from localStorage
    const userData = localStorage.getItem('gh_user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('gh_token');
    localStorage.removeItem('gh_user');
    localStorage.removeItem('gh_role');
    window.location.href = '/grade-manager/';
  };

  const processCSV = useCallback((csvContent: string, fileName: string) => {
    const lines = csvContent.split('\n');
    
    // Extract assignment name from filename
    const assignmentName = fileName.replace('-grades-', ' ').replace('.csv', '').replace(/^\d+/, '').trim();
    
    let maxPointsForAssignment = 0;
    const grades: StudentGrade[] = [];

    // Parse CSV data
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      
      const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
      const pointsAwarded = parseInt(values[8]) || 0;
      const githubUsername = values[3];
      const rosterIdentifier = values[4];
      
      if (pointsAwarded > maxPointsForAssignment) {
        maxPointsForAssignment = pointsAwarded;
      }

      grades.push({
        githubUsername,
        rosterIdentifier,
        assignmentName,
        pointsAwarded,
        maxPoints: maxPointsForAssignment,
        submissionTimestamp: values[7]
      });
    }

    // Update max points for all grades
    grades.forEach(grade => grade.maxPoints = maxPointsForAssignment);

    setStudents(prev => {
      const updated = { ...prev };
      
      grades.forEach(grade => {
        const studentName = grade.rosterIdentifier || grade.githubUsername;
        
        if (!updated[studentName]) {
          updated[studentName] = {
            name: studentName,
            assignments: {},
            totalPercentage: 0,
            hasPassed: false
          };
        }

        updated[studentName].assignments[assignmentName] = {
          points: grade.pointsAwarded,
          maxPoints: grade.maxPoints
        };
      });

      return updated;
    });

    setAssignments(prev => {
      const newAssignments = [...prev];
      if (!newAssignments.includes(assignmentName)) {
        newAssignments.push(assignmentName);
      }
      return newAssignments.sort();
    });
  }, []);

  // Recalculate pass status whenever students or assignments change
  const studentsWithPassStatus = Object.keys(students).reduce((acc, studentName) => {
    const student = students[studentName];
    const assignmentKeys = Object.keys(student.assignments);
    
    if (assignmentKeys.length > 0) {
      const totalEarned = assignmentKeys.reduce((sum, key) => 
        sum + student.assignments[key].points, 0);
      const totalPossible = assignmentKeys.reduce((sum, key) => 
        sum + student.assignments[key].maxPoints, 0);
      
      acc[studentName] = {
        ...student,
        totalPercentage: totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0,
        hasPassed: checkStudentPass(student.assignments, assignments)
      };
    } else {
      acc[studentName] = student;
    }
    
    return acc;
  }, {} as { [studentName: string]: StudentSummary });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const csvContent = reader.result as string;
        processCSV(csvContent, file.name);
      };
      reader.readAsText(file);
    });
  }, [processCSV]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
    }
  });

  const clearData = () => {
    setStudents({});
    setAssignments([]);
  };

  const studentList = Object.values(studentsWithPassStatus).sort((a, b) => a.name.localeCompare(b.name));

  // Calculate statistics
  const totalStudents = studentList.length;
  const passedStudents = studentList.filter(s => s.hasPassed).length;
  const overallAverage = totalStudents > 0
    ? studentList.reduce((sum, s) => sum + s.totalPercentage, 0) / totalStudents
    : 0;

  // Per-assignment statistics
  const assignmentStats = assignments.map(assignmentName => {
    const studentsWithAssignment = studentList.filter(s => s.assignments[assignmentName]);
    const perfectCount = studentsWithAssignment.filter(s => {
      const grade = s.assignments[assignmentName];
      return grade && grade.points === grade.maxPoints;
    }).length;

    return {
      name: assignmentName,
      total: studentsWithAssignment.length,
      perfect: perfectCount,
      percentage: studentsWithAssignment.length > 0
        ? (perfectCount / studentsWithAssignment.length) * 100
        : 0
    };
  });

  // Detect which choice groups are active
  const activeChoiceGroups = CS50_CHOICE_GROUPS.filter(group => 
    group.some(assignment => assignments.includes(assignment))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Title */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="h-9 w-9 sm:h-10 sm:w-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                <span className="text-xl sm:text-2xl">📚</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">GitHub Classroom</h1>
                <p className="text-xs text-gray-500 hidden sm:block">Преподавателски панел</p>
              </div>
            </div>

            {/* User Info and Logout */}
            <div className="flex items-center gap-2 sm:gap-4">
              {user && (
                <div className="flex items-center gap-2 sm:gap-3">
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="h-8 w-8 sm:h-10 sm:w-10 rounded-full border-2 border-gray-200 flex-shrink-0"
                  />
                  <div className="hidden md:block">
                    <div className="text-sm font-medium text-gray-900">{user.login}</div>
                    <div className="text-xs text-gray-500">Преподавател</div>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 shadow-sm text-xs sm:text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <svg className="h-4 w-4 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Изход</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
              isDragActive
                ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-purple-50 shadow-lg'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center">
                <span className="text-4xl">📁</span>
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900 mb-1">
                  {isDragActive
                    ? 'Пуснете CSV файловете тук...'
                    : 'Плъзнете и пуснете CSV файлове тук'}
                </p>
                <p className="text-sm text-gray-500">
                  или кликнете за да изберете файлове
                </p>
              </div>
              <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium rounded-lg shadow-sm">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Качи GitHub Classroom CSV файлове
              </div>
            </div>
          </div>
          
          {assignments.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                      <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
                    </svg>
                    {assignments.length} задачи
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                    </svg>
                    {studentList.length} студенти
                  </div>
                </div>
                <button
                  onClick={clearData}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Изчисти данните
                </button>
              </div>

              {/* Show active requirements */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 mb-2">Изисквания за издържане:</div>
                    <div className="text-sm text-gray-700 space-y-2">
                      {assignments.filter(a => !activeChoiceGroups.some(g => g.includes(a))).length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-800 mt-0.5">
                            Задължителни
                          </span>
                          <span className="flex-1">{assignments.filter(a => !activeChoiceGroups.some(g => g.includes(a))).join(', ')}</span>
                        </div>
                      )}
                      {activeChoiceGroups.map((group, idx) => {
                        const groupAssignments = group.filter(a => assignments.includes(a));
                        return (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 mt-0.5">
                              Избор {idx + 1}
                            </span>
                            <span className="flex-1">{groupAssignments.join(' ИЛИ ')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {studentList.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Резултати на студентите</h2>
              <p className="text-sm text-gray-600 mt-1">Преглед на оценките и статус на издържане</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-0 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                        </svg>
                        Студент
                      </div>
                    </th>
                    {assignments.map(assignment => (
                      <th key={assignment} className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        <div className="flex items-center justify-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd"/>
                          </svg>
                          {assignment}
                        </div>
                      </th>
                    ))}
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center justify-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                        </svg>
                        Общо
                      </div>
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center justify-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                        </svg>
                        Статус
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {studentList.map(student => (
                    <tr key={student.name} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white">
                        {student.name}
                      </td>
                      {assignments.map(assignment => {
                        const grade = student.assignments[assignment];
                        if (!grade) {
                          return (
                            <td key={assignment} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                              -
                            </td>
                          );
                        }
                        
                        const percentage = grade.maxPoints > 0 ? (grade.points / grade.maxPoints) * 100 : 0;
                        const bgColor = percentage === 100 ? 'bg-green-100 text-green-800' : 
                                       percentage >= 50 ? 'bg-yellow-100 text-yellow-800' : 
                                       'bg-red-100 text-red-800';
                        
                        return (
                          <td key={assignment} className="px-6 py-4 whitespace-nowrap text-sm text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${bgColor}`}>
                              {grade.points}/{grade.maxPoints}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          student.totalPercentage === 100 ? 'bg-green-100 text-green-800' :
                          student.totalPercentage >= 75 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {student.totalPercentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        {student.hasPassed ? (
                          <span className="text-green-600 text-xl">✓</span>
                        ) : (
                          <span className="text-red-600 text-xl">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="px-6 py-6 bg-gradient-to-r from-gray-50 to-gray-100 border-t">
              <div className="space-y-6">
                {/* Main Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                          Издържали
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                          {passedStudents}/{totalStudents}
                        </div>
                        <div className="text-sm text-green-600 font-semibold mt-1">
                          {totalStudents > 0 ? ((passedStudents / totalStudents) * 100).toFixed(1) : 0}%
                        </div>
                      </div>
                      <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center">
                        <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                          Среден процент
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                          {overallAverage.toFixed(1)}%
                        </div>
                        <div className="text-sm text-blue-600 font-semibold mt-1">
                          Обща оценка
                        </div>
                      </div>
                      <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <svg className="h-6 w-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                          Всичко задачи
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                          {assignments.length}
                        </div>
                        <div className="text-sm text-purple-600 font-semibold mt-1">
                          Заредени CSV
                        </div>
                      </div>
                      <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center">
                        <svg className="h-6 w-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Per-assignment Statistics */}
                {assignmentStats.length > 0 && (
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-8 w-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <svg className="h-4 w-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                        Процент на завършване по задача
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {assignmentStats.map(stat => (
                        <div key={stat.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{stat.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {stat.perfect}/{stat.total} перфектни
                            </div>
                          </div>
                          <div className="ml-3">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                              stat.percentage === 100 ? 'bg-green-100 text-green-800' :
                              stat.percentage >= 75 ? 'bg-blue-100 text-blue-800' :
                              stat.percentage >= 50 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {stat.percentage.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
