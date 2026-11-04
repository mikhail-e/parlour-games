# Этап 2 переезда на Cloudflare — переключение. План

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** игра выходит из `master` на https://whoami.escapist.club (Cloudflare Workers Builds); Render перестаёт забирать `master` и до удаления держит прежнюю версию по старому адресу.

**Architecture:** новая версия уже работает на домене (этап 1 и коммит `a1b0d25`). В ветке переноса адрес меняется во всех местах, и версия с ним выкатывается на домен вручную. Владелец выключает у сервиса Render автодеплой, затем выпуск 2.0.0 по `docs/release.md`; `master` выкатывает Workers Builds.

**Tech Stack:** Cloudflare Workers + Durable Objects, `wrangler` 4, Workers Builds; Playwright, Jest.

**Spec:** `docs/superpowers/specs/2026-11-04-cloudflare-migration-design.md`, раздел «Этап 2 — переключение».

## Global Constraints

- Push в `master` — только после подтверждения владельца («выкладывай»).
- `.claude/settings.json` не коммитить.
- В коммитах и текстах репозитория нет следов работы владельца.
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `public/sw.js` не трогать: любая правка — новый service worker у всех игроков.
- `npm test` перед каждым коммитом.
- Документы держат принципы, а не историю: ни дат, ни замеров, ни «раньше было на Render».
- Номер версии записан только в `package.json`.
- Новый адрес — `https://whoami.escapist.club` (выбор владельца), старый — `https://whoami-game.onrender.com`.

## Решения

- **Редиректа со старого адреса нет (решение владельца).** Сервисом пока почти никто не пользуется, а спящий сервер Render никто не находил — перенаправлять некого. Render держит прежнюю версию по старому адресу, пока владелец не удалит сервис (этап 3). Это отменяет п. 5 этапа 2 спеки.
- **Render перестаёт забирать `master` выключенным автодеплоем,** без отдельной ветки. Если сервис создан из Blueprint, Blueprint сначала отключают: по документации Render синхронизация Blueprint перезаписывает несогласные с ним настройки панели, а отключение Blueprint оставляет сервис как есть. Без этого push 2.0.0 (в нём уже нет `render.yaml`, а `npm start` — это `wrangler dev`) ушёл бы на Render.
- **Версия 2.0.0 (по `docs/release.md`):** мажорная — «изменение, после которого прежнее перестаёт работать: открытые комнаты, сохранённое в браузере, установленное приложение». Смена адреса делает именно это.
- **Workers Builds: ветка `master`, Preview Builds выключены** (спека, «моё решение»). Сборка ставит пакеты сама и по умолчанию берёт Node 24 — `wrangler` нужен 22+, закреплять версию не нужно. Подключение репозитория сборку не запускает: первая сборка — от push в `master`.
- **Спека и планы уходят из репозитория перед слиянием в `develop`** (CLAUDE.md, Decisions: «A design spec or plan of a feature leaves the repository once the feature is merged»); что остаётся верным — в CLAUDE.md и `docs/`.

## Review Focus

1. Карточки превью на новом адресе ссылаются на новый адрес: `canonical`, `og:url`, `og:image` обеих страниц — иначе бот мессенджера покажет старый адрес и пойдёт за картинкой на Render (тест против домена, Задача 1).
2. Push 2.0.0 в `master` не запускает выкатку на Render: старый адрес по-прежнему отвечает прежней версией (проверка в Задаче 3).
3. Первая сборка Workers Builds: `npm ci` падает, если `package-lock.json` записан более новым npm, чем в образе сборки, а выкатка — если у токена сборки нет прав на маршруты зоны `escapist.club`. Признак и исправление — в Задаче 3.
4. Push `develop` не собирает и не выкатывает ничего на Cloudflare (Preview Builds выключены, Задача 3).
5. В текстах репозитория не осталось старого адреса и Render — кроме того, что прямо нужно (проверка `git grep`, Задача 1).

---

### Task 1: Новый адрес во всех местах, выкатка на домен

**Files:**
- Modify: `public/index.html` (`canonical`, `og:url`, `og:image`, `twitter:image`, `url` и `screenshot` в JSON-LD), `public/game.html` (`og:image`, `twitter:image`), `public/llms.txt` (ссылка Live app)
- Modify: `package.json` (`homepage`, `test:e2e:prod`)
- Modify: `CLAUDE.md`, `README.md`, `SECURITY.md`, `docs/release.md`, `docs/testing.md`, `docs/publishing.md`
- Delete: `render.yaml`
- Test: `tests/e2e/link-preview.spec.js`

