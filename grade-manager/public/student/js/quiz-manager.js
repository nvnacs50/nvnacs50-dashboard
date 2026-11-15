// Quiz Manager - управлява състоянието на теста, навигацията и таймера.
// Въпросите идват вече избрани и разбъркани от сървъра и НЕ съдържат верни отговори.
// Оценяването се извършва изцяло в Cloudflare Worker-а.
class QuizManager {
  constructor(questions, config = {}) {
    this.currentQuestions = questions;
    this.config = {
      timeLimit: config.timeLimit || 25 * 60, // секунди
      ...config
    };

    this.currentQuestionIndex = 0;
    this.userAnswers = new Array(questions.length).fill(null);
    this.startTime = null;
    this.endTime = null;
    this.timerInterval = null;
    this.timeRemaining = this.config.timeLimit;

    // Callbacks
    this.onTimerTick = null;
    this.onTimerExpired = null;
    this.onQuestionChange = null;
  }

  /**
   * Start quiz timer
   */
  startTimer() {
    this.startTime = Date.now();
    this.timeRemaining = this.config.timeLimit;
    this.resumeTimer();
  }

  /**
   * Stop quiz timer
   */
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.endTime = Date.now();
  }

  /**
   * Pause quiz timer (anti-cheating lock)
   */
  pauseTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Resume quiz timer (after unlock)
   */
  resumeTimer() {
    if (this.timerInterval) {
      return; // Already running
    }

    this.timerInterval = setInterval(() => {
      this.timeRemaining--;

      if (this.onTimerTick) {
        this.onTimerTick(this.timeRemaining);
      }

      if (this.timeRemaining <= 0) {
        this.stopTimer();
        if (this.onTimerExpired) {
          this.onTimerExpired();
        }
      }
    }, 1000);
  }

  /**
   * Format time as MM:SS
   */
  static formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getCurrentQuestion() {
    return this.currentQuestions[this.currentQuestionIndex];
  }

  answerCurrentQuestion(answerIndex) {
    this.userAnswers[this.currentQuestionIndex] = answerIndex;
  }

  nextQuestion() {
    if (this.currentQuestionIndex < this.currentQuestions.length - 1) {
      this.currentQuestionIndex++;
      if (this.onQuestionChange) {
        this.onQuestionChange(this.currentQuestionIndex);
      }
      return true;
    }
    return false;
  }

  previousQuestion() {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      if (this.onQuestionChange) {
        this.onQuestionChange(this.currentQuestionIndex);
      }
      return true;
    }
    return false;
  }

  goToQuestion(index) {
    if (index >= 0 && index < this.currentQuestions.length) {
      this.currentQuestionIndex = index;
      if (this.onQuestionChange) {
        this.onQuestionChange(this.currentQuestionIndex);
      }
    }
  }

  areAllQuestionsAnswered() {
    return this.userAnswers.every(answer => answer !== null);
  }

  getUnansweredQuestions() {
    return this.userAnswers
      .map((answer, index) => (answer === null ? index : null))
      .filter(index => index !== null);
  }

  /**
   * Отговорите във вида, в който ги очаква worker-ът (/submit)
   */
  getAnswersForSubmission() {
    return [...this.userAnswers];
  }

  getProgress() {
    const answered = this.userAnswers.filter(a => a !== null).length;
    return {
      current: this.currentQuestionIndex + 1,
      total: this.currentQuestions.length,
      answered,
      percentage: ((answered / this.currentQuestions.length) * 100).toFixed(0)
    };
  }
}
