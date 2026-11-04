# Перенос whoami на Cloudflare — этап 1: план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** whoami работает на Cloudflare Workers + голых Durable Objects в ветке `feature/cloudflare`, развёрнут на временном адресе `*.workers.dev`, и весь набор тестов проходит против него. Render при этом не трогаем.

**Architecture:** Worker отдаёт статику (`public/`, Workers static assets), отвечает на HTTP API и передаёт WebSocket в Durable Object комнаты (один объект на код). Комната держит игру в своём хранилище SQLite, сокеты — через Hibernation API, таймеры — через alarm. Код делится на общую часть (`worker/room-base.js`, `public/js/room-socket.js`), которую следующие приложения копируют без правок, и часть whoami (`worker/index.js`, `worker/room.js`, `game-logic.js`, страницы).

**Tech Stack:** Cloudflare Workers, Durable Objects (SQLite), `wrangler` 4 (devDependency), vanilla JS на страницах без сборки, Jest 30, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-11-04-cloudflare-migration-design.md` — исполнитель читает его вместе с этим планом. Этап 2 (переключение) и домен в этот план не входят.

## Global Constraints

- Для игроков ничего не меняется: страницы, правила, вид, тексты, поведение из CLAUDE.md. Единственное заметное отличие — брошенная комната живёт 2 часа.
- Голые Durable Objects: никаких PartyServer и partysocket. Из Cloudflare в зависимостях только `wrangler` (devDependency).
- Общая часть — `worker/room-base.js` и `public/js/room-socket.js`: в ней нет имён событий whoami, текстов whoami и правил игры. Своих тестов у неё нет, её проверяют браузерные тесты whoami.
- `game-logic.js` остаётся CommonJS, не импортирует ничего из Cloudflare, его тестирует Jest.
- Только бесплатный план: класс комнаты объявлен в `new_sqlite_classes`, `compatibility_flags: ["nodejs_compat"]`, `compatibility_date: "2026-11-01"`.
- Время жизни комнаты без страниц: `ROOM_EMPTY_MS = 2 * 60 * 60 * 1000`. «Призраки»: `MAX_DISCONNECTED_MS = 60 * 60 * 1000`, удаляются только пока открыта хоть одна страница игрока. Когда после перерыва без страниц приходит первая страница игрока, часы всех офлайн-игроков начинаются заново.
- Правила CLAUDE.md 4–8: каждый текст в `en` и `ru`; ошибка сервера показывается через `serverErrorText()`; данные игроков только через `textContent`; отладка только через `debugLog()`; имена между скриптами объявляются в `/* global */` и `/* exported */`; никаких `style=` и `on…=`.
- Тексты ошибок сервера пишутся буквально (`error: '…'` или `this.send(ws, 'error', '…')`), у каждого есть русская копия в `serverErrors`.
- Хэши секретов не выходят из хранилища комнаты: ни в рассылку, ни в ответ, ни в лог.
- Страницы без сборки. `public/sw.js` не трогать.
- Работа только в ветке `feature/cloudflare`. Не трогать `master`, `develop`, Render и `render.yaml`, не пушить. Не коммитить `.claude/settings.json`.
- Перед каждым коммитом (кроме задачи 1) `npm test` проходит полностью.
- Сообщения коммитов — по-английски, с последней строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Обновление страницы и вторая вкладка.** Новый сокет регистрируется раньше, чем закрывается старый. Игрок должен остаться онлайн, а ход после перезагрузки — дойти до всех. Тест: задача 7, `connection.spec.js` → «after a reload the player still moves».
2. **Мусор в сокете** (не JSON, без `event`, неизвестное событие, `event` не строка). Комната не падает, ничего не отвечает, следующий ход работает. Тест: задача 7, «junk on the socket breaks nothing».
3. **Обрыв соединения посреди партии.** Страница переподключается, ход, сделанный во время обрыва, доходит. Тест: задача 7, переделанный `game.spec.js` «a reveal made while the connection is down…». Полуживой сокет проснувшегося телефона — ручная проверка в задаче 10.
4. **Перезапуск комнаты (деплой) посреди партии.** Все сокеты оборваны, комната поднимается из хранилища. Игроки без страниц становятся офлайн, заявки без страниц ожидания исчезают, партия продолжается. Автотеста нет: проверяется в задаче 1 (C8) и вручную в задаче 10.
5. **Код верного формата, но без комнаты** (`/game/ZZZZZZ`, сокет к удалённой комнате). Ответ — редирект или `player-left` с `gameDeleted: true`, хранилище не пишется. Тесты уже есть: `site-headers.spec.js` (`/game/ZZZZZZ` → 302) и `leave-and-return.spec.js` («…just after the room was deleted goes home»). Правило «пустая комната ничего не пишет» — задача 6, шаг 3.

## Файлы

| Файл | Что | Задача |
|---|---|---|
| `wrangler.jsonc` | конфигурация Worker, статики, комнаты | 5, 6 |
| `worker/index.js` | Worker whoami: маршруты, заголовки, передача в комнату | 5, 6 |
| `worker/room-base.js` | **общая** основа комнаты | 6, 7, 8 |
| `worker/room.js` | комната whoami `class Room extends RoomBase` | 6, 7, 8 |
| `worker/security-headers.json` | заголовки для ответов Worker (намеренная копия `public/_headers`) | 5 |
| `public/_headers` | заголовки для статики | 5 |
| `public/js/room-socket.js` | **общая** обёртка сокета для страницы | 7 |
| `game-logic.js` | хранение, таймеры, `createGame` с кодом; минус восстановление | 2, 4, 7 |
| `public/js/game-room.js`, `public/game.html`, `public/js/translations.js` | страница на новом сокете, без восстановления | 4, 7 |
| `playwright.config.js`, `tests/e2e/helpers.js` | `wrangler dev` вместо `node server.js`; перехват сокета | 7, 8 |
| `tests/e2e/api.spec.js` | HTTP API (из `api.test.js`, `app-version.test.js`) | 3 |
| `tests/e2e/connection.spec.js` | перезагрузка, мусор, обрыв | 7 |
| `tests/e2e/room-timers.spec.js` | таймеры на «быстром» сервере | 8 |
| `tests/room-storage.test.js`, `tests/room-timers.test.js`, `tests/security-headers.test.js` | Jest | 2, 5 |
| удаляются: `server.js`, `game-backups.js`, `tests/api.test.js`, `tests/app-version.test.js`, `tests/game-backup.test.js`, `tests/room-recreation.test.js`, `tests/connection-tracker.test.js` | | 3, 4, 7 |

---

### Task 1: Прототип на выброс (spike)

Проверяет допущения проекта до основной работы. Кода из прототипа в репозитории не остаётся: остаются только записанные выводы.

**Files:** всё в `spike/` в корне репозитория. Папка исключена из git: `echo spike/ >> .git/info/exclude`.

- [ ] **Step 1: Подготовить папку.** `mkdir spike && cd spike && npm init -y && npm install wrangler@4`. Скопировать статику: `cp -R ../public ./public`. Создать `spike/public/_headers`:
  ```
  /*
    X-Spike-Header: on
    Content-Security-Policy: default-src 'self'
  ```
- [ ] **Step 2: `spike/wrangler.jsonc`.** `name: "whoami-spike"`, `main: "worker.js"`, `compatibility_date: "2026-11-01"`, `compatibility_flags: ["nodejs_compat"]`, `assets: { directory: "./public", binding: "ASSETS", not_found_handling: "404-page", run_worker_first: ["/api/*", "/game/*", "/ws/*"] }`, Durable Object `SPIKE_ROOMS` → класс `SpikeRoom`, `migrations: [{ tag: "v1", new_sqlite_classes: ["SpikeRoom"] }]`, `observability: { enabled: true }`.
- [ ] **Step 3: `spike/worker.js`.** Код на выброс, тестов нет. Должен уметь:
  - на каждый запрос `console.log('worker', pathname)`;
  - `GET /api/version` — `{ version }` из `import pkg from '../package.json'`;
  - `GET /api/logic` — `import gameLogic from '../game-logic.js'`, затем `createGame(new Map())`, `addPlayerToGame(…, crypto.randomUUID())`, ответ `{ gameId, playerId }` (проверка CommonJS и `crypto` под `nodejs_compat`);
  - `GET /api/vars` — `{ SPIKE_VAR: env.SPIKE_VAR }`;
  - `GET /game/:code` — `env.ASSETS.fetch(new URL('/game.html', request.url))`, ответ отдаётся как есть;
  - `GET /ws/:code` — `env.SPIKE_ROOMS.getByName(code).fetch(request)`. Если `getByName` в этой версии нет — `env.SPIKE_ROOMS.get(env.SPIKE_ROOMS.idFromName(code))`, и записать это в выводы: тогда так же делать в задачах 6–7;
  - `GET /api/alarm/:code` — RPC `stub.armAlarm(2000)`.

  `SpikeRoom extends DurableObject` (`cloudflare:workers`):
  - в конструкторе `console.log('room constructed')` и `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`;
  - `fetch` принимает сокет через `ctx.acceptWebSocket` с attachment `{ n }`;
  - `webSocketMessage` увеличивает счётчик `messages` в `ctx.storage` и рассылает всем `{ from: n, text, messages }`;
  - `webSocketClose` рассылает `'left'`;
  - `alarm()` рассылает `'alarm'`.
- [ ] **Step 4: `spike/check.mjs`.** Скрипт Node (встроенный `WebSocket`, Node ≥ 22), аргумент — базовый адрес. Печатает таблицу «проверка — да/нет»:
  - **C1:** `/` → 200 с `x-spike-header`; `/no-such` → 404 с `x-spike-header` и телом `404.html`; `/_headers` → 404.
  - **C2:** `/api/logic` → `gameId` вида `^[A-Z0-9]{6}$`, `playerId` — UUID.
  - **C3:** `/game/ABC123` → 200, тело содержит `id="waitingSheet"`.
  - **C4:** два сокета к `/ws/TEST01`. Сообщение A приходит обоим. `'ping'` → `'pong'`. Закрытие A → B получает `'left'`. Новый сокет видит прежний счётчик `messages`. `/api/alarm/TEST01` → через ~2 с сокеты получают `'alarm'`.
  - **C5:** `/api/version` равен версии из `package.json`.
  - **`--hold`:** держит два сокета открытыми и печатает код закрытия, когда их оборвут, и счётчик после переподключения.
- [ ] **Step 5: Проверить локально.**
  - `npx wrangler dev --port 3200 --inspector-port 9240 --persist-to .state`, затем `node check.mjs http://localhost:3200` → C1–C5 «да».
  - **C6:** параллельно второй экземпляр `npx wrangler dev --port 3201 --inspector-port 9241 --persist-to .state2 --var SPIKE_VAR:fast`; `curl localhost:3201/api/vars` → `"fast"`. Оба экземпляра работают одновременно.
  - **C7:** запросы `/` и `/js/game.js` не дают строки `worker …` в выводе wrangler: статика отдаётся без Worker.
- [ ] **Step 6: Вход в Cloudflare.** Попросить владельца выполнить в папке `spike` команду `! npx wrangler login` (она интерактивная). Без входа шаги 7–8 не делать.
- [ ] **Step 7: Развернуть и проверить.** `npx wrangler deploy` → записать адрес `https://whoami-spike.<поддомен>.workers.dev`. `node check.mjs <адрес>` → C1–C5 «да».
  - **C8:** `node check.mjs <адрес> --hold` и в это время ещё раз `npx wrangler deploy` → сокеты оборвались (записать код закрытия), после переподключения счётчик `messages` прежний.
  - **C9:** `npx wrangler tail whoami-spike` во время загрузки `/` → вызовов Worker для статики нет.
- [ ] **Step 8: Записать выводы.** В конец этого плана добавить раздел `## Spike findings`: результат C1–C9 и всё, что разошлось с планом. Например: как ведёт себя `env.ASSETS.fetch('/game.html')` (может ответить редиректом на `/game` — тогда в задаче 6 запрашивать `/game`), применяется ли `_headers` к 404, какой код закрытия при деплое. **Если не прошли C1, C2, C4, C6 или C8 — остановиться и прийти к владельцу:** от них зависит проект. Две проверки из раздела проекта «Проверить в самом начале» — Workers Builds и то, как сервис подключён к Render, — относятся к этапу 2 и здесь не делаются.
- [ ] **Step 9: Убрать прототип.** `npx wrangler delete --name whoami-spike` (подтвердить), `cd .. && rm -rf spike`.
- [ ] **Step 10: Commit** — только план с выводами:
  ```bash
  git add docs/superpowers/plans/2026-11-04-cloudflare-stage1.md
  git commit -m "Plan: record the Cloudflare spike findings"
  ```

### Task 2: Хранение и таймеры комнаты в `game-logic.js`

**Files:**
- Modify: `game-logic.js` (`createGame` ~строка 132, новые функции рядом с `removeStaleDisconnectedPlayers`, экспорт)
- Create: `tests/room-storage.test.js`, `tests/room-timers.test.js`

**Interfaces — Produces:**
- `createGame(games, roomCode = null) → { gameId, success: true }`. Если `roomCode` задан, игра создаётся с этим кодом: вызывающий отвечает за то, что код свободен и верен. Без него — как сейчас.
- `gameToStorage(game) → object` — данные для JSON, всё как есть: `id`, `players` (с `isConnected`, `disconnectedAt`), `characters`, `state`, `revealedPlayers`, `recentlyLeft`, `secrets`, `joinRequests`, `created`, `lastActivityAt`.
- `gameFromStorage(data) → game` — обратно в `Map`, `Set` и `Date` (`created`, `joinedAt` игроков, `assignedAt` персонажей). Без проверок и без изменения часов.
- `ROOM_EMPTY_MS = 2 * 60 * 60 * 1000` (экспорт). `MAX_DISCONNECTED_MS` тоже экспортируется.
- `restartGhostClocks(game, now = Date.now()) → void` — каждому игроку с `isConnected !== true` ставит `disconnectedAt = now`.
- `roomAlarmTime(game, { playerPagesOpen, emptySince }, { emptyRoomMs = ROOM_EMPTY_MS, ghostMs = MAX_DISCONNECTED_MS } = {}) → number | null`:
  - `game` пустой → `null`;
  - `!playerPagesOpen` → `emptySince === null ? null : emptySince + emptyRoomMs`;
  - `playerPagesOpen` → минимум `disconnectedAt + ghostMs + 1` по офлайн-игрокам с `disconnectedAt`, или `null`. `+1` нужен, потому что `removeStaleDisconnectedPlayers` сравнивает строго (`>`).

- [ ] **Step 1: Тесты хранения** — `tests/room-storage.test.js`:
  ```js
  const { createGame, addPlayerToGame, assignCharacter, startGame, removePlayerFromGame,
      requestToJoin, markPlayerDisconnected, checkPlayerSecret, gameToStorage, gameFromStorage } = require('../game-logic');
  const [A, B, D] = ['…uuid A…', '…uuid B…', '…uuid D…']; // secrets: crypto.randomUUID() at the top

  test('a game comes back from storage exactly as it was', () => {
      const games = new Map();
      const { gameId } = createGame(games);
      const alice = addPlayerToGame(games, gameId, 'Alice', '🐻', null, A).player;
      const bob = addPlayerToGame(games, gameId, 'Bob', '🦊', null, B).player;
      const carol = addPlayerToGame(games, gameId, 'Carol', '🐼', null, crypto.randomUUID()).player;
      assignCharacter(games, gameId, alice.id, 'Napoleon', bob.id);
      assignCharacter(games, gameId, bob.id, 'Cleopatra', alice.id);
      assignCharacter(games, gameId, carol.id, 'Zorro', alice.id);
      startGame(games, gameId, alice.id);
      removePlayerFromGame(games, gameId, bob.id);                     // recentlyLeft
      requestToJoin(games, gameId, 'Dasha', '🐨', crypto.randomUUID(), D); // joinRequests
      markPlayerDisconnected(games.get(gameId), carol.id);              // disconnectedAt
      const game = games.get(gameId);

      const back = gameFromStorage(JSON.parse(JSON.stringify(gameToStorage(game))));

      expect(back).toEqual(game);
      expect(checkPlayerSecret(back, alice.id, A)).toBe(true);
  });

  test('createGame takes the room code it is given', () => {
      const games = new Map();
      expect(createGame(games, 'ABC123')).toEqual({ gameId: 'ABC123', success: true });
      expect(games.get('ABC123').players).toEqual([]);
  });
  ```
- [ ] **Step 2: Тесты таймеров** — `tests/room-timers.test.js`. Комнаты строятся через `createGame`/`addPlayerToGame`/`markPlayerConnected`/`markPlayerDisconnected`, время задаётся `player.disconnectedAt` вручную:
  - `'an empty room is due two hours after its last page closed'` — `roomAlarmTime(game, { playerPagesOpen: false, emptySince: 1000 })` → `1000 + 2 * 60 * 60 * 1000`; отдельно `expect(ROOM_EMPTY_MS).toBe(2 * 60 * 60 * 1000)`.
  - `'an empty room without emptySince has no alarm'` → `null`.
  - `'with a page open, the alarm is the earliest ghost hour'` — два офлайн-игрока с `disconnectedAt` 5000 и 9000 → `5000 + 60 * 60 * 1000 + 1`.
  - `'with a page open and everybody online there is no alarm'` → `null`.
  - `'the times can be shortened'` — `roomAlarmTime(game, { playerPagesOpen: false, emptySince: 0 }, { emptyRoomMs: 6000 })` → `6000`.
  - `'restartGhostClocks gives every offline player a fresh hour'` — офлайн-игрок с `disconnectedAt = 0`, онлайн-игрок → после `restartGhostClocks(game, 50_000)` у офлайн `disconnectedAt === 50_000`, у онлайн `disconnectedAt` не появился; затем `removeStaleDisconnectedPlayers(games)` → `[]`.
- [ ] **Step 3:** `npx jest tests/room-storage.test.js tests/room-timers.test.js` → FAIL (`gameToStorage is not a function` и т. п.).
- [ ] **Step 4:** Реализовать функции из Interfaces в `game-logic.js` и добавить их в `module.exports`.
- [ ] **Step 5:** `npx jest tests/room-storage.test.js tests/room-timers.test.js` → PASS; затем `npm test` → PASS.
- [ ] **Step 6: Commit** `"game-logic: room storage, room timers, createGame with a code"`.

### Task 3: HTTP API тестируется через Playwright

Тесты HTTP переезжают из Jest (supertest на `app`) в Playwright и начинают проходить и против развёрнутой версии. Пока проверяются на нынешнем сервере Node.

**Files:**
- Create: `tests/e2e/api.spec.js`
- Delete: `tests/api.test.js`, `tests/app-version.test.js`

- [ ] **Step 1:** Перенести каждый тест из `tests/api.test.js` (список в его `describe`) и `tests/app-version.test.js` в `tests/e2e/api.spec.js` с фикстурой `request`; хелпер `withSecret` переносится как есть. Добавить:
  - `'a room link that is not a room code goes home'` — `request.get('/game/not-a-code', { maxRedirects: 0 })` → 302, `location` = `/?error=room-not-found`;
  - в начале файла `test.skip(({ isMobile }) => isMobile, 'HTTP only: one browser is enough')`.

  Версию в тесте читать из `package.json` через `require('../../package.json')`.
- [ ] **Step 2:** `npx playwright test tests/e2e/api.spec.js` → PASS на нынешнем сервере.
- [ ] **Step 3:** Удалить `tests/api.test.js` и `tests/app-version.test.js`. В `docs/testing.md` строку «маршрут HTTP — Jest и supertest…» заменить на «маршрут HTTP — Playwright, `tests/e2e/api.spec.js`».
- [ ] **Step 4:** `npm test` → PASS. **Commit** `"HTTP API tests move to Playwright"`.

### Task 4: Убрать восстановление комнаты из копии в браузере

Всё ещё на сервере Node.

**Files:**
- Modify: `server.js` (маршрут `/api/recreate-game` ~строки 192–227), `game-logic.js` (`recreateGameFromState` ~783), `public/js/game-room.js` (строки 41–127, вызовы `saveGameStateToStorage` ~244/289/309/339/568, ветка в `joinGameRoom` ~575–592, параметр `skipRecreation`), `public/js/translations.js`, тесты (ниже).

- [ ] **Step 1: Тест** в `tests/e2e/api.spec.js`: `'there is no room recovery from a browser copy'` — `request.post('/api/recreate-game', { data: { roomCode: 'ABC123', gameState: { players: [] } } })` → статус 404.
- [ ] **Step 2:** `npx playwright test tests/e2e/api.spec.js -g "recovery"` → FAIL (сейчас 400).
- [ ] **Step 3: Удалить.**
  - Маршрут в `server.js`.
  - `recreateGameFromState` в `game-logic.js` вместе с экспортом.
  - В `game-room.js`: `gameStorageKey`, `saveGameStateToStorage`, `loadGameStateFromStorage`, `clearGameStateFromStorage`, `recreateRoomFromStorage`, все их вызовы, ветку «Game not found → восстановить» и параметр `skipRecreation`. «Game not found» дальше идёт по общей ветке: `alert(serverErrorText(result.error) …)` и уход на главную.
  - В `translations.js` (`en` и `ru`): ключи `failedRecoverGame`, `pleaseCreateNewRoom`, `invalidRoomCodeFormat`, если `grep` больше нигде их не находит; копии в `serverErrors` — `'Invalid saved game state: missing players'`, `'Failed to recreate game from saved state'`, `'Invalid room code format'`.
  - Тесты: `tests/room-recreation.test.js` целиком; тест с `recreateGameFromState` в `tests/custom-avatar.test.js` (~85); в `tests/game-cleanup.test.js` — `'recreated games mark every player disconnected…'`; в `tests/player-secret.test.js` — тест с `recreateGameFromState` (~88); в `tests/game-backup.test.js` — `"is not replaced by a browser's copy"`; в `tests/e2e/language.spec.js` — `"a failed room recovery reads in the player's language"`.
- [ ] **Step 4:** `npm test` → PASS, включая новый тест и `translations-real.test.js` (копий без текста не осталось). **Commit** `"Rooms are no longer rebuilt from a browser's copy"`.

### Task 5: Worker отдаёт сайт

**Files:**
- Create: `wrangler.jsonc`, `worker/index.js`, `worker/security-headers.json`, `public/_headers`, `tests/security-headers.test.js`
- Modify: `package.json` (devDependency `wrangler@4`), `eslint.config.mjs`, `.gitignore` (`.wrangler/`), `server.js` (`SECURITY_HEADERS` → `require('./worker/security-headers.json')`)

**Interfaces — Produces:**
- `worker/index.js`: `export default { fetch(request, env, ctx) }`.
- `withSecurityHeaders(response) → Response` — копия ответа с заголовками из `security-headers.json`.
- `notFound(request, env) → Promise<Response>` — `404.html` со статусом 404.
- `worker/security-headers.json`: `{ "Content-Security-Policy": "…", "Referrer-Policy": "…", "Permissions-Policy": "…", "X-Content-Type-Options": "nosniff" }` — значения ровно как в нынешнем `SECURITY_HEADERS` из `server.js`.

- [ ] **Step 1: Тест копий** — `tests/security-headers.test.js`:
  ```js
  test('the static files and the Worker send the same security headers', () => {
      const lines = fs.readFileSync('public/_headers', 'utf8').split('\n');
      const start = lines.indexOf('/*');
      const block = {};
      for (const line of lines.slice(start + 1)) {
          if (!/^\s+\S/.test(line)) break;
          const [name, ...value] = line.trim().split(': ');
          block[name] = value.join(': ');
      }
      expect(start).toBeGreaterThanOrEqual(0);
      expect(block).toEqual(require('../worker/security-headers.json'));
  });
  ```
- [ ] **Step 2:** `npx jest tests/security-headers.test.js` → FAIL (файлов нет).
- [ ] **Step 3: Заголовки.** Создать `worker/security-headers.json`. Создать `public/_headers` с блоком `/*` и теми же четырьмя заголовками; пояснения к каждой директиве перенести из комментариев `SECURITY_HEADERS` в `server.js` строками `#`. В `server.js` заменить объект на `require('./worker/security-headers.json')`.
- [ ] **Step 4: Конфигурация.** `npm install --save-dev wrangler@4`. Создать `wrangler.jsonc`: `name: "whoami-game"`, `main: "worker/index.js"`, дата и флаг из Global Constraints, `assets: { directory: "./public", binding: "ASSETS", not_found_handling: "404-page", run_worker_first: ["/api/*", "/game/*", "/ws/*"] }`, `observability: { enabled: true }`. Если выводы задачи 1 потребовали другого — сделать по выводам.
- [ ] **Step 5: `worker/index.js`.**
  - `GET /api/version` → `{ version }` из `package.json` (импорт JSON);
  - любой другой путь, дошедший до Worker, → `notFound`;
  - каждый ответ проходит через `withSecurityHeaders`.
- [ ] **Step 6: ESLint.** Блок `files: ["worker/**/*.js"]`, `sourceType: "module"`, `globals: { ...globals.serviceworker, WebSocketPair: "readonly", WebSocketRequestResponsePair: "readonly" }`, `rules: sharedRules`. В `ignores` добавить `.wrangler/`.
- [ ] **Step 7: Проверить.**
  - `npm test` → PASS (сервер Node).
  - `npx wrangler dev --port 3100` в фоне, затем `BASE_URL=http://localhost:3100 npx playwright test tests/e2e/site-headers.spec.js tests/e2e/not-found.spec.js tests/e2e/api.spec.js --project=desktop`. Должны пройти: заголовки для `/`, `/js/game.js`, `/vendor/bootstrap/bootstrap.min.css`, `/no-such/page`; все тесты `not-found.spec.js`; тест версии в `api.spec.js`. Тесты с комнатами пока падают — их чинит задача 6. Остановить wrangler.
