// Quiz Manager - Manages quiz state, timer, scoring
class QuizManager {
  constructor(questions, config = {}) {
    this.allQuestions = questions;
    this.config = {
      questionCount: config.questionCount || 25,
      timeLimit: config.timeLimit || 25 * 60, // 25 minutes in seconds
      ...config
    };

    // Quiz state
    this.currentQuestions = [];
    this.currentQuestionIndex = 0;
    this.userAnswers = [];
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
   * Initialize quiz - select random questions
   */
  initializeQuiz() {
    this.currentQuestions = MoodleXMLParser.selectRandomQuestions(
      this.allQuestions,
      this.config.questionCount
    );

    // Shuffle answers for each question
    this.currentQuestions = this.currentQuestions.map(q => {
      const question = { ...q };
      const answersWithCorrect = question.answers.map((answer, index) => ({
        text: answer,
        isCorrect: index === question.correctAnswer
      }));

      // Shuffle answers
      const shuffled = MoodleXMLParser.shuffleArray(answersWithCorrect);
      question.answers = shuffled.map(a => a.text);
      question.correctAnswer = shuffled.findIndex(a => a.isCorrect);

      return question;
    });

    // Initialize user answers array
    this.userAnswers = new Array(this.currentQuestions.length).fill(null);
    this.currentQuestionIndex = 0;
  }

  /**
   * Start quiz timer
   */
  startTimer() {
    this.startTime = Date.now();
    this.timeRemaining = this.config.timeLimit;

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
   * Pause quiz timer (for anti-cheating)
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
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time
   */
  static formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Get current question
   * @returns {Object} Current question object
   */
  getCurrentQuestion() {
    return this.currentQuestions[this.currentQuestionIndex];
  }

  /**
   * Record user answer for current question
   * @param {number} answerIndex - Selected answer index
   */
  answerCurrentQuestion(answerIndex) {
    this.userAnswers[this.currentQuestionIndex] = answerIndex;
  }

  /**
   * Move to next question
   * @returns {boolean} True if moved, false if at end
   */
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

  /**
   * Move to previous question
   * @returns {boolean} True if moved, false if at start
   */
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

  /**
   * Go to specific question
   * @param {number} index - Question index
   */
  goToQuestion(index) {
    if (index >= 0 && index < this.currentQuestions.length) {
      this.currentQuestionIndex = index;
      if (this.onQuestionChange) {
        this.onQuestionChange(this.currentQuestionIndex);
      }
    }
  }

  /**
   * Check if all questions are answered
   * @returns {boolean} True if all answered
   */
  areAllQuestionsAnswered() {
    return this.userAnswers.every(answer => answer !== null);
  }

  /**
   * Get unanswered question indices
   * @returns {Array} Indices of unanswered questions
   */
  getUnansweredQuestions() {
    return this.userAnswers
      .map((answer, index) => (answer === null ? index : null))
      .filter(index => index !== null);
  }

  /**
   * Calculate quiz score
   * @returns {Object} Score details
   */
  calculateScore() {
    let correctCount = 0;
    const details = this.currentQuestions.map((question, index) => {
      const userAnswer = this.userAnswers[index];
      const isCorrect = userAnswer === question.correctAnswer;
      if (isCorrect) correctCount++;

      return {
        questionId: question.id,
        questionText: question.question,
        userAnswer: userAnswer !== null ? question.answers[userAnswer] : null,
        correctAnswer: question.answers[question.correctAnswer],
        isCorrect
      };
    });

    const totalQuestions = this.currentQuestions.length;
    const percentage = (correctCount / totalQuestions) * 100;
    const timeTaken = this.endTime ? (this.endTime - this.startTime) / 1000 : 0;

    return {
      score: correctCount,
      total: totalQuestions,
      percentage: percentage.toFixed(2),
      timeTaken: Math.round(timeTaken),
      details
    };
  }

  /**
   * Get quiz summary for submission
   * @param {string} username - GitHub username
   * @returns {Object} Quiz result object
   */
  getQuizResult(username) {
    const score = this.calculateScore();

    return {
      username,
      timestamp: new Date().toISOString(),
      score: score.score,
      total: score.total,
      percentage: score.percentage
    };
  }

  /**
   * Get quiz progress
   * @returns {Object} Progress information
   */
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
