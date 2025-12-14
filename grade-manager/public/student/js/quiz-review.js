// Quiz Review - Display quiz results from sessionStorage
(function() {
  'use strict';

  // DOM Elements
  const scoreDisplay = document.getElementById('score-display');
  const percentageDisplay = document.getElementById('percentage-display');
  const correctCount = document.getElementById('correct-count');
  const incorrectCount = document.getElementById('incorrect-count');
  const timeTaken = document.getElementById('time-taken');
  const performanceMessage = document.getElementById('performance-message');
  const questionsContainer = document.getElementById('questions-container');

  /**
   * Format time from seconds to MM:SS
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Get performance message based on percentage
   */
  function getPerformanceMessage(percentage) {
    if (percentage >= 90) {
      return {
        message: '🌟 Отлично! Имате отлично разбиране на материала.',
        bgColor: 'bg-green-100 border-green-300 text-green-800'
      };
    } else if (percentage >= 75) {
      return {
        message: '👍 Много добре! Продължавайте в същия дух.',
        bgColor: 'bg-blue-100 border-blue-300 text-blue-800'
      };
    } else if (percentage >= 50) {
      return {
        message: '✅ Добре! Има място за подобрение.',
        bgColor: 'bg-yellow-100 border-yellow-300 text-yellow-800'
      };
    } else {
      return {
        message: '📚 Прегледайте материала отново.',
        bgColor: 'bg-red-100 border-red-300 text-red-800'
      };
    }
  }

  /**
   * Render quiz review
   */
  function renderReview() {
    // Get review data from sessionStorage
    const reviewDataStr = sessionStorage.getItem('quiz_review_data');

    if (!reviewDataStr) {
      // No data found - redirect to dashboard
      alert('Няма налични данни за преглед. Моля, решете теста първо.');
      window.location.href = 'dashboard.html';
      return;
    }

    try {
      const reviewData = JSON.parse(reviewDataStr);

      // Display score summary
      scoreDisplay.textContent = `${reviewData.score}/${reviewData.total}`;
      percentageDisplay.textContent = `${reviewData.percentage}%`;

      const correct = reviewData.score;
      const incorrect = reviewData.total - reviewData.score;

      correctCount.textContent = correct;
      incorrectCount.textContent = incorrect;
      timeTaken.textContent = formatTime(reviewData.timeTaken);

      // Display performance message
      const percentage = parseFloat(reviewData.percentage);
      const perfMsg = getPerformanceMessage(percentage);
      performanceMessage.textContent = perfMsg.message;
      performanceMessage.className = `mb-8 p-6 rounded-xl text-center text-lg font-medium border-2 ${perfMsg.bgColor}`;

      // Render each question
      reviewData.answers.forEach((answer, index) => {
        const questionItem = document.createElement('div');
        questionItem.className = `question-item ${answer.isCorrect ? 'correct' : 'incorrect'}`;

        // Question number and text
        const questionNumber = document.createElement('div');
        questionNumber.className = 'font-bold text-lg mb-2 text-gray-800';
        questionNumber.textContent = `Въпрос ${index + 1}`;

        const questionText = document.createElement('div');
        questionText.className = 'question-text';
        questionText.innerHTML = answer.question; // Use innerHTML to preserve <pre> tags for code

        // User's answer with colored badge
        const answerLabel = document.createElement('div');
        answerLabel.className = 'text-gray-700 text-sm mb-2';
        answerLabel.textContent = 'Твоят отговор:';

        const answerBadge = document.createElement('div');
        answerBadge.className = `answer-badge ${answer.isCorrect ? 'correct' : 'incorrect'}`;
        answerBadge.textContent = answer.userAnswer || '(Не е отговорено)';

        // Assemble the question item
        questionItem.appendChild(questionNumber);
        questionItem.appendChild(questionText);
        questionItem.appendChild(answerLabel);
        questionItem.appendChild(answerBadge);

        questionsContainer.appendChild(questionItem);
      });

      // Clear sessionStorage after rendering (data is no longer needed)
      // Uncomment the next line if you want to clear data after first view
      // sessionStorage.removeItem('quiz_review_data');

    } catch (error) {
      console.error('Error rendering review:', error);
      alert('Грешка при зареждане на резултатите.');
      window.location.href = 'dashboard.html';
    }
  }

  // Initialize review on page load
  document.addEventListener('DOMContentLoaded', renderReview);
})();