- [ ] **Step 8: Commit** `"A Cloudflare Worker serves the site with the security headers"`.

### Task 6: Комнаты на Cloudflare: HTTP

Комната как Durable Object, маршруты `/api/create-game`, `/api/join-game`, `/game/:code`. Сокетов ещё нет. Страницы пока работают на сервере Node.

**Files:**
- Create: `worker/room-base.js`, `worker/room.js`
- Modify: `worker/index.js`, `wrangler.jsonc`

**Interfaces — Produces:**
- `worker/room-base.js` (общая часть, без whoami): `export class RoomBase extends DurableObject`. В этой задаче — только помощники, которыми пользуется HTTP; сокеты добавляет задача 7:
  - `sockets(filter = info => true) → WebSocket[]` — живые сокеты из `ctx.getWebSockets()`, у которых в attachment нет `gone`;
  - `getInfo(ws) → object` (`ws.deserializeAttachment() || {}`), `setInfo(ws, info) → void`;
  - `send(ws, event, data) → void` — `JSON.stringify({ event, data })`; ошибка отправки глотается;
  - `broadcast(event, data, { only = info => true, except = null } = {}) → void`;
  - `async setAlarmAt(times) → void` — минимум из ненулевых `times`, иначе `deleteAlarm()`.
- `worker/room.js` (whoami): `export class Room extends RoomBase`.
  - Поля: `this.games` (`Map` с 0 или 1 игрой), `this.roomCode`, `this.emptySince` (используется с задачи 8).
  - Хранилище: ключи `'game'` (`gameToStorage`), `'roomCode'`, `'emptySince'`. Загрузка в конструкторе внутри `ctx.blockConcurrencyWhile`.
  - RPC:
    - `async create(roomCode) → { success: boolean }` — `false`, если игра уже есть;
    - `async hasGame() → boolean`;
    - `async join(body) → { status: number, body: object }` — `body` как у `/api/join-game`; порядок проверок и ответы — как в `server.js` (~140–190): «Missing required fields», «Game not found» до проверки секрета, `waitingForApproval` со статусом 200; рассылка `player-joined` или `player-reconnected` всем сокетам игроков (`only: info => info.role === 'player'`).
  - `async save() → void` — `put('game', gameToStorage(game))`, а если игры нет — `deleteAll()`.
  - Логи — те же строки, что пишет `server.js`, через `forLog` (функция переезжает в `worker/room.js`): ни секрета, ни картинки аватара.
