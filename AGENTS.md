# AGENTS.md — last-bear · браузерна 3D-гра для дитини 4–6 років

Інструкції для будь-якого агента в цьому репозиторії. Лише факти й правила проєкту.

## Stack & tooling
- Vite, TypeScript (strict), Three.js 0.187 (WebGL2), Rapier3D (`@dimforge/rapier3d-compat`), pnpm. Без React. Тести — Vitest у середовищі node.

## Commands
- Dev-сервер: `pnpm dev --port 5104`
- Тести: `pnpm test`
- Перевірка типів: `pnpm typecheck`
- Збірка: `pnpm build`
- Експорт рівнів із Blender: `pnpm levels` (усі) або `pnpm levels village` (потрібен `blender` у PATH або змінна `BLENDER`)

## Architecture
- `src/sim/` — правила гри, крок 1/60 с. Не імпортують `three`, DOM, Web Audio (ADR 0001 у `docs/adr/`).
- `src/view/` — показ: ведмідь, камера, ефекти, звук. Читає стан із `sim`.
- `src/entities/` — об'єкти, що малюються (ведмідь).
- Усі числа налаштувань — у `src/sim/tuning.ts`.
- Рівні редагуються в Blender: джерело — `levels/<id>.blend`, гра читає експортований `src/levels/<id>.level.json` (руками не правити). Угоди сцени — у шапці `tools/levels/level_to_blend.py`; після зміни `.blend` — `pnpm levels` і `pnpm test`.
- Терміни — у `CONTEXT.md`; план і специфікація — у `specs/vertical-slice/`.
- Нова логіка правил: спершу тест у `src/sim/*.test.ts`. Картинка перевіряється кадром із браузера.

## Delivery
- CI: none (personal game project)
- Release: none (in development)
- Deploy target: local browser (`pnpm build`, `pnpm preview`)
- Environments: local development only
- Secrets location: none
- Monitoring: none
