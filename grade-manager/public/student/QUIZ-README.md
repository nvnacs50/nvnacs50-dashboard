# 📝 CS50 Quiz Manager

Пълна система за онлайн тестове с автоматично оценяване и запазване на резултати в GitHub.

## ✨ Функционалности

### За студенти:
- ✅ **25 въпроса** рандомизирани от 225 въпроса
- ⏱️ **25 минути** таймер
- 🎯 **1 точка = 1 верен отговор**
- 🔒 **Само 1 опит** (проверка в localStorage + GitHub)
- 💾 **Автоматично запазване** на резултати през Cloudflare Worker (оценяване на сървъра)
- 📊 **Директна визуализация** на резултат
- 🔄 **Навигация** между въпроси
- 📌 **Progress tracker** за отговорени въпроси

### За учители:
- 👥 **Преглед на всички резултати**
- 📈 **Статистики** (среден резултат, минали/паднали)
- 🔍 **Филтриране и сортиране**
- 📥 **Експорт към CSV**
- 👁️ **Детайлен преглед** на отговорите на всеки студент

---

## 📁 Файлова структура

```
public/student/
├── quiz.html                      # Quiz страница
├── quiz-results.html              # Teacher dashboard
├── data/                          # (gitignored) локален XML; качва се в secret Gist за worker-а
├── js/
│   ├── quiz-manager.js            # Quiz логика + таймер
│   ├── quiz-storage.js            # API клиент към Cloudflare Worker-а
│   ├── quiz-app.js                # Главна интеграция
│   └── quiz-results-viewer.js    # Teacher dashboard логика
```

---

## 🚀 Как работи?

### 1️⃣ Студент започва тест:

```
1. Влиза в quiz.html
2. GitHub OAuth автентикация
3. Проверка за предишен опит (localStorage + GitHub)
4. Ако НЯМА опит → Започва тест
5. Ако ИМА опит → Показва грешка "Вече сте решавали теста"
```

### 2️⃣ По време на теста:

```
- 25 минути таймер (countdown)
- Рандомизирани 25 въпроса от 225
- Shuffle на отговорите за всеки въпрос
- Навигация: Предишен/Следващ/Преглед на всички въпроси
- Progress bar показва отговорени въпроси
```

### 3️⃣ Предаване на теста:

```
1. Проверка за неотговорени въпроси
2. Изчисляване на резултат
3. Запазване в GitHub Gist (JSON файл)
4. Маркиране в localStorage
5. Показване на резултат
```

### 4️⃣ Учител преглежда резултати:

```
1. Отива на quiz-results.html
2. Fetch на всички резултати от GitHub Gist
3. Показва статистики
4. Може да филтрира, сортира, експортира
5. Може да види детайлите на всеки студент
```

---

## 🔐 Сигурност и защита

### Проверка за повторни опити:

**1. localStorage проверка (бърза):**
```javascript
LocalQuizAttempts.hasAttempted(username)
```

**2. GitHub Gist проверка (надеждна):**
```javascript
await quizStorage.checkPreviousAttempt(username)
```

### GitHub Gist структура:

```json
[
  {
    "username": "student123",
    "timestamp": "2025-12-13T14:30:00.000Z",
    "score": 20,
    "total": 25,
    "percentage": "80.00",
    "timeTaken": 1200,
    "questionCount": 25,
    "timeLimit": 1500,
    "answers": [
      {
        "question": "Какво е pointer?",
        "userAnswer": "Променлива която...",
        "correctAnswer": "Променлива която...",
        "isCorrect": true
      },
      ...
    ]
  }
]
```

---

## 📊 XML Формат (Moodle)

Въпросите са в стандартен Moodle XML формат:

```xml
<question type="multichoice">
  <name><text>C Basics 01</text></name>
  <questiontext format="html">
    <text><![CDATA[Как декларирате int?]]></text>
  </questiontext>
  <answer fraction="100"><text>int x;</text></answer>
  <answer fraction="0"><text>integer x;</text></answer>
  <answer fraction="0"><text>var x;</text></answer>
  <answer fraction="0"><text>x: int;</text></answer>
  <tags>
    <tag><text>c-basics</text></tag>
    <tag><text>easy</text></tag>
  </tags>
</question>
```

---

## 🎨 UI Компоненти

### Quiz Screen:

```
┌─────────────────────────────────────┐
│ CS50 Тест        |    Timer: 24:30  │
├─────────────────────────────────────┤
│ Въпрос 5 от 25   Отговорени: 4/25   │
│ [████████░░░░░░░░░░░░░░] 16%        │
│ [1][2][3][4][●][6]... navigation    │
├─────────────────────────────────────┤
│                                     │
│ ВЪПРОС 5                            │
│ Какво прави malloc()?               │
│                                     │
│ ○ Алокира памет                     │
│ ○ Освобождава памет                 │
│ ○ Проверява памет                   │
│ ○ Копира памет                      │
│                                     │
├─────────────────────────────────────┤
│ [← Предишен]  [Предай]  [Следващ →] │
└─────────────────────────────────────┘
```

### Results Screen:

```
┌─────────────────────────────────────┐
│        🎉 Тест завършен!            │
│                                     │
│            20/25                    │
│        Вашият резултат              │
│                                     │
│ 👍 Много добре! Продължавайте!      │
│                                     │
│ Детайли:                            │
│ • Верни: 20 от 25                   │
│ • Процент: 80.00%                   │
│ • Време: 18:30                      │
│ • Дата: 13.12.2025 14:30            │
│                                     │
│      [Към Dashboard]                │
└─────────────────────────────────────┘
```

---

## 🔧 Настройки

### Промяна на брой въпроси/време:

В `quiz-app.js`:

```javascript
quizManager = new QuizManager(allQuestions, {
  questionCount: 25,    // Брой въпроси
  timeLimit: 25 * 60    // Време в секунди (25 мин)
});
```

### Промяна на минимален резултат за положен:

В `quiz-results-viewer.js`:

```javascript
const passedStudents = allResults.filter(
  r => parseFloat(r.percentage) >= 60  // 60% = минимум
).length;
```

---

## 📱 Responsive Design

- ✅ Desktop (1200px+)
- ✅ Tablet (768px - 1200px)
- ✅ Mobile (320px - 768px)

---

## 🐛 Известни ограничения

1. **GitHub Gists лимит:** Max 1MB per file (~5000 студента)
2. **localStorage:** Може да се изчисти от браузъра
3. **Timer:** Ако затворят таба, таймерът спира
4. **Offline:** Не работи без интернет

---

## 💡 Бъдещи подобрения

- [ ] Backup на резултати в GitHub Issues
- [ ] Resume quiz след затваряне на таба
- [ ] PDF export на резултати
- [ ] Различни категории тестове
- [ ] Adaptive difficulty
- [ ] Leaderboard

---

## 📞 Поддръжка

За въпроси или проблеми:
- GitHub Issues
- Email: [вашият имейл]

---

## 📄 Лиценз

MIT License - Свободна употреба!

---

**Създадено за CS50 курса в NVNACS50** 🎓