**Interfaces:**
- Consumes: домен подключён (`wrangler.jsonc`, `a1b0d25`).
- Produces: на `https://whoami.escapist.club` работает версия с новым адресом во всех карточках.

- [ ] **Step 1: Написать тест, который падает против домена.** В `tests/e2e/link-preview.spec.js`:

```js
// Against a deployed site the cards name that very site: a card with another
// address sends the reader and the bot's picture request elsewhere
test('the cards name the site they are served from', async ({ newPlayer, request, baseURL }) => {
    test.skip(!process.env.BASE_URL, 'the cards hold the production address');
    const { page } = await newPlayer('Reader');
    const site = new URL(baseURL).origin;
    const landing = await headOf(page, request, '/');
    expect(new URL(landing.canonical).origin).toBe(site);
    expect(new URL(landing.tags['og:url']).origin).toBe(site);
    const room = await headOf(page, request, `/game/${await createRoom(await newPlayer('Alice'))}`);
    for (const tags of [landing.tags, room.tags]) {
        expect(new URL(tags['og:image']).origin).toBe(site);
    }
});
```

- [ ] **Step 2: Убедиться, что он падает.** `BASE_URL=https://whoami.escapist.club npx playwright test tests/e2e/link-preview.spec.js -g "name the site" --project=desktop` → FAIL: `Expected: "https://whoami.escapist.club"`, `Received: "https://whoami-game.onrender.com"`. Локально (`npx playwright test tests/e2e/link-preview.spec.js`) тест пропущен.

- [ ] **Step 3: Заменить адрес.** `git grep -n "whoami-game.onrender.com"` → в каждом найденном месте `https://whoami-game.onrender.com` → `https://whoami.escapist.club` (страницы, `llms.txt`, `package.json`, README, SECURITY). Документы переписать под Cloudflare, без истории:
  - `CLAUDE.md`: строка Production — `https://whoami.escapist.club/ (Cloudflare Workers, free plan)`; строку `render.yaml` из Architecture убрать; Git Workflow — «Every push to `master` deploys» через Workers Builds (только `master`, сборки других веток выключены); в Commands `npx wrangler deploy` заменить строкой о том, что прод выкатывает Workers Builds из `master`, руками не выкатывать (`wrangler tail` остаётся).
  - `docs/release.md`: прод и что делает push в `master` (Workers Builds: ставит пакеты и выполняет `npx wrangler deploy`); проверка после выкладки — сборка в панели Cloudflare (Worker `whoami-game` → Builds) закончилась успешно, `curl -s https://whoami.escapist.club/api/version`, без абзаца о сне Render; раздел «Выкладка и идущие партии» — по правде Cloudflare: выкладка не рвёт сокеты, спящая комната просыпается на новом коде, неспящая доигрывает на старом (CLAUDE.md, Gotchas «A deploy keeps the sockets open»), поэтому изменение протокола сокета должно работать с комнатой предыдущей версии.
  - `docs/testing.md`: раздел о `test:e2e:prod` — адрес, без сна Render; причину `--workers=2` сформулировать заново (сеть до прода медленнее локальной: чем больше игроков разом, тем вероятнее, что ответ не успеет до таймаута).
  - `docs/publishing.md`: абзац о сне Render (о карточке первой ссылки) убрать; абзац о `sitemap.xml` и Search Console — без `onrender.com` (одна страница в поиске — причина остаётся); абзац «Переход на свой домен» заменить правилом «адрес меняется во всех местах таблицы и в поле Website репозитория на GitHub (`gh repo edit --homepage`)».
  - README: строка Play и «Hosting: Cloudflare Workers + Durable Objects».
  - `render.yaml` удалить (`git rm`).

- [ ] **Step 4: Проверить, что старого адреса и Render не осталось.** `git grep -n -i "onrender\|render\.yaml\|render\.com\|\bRender\b" -- ':!docs/superpowers' ':!public/vendor'` → пусто.

- [ ] **Step 5: `npm test`** → ESLint, Jest и Playwright проходят (новый тест пропущен локально).

- [ ] **Step 6: Коммит.**

```bash
git add -A public package.json CLAUDE.md README.md SECURITY.md docs/release.md docs/testing.md docs/publishing.md tests/e2e/link-preview.spec.js render.yaml
git commit -m "The game's address is whoami.escapist.club everywhere; production on Cloudflare"
```

- [ ] **Step 7: Выкатить на домен вручную** (последняя выкатка руками): `npx wrangler deploy` → без ошибок и предупреждений, `whoami.escapist.club (custom domain)`.

- [ ] **Step 8: Тест Step 1 проходит, весь набор — против домена.** `BASE_URL=https://whoami.escapist.club npx playwright test --workers=2` → все проходят, 27 пропущены. Это и обещанный повторный прогон против домена перед переключением.

