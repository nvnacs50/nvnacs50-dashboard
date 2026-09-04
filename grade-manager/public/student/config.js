

// GitHub Classroom Dashboard Configuration
// ВАЖНО: Попълни тези стойности след като създадеш OAuth App

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


  // Quiz Questions Gist ID (PUBLIC)
  // Въпросите са в public Gist (не в repo)
  QUIZ_QUESTIONS_GIST_ID: '3633387239d3257a62397134fb1c9bb5',

  // Quiz Results Gist ID (PRIVATE)
  // Учителят вижда всички резултати тук
  QUIZ_RESULTS_GIST_ID: 'decf38f65f3a2dcd46771afec0069d06',

  // Cloudflare Worker URL (saves results securely)
  // Teacher's token is stored as Worker secret (not in code)
  QUIZ_RESULTS_WORKER_URL: 'https://quiz-results-saver.m-avramova.workers.dev',

  // Quiz access password
  QUIZ_ACCESS_PASSWORD: 'testC2025'
};

// Export за използване в други scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
