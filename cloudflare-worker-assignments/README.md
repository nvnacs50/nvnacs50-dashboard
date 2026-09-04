# nvnacs50-assignments

Създава студентски repo-та от темплейт — заместител на пенсионирания GitHub Classroom.

Дизайн: `docs/superpowers/specs/2026-09-04-assignment-links-design.md`

## Endpoints

- `GET /assignments` — списък със задачи, публичен
- `POST /accept` — Bearer токен на студента, тяло `{"assignment":"filter-less"}`
- `POST /admin/toggle` — Bearer токен на преподавател (org admin)

## Настройка

    npx wrangler kv namespace create ASSIGNMENTS   # id-то влиза в wrangler.toml
    npx wrangler secret put GITHUB_TOKEN           # fine-grained PAT, виж по-долу
    npx wrangler deploy

Токенът е fine-grained, resource owner `nvnacs50`, **All repositories**,
Repository permissions: Administration (write), Contents (write), Metadata (read).
Организационни права не са нужни.

Изтича на 2027-09-05. Когато изтече, Worker-ът спира тихо — `/accept` започва
да връща `generate_failed`.

## Тестове

    npm install && npm test
