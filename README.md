# 📊 NVNACS50 Dashboard

**Система за управление на оценки и задачи в GitHub Classroom за CS50 курса**

![Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🎯 Какво е това?

Интегрирана система с два интерфейса за управление на GitHub Classroom задачи:

### 👨‍🏫 Преподавателски Dashboard
- Drag & drop CSV файлове от GitHub Classroom
- Автоматично изчисляване на оценки
- Визуализация на прогреса на студентите
- CS50-специфична логика за choice groups (mario-less/more, cash/credit, и т.н.)

### 👨‍🎓 Студентски Dashboard
- GitHub OAuth автентикация - влизане с GitHub акаунт
- Преглед на всички 14 CS50 задачи
- Статус на приети задачи (със създадено репо)
- Статус на завършени задачи (успешно преминати тестове)
- Реално време статус от GitHub Actions
- Privacy-first - всеки вижда само своите данни

## 🚀 Бърз старт

### За студенти

1. Отидете на: `https://nvnacs50.github.io/nvnacs50-dashboard/`
2. Натиснете "Влез с GitHub"
3. Разрешете достъп до организацията nvnacs50
4. Вижте вашите задачи и прогрес

### За преподаватели

1. Отидете на: `https://nvnacs50.github.io/nvnacs50-dashboard/teacher/`
2. Drag & drop CSV файлове от GitHub Classroom
3. Прегледайте статистики и оценки

## 📋 CS50 Задачи (14 общо)

Системата автоматично разпознава всички CS50 задачи:

**Задължителни задачи (9):**
- Hello, It's Me
- Scrabble
- Readability
- Sort
- Plurality
- Volume
- Recover
- Inheritance
- Speller

**Choice Groups (5 - избери по една):**
1. Mario (less/more comfortable)
2. Cash/Credit
3. Caesar/Substitution
4. Runoff/Tideman
5. Filter (less/more comfortable)

## 📁 Структура на проекта

```
nvnacs50-dashboard/
├── .github/
│   └── workflows/
│       └── deploy.yml              # Автоматичен deploy при push
├── grade-manager/
│   ├── src/app/                    # Next.js преподавателски dashboard
│   │   ├── page.tsx                # Главна страница
│   │   └── globals.css
│   ├── public/
│   │   ├── index.html              # Общ login
│   │   ├── config.js               # OAuth конфигурация
│   │   └── student/                # Студентски dashboard
│   │       ├── dashboard.html      # Главен dashboard
│   │       └── js/
│   │           ├── auth.js         # GitHub OAuth логика
│   │           └── github-api.js   # GitHub API client
│   ├── package.json
│   └── next.config.js
├── cloudflare-worker/              # OAuth token exchange
│   ├── worker.js
│   └── wrangler.toml
└── README.md
```

## 🛠️ Технологии

**Frontend:**
- Next.js 14 + React + TypeScript (преподаватели)
- Vanilla JavaScript + HTML (студенти)
- Tailwind CSS (styling)

**Автентикация:**
- GitHub OAuth 2.0
- Cloudflare Workers (OAuth proxy)

**API:**
- GitHub REST API v3
- GitHub Actions API (за тест резултати)

**Deployment:**
- GitHub Pages
- Автоматичен CI/CD с GitHub Actions

## ✨ Функционалности

### Студентски Dashboard

**Обща статистика:**
- 📝 **Приети задачи** - Задачи със създадено репо (от 14)
- ✅ **Завършени задачи** - Задачи с успешни тестове (от 14)
- ⏳ **В процес** - Задачи с активни или неуспешни тестове
- ❌ **Неуспешни** - Задачи с failing тестове

**Детайлна информация:**
- Списък на всички твои assignment repositories
- Последен commit и съобщение
- Статус на GitHub Actions workflow
- Директен линк към repository в GitHub

**CS50 задачи преглед:**
- Модал с всички 14 CS50 задачи
- Визуален индикатор (✓) за приети задачи
- Прогрес бар показващ завършени задачи
- Разделение между required и choice groups

### Преподавателски Dashboard

**CSV Import:**
- Drag & drop множество CSV файлове
- Автоматично извличане на assignment имена
- Автоматично определяне на максимални точки

**Статистики:**
- Обща статистика (passed/total students)
- Per-assignment детайлна статистика
- Цветова индикация (зелено=100%, жълто=50-99%, червено=<50%)

**CS50 Choice Groups:**
- Автоматично разпознаване на choice groups
- Студентът трябва да има 100% на поне една задача от групата
- Динамична визуализация на изисквания

## 🔒 Сигурност и Privacy

### Какво е публично?
- Клиентски код (HTML/CSS/JavaScript)
- GitHub OAuth Client ID
- Cloudflare Worker URL

### Какво е защитено?
- GitHub Client Secret (само в Cloudflare Worker)
- Student access tokens (localStorage в браузъра)
- Никакви данни не се съхраняват на сървър

### Privacy гаранции:
- GitHub API връща само данни на logged-in потребителя
- Невъзможно е студент да види данните на друг студент
- Няма backend база данни
- Няма логване или съхранение на tokens

## 🔧 Development

```bash
# Clone repository
git clone https://github.com/nvnacs50/nvnacs50-dashboard.git
cd nvnacs50-dashboard/grade-manager

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 🚢 Deployment

Deployment е напълно автоматичен:

1. Push промени към `main` branch
2. GitHub Actions автоматично build-ва проекта
3. Deploy към GitHub Pages
4. Достъпен на: `https://nvnacs50.github.io/nvnacs50-dashboard/`

## 📖 Конфигурация

### OAuth Setup (за administrators)

1. Създайте GitHub OAuth App в nvnacs50 организацията
2. Deploy Cloudflare Worker за token exchange
3. Актуализирайте `grade-manager/public/config.js`:

```javascript
const CONFIG = {
  GITHUB_CLIENT_ID: 'your_client_id',
  GITHUB_CLASSROOM_ORG: 'nvnacs50',
  REDIRECT_URI: 'https://nvnacs50.github.io/nvnacs50-dashboard/',
  OAUTH_PROXY_URL: 'your_cloudflare_worker_url'
};
```

Вижте [SETUP.md](SETUP.md) за детайлни инструкции.

## 🤝 Contributing

Contributions са добре дошли! Отворете issue или pull request.

## 📝 License

MIT License - използвайте свободно!

## 💡 За курса

Създадено специално за **CS50 курса в NVNACS50**.

Организация: [nvnacs50](https://github.com/nvnacs50)

---

**Въпроси или проблеми?** Отворете [issue](https://github.com/nvnacs50/nvnacs50-dashboard/issues) в GitHub.
