# Линкове за задачи — заместител на GitHub Classroom

**Дата:** 2026-09-04
**Статус:** Одобрен дизайн, предстои план за имплементация

## 1. Проблем

GitHub Classroom е пенсиониран. Наследникът (classroom50) изисква студентът да е част
от **екип**, когато му се възлага задача. Организацията `nvnacs50` не е Enterprise и този
модел не е приложим.

Досегашният поток обаче не е ползвал екипи изобщо и работи безупречно: за всяка задача
GitHub Classroom е създавал private repo в организацията от темплейт и е добавял студента
като **direct collaborator** с роля `write`. Това е чист GitHub API — не изисква нито екипи,
нито Enterprise. Целта на този документ е да опише как да го възпроизведем сами.

## 2. Цел

Преподавателят генерира линк за дадена задача. Студентът цъка линка, влиза с GitHub и
получава готово private repo в `nvnacs50`, наименувано `<задача>-<username>`, с директен
достъп само за него.

### Извън обхвата

- Групови задачи и екипи (това е точно каквото избягваме)
- Промяна на автоматичното оценяване — темплейтите вече носят CS50 autograding workflow
- Промяна на учителското табло извън една нова страница
- Мигриране или триене на съществуващи repo-та

## 3. Доказателства от текущото състояние

Всички твърдения по-долу са проверени срещу живата организация на 2026-09-04:

| Факт | Стойност |
|---|---|
| Членове на организацията | 5 (преподаватели) |
| Outside collaborators | 134 (студенти) — няма проблем със seats |
| Съществуващи студентски repo-та | 422, всичките private |
| Достъп в примерно repo | `Teodora430` → `write`, affiliation `direct` |
| Темплейти живи | всички `nvnacs50-classroom-fall2025-*` са `is_template: true`; 12 проверени повторно поименно |
| Autograding | `.github/workflows/main.yml` → `education/autograding@v1` |

Картата задача → темплейт е **изведена**, не предположена: описанието на всяко студентско
repo носи името на темплейта, от който е генерирано. 422 repo-та, 0 неразпознати,
точно един темплейт на задача.

Хостинг: `https://nvnacs50.github.io/nvnacs50-dashboard/`, един OAuth callback
(`callback.html`), който след логин разпределя по роля.

## 4. Архитектура

```
Студент цъка линк
        │
        ▼
  accept.html?a=filter-less
        │
        ├── има токен в localStorage? ──── да ──┐
        │                                       │
        └── не: sessionStorage.pending = slug   │
                 → GitHub OAuth                 │
                 → callback.html (връща тук)    │
                                                │
                                                ▼
                              POST /accept  (Bearer: токен на СТУДЕНТА)
                                       │
                                       ▼
                          ┌─────────────────────────┐
                          │  Worker (твоят token    │
                          │  като secret)           │
                          └─────────────────────────┘
                                       │
      1. GET /user (токен на студента) → истинско login
      2. slug в закованата таблица?     → не: 400
      3. задачата включена ли е?        → не: 403
      4. под почасовия лимит ли сме?    → не: 429
      5. repo вече съществува?          → да: връща го, край
      6. POST /repos/{темплейт}/generate  (твоят token)
      7. PUT  /collaborators/{login}      (твоят token)
      8. PATCH /user/repository_invitations/{id}  (токен на студента)
                                       │
                                       ▼
                    nvnacs50/filter-less-<username>  (private, write)
```

## 5. Компоненти

### 5.1 Worker `nvnacs50-assignments`

Нов Worker, отделен от `github-classroom-oauth` и `quiz-results-saver`.
Файл: `cloudflare-worker-assignments.js`.

**`GET /assignments`** — публичен. Връща `[{slug, title, enabled}]` за UI-а.
Не издава имената на темплейтите.

**`POST /accept`** — `Authorization: Bearer <токен на студента>`, тяло `{assignment: slug}`.

Ред на изпълнение:

1. `GET https://api.github.com/user` с токена на студента → `login`.
   Провал → 401. **Клиентът не подава username никъде и той не се чете от заявката.**
