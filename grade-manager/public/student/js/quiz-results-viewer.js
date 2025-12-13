// Quiz Results Viewer - Teacher Dashboard
(async function() {
  'use strict';

  let allResults = [];
  let filteredResults = [];
  let quizStorage = null;

  // DOM Elements
  const elements = {
    statsGrid: document.getElementById('stats-grid'),
    loading: document.getElementById('loading'),
    noResults: document.getElementById('no-results'),
    resultsTable: document.getElementById('results-table'),
    resultsTbody: document.getElementById('results-tbody'),
    searchFilter: document.getElementById('search-filter'),
    sortByScore: document.getElementById('sort-by-score'),
    sortByDate: document.getElementById('sort-by-date'),
    exportBtn: document.getElementById('export-btn')
  };

  /**
   * Initialize
   */
  async function init() {
    try {
      // Check authentication
      if (!auth.isAuthenticated()) {
        window.location.href = 'index.html';
        return;
      }

      const token = auth.getToken();
      quizStorage = new QuizStorage(token);

      // Load results
      await loadResults();

    } catch (error) {
      console.error('Initialization error:', error);
      showNoResults();
    }
  }

  /**
   * Load all quiz results
   */
  async function loadResults() {
    try {
      elements.loading.style.display = 'block';
      elements.noResults.style.display = 'none';
      elements.resultsTable.style.display = 'none';

      // Fetch from configured results Gist with authentication
      const gistId = CONFIG.QUIZ_RESULTS_GIST_ID;
      const token = auth.getToken();
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API грешка: ${response.status}`);
      }

      const gistData = await response.json();
      const content = gistData.files['quiz-results.json']?.content || '[]';
      allResults = JSON.parse(content);
      filteredResults = [...allResults];

      console.log(`Заредени ${allResults.length} резултата`);

      if (allResults.length === 0) {
        showNoResults();
      } else {
        displayResults();
        displayStats();
      }

    } catch (error) {
      console.error('Error loading results:', error);
      showNoResults();
    } finally {
      elements.loading.style.display = 'none';
    }
  }

  /**
   * Display statistics
   */
  function displayStats() {
    const totalStudents = allResults.length;
    const avgScore = allResults.reduce((sum, r) => sum + parseFloat(r.percentage), 0) / totalStudents;
    const passedStudents = allResults.filter(r => parseFloat(r.percentage) >= 60).length;
    const avgTime = allResults.reduce((sum, r) => sum + r.timeTaken, 0) / totalStudents;

    elements.statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${totalStudents}</div>
        <div class="stat-label">Общо студенти</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${avgScore.toFixed(1)}%</div>
        <div class="stat-label">Среден резултат</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${passedStudents}</div>
        <div class="stat-label">Положили (≥60%)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatTime(avgTime)}</div>
        <div class="stat-label">Средно време</div>
      </div>
    `;
  }

  /**
   * Display results table
   */
  function displayResults() {
    elements.resultsTable.style.display = 'table';
    elements.resultsTbody.innerHTML = '';

    filteredResults.forEach((result, index) => {
      const row = createResultRow(result, index + 1);
      elements.resultsTbody.appendChild(row);
    });
  }

  /**
   * Create table row for result
   */
  function createResultRow(result, index) {
    const tr = document.createElement('tr');

    const percentage = parseFloat(result.percentage);
    const scoreClass = getScoreClass(percentage);

    tr.innerHTML = `
      <td>${index}</td>
      <td><strong>${escapeHtml(result.username)}</strong></td>
      <td>${result.score}/${result.total}</td>
      <td><span class="score-badge ${scoreClass}">${result.percentage}%</span></td>
      <td>${formatTime(result.timeTaken)}</td>
      <td>${formatDate(result.timestamp)}</td>
      <td>
        <button class="btn btn-secondary" onclick="viewDetails('${result.username}')" style="font-size: 12px; padding: 6px 12px;">
          👁️ Детайли
        </button>
      </td>
    `;

    return tr;
  }

  /**
   * Get score class based on percentage
   */
  function getScoreClass(percentage) {
    if (percentage >= 90) return 'score-excellent';
    if (percentage >= 75) return 'score-good';
    if (percentage >= 60) return 'score-average';
    return 'score-poor';
  }

  /**
   * Format time in seconds to MM:SS
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format date
   */
  function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('bg-BG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show no results message
   */
  function showNoResults() {
    elements.loading.style.display = 'none';
    elements.resultsTable.style.display = 'none';
    elements.noResults.style.display = 'block';
    elements.statsGrid.innerHTML = '';
  }

  /**
   * Filter results by search query
   */
  function filterResults(query) {
    const lowerQuery = query.toLowerCase();
    filteredResults = allResults.filter(result =>
      result.username.toLowerCase().includes(lowerQuery)
    );
    displayResults();
  }

  /**
   * Sort results by score
   */
  function sortByScore() {
    filteredResults.sort((a, b) => b.score - a.score);
    displayResults();
  }

  /**
   * Sort results by date
   */
  function sortByDate() {
    filteredResults.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    displayResults();
  }

  /**
   * Export results to CSV
   */
  function exportToCSV() {
    const headers = ['#', 'Username', 'Score', 'Total', 'Percentage', 'Time (seconds)', 'Date'];
    const rows = filteredResults.map((result, index) => [
      index + 1,
      result.username,
      result.score,
      result.total,
      result.percentage,
      result.timeTaken,
      result.timestamp
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quiz-results-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * View detailed results for a student
   */
  window.viewDetails = function(username) {
    const result = allResults.find(r => r.username === username);
    if (!result) return;

    const detailsWindow = window.open('', '_blank', 'width=800,height=600');
    detailsWindow.document.write(`
      <!DOCTYPE html>
      <html lang="bg">
      <head>
        <meta charset="UTF-8">
        <title>Детайли - ${username}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 24px;
            background: #f7fafc;
          }
          .header {
            background: white;
            padding: 24px;
            border-radius: 8px;
            margin-bottom: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .question {
            background: white;
            padding: 16px;
            margin-bottom: 12px;
            border-radius: 8px;
            border-left: 4px solid #e2e8f0;
          }
          .question.correct {
            border-left-color: #48bb78;
            background: #f0fff4;
          }
          .question.incorrect {
            border-left-color: #f56565;
            background: #fff5f5;
          }
          .q-text {
            font-weight: 600;
            margin-bottom: 8px;
          }
          .answer {
            margin-left: 16px;
            font-size: 14px;
          }
          .correct-mark {
            color: #48bb78;
            font-weight: bold;
          }
          .incorrect-mark {
            color: #f56565;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📝 Детайли за ${escapeHtml(username)}</h1>
          <p>Резултат: ${result.score}/${result.total} (${result.percentage}%)</p>
          <p>Време: ${formatTime(result.timeTaken)} | Дата: ${formatDate(result.timestamp)}</p>
        </div>
        ${result.answers.map((answer, index) => `
          <div class="question ${answer.isCorrect ? 'correct' : 'incorrect'}">
            <div class="q-text">${index + 1}. ${escapeHtml(answer.question)}</div>
            <div class="answer">
              ${answer.isCorrect ? '✅' : '❌'}
              <strong>Отговор:</strong> ${escapeHtml(answer.userAnswer || 'Не е отговорено')}
            </div>
            ${!answer.isCorrect ? `
              <div class="answer" style="color: #48bb78;">
                ✅ <strong>Верен:</strong> ${escapeHtml(answer.correctAnswer)}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </body>
      </html>
    `);
  };

  // Event listeners
  elements.searchFilter.addEventListener('input', (e) => filterResults(e.target.value));
  elements.sortByScore.addEventListener('click', sortByScore);
  elements.sortByDate.addEventListener('click', sortByDate);
  elements.exportBtn.addEventListener('click', exportToCSV);

  // Initialize
  init();
})();
