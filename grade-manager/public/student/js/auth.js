// GitHub OAuth Authentication Logic

class Auth {
  constructor() {
    this.tokenKey = 'gh_token';
    this.userKey = 'gh_user';
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!localStorage.getItem(this.tokenKey);
  }

  // Get stored access token
  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  // Get stored user data
  getUser() {
    const userStr = localStorage.getItem(this.userKey);
    return userStr ? JSON.parse(userStr) : null;
  }

  // Store token and user data
  setAuth(token, user) {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  // Clear auth data (logout)
  clearAuth() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  // Initiate GitHub OAuth flow
  login() {
    const clientId = CONFIG.GITHUB_CLIENT_ID;
    const redirectUri = CONFIG.REDIRECT_URI;
    const scope = 'read:user repo';

    // Generate random state for CSRF protection
    const state = this.generateState();
    sessionStorage.setItem('oauth_state', state);

    const authUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${state}`;

    window.location.href = authUrl;
  }

  // Handle OAuth callback
  async handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    // Verify state to prevent CSRF
    const savedState = sessionStorage.getItem('oauth_state');
    if (!state || state !== savedState) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }
    sessionStorage.removeItem('oauth_state');

    if (!code) {
      throw new Error('No authorization code received');
    }

    try {
      // Exchange code for token via Cloudflare Worker
      const token = await this.exchangeCodeForToken(code);

      // Fetch user data
      const user = await this.fetchUserData(token);

      // Store auth data
      this.setAuth(token, user);

      // Clean URL
      window.history.replaceState({}, document.title, '/nvnacs50-dashboard/student/dashboard.html');

      return { token, user };
    } catch (error) {
      console.error('Auth error:', error);
      throw error;
    }
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code) {
    const response = await fetch(CONFIG.OAUTH_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    return data.access_token;
  }

  // Fetch GitHub user data
  async fetchUserData(token) {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }

    return await response.json();
  }

  // Generate random state for CSRF protection
  generateState() {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  // Logout
  logout() {
    this.clearAuth();
    const basePath = window.location.pathname.includes('/nvnacs50-dashboard/') ? '/nvnacs50-dashboard' : '';
    window.location.href = `${basePath}/`;
  }
}

// Initialize auth
const auth = new Auth();

// Logout button handler (for dashboard.html)
if (window.location.pathname.includes('/student/dashboard.html')) {
  window.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        auth.logout();
      });
    }
  });
}