2. Проверка на `slug` срещу закованата таблица. Липсва → 400.
   Това е същественото ограничение: Worker-ът може да генерира само от 19-те
   известни темплейта, не от произволно repo в организацията.
3. Проверка `enabled` в KV. Изключена задача → 403 „Записването е затворено".
4. Глобален лимит в KV (ключ `rate:<YYYY-MM-DD-HH>`). Над тавана → 429.
5. `GET /repos/nvnacs50/<slug>-<login>` → 200 означава, че вече има repo:
   връща се същото, без нищо да се създава. **Повторното цъкане е безопасно.**
6. `POST /repos/nvnacs50/<темплейт>/generate` с твоя token,
   тяло `{owner: "nvnacs50", name: "<slug>-<login>", private: true}`.
7. `PUT /repos/nvnacs50/<slug>-<login>/collaborators/<login>` `{permission: "push"}`.
   Отговорът е 201 с покана, или 204 ако вече е collaborator — обработват се и двата.
8. При покана: `PATCH /user/repository_invitations/<id>` **с токена на студента**.
   Без тази стъпка GitHub праща имейл-покана и студентът трябва да я приеме ръчно,
   преди да види repo-то.

Отговор: `{repo, url, created: bool}`.

**`POST /admin/toggle`** — `Authorization: Bearer <токен на учителя>`, тяло `{assignment, enabled}`.
Worker-ът проверява `GET /user/memberships/orgs/nvnacs50` с подадения токен и приема
само `role: "admin"`. Записва в KV.

**Secrets и binding:** `GITHUB_TOKEN` (secret), `ASSIGNMENTS` (KV namespace).

### 5.2 `grade-manager/public/accept.html`

Целта на линка. Показва името на задачата. Ако има токен — вика `/accept` веднага;
ако няма — бутон „Влез с GitHub", който записва slug-а в `sessionStorage` и тръгва по
съществуващия OAuth поток. След успех: име на repo-то и бутон „Отвори".
Ако repo-то вече е съществувало: „Вече имаш repo за тази задача" + същия линк.

### 5.3 `grade-manager/public/callback.html`

Единствената промяна в съществуващ файл. Преди разпределянето по роля:
ако `sessionStorage.pending_assignment` съществува → изтрива го и пренасочва към
`accept.html?a=<slug>` вместо към таблото. Около 8 реда.

Този подход е избран, за да не се пипат регистрираните callback URL-и на OAuth App-а.

### 5.4 `grade-manager/src/app/assignments/page.tsx`

Нова страница в учителското табло. За всяка задача: линк с бутон „Копирай",
брой приели и превключвател вкл./изкл.

Броят приели се смята от repo-тата, които таблото вече тегли — нула допълнителни
API заявки.

### 5.5 Конфигурация и deploy

`public/config.js` и `public/student/config.js`: `ASSIGNMENTS_WORKER_URL`.
`.github/workflows/deploy.yml`: копиране на `accept.html` в `deploy-output/`.

## 6. Таблица задача → темплейт

Закована в Worker-а. Всички темплейти са в `nvnacs50` с префикс
`nvnacs50-classroom-fall2025-`; колоната показва остатъка след префикса.

| Задача | Остатък от името на темплейта | Потвърдено от |
|---|---|---|
| hello | `hello-2023-fall-hello-1` | 6 repo-та |
| mario-less | `mario-less-2023-fall-mario-less` | 11 |
| mario-more | `mario-more-2023-fall-mario-more` | 7 |
| cash | `cash-2023-fall-cash` | 8 |
| credit | `credit-2023-fall-credit` | 12 |
| scrabble | `scrabble-scrabble-template` | 26 |
| readability | `test-2023-fall-readability` | 28 |
| caesar | `caesar-2023-fall-caesar` | 24 |
| substitution | `substitution-2023-fall-substitution` | 8 |
| sort | `sort-nvnacs50-classroom-fall2025-sort-sort-template` | 8 |
| plurality | `plurality-2023-fall-plurality` | 14 |
| runoff | `runoff-2023-fall-runoff` | 22 |
| tideman | `tideman-2023-fall-tideman` | 11 |
| volume | `volume-nvnacs50-classroom-fall2025-volume` | 21 |
| filter-less | `filter-less-2023-fall-filter-less` | 25 |
| filter-more | `filter-more-2023-fall-filter-more` | 12 |
| recover | `recover-2023-fall-recover` | 59 |
| inheritance | `inheritance-inheritance-template` | 80 |
| speller | `speller-2023-fall-speller` | 39 |

