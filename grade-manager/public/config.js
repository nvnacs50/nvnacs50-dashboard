// GitHub Classroom Dashboard Configuration
// ВАЖНО: Попълни тези стойности след като създадеш OAuth App

const CONFIG = {
  // GitHub OAuth App Client ID (публичен, може да е в кода)
  GITHUB_CLIENT_ID: 'Ov23li88GTM0e75wAX9p',

  // URL на Cloudflare Worker за token exchange
  OAUTH_PROXY_URL: 'https://github-classroom-oauth.m-avramova.workers.dev/auth',

  // GitHub Organization (ЗАДЪЛЖИТЕЛНО за role detection)
  // Организацията в която owner/admin = преподавател, member = студент
  GITHUB_CLASSROOM_ORG: 'nvnacs50',

  // Repo naming pattern за GitHub Classroom assignments
  ASSIGNMENT_REPO_PATTERN: /^(?!.*-simple$).*$/, // Exclude repos ending with -simple

  // App URLs (автоматично се определят от window.location)
  get REDIRECT_URI() {
    // GitHub Pages uses /nvnacs50-dashboard/ as base path
    const basePath = window.location.pathname.includes('/nvnacs50-dashboard/') ? '/nvnacs50-dashboard' : '';
    return `${window.location.origin}${basePath}/callback.html`;
  },

  get BASE_URL() {
    return window.location.origin;
  }
};

// Export за използване в други scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
