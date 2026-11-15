// Quiz API client - всички заявки минават през Cloudflare Worker-а.
// Браузърът никога не вижда пароли, Gist ID-та или верни отговори.
class QuizApi {
  constructor(githubToken) {
    this.token = githubToken;
    this.baseUrl = CONFIG.QUIZ_WORKER_URL;
  }

  async call(path, body = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify(body)
    });

    let data = {};
    try {
      data = await response.json();
    } catch (e) {
      // празен/невалиден отговор
    }

    if (!response.ok) {
      const error = new Error(data.error || `Worker грешка: ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  /** Проверка на парола + факултетен номер. Връща { ticket }. */
  access(facultyNumber, password) {
    return this.call('/access', { facultyNumber, password });
  }

  /** Започва теста: връща { session, questions, timeLimit, startedAt }. */
  start(ticket) {
    return this.call('/start', { ticket });
  }

  /** Отключване след смяна на таб с парола от преподавател. */
  unlock(session, password) {
    return this.call('/unlock', { session, password });
  }

  /** Предаване: answers[i] е индексът на избрания отговор или null. */
  submit(session, answers, tabSwitches) {
    return this.call('/submit', { session, answers, tabSwitches });
  }

  /** Всички резултати (само за преподаватели). */
  async getAllResults() {
    const data = await this.call('/results');
    return data.results || [];
  }

  /** Изтриване на резултат (само за преподаватели). */
  deleteResult(username) {
    return this.call('/delete', { username });
  }
}

// Запазено за обратна съвместимост на старите страници
const QuizStorage = QuizApi;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuizApi;
}
