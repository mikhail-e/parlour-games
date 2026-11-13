# Тесты

Общие правила тестов игр на ядре — `packages/room-kit/docs/testing.md`: команды, два вида тестов, проекты Playwright, игроки и страховка, помощники ядра, сокет комнаты в тестах, правила набора, отладка, прогон против прода. Здесь — своё у whoami.

## Команды

Из папки игры, `games/whoami/` (из корня — `-w games/whoami` для скриптов npm).

```bash
npm test                                   # всё: ESLint, Jest, Playwright
npx jest tests/game-logic.test.js          # один файл Jest
npx playwright test tests/e2e/room.spec.js --project=desktop   # один файл в одном проекте
npm run test:e2e:prod                      # браузерные тесты против https://whoami.escapist.club
```

## Что проверяют тесты по тексту файлов

- `code-structure.test.js`: ни `style="..."`, ни `on...="..."` в страницах и скриптах игры (CLAUDE.md, правило 8; проверка — `inlineCodeProblems` ядра);
- `shared-names.test.js`: общие имена скриптов страниц — игры и ядра вместе (`sharedNameProblems` ядра);
- `translations-real.test.js`: оба языка словаря, одинаковые подстановки, словарь не повторяет тексты ядра, у каждой ошибки сервера есть русская копия (`serverErrors` — копии ошибок самой игры; проверка — `translationProblems` ядра);
- сверка копий, которые игра держит намеренно: длина персонажа в `game-logic.js` и в `utils.js` (`input-limits.test.js`), список иконок service worker (`service-worker.test.js`), манифест, печать на конверте и в иконке (`wax-seal.test.js`), три копии вывески (`brand-sign.test.js`), цвета наклеек (`improved-sticker-colors.test.js`).

## Серверы тестов

Playwright запускает два `wrangler dev` (`playwright.config.js`):
- на порту 3100 — обычный, для всех тестов;
- на порту 3101 — с короткими таймерами комнаты (`ROOM_EMPTY_MS: 8000`, `GHOST_MS: 3000`): на нём идёт только `room-timers.spec.js` (`test.use({ baseURL: process.env.E2E_FAST_TIMERS_URL })`).

Запущенный `npm start` (8787) не мешает.

## Помощники (`tests/e2e/helpers.js`)

Файл передаёт дальше помощники ядра (`packages/room-kit/docs/testing.md`, Помощники ядра: тексты страниц, вход, создание комнаты, выход, подмена «Поделиться», медленная связь…) и добавляет свои:

| Помощник | Что делает |
|---|---|
| `text(ключ, язык, подстановки)`, `serverErrorText(текст, язык)` | тексты `translations.js` whoami поверх текстов ядра (`pageTexts` ядра) |
| `assignCharacter(игрок, кому, персонаж)` | «+ Assign character», ввод, Enter |
| `startGame(игрок)` | «Start Game» и ожидание начатой партии |
| `revealOwnCharacter(игрок)` | свой конверт → окно → подтверждение |
| `startedGame(newPlayer, имена)` | целая начатая партия: комната, вход, персонажи по кругу, старт |

## Особые тесты

- **Обрыв связи** (`socket.ws.close()`) — ход во время обрыва (`game.spec.js`) и новичок, у которого оборвалась связь (`late-join.spec.js`); **второй сокет из консоли** — `impersonation.spec.js`, `late-join.spec.js`.
- **Адрес в карточках превью** (`link-preview.spec.js`, «the cards name the site they are served from») проверяется только против развёрнутого сайта (`BASE_URL`): в разметке записан адрес прода, локальный сервер с ним не совпадает. Только в проекте `desktop`: карточки — разметка, телефон ничего не добавляет.
- **HTTP API**: `api.spec.js` проверяет ответы `/api/*` и ссылки на комнаты через `request` Playwright — без страницы, только в проекте `desktop`. Он идёт и против прода.
- **Метка запросов**: `check-tag.spec.js` запускает тест ядра о метке ` EscapistCheck` в user agent на настройках игры (`packages/room-kit/docs/testing.md`, Против прода).
- **Экран не гаснет**: `wake-lock.spec.js` держит свою подмену `navigator.wakeLock` — экран, который не гаснет, из теста не увидеть. Подмена ведёт себя как браузер: выдаёт блокировку, отказывает скрытой странице, снимает блокировку, когда страница уходит с экрана (`setPageHidden`), и по просьбе отказывает в первом запросе. Последний тест спрашивает настоящий Chromium с разрешением `screen-wake-lock`: подмена не знает, просит ли страница то самое и пускает ли это `Permissions-Policy` сервера. Без разрешения Chromium отказывает, как телефон в режиме экономии, — и молчание отказа проверяет страховка всех тестов начатой партии.
- **Стили**: `styles.spec.js` читает правила `playbill.css` ядра и `style.css` игры так, как их принял браузер (`:hover` только для мыши), и проверяет, что шрифты загрузились, кириллица тоже; axe в `accessibility.spec.js` — у каждого экрана и окна.
- **Журнал игры** в консоли теста: `await player.page.evaluate(() => localStorage.setItem('whoami-debug', 'on'))` и перезагрузка.
