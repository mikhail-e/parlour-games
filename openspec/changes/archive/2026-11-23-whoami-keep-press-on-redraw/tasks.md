# Tasks

## 1. Начало

- [x] 1.1 Сбой воспроизведён на локальном сервере вне репозитория (2026-11-21): мышь теряет нажатие на «Задать персонажа» и на своём конверте, клавиатура теряет фокус, касание в Chromium нет; набросок исправления, вставленный в страницу, чинит мышь и клавиатуру. Проверка: записано в design.md
- [x] 1.2 Ветка `feature/whoami-keep-press-on-redraw` от `develop`, первый коммит: этот change. Проверка: `openspec validate whoami-keep-press-on-redraw --strict` проходит, `git status` чистый

## 2. Общий код в ките

- [x] 2.1 `redrawChildren` переезжает из `games/consequences/public/js/game-room.js` в `packages/room-kit/public/kit/js/room-page.js` (design, решение 1), с комментарием о правиле разметки; Consequences берёт его из кита. `holdMouseOn` переезжает из `games/consequences/tests/e2e/helpers.js` в `packages/room-kit/e2e-helpers.js` (решение 3). Документы: CLAUDE.md кита (страница комнаты), CLAUDE.md Consequences (помощник теперь китовый), `docs/testing.md` кита и Consequences. Без длинного тире в новых строках. Проверка: `npm test -w packages/room-kit` зелёный; `npm run lint` Consequences зелёный; `reading.spec.js` и `history.spec.js` Consequences зелёные на телефоне и компьютере

## 3. Тесты whoami, которые падают

- [x] 3.1 Браузерные тесты по требованию «Нажатие и фокус во время чужих ходов», только в проекте компьютера (design, решение 4): в `room.spec.js` «Задать персонажа» мышью, фокус и Enter, чужая наклейка, кнопки больше нет; в `game.spec.js` свой конверт во время чужого раскрытия. Проверка: четыре теста падают на нынешнем коде whoami, «Кнопки больше нет» и остальные зелёные

## 4. Исправление whoami

- [x] 4.1 `updatePlayersList` ставит карточки через `redrawChildren` кита вместо очистки и `appendChild` (design, решение 2). Документы whoami: CLAUDE.md (Gotchas о перерисовке списка), `docs/testing.md` (тесты нажатия во время чужого хода, почему только компьютер). Проверка: `npm run lint` whoami зелёный; тесты 3.1 зелёные на компьютере; `room.spec.js`, `game.spec.js`, `late-join.spec.js` зелёные на телефоне и компьютере

## 5. Проверка целиком

- [x] 5.1 `npm test` в корне зелёный
- [x] 5.2 После выкладки: `/api/version` whoami 2.7.0 и Consequences 1.9.1; `npm run test:e2e:prod` обеих игр зелёный. Сделано: прод отдаёт whoami 2.7.0 и Consequences 1.9.1, проверка прода обеих игр зелёная

## Workflow follow-up

- Слияние `feature/whoami-keep-press-on-redraw` в `develop` (`--no-ff`) после зелёного `npm test`, ветка удаляется.
- Выпуск whoami 2.7.0 и Consequences 1.9.1 одной веткой по `docs/release.md`; отправка в `master` только после подтверждения владельца, затем проверка прода и 5.2.
- `/opsx:archive` этого change.
