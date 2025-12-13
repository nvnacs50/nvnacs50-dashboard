// XML Parser for Moodle Question Bank
class MoodleXMLParser {
  /**
   * Parse Moodle XML file and extract questions
   * @param {string} xmlContent - Raw XML content
   * @returns {Array} Array of question objects
   */
  static parseQuestions(xmlContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('XML парсиране грешка: ' + parseError.textContent);
    }

    const questionElements = xmlDoc.querySelectorAll('question[type="multichoice"]');
    const questions = [];

    questionElements.forEach((questionEl, index) => {
      try {
        const question = this.parseQuestion(questionEl, index);
        if (question) {
          questions.push(question);
        }
      } catch (error) {
        console.warn(`Грешка при парсиране на въпрос ${index}:`, error);
      }
    });

    return questions;
  }

  /**
   * Parse single question element
   * @param {Element} questionEl - Question XML element
   * @param {number} index - Question index
   * @returns {Object} Question object
   */
  static parseQuestion(questionEl, index) {
    // Extract question name
    const nameEl = questionEl.querySelector('name > text');
    const name = nameEl ? nameEl.textContent.trim() : `Въпрос ${index + 1}`;

    // Extract question text
    const questionTextEl = questionEl.querySelector('questiontext > text');
    if (!questionTextEl) {
      console.warn(`Въпрос ${name} няма текст`);
      return null;
    }
    const questionText = questionTextEl.textContent.trim();

    // Extract answers
    const answerElements = questionEl.querySelectorAll('answer');
    const answers = [];
    let correctAnswerIndex = -1;

    answerElements.forEach((answerEl, answerIndex) => {
      const fraction = parseFloat(answerEl.getAttribute('fraction') || '0');
      const answerTextEl = answerEl.querySelector('text');

      if (answerTextEl) {
        const answerText = answerTextEl.textContent.trim();
        answers.push(answerText);

        // Check if this is the correct answer (fraction = 100)
        if (fraction === 100) {
          correctAnswerIndex = answerIndex;
        }
      }
    });

    // Extract tags
    const tagElements = questionEl.querySelectorAll('tags > tag > text');
    const tags = Array.from(tagElements).map(tag => tag.textContent.trim());

    // Validate question
    if (answers.length === 0 || correctAnswerIndex === -1) {
      console.warn(`Въпрос ${name} няма валидни отговори`);
      return null;
    }

    return {
      id: `q_${index}`,
      name,
      question: questionText,
      answers,
      correctAnswer: correctAnswerIndex,
      tags,
      difficulty: this.extractDifficulty(tags),
      category: this.extractCategory(tags)
    };
  }

  /**
   * Extract difficulty from tags
   * @param {Array} tags - Question tags
   * @returns {string} Difficulty level (easy/medium/hard)
   */
  static extractDifficulty(tags) {
    const difficultyTags = ['easy', 'medium', 'hard'];
    const found = tags.find(tag => difficultyTags.includes(tag.toLowerCase()));
    return found || 'medium';
  }

  /**
   * Extract category from tags
   * @param {Array} tags - Question tags
   * @returns {string} Category name
   */
  static extractCategory(tags) {
    // First non-difficulty tag is usually the category
    const difficultyTags = ['easy', 'medium', 'hard'];
    const category = tags.find(tag => !difficultyTags.includes(tag.toLowerCase()));
    return category || 'general';
  }

  /**
   * Load and parse XML file from URL
   * @param {string} url - URL to XML file
   * @returns {Promise<Array>} Array of questions
   */
  static async loadFromFile(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP грешка: ${response.status}`);
      }

      const xmlContent = await response.text();
      return this.parseQuestions(xmlContent);
    } catch (error) {
      console.error('Грешка при зареждане на XML файл:', error);
      throw error;
    }
  }

  /**
   * Load and parse XML from public GitHub Gist
   * @param {string} gistId - GitHub Gist ID
   * @param {string} token - GitHub OAuth token (optional for public)
   * @returns {Promise<Array>} Array of questions
   */
  static async loadFromGist(gistId, token) {
    try {
      if (!gistId || gistId.trim() === '') {
        throw new Error('Gist ID не е конфигуриран.');
      }

      // Fetch Gist metadata (no auth needed for public Gist)
      const gistResponse = await fetch(`https://api.github.com/gists/${gistId}`);

      if (!gistResponse.ok) {
        throw new Error(`GitHub API грешка: ${gistResponse.status}`);
      }

      const gistData = await gistResponse.json();
      const fileName = 'cs50-questions.xml';

      if (!gistData.files || !gistData.files[fileName]) {
        throw new Error(`Файл ${fileName} не е намерен в Gist`);
      }

      // Get raw URL
      const rawUrl = gistData.files[fileName].raw_url;

      // Fetch XML content (public, no auth)
      const xmlResponse = await fetch(rawUrl);

      if (!xmlResponse.ok) {
        throw new Error(`Грешка при зареждане на XML: ${xmlResponse.status}`);
      }

      const xmlContent = await xmlResponse.text();
      return this.parseQuestions(xmlContent);

    } catch (error) {
      console.error('Грешка при зареждане от Gist:', error);
      throw error;
    }
  }

  /**
   * Shuffle array (Fisher-Yates algorithm)
   * @param {Array} array - Array to shuffle
   * @returns {Array} Shuffled array
   */
  static shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Select random questions from pool
   * @param {Array} questions - All questions
   * @param {number} count - Number of questions to select
   * @returns {Array} Random subset of questions
   */
  static selectRandomQuestions(questions, count) {
    const shuffled = this.shuffleArray(questions);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MoodleXMLParser;
}
