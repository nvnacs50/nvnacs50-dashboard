# Cloudflare Worker Setup - CS50 Quiz

Worker-ът в `cloudflare-worker-quiz/` е сървърната част на теста. Той държи всичко,
което студентите не трябва да виждат:

| Какво | Къде |
|---|---|
| Парола за достъп до теста | secret `QUIZ_ACCESS_PASSWORD` |
| Парола за отключване след смяна на таб | secret `TEACHER_UNLOCK_PASSWORD` |
| Въпроси с верни отговори (Moodle XML) | secret Gist, ID-то е secret `QUIZ_QUESTIONS_GIST_ID` |
| Резултати (`quiz-results.json`) | secret Gist, ID-то е secret `QUIZ_RESULTS_GIST_ID` |
| GitHub token за Gist-овете | secret `GITHUB_TOKEN` (PAT със scope `gist`) |
| Ключ за подписване на сесии | secret `SESSION_SECRET` |
| Кой е преподавател | var `TEACHER_LOGINS` в `wrangler.toml` |
| Кои сайтове могат да викат worker-а | var `ALLOWED_ORIGINS` в `wrangler.toml` |

Браузърът получава само 25 въпроса **без** верните отговори. Оценяването, лимитът от
25 минути и правилото "един опит" се проверяват в worker-а.

---

## Стъпка 1: Инсталирайте Wrangler и влезте

```bash
npm install -g wrangler
wrangler login
```

## Стъпка 2: Secret Gist-ове

Създайте **нови** secret Gist-ове (старите ID-та са били в публичния код и са компрометирани):

```bash
# въпроси (локалният XML е gitignored)
gh gist create --filename cs50-questions.xml public/student/data/cs50-questions.xml
# резултати (празен масив)
echo "[]" > quiz-results.json && gh gist create --filename quiz-results.json quiz-results.json
```

Запишете двете ID-та от URL-ите. **Не ги слагайте в кода.**

## Стъпка 3: Secrets

```bash
cd cloudflare-worker-quiz
wrangler secret put GITHUB_TOKEN             # PAT (classic) само със scope "gist"
wrangler secret put QUIZ_QUESTIONS_GIST_ID
wrangler secret put QUIZ_RESULTS_GIST_ID
wrangler secret put QUIZ_ACCESS_PASSWORD     # нова парола за студентите
wrangler secret put TEACHER_UNLOCK_PASSWORD  # нова парола за отключване
wrangler secret put SESSION_SECRET           # напр. изхода на: openssl rand -base64 48
```

Проверете `wrangler.toml`: `TEACHER_LOGINS` трябва да съдържа вашето GitHub потребителско име,
`ALLOWED_ORIGINS` - адресите на GitHub Pages сайтовете.

## Стъпка 4: Deploy

```bash
wrangler deploy
```

Името на worker-а е `quiz-results-saver`, така че URL-ът остава
`https://quiz-results-saver.m-avramova.workers.dev` и `config.js` не се променя.

## Проверка

```bash
# без token -> 401
curl -s -X POST https://quiz-results-saver.m-avramova.workers.dev/results -d '{}'
# с ваш token (gh auth token) -> списък с резултати
curl -s -X POST https://quiz-results-saver.m-avramova.workers.dev/results \
  -H "Authorization: Bearer $(gh auth token)" -d '{}'
```

## Смяна на паролата за теста

```bash
cd cloudflare-worker-quiz && wrangler secret put QUIZ_ACCESS_PASSWORD
```

Без нов deploy и без промяна в кода.

## Обновяване на въпросите

```bash
gh gist edit <QUIZ_QUESTIONS_GIST_ID> -f cs50-questions.xml public/student/data/cs50-questions.xml
```

Worker-ът кешира въпросите до 10 минути.
