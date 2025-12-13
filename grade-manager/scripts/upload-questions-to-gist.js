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
const CONFIG_FILE = path.join(__dirname, '../public/student/config.js');

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

    // Update config.js
    console.log('📝 Обновяване на config.js...');
    updateConfig(gist.id);

    console.log('');
    console.log('🎉 Готово!');
    console.log('');
    console.log('Следващи стъпки:');
    console.log('  1. ✅ Въпросите са качени като PRIVATE Gist');
    console.log('  2. ✅ config.js е обновен автоматично');
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

function updateConfig(gistId) {
  try {
    let configContent = fs.readFileSync(CONFIG_FILE, 'utf-8');

    // Check if QUIZ_QUESTIONS_GIST_ID already exists
    if (configContent.includes('QUIZ_QUESTIONS_GIST_ID')) {
      // Update existing
      configContent = configContent.replace(
        /QUIZ_QUESTIONS_GIST_ID:\s*['"][^'"]*['"]/,
        `QUIZ_QUESTIONS_GIST_ID: '${gistId}'`
      );
    } else {
      // Add new property before closing }
      configContent = configContent.replace(
        /(\};?\s*)$/,
        `,\n  QUIZ_QUESTIONS_GIST_ID: '${gistId}'\n$1`
      );
    }

    fs.writeFileSync(CONFIG_FILE, configContent, 'utf-8');
    console.log('✅ config.js обновен');

  } catch (error) {
    console.warn('⚠️  Не можах да обновя config.js автоматично');
    console.warn('   Моля, добавете ръчно:');
    console.warn(`   QUIZ_QUESTIONS_GIST_ID: '${gistId}'`);
  }
}

// Run
uploadQuestions();