- `wrangler.jsonc`: `durable_objects.bindings: [{ name: "ROOMS", class_name: "Room" }]`, `migrations: [{ tag: "v1", new_sqlite_classes: ["Room"] }]`. Из `worker/index.js`: `export { Room } from './room.js'`.

- [ ] **Step 1: Тест.** Уже есть: `tests/e2e/api.spec.js`. Против `wrangler dev` он сейчас падает: маршрутов нет.
- [ ] **Step 2:** `npx wrangler dev --port 3100` в фоне и `BASE_URL=http://localhost:3100 npx playwright test tests/e2e/api.spec.js --project=desktop` → FAIL (404 на create-game).
- [ ] **Step 3: `worker/room-base.js` и `worker/room.js`** по Interfaces. Правило Review Focus 5: `hasGame()` и `join()` для комнаты без игры ничего не пишут в хранилище. `create()` записывает `game` и `roomCode`.
- [ ] **Step 4: Маршруты в `worker/index.js`.**
  - `POST /api/create-game`: до 5 попыток `code = generateRoomCode()` → `env.ROOMS.getByName(code).create(code)`; при успехе — `{ gameId: code, success: true }` (форма ответа нынешняя).
  - `POST /api/join-game`:
    - тело больше 65 536 байт → 413 `{ success: false }`;
    - `gameId` приводится к верхнему регистру;
    - пустые обязательные поля → 400 `{ error: 'Missing required fields' }`;
    - неверный формат кода → 400 `{ success: false, error: 'Game not found' }` без обращения к комнате;
    - иначе ответ `stub.join(body)` со статусом и телом из него.
  - `GET /game/:code`: верхний регистр; неверный формат или `!(await stub.hasGame())` → 302 на `/?error=room-not-found`; иначе страница `game.html` через `env.ASSETS` (путь — по выводам задачи 1).
