// Quiz Application - Main Integration
(async function() {
  'use strict';

  // State
  let quizManager = null;
  let quizStorage = null;
  let allQuestions = [];
  let currentUser = null;
  let facultyNumber = null;
  let quizStartTime = null;

  // DOM Elements
  const screens = {
    loading: document.getElementById('loading'),
    start: document.getElementById('quiz-start'),
    active: document.getElementById('quiz-active'),
    results: document.getElementById('quiz-results')
  };

  const elements = {
    startBtn: document.getElementById('start-quiz-btn'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    submitBtn: document.getElementById('submit-btn'),
    timer: document.getElementById('timer'),
    questionNumber: document.getElementById('question-number'),
    questionText: document.getElementById('question-text'),
    answersList: document.getElementById('answers-list'),
    progressText: document.getElementById('progress-text'),
    answeredCount: document.getElementById('answered-count'),
    progressFill: document.getElementById('progress-fill'),
    questionNavigator: document.getElementById('question-navigator'),
    usernameDisplay: document.getElementById('username-display'),
    errorContainer: document.getElementById('error-container'),
    finalScore: document.getElementById('final-score'),
    scoreLabel: document.getElementById('score-label'),
    resultMessage: document.getElementById('result-message'),
    resultDetails: document.getElementById('result-details')
  };

  /**
   * Show specific screen
   */
  function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.style.display = 'none');
    screens[screenName].style.display = 'block';
  }

  /**
   * Validate faculty number format (XXX-XXXXXX)
   */
  function validateFacultyNumber(value) {
    const pattern = /^\d{3}-\d{6}$/;
    return pattern.test(value);
  }

  /**
   * Handle access form submission
   */
  function handleAccessFormSubmit(e) {
    e.preventDefault();

    const facultyInput = document.getElementById('faculty-number');
    const passwordInput = document.getElementById('test-password');
    const facultyError = document.getElementById('faculty-error');
    const passwordError = document.getElementById('password-error');

    // Reset errors
    facultyError.classList.remove('visible');
    passwordError.classList.remove('visible');
    facultyInput.classList.remove('error');
    passwordInput.classList.remove('error');

    let hasError = false;

    // Validate faculty number
    if (!validateFacultyNumber(facultyInput.value)) {
      facultyError.classList.add('visible');
      facultyInput.classList.add('error');
      hasError = true;
    }

    // Validate password
    if (passwordInput.value !== CONFIG.QUIZ_ACCESS_PASSWORD) {
      passwordError.classList.add('visible');
      passwordInput.classList.add('error');
      hasError = true;
    }

    if (hasError) {
      return;
    }

    // Success - store faculty number, start time, and hide modal
    facultyNumber = facultyInput.value;
    quizStartTime = new Date().toISOString();
    document.getElementById('access-modal').classList.add('hidden');

    // Initialize quiz
    init();
  }

  /**
   * Show error message
   */
  function showError(message) {
    elements.errorContainer.innerHTML = `
      <div class="error-message">${message}</div>
    `;
  }

  /**
   * Show success message
   */
  function showSuccess(message) {
    elements.errorContainer.innerHTML = `
      <div class="success-message">${message}</div>
    `;
  }

  /**
   * Initialize application
   */
  async function init() {
    try {
      showScreen('loading');

      // Check authentication
      if (!auth.isAuthenticated()) {
        window.location.href = 'index.html';
        return;
      }

      currentUser = auth.getUser();
      const token = auth.getToken();

      elements.usernameDisplay.textContent = currentUser.login;

      // Initialize storage
      quizStorage = new QuizStorage(token);

      // Check for previous attempt (GitHub Gist - source of truth)
      const previousAttempt = await quizStorage.checkPreviousAttempt(currentUser.login);
      if (previousAttempt) {
        showScreen('start');
        showError(`❌ Вече сте решавали този тест на ${new Date(previousAttempt.timestamp).toLocaleString('bg-BG')}. Резултат: ${previousAttempt.score} (${previousAttempt.percentage}%)`);
        elements.startBtn.disabled = true;
        return;
      }

      // Load questions from public Gist
      const gistId = CONFIG.QUIZ_QUESTIONS_GIST_ID;
      allQuestions = await MoodleXMLParser.loadFromGist(gistId, token);
      console.log(`✅ Заредени ${allQuestions.length} въпроса`);

      showScreen('start');

    } catch (error) {
      console.error('Initialization error:', error);
      showScreen('start');

      if (error.message.includes('Gist ID не е конфигуриран')) {
        showError('⚙️ Системата все още не е конфигурирана. Свържете се с учителя.');
      } else {
        showError('Грешка при зареждане на въпросите: ' + error.message);
      }
    }
  }

  /**
   * Start quiz
   */
  function startQuiz() {
    try {
      // Initialize quiz manager
      quizManager = new QuizManager(allQuestions, {
        questionCount: 25,
        timeLimit: 25 * 60 // 25 minutes
      });

      quizManager.initializeQuiz();

      // Setup timer callbacks
      quizManager.onTimerTick = updateTimer;
      quizManager.onTimerExpired = handleTimerExpired;
      quizManager.onQuestionChange = renderCurrentQuestion;

      // Start timer
      quizManager.startTimer();

      // Show quiz
      showScreen('active');
      renderQuestionNavigator();
      renderCurrentQuestion();

    } catch (error) {
      console.error('Error starting quiz:', error);
      showError('Грешка при стартиране на теста.');
    }
  }

  /**
   * Update timer display
   */
  function updateTimer(secondsRemaining) {
    const formatted = QuizManager.formatTime(secondsRemaining);
    elements.timer.textContent = formatted;

    // Warning when less than 5 minutes
    if (secondsRemaining <= 300) {
      elements.timer.classList.add('warning');
    }
  }

  /**
   * Handle timer expired
   */
  function handleTimerExpired() {
    alert('⏰ Времето изтече! Тестът ще бъде автоматично предаден.');
    submitQuiz();
  }

  /**
   * Render question navigator (dots)
   */
  function renderQuestionNavigator() {
    const totalQuestions = quizManager.currentQuestions.length;
    elements.questionNavigator.innerHTML = '';

    for (let i = 0; i < totalQuestions; i++) {
      const dot = document.createElement('div');
      dot.className = 'nav-dot';
      dot.textContent = i + 1;
      dot.onclick = () => quizManager.goToQuestion(i);

      elements.questionNavigator.appendChild(dot);
    }

    updateQuestionNavigator();
  }

  /**
   * Update question navigator state
   */
  function updateQuestionNavigator() {
    const dots = elements.questionNavigator.querySelectorAll('.nav-dot');
    dots.forEach((dot, index) => {
      dot.classList.remove('current', 'answered');

      if (index === quizManager.currentQuestionIndex) {
        dot.classList.add('current');
      }

      if (quizManager.userAnswers[index] !== null) {
        dot.classList.add('answered');
      }
    });
  }

  /**
   * Render current question
   */
  function renderCurrentQuestion() {
    const question = quizManager.getCurrentQuestion();
    const questionIndex = quizManager.currentQuestionIndex;

    // Update question header
    elements.questionNumber.textContent = `Въпрос ${questionIndex + 1}`;
    elements.questionText.textContent = question.question;

    // Render answers
    elements.answersList.innerHTML = '';
    question.answers.forEach((answer, index) => {
      const li = document.createElement('li');
      li.className = 'answer-option';

      const label = document.createElement('label');
      label.className = 'answer-label';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'answer';
      radio.value = index;
      radio.className = 'answer-radio';
      radio.checked = quizManager.userAnswers[questionIndex] === index;
      radio.onchange = () => handleAnswerSelect(index);

      const answerText = document.createElement('span');
      answerText.className = 'answer-text';
      answerText.textContent = answer;

      label.appendChild(radio);
      label.appendChild(answerText);
      li.appendChild(label);
      elements.answersList.appendChild(li);
    });

    // Update navigation buttons
    elements.prevBtn.disabled = questionIndex === 0;
    elements.nextBtn.disabled = questionIndex === quizManager.currentQuestions.length - 1;

    // Show submit button on last question
    if (questionIndex === quizManager.currentQuestions.length - 1) {
      elements.nextBtn.style.display = 'none';
      elements.submitBtn.style.display = 'block';
    } else {
      elements.nextBtn.style.display = 'block';
      elements.submitBtn.style.display = 'none';
    }

    updateProgress();
    updateQuestionNavigator();
  }

  /**
   * Handle answer selection
   */
  function handleAnswerSelect(answerIndex) {
    quizManager.answerCurrentQuestion(answerIndex);
    updateProgress();
    updateQuestionNavigator();
  }

  /**
   * Update progress display
   */
  function updateProgress() {
    const progress = quizManager.getProgress();

    elements.progressText.textContent = `Въпрос ${progress.current} от ${progress.total}`;
    elements.answeredCount.textContent = `Отговорени: ${progress.answered}/${progress.total}`;
    elements.progressFill.style.width = `${progress.percentage}%`;
  }

  /**
   * Submit quiz
   */
  async function submitQuiz() {
    try {
      // Check if all questions are answered
      const unanswered = quizManager.getUnansweredQuestions();
      if (unanswered.length > 0) {
        const confirm = window.confirm(
          `Имате ${unanswered.length} неотговорени въпроса!\n\n` +
          `Въпроси: ${unanswered.map(i => i + 1).join(', ')}\n\n` +
          `Сигурни ли сте, че искате да предадете?`
        );

        if (!confirm) {
          return;
        }
      }

      // Stop timer
      quizManager.stopTimer();

      // Get result
      const result = quizManager.getQuizResult(currentUser.login);

      // Add faculty number and timestamps
      result.facultyNumber = facultyNumber;
      result.startedAt = quizStartTime;
      result.completedAt = new Date().toISOString();

      // Calculate time taken in seconds
      const startTime = new Date(quizStartTime);
      const endTime = new Date(result.completedAt);
      result.timeTaken = Math.floor((endTime - startTime) / 1000);

      // Mark as attempted locally
      LocalQuizAttempts.markAttempted(currentUser.login);

      // Submit to GitHub
      await quizStorage.submitResult(result);
      console.log('✅ Резултатът е запазен в GitHub Gist');

      // Show results
      showResults(result);

    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert('Грешка: ' + error.message);
    }
  }

  /**
   * Show results screen
   */
  function showResults(result) {
    showScreen('results');

    elements.finalScore.textContent = `${result.score}/${result.total}`;

    const percentage = parseFloat(result.percentage);
    let message = '';
    if (percentage >= 90) {
      message = '🌟 Отлично! Имате отлично разбиране на материала.';
    } else if (percentage >= 75) {
      message = '👍 Много добре! Продължавайте в същия дух.';
    } else if (percentage >= 60) {
      message = '✅ Добре! Има място за подобрение.';
    } else {
      message = '📚 Прегледайте материала отново.';
    }

    elements.resultMessage.innerHTML = `<p style="font-size: 18px; color: #4a5568;">${message}</p>`;

    // Result details
    elements.resultDetails.innerHTML = `
      <li><strong>Верни отговори:</strong> ${result.score} от ${result.total}</li>
      <li><strong>Процент:</strong> ${result.percentage}%</li>
      <li><strong>Използвано време:</strong> ${QuizManager.formatTime(result.timeTaken)}</li>
      <li><strong>Дата:</strong> ${new Date(result.timestamp).toLocaleString('bg-BG')}</li>
    `;
  }

  /**
   * Event listeners
   */
  document.getElementById('access-form').addEventListener('submit', handleAccessFormSubmit);
  elements.startBtn.addEventListener('click', startQuiz);
  elements.prevBtn.addEventListener('click', () => quizManager.previousQuestion());
  elements.nextBtn.addEventListener('click', () => quizManager.nextQuestion());
  elements.submitBtn.addEventListener('click', submitQuiz);

  // Show access modal on load (init() is called after successful validation)
})();
