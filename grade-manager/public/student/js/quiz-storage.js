// Quiz Storage - Store results in GitHub Gists
class QuizStorage {
  constructor(githubToken) {
    this.token = githubToken;
    this.apiBase = 'https://api.github.com';
    this.gistDescription = 'CS50 Quiz Results';
    this.resultsFileName = 'quiz-results.json';
  }

  /**
   * Check if user has already taken the quiz
   * @param {string} username - GitHub username
   * @returns {Promise<Object|null>} Previous result or null
   */
  async checkPreviousAttempt(username) {
    try {
      const gistId = CONFIG.QUIZ_RESULTS_GIST_ID;

      // Fetch shared results Gist (no auth needed, it's private but we can read with token)
      const response = await fetch(`https://api.github.com/gists/${gistId}`);

      if (!response.ok) {
        console.warn('Could not fetch results Gist');
        return null;
      }

      const gistData = await response.json();
      const content = JSON.parse(gistData.files[this.resultsFileName]?.content || '[]');

      // Check if this user has submitted
      return content.find(result => result.username === username) || null;

    } catch (error) {
      console.error('Грешка при проверка за предишен опит:', error);
      return null;
    }
  }

  /**
   * Submit quiz results via Cloudflare Worker
   * @param {Object} result - Quiz result object
   * @returns {Promise<Object>} Worker response
   */
  async submitResult(result) {
    try {
      // Post to Cloudflare Worker (teacher's token is stored there as secret)
      const workerUrl = 'https://quiz-results-saver.m-avramova.workers.dev';

      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(result)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || `Worker грешка: ${response.status}`);
      }

      return responseData;
    } catch (error) {
      console.error('Грешка при запазване на резултат:', error);
      throw error;
    }
  }

  /**
   * Create new gist with result
   * @param {Object} result - Quiz result
   * @returns {Promise<Object>} Gist response
   */
  async createGist(result) {
    const response = await fetch(`${this.apiBase}/gists`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        description: this.gistDescription,
        public: false,
        files: {
          [this.resultsFileName]: {
            content: JSON.stringify([result], null, 2)
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub API грешка: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Update existing gist with new result
   * @param {string} gistId - Gist ID
   * @param {Object} newResult - New quiz result
   * @returns {Promise<Object>} Gist response
   */
  async updateGist(gistId, newResult) {
    // Fetch current content
    const gist = await this.fetchGist(gistId);
    const currentContent = JSON.parse(gist.files[this.resultsFileName].content);

    // Check if user already has a result
    const existingIndex = currentContent.findIndex(r => r.username === newResult.username);

    if (existingIndex !== -1) {
      // User already submitted - this shouldn't happen if we check properly
      throw new Error('Вече сте решавали този тест!');
    }

    // Add new result
    currentContent.push(newResult);

    // Update gist
    const response = await fetch(`${this.apiBase}/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        files: {
          [this.resultsFileName]: {
            content: JSON.stringify(currentContent, null, 2)
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub API грешка: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Get user's gists
   * @returns {Promise<Array>} Array of gists
   */
  async getUserGists() {
    const response = await fetch(`${this.apiBase}/gists`, {
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API грешка: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Fetch specific gist
   * @param {string} gistId - Gist ID
   * @returns {Promise<Object>} Gist data
   */
  async fetchGist(gistId) {
    const response = await fetch(`${this.apiBase}/gists/${gistId}`, {
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API грешка: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Get all quiz results (for teachers)
   * @returns {Promise<Array>} All quiz results
   */
  async getAllResults() {
    try {
      const gists = await this.getUserGists();

      const quizGist = gists.find(g =>
        g.description === this.gistDescription &&
        g.files[this.resultsFileName]
      );

      if (!quizGist) {
        return [];
      }

      const gistData = await this.fetchGist(quizGist.id);
      return JSON.parse(gistData.files[this.resultsFileName].content);

    } catch (error) {
      console.error('Грешка при зареждане на резултати:', error);
      return [];
    }
  }
}

// Local storage helper for attempt tracking
class LocalQuizAttempts {
  static STORAGE_KEY = 'cs50_quiz_attempts';

  /**
   * Check if user has attempted quiz locally
   * @param {string} username - GitHub username
   * @returns {boolean} True if attempted
   */
  static hasAttempted(username) {
    const attempts = this.getAttempts();
    return attempts.includes(username);
  }

  /**
   * Mark user as having attempted
   * @param {string} username - GitHub username
   */
  static markAttempted(username) {
    const attempts = this.getAttempts();
    if (!attempts.includes(username)) {
      attempts.push(username);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(attempts));
    }
  }

  /**
   * Get all attempts from localStorage
   * @returns {Array} Array of usernames
   */
  static getAttempts() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Clear all attempts (admin only)
   */
  static clearAttempts() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
