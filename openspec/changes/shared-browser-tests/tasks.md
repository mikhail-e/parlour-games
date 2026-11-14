# Tasks

## 1. Начало

- [x] 1.1 Ветка `feature/shared-browser-tests` от `develop` (после слияния `feature/test-duplicates`), первый коммит: этот change (`openspec/changes/shared-browser-tests/`). Проверка: `git status` чистый, `openspec validate shared-browser-tests --strict` проходит

## 2. Общие помощники в `e2e-helpers.js`

- [x] 2.1 `packages/room-kit/e2e-helpers.js` (design, решение 6): `listedNames(page)`, `avatarTiles(page)`, `axeViolations(page, only)`, `sleep(ms)`, с комментариями, для чего каждый; `tests/e2e/helpers.js` обеих игр передаёт их дальше. Проверка: `npm run lint` в корне зелёный
- [x] 2.2 Игры берут помощники ядра вместо своих копий: `listedNames` (whoami `room.spec.js`, `leave-and-return.spec.js`; Consequences `room.spec.js`), `avatarTiles` (whoami `landing.spec.js`, `custom-avatar.spec.js`; Consequences `landing.spec.js`), `violations` → `axeViolations` (`accessibility.spec.js` обеих игр), `sleep` (`room-timers.spec.js` обеих игр). Проверка: `grep` по `tests/e2e/` игр не находит своих определений; эти файлы зелёные в обоих проектах (`npx playwright test <файлы>` в папке каждой игры)
- [x] 2.3 `packages/room-kit/docs/testing.md`, таблица «Помощники ядра»: четыре строки; у `sleep` — только тестам таймеров комнаты. Проверка: сверка с кодом `e2e-helpers.js`

## 3. Общие тесты ядра

- [x] 3.1 `packages/room-kit/e2e-kit-tests.js`: заголовок модуля (что это, как игра вызывает группу, решение владельца о тестах ядра через страницы игр) и `siteTests({ text })` (design, решения 3 и 4): ничего с чужих сайтов; заголовки безопасности на каждом адресе, в списке `/sw.js` и `/js/config.js`, только `desktop`; версия внизу обеих страниц; иконки страниц и манифеста; значки страницы комнаты; регистрация service worker; «Update now» со значком. whoami `site.spec.js` вызывает группу, `site-headers.spec.js` теряет цикл адресов и тест чужих запросов (остальное в нём остаётся, а пустой файл удаляется); Consequences `site.spec.js` вызывает группу вместо своих копий. Проверка: `site.spec.js` и `site-headers.spec.js` зелёные в обеих играх, в отчёте у теста адресов нет прогона `mobile`
- [x] 3.2 `notFoundTests({ text, brand })`: весь нынешний `not-found.spec.js` с вывеской игры на странице 404 (`getByRole('img', { name: brand })`); тесты адресов без страницы только в `desktop`. `not-found.spec.js` обеих игр вызывает группу (whoami — `brand: 'Who am I?'`, Consequences — `'Consequences'`). Проверка: файл зелёный в обеих играх; у whoami проходит новая проверка вывески
- [x] 3.3 `linkPreviewTests({ brand })`: весь нынешний `link-preview.spec.js`, название игры из `brand`, вся группа только в `desktop` (карточки — разметка); тест «the cards name the site they are served from» по-прежнему только с `BASE_URL`. `link-preview.spec.js` обеих игр вызывает группу. Проверка: файл зелёный в обеих играх; временно другое `brand` в whoami роняет тесты карточек
- [x] 3.4 `landingPageTests({ text })`: ссылка на несуществующую комнату; имя и аватар запоминаются после создания и после входа; два игрока с одним именем; фото вместо эмодзи видят все. whoami: вызов в `landing.spec.js`, копии уходят из `site.spec.js`, `landing.spec.js`, `room.spec.js`, `custom-avatar.spec.js`; Consequences: вызов в `landing.spec.js` вместо копий. Проверка: эти файлы зелёные в обеих играх
- [x] 3.5 `roomPageTests({ text })`: выход из лобби (главная с кодом и именем, остальные видят уведомление со значком), Leave в одной вкладке выводит из всех, последний вышедший удаляет комнату, Copy Link кладёт ссылку комнаты в буфер. whoami: вызов в `leave-and-return.spec.js`, копии уходят из него и из `share.spec.js`; Consequences: вызов в `room.spec.js` вместо копий. Проверка: эти файлы зелёные в обеих играх
- [x] 3.6 `roomTimerTests()` (design, решение 5): «a room nobody has open is gone after the empty-room time» ждёт ответа 302 на `/game/CODE` через `expect.poll`, без паузы; «nobody leaves while every page is closed…» с паузой `sleep`. `room-timers.spec.js` обеих игр вызывает группу после своих `test.skip` и `test.use`. Проверка: файл зелёный в обеих играх; с временно увеличенным `ROOM_EMPTY_MS` второго сервера тест «уходит» падает по таймауту опроса, а не проходит
- [x] 3.7 Документы: `packages/room-kit/CLAUDE.md` (раскладка: `e2e-kit-tests.js`; абзац Playwright в «How a game uses it»: игра вызывает группы ядра); `packages/room-kit/docs/testing.md`: раздел «Общие тесты ядра» (группы, где игра их вызывает, параметры, место теста в отчёте — файл ядра, прогон одного файла игры) и в «Правила набора» правило: тест без страницы идёт в одном проекте; `docs/testing.md` игр — если в них названы перенесённые тесты. Без длинного тире в новых строках. Проверка: сверка с кодом, каждое решение записано один раз

## 4. Повторы, которые удаляются

- [x] 4.1 whoami `language.spec.js`: «an unknown text key shows the key itself» и «an unknown language falls back to English» (design, решение 7), с ними `/* global i18n */`, если больше не нужен. Проверка: `npx playwright test tests/e2e/language.spec.js` зелёный, ESLint зелёный
- [x] 4.2 Consequences `reading.spec.js`: «two players: each reads the sheet the other finished» (design, решение 7). Проверка: в `tests/game-logic.test.js` есть `test.each([2, 3, 12])` на оба правила (лист идёт по кругу, игрок открывает чужой лист); `reading.spec.js` зелёный

## 5. Проверка целиком

- [ ] 5.1 `npm test` в корне зелёный: все игры и kit; у обеих игр нет повторяющихся тестов из таблицы design.md (Context)

## Workflow follow-up

- Слияние `feature/shared-browser-tests` в `develop` (`--no-ff`), ветка удаляется.
- Архив change (`/opsx:archive`): спеков нет (`skip_specs: true`), в архив уходят proposal, design и tasks.
