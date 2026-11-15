// Quiz Application - Main Integration
// Паролите, въпросите с верни отговори и оценяването са в Cloudflare Worker-а.
// Този файл само показва въпросите и праща отговорите.
(async function() {
  'use strict';

  // State
  let quizManager = null;
  let quizApi = null;
  let currentUser = null;
  let accessTicket = null;   // издаден от worker-а след вярна парола
  let quizSession = null;    // подписана сесия от worker-а (въпроси + начало)
  let isQuizLocked = false;
  let tabSwitchCount = 0;
  let isSubmitting = false;

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
   * Lock quiz when student switches tabs (anti-cheating)
   */
  function lockQuiz() {
    if (isQuizLocked) return; // Already locked

    isQuizLocked = true;
    tabSwitchCount++;

    // Pause timer
    if (quizManager) {
      quizManager.pauseTimer();
    }

    // Show lock modal
    showLockModal();
  }

  /**
   * Show lock modal with teacher password prompt (паролата се проверява в worker-а)
   */
  function showLockModal() {
    const modal = document.createElement('div');
    modal.id = 'lock-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    modal.innerHTML = `
      <div style="background: white; padding: 2rem; border-radius: 12px; max-width: 400px; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
        <h2 style="color: #c53030; margin-bottom: 1rem; font-size: 1.5rem;">Тестът е заключен!</h2>
        <p style="color: #666; margin-bottom: 1.5rem;">
          Засечена е смяна на таб или прозорец.<br/>
          Това е регистрирано като опит за измама.<br/>
          <strong>Брой засечени опити: ${tabSwitchCount}</strong>
        </p>
        <p style="color: #333; margin-bottom: 1rem; font-weight: 600;">
          Моля, въведете парола от преподавател за да продължите:
        </p>
        <input type="password" id="teacher-unlock-password"
               placeholder="Парола от преподавател"
               style="width: 100%; padding: 0.75rem; border: 2px solid #e2e8f0; border-radius: 6px; margin-bottom: 1rem; font-size: 1rem;"/>
        <div id="unlock-error" style="color: #c53030; margin-bottom: 1rem; display: none; font-size: 0.875rem;">
          Грешна парола!
        </div>
        <button id="unlock-btn"
                style="width: 100%; padding: 0.75rem; background: #667eea; color: white; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer;">
          Продължи
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const passwordInput = document.getElementById('teacher-unlock-password');
    const unlockBtn = document.getElementById('unlock-btn');
    const unlockError = document.getElementById('unlock-error');

    // Focus password input
    setTimeout(() => passwordInput.focus(), 100);

    // Handle unlock
    const attemptUnlock = async () => {
      const password = passwordInput.value;
      unlockBtn.disabled = true;

      try {
        await quizApi.unlock(quizSession, password);
        unlockQuiz();
        modal.remove();
      } catch (error) {
        unlockError.textContent = error.status === 401 ? 'Грешна парола!' : ('Грешка: ' + error.message);
        unlockError.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
      } finally {
        unlockBtn.disabled = false;
      }
    };

    unlockBtn.addEventListener('click', attemptUnlock);
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') attemptUnlock();
    });
  }

  /**
   * Unlock quiz after teacher password
   */
  function unlockQuiz() {
    isQuizLocked = false;

    // Resume timer
    if (quizManager) {
      quizManager.resumeTimer();
    }
  }

  /**
   * Setup anti-cheating monitoring
   */
  function setupAntiCheating() {
    // Detect tab visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && screens.active.style.display === 'block' && !isQuizLocked) {
        lockQuiz();
      }
    });

    // Detect window blur (switching to another app)
    window.addEventListener('blur', () => {
      if (screens.active.style.display === 'block' && !isQuizLocked) {
        lockQuiz();
      }
    });
  }

  /**
   * Validate faculty number format (XXX-XXXXXX)
   */
  function validateFacultyNumber(value) {
    const pattern = /^\d{3}-\d{6}$/;
    return pattern.test(value);
  }

  /**
   * Handle access form submission - паролата се проверява в worker-а
   */
  async function handleAccessFormSubmit(e) {
    e.preventDefault();

    const facultyInput = document.getElementById('faculty-number');
    const passwordInput = document.getElementById('test-password');
    const facultyError = document.getElementById('faculty-error');
    const passwordError = document.getElementById('password-error');
    const submitButton = e.target.querySelector('button[type="submit"]');

    // Reset errors
    facultyError.classList.remove('visible');
    passwordError.classList.remove('visible');
    facultyInput.classList.remove('error');
    passwordInput.classList.remove('error');

    // Validate faculty number format locally (само формат)
    if (!validateFacultyNumber(facultyInput.value)) {
      facultyError.classList.add('visible');
      facultyInput.classList.add('error');
      return;
    }

    // Must be logged in with GitHub
    if (!auth.isAuthenticated()) {
      window.location.href = 'index.html';
      return;
    }

    currentUser = auth.getUser();
    quizApi = new QuizApi(auth.getToken());
    if (submitButton) submitButton.disabled = true;

    try {
      const data = await quizApi.access(facultyInput.value, passwordInput.value);
      accessTicket = data.ticket;

      document.getElementById('access-modal').classList.add('hidden');
      elements.usernameDisplay.textContent = currentUser.login;
      setupAntiCheating();
      showScreen('start');

    } catch (error) {
      if (error.status === 401 && error.message === 'Грешна парола') {
        passwordError.classList.add('visible');
        passwordInput.classList.add('error');
        passwordInput.value = '';
        passwordInput.focus();
      } else if (error.status === 401) {
        // Невалиден GitHub token - логни се отново
        auth.clearAuth();
        window.location.href = 'index.html';
      } else if (error.status === 409) {
        // Вече решаван тест
        document.getElementById('access-modal').classList.add('hidden');
        showScreen('start');
        const prev = error.data && error.data.previous;
        const when = prev && prev.timestamp ? new Date(prev.timestamp).toLocaleString('bg-BG') : '';
        showError(`❌ Вече сте решавали този тест${when ? ' на ' + when : ''}.` +
          (prev ? ` Резултат: ${prev.score}/${prev.total} (${prev.percentage}%)` : ''));
        elements.startBtn.disabled = true;
      } else {
        passwordError.textContent = 'Грешка: ' + error.message;
        passwordError.classList.add('visible');
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
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
   * Start quiz - worker-ът избира въпросите и стартира часовника
   */
  async function startQuiz() {
    elements.startBtn.disabled = true;
    try {
      showScreen('loading');

      const data = await quizApi.start(accessTicket);
      quizSession = data.session;

      quizManager = new QuizManager(data.questions, {
        timeLimit: data.timeLimit || 25 * 60
      });

      // Setup timer callbacks
      quizManager.onTimerTick = updateTimer;
      quizManager.onTimerExpired = handleTimerExpired;
      quizManager.onQuestionChange = renderCurrentQuestion;

      // Start timer
      quizManager.startTimer();
      updateTimer(quizManager.timeRemaining);

      // Show quiz
      showScreen('active');
      renderQuestionNavigator();
      renderCurrentQuestion();

    } catch (error) {
      console.error('Error starting quiz:', error);
      showScreen('start');
      if (error.status === 409) {
        showError('❌ Вече сте решавали този тест.');
      } else if (error.status === 401) {
        showError('Сесията е изтекла. Презаредете страницата и въведете паролата отново.');
      } else {
        showError('Грешка при стартиране на теста: ' + error.message);
        elements.startBtn.disabled = false;
      }
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
    submitQuiz(true);
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
    // Use innerHTML to preserve code formatting (pre tags) - съдържанието идва от преподавателя
    elements.questionText.innerHTML = question.question;

    // Render answers
    elements.answersList.innerHTML = '';
    question.answers.forEach((answer, index) => {
      const li = document.createElement('li');
      li.className = 'answer-option';

      const label = document.createElement('label');
      label.className = 'answer-label';
      // Add keyboard shortcut indicator (1, 2, 3, 4)
      label.setAttribute('data-key', index + 1);

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
   * Submit quiz - оценяването става в worker-а
   */
  async function submitQuiz(force = false) {
    if (isSubmitting) return;

    try {
      // Check if all questions are answered
      const unanswered = quizManager.getUnansweredQuestions();
      if (unanswered.length > 0 && !force) {
        const confirm = window.confirm(
          `Имате ${unanswered.length} неотговорени въпроса!\n\n` +
          `Въпроси: ${unanswered.map(i => i + 1).join(', ')}\n\n` +
          `Сигурни ли сте, че искате да предадете?`
        );

        if (!confirm) {
          return;
        }
      }

      isSubmitting = true;
      elements.submitBtn.disabled = true;

      // Stop timer
      quizManager.stopTimer();

      const result = await quizApi.submit(
        quizSession,
        quizManager.getAnswersForSubmission(),
        tabSwitchCount
      );

      // Данни за review страницата (само верен/грешен, без верните отговори)
      const reviewData = {
        score: result.score,
        total: result.total,
        percentage: result.percentage,
        timeTaken: result.timeTaken,
        completedAt: result.completedAt,
        answers: result.review
      };
      sessionStorage.setItem('quiz_review_data', JSON.stringify(reviewData));

      console.log('✅ Резултатът е запазен');

      // Redirect to review page
      window.location.href = 'review.html';

    } catch (error) {
      console.error('Error submitting quiz:', error);
      isSubmitting = false;
      elements.submitBtn.disabled = false;
      if (error.status === 409 || error.status === 410) {
        alert(error.message);
        window.location.href = 'dashboard.html';
      } else {
        alert('Грешка при предаване: ' + error.message + '\nОпитайте отново.');
      }
    }
  }

  /**
   * Keyboard shortcuts for answer selection (1, 2, 3, 4) and navigation (Enter)
   */
  function handleKeyboardShortcuts(e) {
    // Only handle keyboard shortcuts when quiz is active and not locked
    if (screens.active.style.display !== 'block' || isQuizLocked) {
      return;
    }

    const key = e.key;

    // Handle Enter key for next question
    if (key === 'Enter') {
      e.preventDefault();

      const questionIndex = quizManager.currentQuestionIndex;
      const isLastQuestion = questionIndex === quizManager.currentQuestions.length - 1;

      if (isLastQuestion) {
        // On last question, Enter submits the quiz
        elements.submitBtn.click();
      } else {
        // Otherwise, go to next question
        elements.nextBtn.click();
      }
      return;
    }

    // Handle number keys (1, 2, 3, 4) for answer selection
    // Support both regular numbers and numpad
    const numberKeys = ['1', '2', '3', '4'];
    const numpadKeys = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'];

    let answerIndex = -1;

    if (numberKeys.includes(key)) {
      answerIndex = parseInt(key) - 1;
    } else if (numpadKeys.includes(key)) {
      answerIndex = parseInt(key.replace('Numpad', '')) - 1;
    }

    if (answerIndex >= 0) {
      const question = quizManager.getCurrentQuestion();

      // Check if this answer index exists for current question
      if (answerIndex < question.answers.length) {
        handleAnswerSelect(answerIndex);

        // Update radio button UI
        const radios = elements.answersList.querySelectorAll('.answer-radio');
        radios.forEach((radio, index) => {
          radio.checked = (index === answerIndex);
        });
      }
    }
  }

  /**
   * Event listeners
   */
  document.getElementById('access-form').addEventListener('submit', handleAccessFormSubmit);
  elements.startBtn.addEventListener('click', startQuiz);
  elements.prevBtn.addEventListener('click', () => quizManager.previousQuestion());
  elements.nextBtn.addEventListener('click', () => quizManager.nextQuestion());
  elements.submitBtn.addEventListener('click', () => submitQuiz(false));

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // Access modal is shown on load; the quiz starts after the worker validates the password
})();
