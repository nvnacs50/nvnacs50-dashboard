

// GitHub Classroom Dashboard Configuration
// ВАЖНО: Тук има САМО публични стойности. Пароли, Gist ID-та и токени живеят
// като secrets в Cloudflare Worker-а (виж cloudflare-worker-quiz/wrangler.toml).

const CONFIG = {
  // GitHub OAuth App Client ID (публичен, може да е в кода)
  GITHUB_CLIENT_ID: 'Ov23li88GTM0e75wAX9p',

  // URL на Cloudflare Worker за token exchange
  OAUTH_PROXY_URL: 'https://github-classroom-oauth.m-avramova.workers.dev/auth',

  // Worker, който създава студентски repo-та от темплейт
  ASSIGNMENTS_WORKER_URL: 'https://nvnacs50-assignments.m-avramova.workers.dev',

  // GitHub Organization
  // Филтрира само repos от тази organization
  GITHUB_CLASSROOM_ORG: 'nvnacs50',

  // Repo naming pattern за GitHub Classroom assignments
  // Обикновено GitHub Classroom създава repos с pattern: assignment-name-username
  ASSIGNMENT_REPO_PATTERN: /^(?!.*-simple$).*$/, // Exclude repos ending with -simple

  // App URLs (автоматично се определят от window.location)
  get REDIRECT_URI() {
    return `${window.location.origin}/student/dashboard.html`;
  },

  get BASE_URL() {
    return window.location.origin;
  },


  // Cloudflare Worker за теста: проверява паролата, раздава въпросите (без верни
  // отговори), оценява и пази резултатите. Клиентът няма достъп до Gist-овете.
  QUIZ_WORKER_URL: 'https://quiz-results-saver.m-avramova.workers.dev'
};

// Export за използване в други scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