- [ ] **Step 5:** `BASE_URL=http://localhost:3100 npx playwright test tests/e2e/api.spec.js --project=desktop` → PASS. Затем `npm test` → PASS (страницы ещё на Node).
- [ ] **Step 6: Commit** `"Rooms are Durable Objects: create, join and room links"`.

### Task 7: Сокеты и переключение страниц на Cloudflare

Самая большая задача: страница переходит на `RoomSocket`, тесты — на `wrangler dev`, сервер Node удаляется.

**Files:**
- Create: `public/js/room-socket.js`, `tests/e2e/connection.spec.js`
- Modify: `worker/room-base.js`, `worker/room.js`, `worker/index.js`, `public/game.html`, `public/js/game-room.js`, `playwright.config.js`, `tests/e2e/helpers.js`, `tests/e2e/impersonation.spec.js`, `tests/e2e/late-join.spec.js`, `tests/e2e/game.spec.js`, `tests/e2e/leave-and-return.spec.js`, `tests/e2e/room.spec.js`, `tests/translations-real.test.js`, `tests/game-cleanup.test.js`, `tests/player-secret.test.js`, `tests/late-join.test.js`, `game-logic.js`, `package.json`, `eslint.config.mjs`, `.gitignore`
- Delete: `server.js`, `game-backups.js`, `tests/game-backup.test.js`, `tests/connection-tracker.test.js`

