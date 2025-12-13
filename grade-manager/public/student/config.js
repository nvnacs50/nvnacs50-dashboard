// GitHub Classroom Dashboard Configuration
// ВАЖНО: Попълни тези стойности след като създадеш OAuth App

const CONFIG = {
  // GitHub OAuth App Client ID (публичен, може да е в кода)
  GITHUB_CLIENT_ID: 'Ov23li88GTM0e75wAX9p',

  // URL на Cloudflare Worker за token exchange
  OAUTH_PROXY_URL: 'https://github-classroom-oauth.m-avramova.workers.dev/auth',

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
  QUIZ_QUESTIONS_GIST_ID: '***REMOVED***'
};

// Export за използване в други scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