---

### Task 2: Render перестаёт забирать `master` (владелец)

**Interfaces:**
- Produces: push в `master` не выкатывается на Render — Задача 3 может пушить.

- [ ] **Step 1 (владелец): Blueprint.** Панель Render → Blueprints: есть ли Blueprint с сервисом `whoami-game`. Есть — открыть его и отключить (Disconnect Blueprint): сервис остаётся и работает дальше.

- [ ] **Step 2 (владелец): автодеплой.** Сервис `whoami-game` → Settings → Auto-Deploy → **Off**, сохранить.

- [ ] **Step 3: Запомнить, что отвечает старый адрес** — для проверки в Задаче 3: `curl -s https://whoami-game.onrender.com/api/version` → `{"version":"1.11.1"}` (первый ответ после сна — до минуты).

---

### Task 3: Выпуск 2.0.0 и Workers Builds

**Interfaces:**
- Consumes: Задача 1 выкачена на домен и зелёная; Задача 2 — автодеплой Render выключен.
- Produces: `master` = 2.0.0 на https://whoami.escapist.club, выкатка — Workers Builds.

- [ ] **Step 1 (владелец): подключить Workers Builds** до push `master`. Cloudflare → Workers & Pages → `whoami-game` → Settings → Builds → Connect → GitHub, репозиторий `mikhail-e/whoami-game`. Build command — пусто, Deploy command — `npx wrangler deploy` (по умолчанию), Root directory — `/`. Branch control: production branch `master`, **Enable Preview Builds — снять**. Подключение само ничего не собирает.

- [ ] **Step 2: Убрать спеку и планы из ветки** (`git rm -r docs/superpowers`), `npm test`, коммит «Docs: the Cloudflare move's spec and plans leave the repository».

- [ ] **Step 3: Влить ветку в `develop`** по `docs/release.md` («Задача»): `git checkout develop && git pull && git merge --no-ff feature/cloudflare`, `npm test`.

- [ ] **Step 4: Ветка выпуска.** `git checkout -b release/2.0.0`, `npm version major --no-git-tag-version` → `2.0.0` в `package.json` и `package-lock.json`; `npm test`; коммит «Release 2.0.0».

- [ ] **Step 5 (владелец): «выкладывай».**

- [ ] **Step 6: Шаги 7–9 выпуска** (`docs/release.md`): слить `release/2.0.0` в `master` с тегом `v2.0.0`, обратно в `develop`, удалить ветку выпуска, `git push origin master develop --tags`.

- [ ] **Step 7: Проверить сборку.** Cloudflare → `whoami-game` → Builds: сборка коммита `master` успешна (владелец смотрит или присылает лог); сборки для `develop` нет. Если упала:
  - «npm ci can only install packages when your package.json and package-lock.json are in sync» — добавить в `package.json` `"packageManager": "npm@<вывод npm -v>"` (срочная правка 2.0.1);
  - ошибка на шаге маршрутов или домена (нет прав) — владелец добавляет токену сборки (Settings → Builds → API token) права Workers Routes на зону `escapist.club` и запускает сборку снова (Retry build).

- [ ] **Step 8: Проверка после выкладки** (`docs/release.md`, уже новый текст): `curl -s https://whoami.escapist.club/api/version` → `{"version":"2.0.0"}`; `npm run test:e2e:prod` → все проходят; внизу страницы — 2.0.0. Старый адрес: `curl -s https://whoami-game.onrender.com/api/version` → по-прежнему `1.11.1`, в Events сервиса Render нет новой выкатки.

- [ ] **Step 9 (владелец):** карточка ссылки в Telegram или WhatsApp и в Facebook Sharing Debugger (`docs/publishing.md`, «Проверка после выкладки») — адрес новый, картинка есть.

- [ ] **Step 10: Поле Website репозитория** — с подтверждения владельца: `gh repo edit --homepage https://whoami.escapist.club/`.

- [ ] **Step 11: Уборка.** `git branch -d feature/cloudflare`; память проекта — этап 2 закончен, Render держит 1.11.1 до удаления.

---

## Вне этого плана

- **Этап 3 (владелец, когда решит):** удалить сервис `whoami-game` в панели Render.
- **escapist-web** ссылается на `whoami-game.onrender.com` (витрина, `site/index.html`, `scripts/capture-plates.mjs`, тесты, README). Без редиректа витрина будет вести на старую версию на Render, а после этапа 3 — в никуда. Заменить ссылки — отдельная задача в том репозитории, по решению владельца; лучше сразу после выпуска 2.0.0.