**Interfaces — Consumes:** `RoomBase` и `Room` из задачи 6; `gameToStorage` и `gameFromStorage` из задачи 2.

**Interfaces — Produces:**
- `RoomBase` добавляет:
  - `async fetch(request)` — без `Upgrade: websocket` → 426; иначе `new WebSocketPair()`, `ctx.acceptWebSocket(server)`, attachment `{ connectedAt: Date.now() }`, ответ 101;
  - конструктор ставит `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`;
  - `async webSocketMessage(ws, message)` — не строка, не JSON, без `event`-строки → тихо игнорировать; `data` не объект → `{}`; затем `await this.onEvent(ws, event, data)` в `try`; на исключение — `console.error` и `this.onEventError(ws, event, error)`;
  - `async webSocketClose(ws)` и `async webSocketError(ws)` → `this.socketGone(ws)`;
  - `async socketGone(ws)` — если уже `gone`, ничего; иначе пометить `gone`, `try { ws.close() } catch {}`, затем `await this.onSocketGone(ws, info)` с прежним `info`;
  - хуки для переопределения: `async onEvent(ws, event, data)`, `onEventError(ws, event, error)`, `async onSocketGone(ws, info)`.
- `Room` (whoami):
  - роли в attachment: `{ role: 'player', playerId }`, `{ role: 'waiting', playerId }`, без роли — не зарегистрирован;
  - обработчики `onEvent` — все события из `server.js` (~347–533), одно в одно: условия, рассылки и тексты ошибок прежние. `io.to(room)` → `broadcast(…, { only: player })`; `socket.to(room)` → то же с `except: ws`; `socket.emit('error', t)` → `this.send(ws, 'error', t)`;
  - `onEventError` → `this.send(ws, 'error', 'Something went wrong, please try again')`;
  - `onSocketGone`:
    - `waiting`: последний сокет ожидания этого новичка → `withdrawJoinRequest` и `join-request-closed` с `withdrawn`;
    - `player`: последний сокет игрока → `markPlayerDisconnected` и `player-disconnected` остальным;
    - затем `save()`;
  - сверка после загрузки в конструкторе: игроки с `isConnected`, у которых нет сокетов `player`, → `markPlayerDisconnected`; заявки без сокетов `waiting` → удалить. Так комната приходит в порядок после деплоя;
  - `leave-game`: у всех сокетов игрока снимается роль; если игра удалена — `save()` стирает хранилище;
  - после каждого обработчика, который меняет игру, — `save()`.
- `worker/index.js`: `GET /ws/:code` — код в верхний регистр; верный код → `env.ROOMS.getByName(code).fetch(request)`, иначе 400.
- `public/js/room-socket.js` (общая часть, классический скрипт, `/* exported RoomSocket */`):
  ```js
  class RoomSocket {
      constructor(path, { log = () => {} } = {})  // path like '/ws/ABC123'; ws: or wss: by location.protocol; connects at once
      get connected()          // boolean
      get ws()                 // the current WebSocket or null (tests close it to drop the connection)
      on(event, handler)       // 'connect', 'disconnect', or an event the server sends
      once(event, handler)
      emit(event, data)        // JSON { event, data }; not connected → dropped (log)
      disconnect()             // closes for good, no reconnect
  }
  ```
  Константы: `PING_EVERY_MS = 25_000`; `SILENCE_LIMIT_MS = 60_000` — после этого соединение считается мёртвым: закрыть и переподключиться. Задержки переподключения: 1000 мс, удваиваются до 5000, плюс случайные 0–50 %. На `visibilitychange` → видимая страница: отправить `'ping'`; если за 5000 мс ничего не пришло — переподключиться. Ответ `'pong'` и любое сообщение считаются «услышали». `'connect'` срабатывает на каждое открытие, `'disconnect'` — на каждое закрытие.

