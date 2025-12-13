/**
 * Cloudflare Worker - Quiz Results Saver
 *
 * Accepts quiz results from students and saves to GitHub Gist
 * Teacher's token is stored as Worker Secret (not exposed)
 */

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only accept POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders
      });
    }

    try {
      // Parse request body
      const result = await request.json();

      // Validate result has required fields
      if (!result.username || result.score === undefined || result.total === undefined || !result.percentage) {
        return new Response(JSON.stringify({
          error: 'Invalid result data'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get environment variables (set in Cloudflare dashboard)
      const GIST_ID = env.QUIZ_RESULTS_GIST_ID;
      const GITHUB_TOKEN = env.GITHUB_TOKEN;

      if (!GIST_ID || !GITHUB_TOKEN) {
        return new Response(JSON.stringify({
          error: 'Worker not configured properly'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fetch current Gist content
      const gistResponse = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Quiz-Results-Worker'
        }
      });

      if (!gistResponse.ok) {
        return new Response(JSON.stringify({
          error: 'Failed to fetch Gist',
          status: gistResponse.status
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const gistData = await gistResponse.json();
      const currentContent = JSON.parse(
        gistData.files['quiz-results.json']?.content || '[]'
      );

      // Check if user already submitted
      if (currentContent.find(r => r.username === result.username)) {
        return new Response(JSON.stringify({
          error: 'Вече сте решавали този тест!'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Append new result
      currentContent.push({
        ...result,
        submittedAt: new Date().toISOString()
      });

      // Update Gist
      const updateResponse = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Quiz-Results-Worker'
        },
        body: JSON.stringify({
          files: {
            'quiz-results.json': {
              content: JSON.stringify(currentContent, null, 2)
            }
          }
        })
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        return new Response(JSON.stringify({
          error: 'Failed to save result',
          details: errorText
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Success
      return new Response(JSON.stringify({
        success: true,
        message: 'Резултатът е запазен успешно!'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
