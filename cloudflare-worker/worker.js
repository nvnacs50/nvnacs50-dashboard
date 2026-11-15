// Cloudflare Worker for GitHub OAuth Token Exchange
// This worker acts as a proxy to exchange OAuth code for access token
// since we cannot expose GitHub Client Secret in client-side code.
//
// Secrets:  GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET  (wrangler secret put ...)
// Vars:     ALLOWED_ORIGINS - comma-separated list of origins allowed to call /auth

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Only allow POST requests to /auth
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/auth') {
      return new Response('Not Found', { status: 404 });
    }

    // Only our own sites may use this relay (the browser always sends Origin on POST)
    if (!isAllowedOrigin(origin, env)) {
      return jsonResponse({ error: 'Origin not allowed' }, 403, cors);
    }

    try {
      const body = await request.json();
      const { code, redirect_uri } = body;

      if (!code) {
        return jsonResponse({ error: 'Missing authorization code' }, 400, cors);
      }

      // Exchange code for token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code: code,
          ...(redirect_uri ? { redirect_uri } : {})
        })
      });

      const data = await tokenResponse.json();

      if (data.error) {
        return jsonResponse({
          error: data.error,
          error_description: data.error_description
        }, 400, cors);
      }

      return jsonResponse({
        access_token: data.access_token,
        token_type: data.token_type,
        scope: data.scope
      }, 200, cors);

    } catch (error) {
      console.error('Token exchange error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500, cors);
    }
  }
};

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(origin, env) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (isAllowedOrigin(origin, env)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonResponse(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}