- [ ] **Step 1: `roomWith` в helpers.** Перенести одинаковую `roomWith(newPlayer, names)` из `room.spec.js` и `leave-and-return.spec.js` в `tests/e2e/helpers.js` (экспорт) и использовать оттуда.
- [ ] **Step 2: Новые тесты** — `tests/e2e/connection.spec.js`:
  ```js
  test('after a reload the player still moves', async ({ newPlayer }) => {
      const { players: [alice, bob, carol] } = await roomWith(newPlayer, ['Alice', 'Bob', 'Carol']);
      await bob.page.reload();
      await waitForPlayers(bob.page, 3);
      await assignCharacter(bob, 'Alice', 'Napoleon');
      await expect(playerCard(carol.page, 'Alice').locator('.character-sticker')).toHaveText('Napoleon');
  });

  test('junk on the socket breaks nothing', async ({ newPlayer }) => {
      const { players: [alice, bob, carol] } = await roomWith(newPlayer, ['Alice', 'Bob', 'Carol']);
      await alice.page.evaluate(() => {
          for (const junk of ['not json', '{}', '[1,2]', JSON.stringify({ event: 5 }), JSON.stringify({ event: 'no-such-event', data: 1 })]) {
              socket.ws.send(junk);
          }
      });
      await assignCharacter(alice, 'Bob', 'Zorro');
      await expect(playerCard(carol.page, 'Bob').locator('.character-sticker')).toHaveText('Zorro');
  });
  ```
  Неожиданный диалог или ошибка в консоли и так проваливают тест через фикстуру `newPlayer`.
- [ ] **Step 3: Переделать тесты, которые лезут в Socket.IO.**
  - `holdRoomJoin` (helpers): в `addInitScript` обернуть `WebSocket.prototype.send` — кадр-строка с `"event":"join-room"` до `releaseRoomJoin()` придерживается, остальные уходят сразу. Комментарий поправить.
  - `countSentEvents`: убрать ветку HTTP polling (`/socket.io/`).
  - `impersonation.spec.js`: `io({ forceNew: true })` → `new RoomSocket(`/ws/${gameId}`)`; `socket.disconnect()` остаётся.
  - `late-join.spec.js`: ~79 `socket.once('error', …)` — без изменений; ~172 `io({ forceNew: true })` → `new RoomSocket(`/ws/${gameId}`)`; ~276 и ~285 — без изменений; ~305–309: вместо `socket.id` и `socket.io.engine.close()` — счётчик `window.connects` через `socket.on('connect', …)`, обрыв `socket.ws.close()`, ожидание `window.connects >= 1 && socket.connected`.
  - `game.spec.js` ~124: `socket.io.engine.close()` → `socket.ws.close()`.
  - `leave-and-return.spec.js`: удалить `'a room its last player left does not come back from its backup'` — резервных копий больше нет, удаление последним игроком проверяет `'the last player to leave deletes the room'`.
- [ ] **Step 4: Переключить тесты на wrangler.** `playwright.config.js`: `webServer.command: 'npx wrangler dev --port 3100 --inspector-port 9230 --persist-to <os.tmpdir()>/whoami-e2e-state'`, `env: { WRANGLER_SEND_METRICS: 'false' }`, `url` прежний, `reuseExistingServer: false`. Убрать `GAMES_DIR`, `E2E_GAMES_DIR` и упоминание Render в комментарии.
- [ ] **Step 5:** `npx playwright test tests/e2e/connection.spec.js` → FAIL (`RoomSocket`/`socket.ws` нет, страница грузит `/socket.io/socket.io.js`).
- [ ] **Step 6: Реализовать** `RoomBase` и `Room` по Interfaces, маршрут `/ws/:code`, `public/js/room-socket.js`. В `game.html` строку `<script src="/socket.io/socket.io.js">` заменить на `<script src="/js/room-socket.js">`. В `game-room.js`: `socket = new RoomSocket(`/ws/${roomCode}`, { log: debugLog })`, `RoomSocket` добавить в `/* global */`. В `eslint.config.mjs` убрать глобал `io`.
- [ ] **Step 7: Удалить старое.**
  - Файлы: `server.js`, `game-backups.js`, `tests/game-backup.test.js`, `tests/connection-tracker.test.js`.
  - Из `game-logic.js`: `restoreGame`, `toDate` (если больше не нужен), `cleanupInactiveGames`, `createConnectionTracker`, опцию `withSecrets` у `serializeGame`; комментарии про `server.js` и диск — на новые места.
  - Тесты: в `game-cleanup.test.js` — `describe('Inactive Game Cleanup')`; в `player-secret.test.js` — тест резервной копии (~76); в `late-join.test.js` ~135 — заменить на `'join requests are kept in storage'`: `gameFromStorage(JSON.parse(JSON.stringify(gameToStorage(game)))).joinRequests.size === 1`.
  - `package.json`: убрать `express`, `socket.io`, `supertest`; `main: "worker/index.js"`; `start` и `dev` → `wrangler dev`.
  - `eslint.config.mjs`: серверный блок — только `game-logic.js`; убрать `games/` из ignores; `.gitignore`: убрать `games/`.
  - `tests/translations-real.test.js`: файлы → `['game-logic.js', 'worker/index.js', 'worker/room.js']`; регулярное выражение дополнить формой `send\(\s*\w+\s*,\s*(['"])error\1\s*,\s*(['"])(.+?)\2`; добавить проверку, что среди найденных есть `'You are not in this game'` (доказательство, что выражение находит новую форму).
- [ ] **Step 8:** `npm test` → PASS (ESLint, Jest, все браузерные тесты на `wrangler dev`).
- [ ] **Step 9: Commit** `"The game runs on Cloudflare: rooms over WebSocket, the Node server goes"`.

### Task 8: Таймеры комнаты

**Files:**
- Modify: `worker/room-base.js`, `worker/room.js`, `playwright.config.js`
- Create: `tests/e2e/room-timers.spec.js`

**Interfaces — Consumes:** `roomAlarmTime`, `restartGhostClocks`, `removeStaleDisconnectedPlayers`, `ROOM_EMPTY_MS`, `MAX_DISCONNECTED_MS` из задачи 2.

**Interfaces — Produces:**
- `RoomBase`:
  - `SOCKET_SILENCE_MS = 2 * 60 * 1000` и `SWEEP_EVERY_MS = 60 * 1000` (экспорт; первое — как `pingTimeout` у Socket.IO);
  - `async sweepSilentSockets(limitMs = SOCKET_SILENCE_MS)` — для каждого живого сокета `last = ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? info.connectedAt`; если `now - last > limitMs` → `socketGone(ws)`.