Три от тях са капани — съществуват дублирани темплейти с по-логични имена
(`...-sort-sort-template`, `...-volume`, и мигрираният `readability`), но реално
**не са** използвани. Таблицата следва доказателството, не интуицията.

Мигрираните темплейти с кратки имена (`hello`, `speller`, `filter-less`…, описание
„Migrated from GitHub Classroom") **не се ползват** — това е изрично решение.

В организацията има и onboarding задача (`2026` → `...-onboarding-assignment-invitation-repo`,
едно repo). Тя не е CS50 проблем и не влиза в таблицата. Добавя се с един ред, ако потрябва.

## 7. Състояние

Няма собствена база. Истината за „има ли студентът repo" е самият GitHub:
`GET /repos/nvnacs50/<slug>-<login>` е 200 или 404. Това прави операцията идемпотентна
без нужда от синхронизация и премахва цял клас race conditions при 30 студенти,
цъкащи едновременно в час.

KV съхранява само две неща: флаг `enabled` на задача и почасов брояч за лимита.

## 8. Сигурност

| Заплаха | Мярка |
|---|---|
| Студент създава repo на чуждо име | Username идва само от `GET /user`; заявката не носи username |
| Изтекъл линк у външен човек | Може да създаде най-много 19 repo-та на свой акаунт; вижда се в таблото и се трие |
| Генериране от произволно repo | Worker-ът приема само 19-те заковани slug-а |
| Изтичане на твоя token | Живее само като Worker secret; fine-grained и ограничен до `nvnacs50` |
| Чужд вика `/admin/toggle` | Проверка за `role: admin` в организацията |
| Масово злоупотребяване | Почасов глобален лимит в KV |

Токенът на студента се ползва за стъпки 1 и 8 и не се записва никъде.

Изборът на fine-grained token (Administration: write, Contents: write, Metadata: read,
обхват `nvnacs50`) се валидира при първия тест. Ако `generate` endpoint-ът не го приема,
резервният вариант е classic PAT с `repo` scope.

## 9. Грешки

Всяко състояние връща на студента какво да направи, а не суров GitHub JSON:

- 401 — токенът е изтекъл → „Влез отново"
- 400 — непозната задача → „Този линк е невалиден, пиши на преподавателя"
- 403 — задачата е затворена → „Записването за тази задача е затворено"
- 429 — лимит → „Твърде много заявки, опитай след малко"
- 422 от `generate` (заето име) → „Има repo с това име, което не е твое — пиши на преподавателя"
- Провал между стъпка 6 и 7 оставя repo без collaborator. Повторното цъкане го поправя,
  защото стъпка 5 го намира и продължава към добавянето на достъпа.

## 10. Тестове

В проекта няма тестова инфраструктура. Добавя се vitest само за Worker-а, върху чистите
части, с мокирана мрежа:

- избор на темплейт по slug, включително трите капана
- сглобяване на името `<slug>-<login>`
- отказ при непознат slug
- игнориране на username, подаден в тялото на заявката
- идемпотентност: съществуващо repo не води до `generate`
- 204 срещу 201 от `PUT collaborators`
- `/admin/toggle` отказва на не-админ

Плюс едно ръчно end-to-end с тестова задача преди пускане пред студенти.

## 11. Ръчни стъпки за преподавателя

1. Fine-grained PAT: resource owner `nvnacs50`, all repositories,
   Administration + Contents = write, Metadata = read
2. `npx wrangler login`
3. `npx wrangler secret put GITHUB_TOKEN` — стойността се въвежда скрито и не влиза
   нито в кода, нито в кореспонденция

Останалото (Worker, KV namespace, deploy) не изисква намеса.

## 12. Отложено

- Крайни срокове с автоматично затваряне — има само ръчен превключвател
- Списък със студенти (roster) — линкът е отворен, както беше и в GitHub Classroom
- Групови задачи
