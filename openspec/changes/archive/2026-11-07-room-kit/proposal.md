# Proposal

## Why

Монорепо готово (move-to-monorepo), но общий код игр с комнатами всё ещё лежит внутри whoami: основа комнаты, сокет страницы, личность игрока, переводы, заголовки безопасности, Bootstrap, шрифты, конфиги проверок. Вторая игра, Consequences, должна взять их из одного места, а не копировать. Этот change выделяет общее ядро в отдельный пакет workspace и переводит на него whoami, ничего не меняя для игроков. Тогда третий change, сама Consequences, начнётся с готового ядра.

## What Changes

- Новый пакет workspace `packages/room-kit/` (`@parlour-games/room-kit`, private, без выпусков: ядро выходит вместе с версиями игр). Корневой `package.json` добавляет `packages/*` в `workspaces`, корневой `npm test` проверяет и ядро.
- В ядро переезжает то, что не знает правил whoami (состав выбран с владельцем):
  - **сервер**: основа комнаты `RoomBase` (сокеты, роли во вложении сокета, рассылка, поиск замолчавших сокетов, таймер); обвязка Worker (заголовки безопасности на каждом ответе, HEAD, JSON со статусом 500 вместо страницы ошибки Cloudflare, своя страница 404, `/api/version`); код комнаты из 6 знаков, формат ID игрока, хэш секрета;
  - **браузер**: сокет страницы `RoomSocket`; основа `utils.js` (`debugLog`, `AppStorage`, ID и секрет игрока, версия внизу страницы); механизм переводов (класс `Localization`, `data-i18n*`, кнопка языка, перевод ошибок сервера, тексты самого ядра); `pwa.js`; `wake-lock.js`;
  - **статические файлы**: заголовки безопасности (один список на все игры, с причинами: для статических файлов и копия для Worker), Bootstrap, шрифты с лицензиями и `@font-face`;
  - **конфиги**: общая часть ESLint и Playwright (включая сторож браузерных тестов: нарушение CSP или ошибка в консоли роняет тест).
- В whoami остаются правила игры, её маршруты (`/api/create-game`, `/api/join-game`, `/game/CODE`), её комната `Room`, словари переводов, страницы, `style.css`, `sw.js`, иконки, ограничения ввода и проверка фото-аватара, уведомления.
- Браузерные файлы ядра попадают в `public/` игры копированием в шаге сборки: скрипт ядра раскладывает их в `public/kit/` и `public/_headers`, в git этих копий нет. Локально его запускает wrangler (`build` в `wrangler.jsonc`: `npm start` и браузерные тесты), в Workers Builds — Build command в настройках Worker. Страницы whoami подключают скрипты, Bootstrap и шрифты по новым адресам `/kit/...`.
- Workers Builds у `whoami-game`: Build command `npm run build -w games/whoami`, в build watch paths добавляется `packages/*` — правка ядра пересобирает игру. Перед этим — спайк на временном Worker: документация Cloudflare говорит, что Workers Builds не выполняет `build` из `wrangler.jsonc`, но не описывает, как wrangler в Workers Builds собирает код из пакета workspace.
- Тесты, которые проверяют код ядра, переезжают с ним (копии заголовков, формат ID в обеих копиях, `debugLog`, механизм переводов, общие имена скриптов, запрет встроенного кода). Поведение по-прежнему проверяют браузерные тесты игры.
- Технические правила из `games/whoami/CLAUDE.md`, которые описывают код ядра, переезжают в `packages/room-kit/CLAUDE.md`; CLAUDE.md игры подключает его, чтобы правила ядра были под рукой при работе над игрой. Корневые `CLAUDE.md`, `README.md` и `docs/release.md` описывают ядро и новые настройки сборки.
- Выпуск `whoami-v2.2.0`.

Для игроков не меняется ничего: тот же адрес, тот же Worker и класс комнат `Room`, то же хранилище комнат, тот же протокол сокета, те же ключи в `localStorage` (тот же игрок, тот же секрет, тот же язык), те же заголовки безопасности, `sw.js` не меняется (баннера «Доступно обновление» не будет).

## Capabilities

### New Capabilities

Нет. Change переносит код без изменения поведения, поэтому спеки не пишутся (`skip_specs: true`), как в move-to-monorepo. Что поведение whoami не изменилось, проверяют её тесты (Jest и Playwright на телефоне и компьютере) локально, на временном Worker спайка и на проде после выпуска (design.md, tasks.md).

### Modified Capabilities

Нет.

## Impact

- **Код whoami**: `worker/index.js`, `worker/room.js`, `game-logic.js` берут общее из ядра; `worker/room-base.js`, `worker/security-headers.json`, `public/_headers`, `public/js/room-socket.js`, `pwa.js`, `wake-lock.js`, `public/vendor/`, `public/fonts/` уходят в ядро; `utils.js` и `translations.js` теряют общую часть; три страницы и `style.css` получают новые адреса файлов; `scripts/icon.html` и `scripts/og-image.html` берут шрифты и Bootstrap из ядра.
- **Инструменты**: `workspaces` в корне, `build` в `wrangler.jsonc` игры, скрипт `build` игры, `eslint.config.mjs` и `playwright.config.js` игры строятся на общей части, `.gitignore` скрывает копии ядра.
- **Cloudflare**: Build command и build watch paths Worker `whoami-game`; временный Worker спайка создаётся и удаляется. Имя Worker, домен, Durable Objects и их миграции не меняются.
- **Документация**: `packages/room-kit/CLAUDE.md` и `README.md`, корневые `CLAUDE.md`, `README.md`, `docs/release.md`, `games/whoami/CLAUDE.md`, `games/whoami/docs/testing.md`.
- **Не входит**: игра Consequences и всё, что понадобится только ей; общий вид (`style.css`: цвета, занавес, листы); общий `sw.js`; правила поезда выпусков нескольких игр.