- `Room`:
  - таймеры: `emptyRoomMs = Number(env.ROOM_EMPTY_MS) || ROOM_EMPTY_MS`, `ghostMs = Number(env.GHOST_MS) || MAX_DISCONNECTED_MS`;
  - `async afterChange()` — вызывается после каждого обработчика, RPC и `onSocketGone` вместо голого `save()`:
    - игры нет → `save()` (стирает хранилище, если там что-то было), `deleteAlarm()` и больше ничего: пустая комната ничего не пишет и не будит себя (Review Focus 5);
    - нет сокетов `player` → `emptySince ??= Date.now()`, иначе `emptySince = null`;
    - сохранить `game` и `emptySince`;
    - `setAlarmAt([roomAlarmTime(game, { playerPagesOpen, emptySince }, { emptyRoomMs, ghostMs }), sockets().length ? Date.now() + SWEEP_EVERY_MS : null])`;
  - `create()` ставит `emptySince = Date.now()`: комната, в которую так никто и не вошёл, уходит через 2 часа;
  - `join-room`: если `emptySince !== null` → `restartGhostClocks(game)` до `markPlayerConnected`;
  - `async alarm()`:
    - нет страниц игроков и `now >= emptySince + emptyRoomMs` → `deleteRoom()`: ждущим новичкам `join-request-ended` с `retry`, затем `games.clear()`, `deleteAll()`, `deleteAlarm()`;
    - иначе, если страницы игроков есть → `removeStaleDisconnectedPlayers(this.games, ghostMs)`; на каждое удаление — `player-left` с нагрузкой `{ playerId, playerName, players, characters, revealedPlayers, gameDeleted }` (как у `leave-game`) всем сокетам игроков, и `join-request-ended` с `retry` для `endedJoinRequests`;
    - затем `sweepSilentSockets()` и `afterChange()`.
- `playwright.config.js`:
  - второй `webServer`: `npx wrangler dev --port 3101 --inspector-port 9231 --persist-to <tmp>/whoami-e2e-fast --var ROOM_EMPTY_MS:6000 --var GHOST_MS:3000`;
  - `process.env.E2E_FAST_TIMERS_URL = 'http://localhost:3101'`.

- [ ] **Step 1: Тесты** — `tests/e2e/room-timers.spec.js`:
  - `test.skip(!!process.env.BASE_URL, 'needs the local server with short timers')`;
  - `test.use({ baseURL: process.env.E2E_FAST_TIMERS_URL })`;
  - паузы — `new Promise(r => setTimeout(r, ms))`;
  - тесты:
  ```js
  test('a room nobody has open is gone after the empty-room time', async ({ newPlayer }) => {
      const alice = await newPlayer('Alice');
      const code = await createRoom(alice);
      await alice.page.goto('/');
      await sleep(7000);
      await alice.page.goto(`/game/${code}`);
      await expect(alice.page).toHaveURL(/\/\?error=room-not-found$/);
  });

  test('a player whose page is gone leaves after the ghost time while others play', async ({ newPlayer }) => {
      const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', 'Bob']);
      await bob.page.close();
      await waitForPlayers(alice.page, 1);   // expect timeout of the helper: give it 10_000
  });

  test('nobody leaves while every page is closed; the ghost time starts again on return', async ({ newPlayer }) => {
      const { players: [alice, bob], code } = await roomWith(newPlayer, ['Alice', 'Bob']);
      await alice.page.close();
      await bob.page.close();
      await sleep(4500);                     // longer than GHOST_MS, shorter than ROOM_EMPTY_MS
      const back = { ...alice, page: await alice.context.newPage() };
      await back.page.goto(`/game/${code}`);
      await waitForPlayers(back.page, 2);    // Bob is still listed: nobody was removed in the gap
      await waitForPlayers(back.page, 1);    // and goes GHOST_MS after Alice came back
  });
  ```
  Если `waitForPlayers` не принимает тайм-аут, ожидание делается через `expect(…).toHaveCount(n, { timeout: 10_000 })` на тех же карточках.
- [ ] **Step 2:** `npx playwright test tests/e2e/room-timers.spec.js` → FAIL (комнаты не удаляются, «призраки» не уходят).
- [ ] **Step 3:** Реализовать по Interfaces.
- [ ] **Step 4:** `npx playwright test tests/e2e/room-timers.spec.js` → PASS; затем `npm test` → PASS.
- [ ] **Step 5: Commit** `"Room timers: empty rooms go after two hours, ghosts only while someone plays"`.

### Task 9: Документация

**Files:** `CLAUDE.md`, `docs/testing.md`, `README.md`, `.vscode/` (если там упомянут сервер).

Не трогать сейчас (это этап 2): адрес продакшена, `render.yaml`, `docs/release.md`, `docs/publishing.md`, деплой в «Git Workflow».

- [ ] **Step 1: CLAUDE.md** — описать новый мир по принципу «principles, not history»:
  - **Commands:** `npm start` = `wrangler dev`, `npx wrangler deploy`;
  - **Architecture:** `worker/`, `wrangler.jsonc`, `public/_headers`, `room-socket.js`; убрать `server.js`, `game-backups.js`, `games/`;
  - **How it works:**
    - HTTP API без recreate-game;
    - заголовки: `_headers` и копия в `security-headers.json`, тест сверки;
    - события по WebSocket через `RoomSocket` и комнату-Durable Object; разделение на общую часть и часть whoami;
    - Persistence: хранилище комнаты и 2 часа;
    - раздел «Restoring is validating» и «Limit» в «Player identity» убрать;
    - Timeout protection: ping/pong 25 с / 60 с, тишина 2 минуты, «призраки» только при открытых страницах, часы с начала после перерыва;
    - Connection tracking: роли в attachment, сверка после пробуждения;
  - **Gotchas:** Socket.IO → `RoomSocket`; файлы в «Server error texts»; `holdRoomJoin`;
  - **Decisions:** Cloudflare Workers + голые Durable Objects; общая часть копируется в следующие приложения; лимиты бесплатного плана.
- [ ] **Step 2: `docs/testing.md`:** два `wrangler dev` (обычный и с короткими таймерами), как устроен `holdRoomJoin`, обрыв соединения в тестах (`socket.ws.close()`), `api.spec.js`. **README:** запуск.
- [ ] **Step 3:** `npm test` → PASS. **Commit** `"Docs: the game on Cloudflare Workers and Durable Objects"`.

### Task 10: Первая выкатка на workers.dev и проверка

- [ ] **Step 1:** Если вход в Cloudflare из задачи 1 не сохранился, попросить владельца выполнить `! npx wrangler login`.
- [ ] **Step 2:** `npx wrangler deploy` → записать адрес `https://whoami-game.<поддомен>.workers.dev` и проверить, что вывод без ошибок (условие 1 владельца).
- [ ] **Step 3:** `BASE_URL=<адрес> npx playwright test --workers=2` → все PASS, локальные тесты пропущены (условие 2 владельца).
- [ ] **Step 4: Ручные проверки (вместе с владельцем).**
  - (a) Два окна в начатой партии на `<адрес>`, во время игры ещё раз `npx wrangler deploy`: оба окна переподключились, персонажи на месте, открытие конверта доходит до второго окна (Review Focus 4).
  - (b) Телефон в комнате, экран заблокирован 3+ минуты, разблокировка: за минуту страница снова в комнате, ход доходит (Review Focus 3).
  - (c) `npx wrangler tail whoami-game` во время игры: видны записи комнаты; ни секретов, ни картинок аватаров.
