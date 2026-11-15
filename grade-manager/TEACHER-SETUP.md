# 🔐 Teacher Setup Guide - Quiz Questions

## Защо е нужна тази стъпка?

Въпросите за теста **НЕ трябва** да са видими в публичното GitHub repo, защото студентите могат да ги видят и да мамят. Затова ги качваме като **private GitHub Gist**.

---

## 📝 Стъпка 1: Създайте GitHub Personal Access Token

1. Отворете: https://github.com/settings/tokens
2. Кликнете: **Generate new token (classic)**
3. Име на токена: `Quiz Questions Upload`
4. Scope: **Изберете само `gist`**
5. Кликнете: **Generate token**
6. **КОПИРАЙТЕ токена веднага!** (не може да го видите отново)

---

## 📤 Стъпка 2: Качете въпросите като Private Gist

### Windows:

```cmd
set GITHUB_TOKEN=вашият_токен_тук
cd C:\Users\Misha\Desktop\Grade-Manager\grade-manager\grade-manager
node scripts/upload-questions-to-gist.js
```

### Linux/Mac:

```bash
export GITHUB_TOKEN=вашият_токен_тук
cd /path/to/grade-manager/grade-manager
node scripts/upload-questions-to-gist.js
```

---

## ✅ Какво прави скриптът?

1. ✅ Чете `public/student/data/cs50-questions.xml`
2. ✅ Създава **private** GitHub Gist с въпросите
3. ✅ Автоматично обновява `public/student/config.js` с Gist ID
4. ✅ Показва детайли за създаденото Gist

---

## 🚀 Стъпка 3: Push към GitHub

След като скриптът завърши успешно:

```bash
cd cloudflare-worker-quiz
wrangler secret put QUIZ_QUESTIONS_GIST_ID   # въведете ID-то, което скриптът отпечата
```

---

## 🔒 Сигурност

### Как е устроено:

- Въпросите (с верните отговори) са в **secret Gist**, чието ID е **secret на Cloudflare Worker-а**
  (`QUIZ_QUESTIONS_GIST_ID`). Браузърът на студента никога не вижда Gist-а.
- Worker-ът избира 25 случайни въпроса, разбърква отговорите и праща на браузъра
  **само текстовете** (без кое е вярно). Оценяването става в worker-а.
- Паролата за достъп и паролата за отключване са secrets на worker-а
  (`QUIZ_ACCESS_PASSWORD`, `TEACHER_UNLOCK_PASSWORD`), не са в кода.
- Резултатите се четат и трият само от GitHub потребители в `TEACHER_LOGINS`.

### ❌ НИКОГА НЕ:

- ❌ НЕ commit-вайте XML с въпроси (`.gitignore` блокира `public/student/data/`)
- ❌ НЕ пишете Gist ID-та, пароли или токени в `config.js`, в README или в commit съобщения
- ❌ НЕ разчитайте, че "secret" Gist е таен: **всеки, който знае ID-то, може да го чете без логин**.
  Затова ID-то живее само в worker-а.

---

## 🔄 Обновяване на въпросите

Ако искате да промените въпросите:

1. Редактирайте `public/student/data/cs50-questions.xml`
2. Пуснете отново `upload-questions-to-gist.js`
3. Скриптът ще **актуализира** съществуващото Gist

---

## ❓ Проблеми

### "GITHUB_TOKEN не е зададен"

```bash
# Windows
set GITHUB_TOKEN=вашият_токен

# Linux/Mac
export GITHUB_TOKEN=вашият_токен
```

### "Файлът не съществува"

Уверете се, че сте в правилната директория:

```bash
cd C:\Users\Misha\Desktop\Grade-Manager\grade-manager\grade-manager
ls public/student/data/cs50-questions.xml
```

### "GitHub API грешка: 401"

Токенът е невалиден или няма `gist` scope. Създайте нов токен.

---

## 📞 Поддръжка

За въпроси относно setup-а, проверете:

- `public/student/QUIZ-README.md` - Документация за quiz системата
- `scripts/upload-questions-to-gist.js` - Upload скрипт код

---

**🎓 NVNACS50 - CS50 Quiz Manager**
