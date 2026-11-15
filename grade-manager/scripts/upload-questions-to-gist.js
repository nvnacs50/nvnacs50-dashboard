#!/usr/bin/env node
/**
 * Upload Quiz Questions to Private GitHub Gist
 *
 * ВАЖНО: Този скрипт се пуска САМО от учителя!
 *
 * Usage:
 *   node scripts/upload-questions-to-gist.js
 *
 * Prerequisites:
 *   - GitHub Personal Access Token с 'gist' scope
 *   - Въпросите в public/student/data/cs50-questions.xml
 */

const fs = require('fs');
const path = require('path');

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const QUESTIONS_FILE = path.join(__dirname, '../public/student/data/cs50-questions.xml');

if (!GITHUB_TOKEN) {
  console.error('❌ Грешка: GITHUB_TOKEN не е зададен!');
  console.error('');
  console.error('Как да зададете токен:');
  console.error('  1. Отидете на: https://github.com/settings/tokens');
  console.error('  2. Generate new token (classic)');
  console.error('  3. Изберете scope: gist');
  console.error('  4. Копирайте токена');
  console.error('  5. Пуснете:');
  console.error('     Windows: set GITHUB_TOKEN=your_token_here');
  console.error('     Linux/Mac: export GITHUB_TOKEN=your_token_here');
  console.error('');
  process.exit(1);
}

async function uploadQuestions() {
  try {
    console.log('📝 Зареждане на въпросите...');

    // Read questions file
    if (!fs.existsSync(QUESTIONS_FILE)) {
      throw new Error(`Файлът не съществува: ${QUESTIONS_FILE}`);
    }

    const questionsContent = fs.readFileSync(QUESTIONS_FILE, 'utf-8');
    console.log(`✅ Заредени ${questionsContent.length} chars`);

    console.log('');
    console.log('🔐 Качване като private Gist...');

    // Create private Gist
    const response = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        description: 'CS50 Quiz Questions - PRIVATE',
        public: false, // ВАЖНО: Private Gist!
        files: {
          'cs50-questions.xml': {
            content: questionsContent
          }
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API грешка: ${response.status}\n${error}`);
    }

    const gist = await response.json();

    console.log('');
    console.log('✅ Успешно качено!');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Gist Information:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Gist ID: ${gist.id}`);
    console.log(`URL: ${gist.html_url}`);
    console.log(`Raw URL: ${gist.files['cs50-questions.xml'].raw_url}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    console.log('🔐 Gist ID-то НЕ се записва в кода. Задайте го като secret на worker-а:');
    console.log('   cd cloudflare-worker-quiz && wrangler secret put QUIZ_QUESTIONS_GIST_ID');

    console.log('');
    console.log('🎉 Готово!');
    console.log('');
    console.log('Следващи стъпки:');
    console.log('  1. ✅ Въпросите са качени като PRIVATE Gist');
    console.log('  2. 🔐 Задайте QUIZ_QUESTIONS_GIST_ID като wrangler secret (виж по-горе)');
    console.log('  3. 🚀 Commit-нете промените (без XML файла)');
    console.log('  4. 🔒 ПАЗЕТЕ токена си в тайна!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Грешка:', error.message);
    console.error('');
    process.exit(1);
  }
}

// Run
uploadQuestions();