- [ ] **Step 5:** Добавить в этот план раздел `## Stage 1 results`: адрес, итог тестов, итоги (a)–(c). **Commit** `"Plan: stage 1 results"`.
- [ ] **Step 6:** Сказать владельцу, что этап 1 готов и следующий шаг — разговор о домене, а потом подготовка этапа 2.

## Spike findings

Прототип 2026-11-04: `wrangler` 4.157.0, Node 26, аккаунт с поддоменом `<поддомен>.workers.dev`. Прототип удалён, в репозитории остались только эти выводы.

| Проверка | Локально | Cloudflare |
|---|---|---|
| C1 `_headers`: заголовки на `/`, на файлах и на странице 404; `/no-such` → 404 с телом `404.html`; `/_headers` → 404 | да | да |
| C2 `game-logic.js` (CommonJS) и `crypto` под `nodejs_compat` | да | да |
| C3 `env.ASSETS.fetch('/game.html')` → `game.html` | да | да |
| C4 рассылка, автоответ `ping` → `pong`, закрытие, счётчик в хранилище, alarm | да | да |
| C5 версия из `package.json` | да | да |
| C6 два `wrangler dev` одновременно, `--var` доходит только до своего | да | — |
| C7 статика отдаётся без Worker | да | — |
| C8 комната переживает деплой | — | да, лучше ожидаемого (ниже) |
| C9 в `wrangler tail` нет вызовов для статики | — | да |

Что разошлось с планом или уточняет его:

1. **Деплой не обрывает сокеты (C8).** Ни повторная выкатка того же кода, ни выкатка изменённого не закрыли открытые сокеты: за 2,5 минуты наблюдения кодов закрытия нет.
   - Комната, которая спит (Hibernation), просыпается на следующем сообщении уже на новом коде. Сокеты при этом подключены, attachment и хранилище на месте.
   - Комната, которая не засыпает (сообщения чаще ~10 с), продолжает работать на старом коде, пока не уснёт. На него попадают и новые подключения к ней.
   - Новая комната сразу получает новый код.
   
   Следствия:
   - сверка после загрузки (задача 7) остаётся: Cloudflare всё равно может перезапустить комнату, и тогда сокеты рвутся, а `RoomSocket` переподключается;
   - в задаче 10 (a) ожидание другое: окна остаются подключёнными или переподключаются, партия идёт, открытие доходит;
   - в задаче 9 записать в Gotchas: после выкатки комната какое-то время может работать на прежнем коде рядом с новыми страницами, поэтому изменение протокола должно работать и с прежней версией комнаты.
2. **`env.ASSETS.fetch(new URL('/game.html', request.url))` отвечает 200 с `game.html`** без редиректа, и заголовки из `_headers` на этом ответе уже стоят. В задаче 6 так и делать.
   - Прямые запросы `/game.html`, `/index.html` и `/404.html` статика отвечает редиректом 307 (`/game`, `/`, `/404`), тоже с заголовками из `_headers`.
3. **`getByName` есть,** запасной путь через `idFromName` не нужен.
4. **Ответы самого Worker заголовков из `_headers` не получают** (`/api/nothing` → 404 без них). `withSecurityHeaders` нужен, как в плане.
5. **Выкатка с Mac загружает `public/.DS_Store`** как файл сайта: `/.DS_Store` → 200. В задаче 5 добавить `public/.assetsignore` со строкой `.DS_Store` и проверить, что `/.DS_Store` → 404 и `/.assetsignore` → 404.
6. **npm 11 не запускает install-скрипты `esbuild` и `workerd`** (предупреждение `allowScripts`), но `wrangler dev`, `deploy` и `tail` работают и без них.
7. **Мелочи.**
   - Код закрытия в комнате, когда клиент закрывает сокет без кода, — 1005.
   - Alarm и `--persist-to` работают в `wrangler dev`.
   - Адрес задачи 10 — `https://whoami-game.<поддомен>.workers.dev`.
   - Вход wrangler хранится в `~/Library/Preferences/.wrangler`, повторный `wrangler login` для задачи 10 не нужен.

## Stage 1 results

2026-11-04. Ветка `feature/cloudflare`, не слита и не запушена; Render не тронут.

- **Адрес:** https://whoami-game.<поддомен>.workers.dev — выкатка `npx wrangler deploy` без ошибок и предупреждений (условие владельца 1).
- **Тесты:**
  - локально `npm test`: ESLint, Jest 250, Playwright 335 пройдено (19 пропущено);
  - против адреса `BASE_URL=… npx playwright test --workers=2`: 332 пройдено, 22 пропущено — только локальные (условие владельца 2).
  - Первый прогон сразу после самой первой выкатки дал 4 падения: несколько секунд файлы сайта отвечали 404, и было два ответа 502. Повторные прогоны их не воспроизвели. Значит, после выкатки нужно дождаться, пока новые файлы разойдутся по сети Cloudflare, и только потом запускать тесты.
- **Ручные проверки:**
  - (a) выкатка посреди начатой партии в двух окнах: сокеты не оборвались, переподключений ноль, открытие конверта дошло до второго окна;
  - (b) телефон в комнате, экран заблокирован 3+ минуты: после разблокировки страница снова в комнате, ход доходит — проверил владелец;
  - (c) `wrangler tail`: записи комнаты видны, фото-аватар в логе — `[photo]`, ни секретов, ни картинок, ни хэшей.
- **Таймеры комнаты на `wrangler dev`:**
  - сокет, который пингует каждые 25 с, живёт;
  - молчащий сокет игрока комната закрывает ровно через 2 минуты;
  - комната с открытой страницей, где ничего не меняется, своё хранилище не переписывает.
- **Финальная проверка ветки** (отдельный проверяющий): критичного нет. Исправлены три важных замечания и запас времени в тесте таймеров (коммит `3ff7730`); 10 мелких замечаний отложены на решение владельца.
- **Отложенные мелкие замечания проверки** (решает владелец):
  1. `readBody` читает всё тело и только потом отвечает 413 — сначала смотреть `Content-Length`.
  2. Голый `/game` (и `/index`, `/404`) статика отдаёт страницей; на `/game` — сообщение «неверный код» и уход на главную вместо страницы 404 (добавить `/game` в `run_worker_first`).
  3. Сокет ожидания, который потом шлёт `join-room` как игрок, оставляет свою заявку висеть (путь только из консоли).
  4. `checkAfterWake` может закрыть ещё не открывшийся сокет (ошибка в консоли, переподключение всё равно происходит).
  5. У Worker нет запасного ответа: исключение комнаты превращается в страницу Cloudflare 1101 без заголовков и JSON.
  6. `HEAD` на `/api/version` и `/game/:code` отвечает 404.
  7. `create()` пишет в хранилище дважды.
  8. Нет тестов на 413 (тело больше 64 КБ) и на `/ws/не-код` → 400.
  9. `gameFromStorage` лишний раз превращает уже готовые данные в строку.
  10. Каждый `RoomSocket` добавляет слушатель `visibilitychange` и не снимает его.
- **Дальше:** разговор о домене, затем подготовка этапа 2 (переключение).
