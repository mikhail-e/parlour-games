# Tasks

## 1. Подготовка

- [x] 1.1 Разобраться с незакоммиченной правкой `.claude/settings.json` (владелец коммитит её в отдельной ветке или откладывает в stash) и проверить, что `git status` показывает только неотслеживаемые `openspec/`, `.claude/commands/`, `.claude/skills/openspec-*`
- [x] 1.2 Создать ветку `feature/monorepo` от свежего `develop` и закоммитить настройку OpenSpec (`openspec/` с этим change, `.claude/commands/opsx/`, `.claude/skills/openspec-*`); проверка — `openspec status --change move-to-monorepo` из корня репозитория видит change

## 2. Переименование репозитория

- [x] 2.1 Переименовать репозиторий на GitHub (`gh repo rename parlour-games`, с подтверждения владельца) и проверить, что `gh repo view mikhail-e/whoami-game` открывает `mikhail-e/parlour-games`
- [x] 2.2 Обновить `origin` (`git remote set-url origin git@github.com:mikhail-e/parlour-games.git`) и проверить командой `git fetch origin`
- [ ] 2.3 Владелец проверяет в панели Cloudflare (Workers & Pages → `whoami-game` → Settings → Build), что Worker подключён к `mikhail-e/parlour-games`; если связь потеряна — подключить заново, не меняя остальных настроек

## 3. Спайк Workers Builds

- [x] 3.1 Подготовить ветку `spike/monorepo` от `feature/monorepo`: раскладка из группы 4 в черновом виде (`git mv` в `games/whoami/`, корневой `package.json` с workspaces и devDependencies, `npm install` в корне), а в `games/whoami/wrangler.jsonc` — имя `parlour-spike`, без `routes`, `workers_dev: true`; проверка — `npm test -w games/whoami` локально зелёный, а скан всего, что уйдёт в push (каждый новый blob, имена файлов, сообщения коммитов), не находит ни рабочих, ни личных данных: ветка публичная
- [ ] 3.2 Владелец создаёт в Cloudflare временный Worker `parlour-spike`, подключённый к `parlour-games` с веткой `spike/monorepo` по варианту A (root directory `games/whoami`, выкладка `npx wrangler deploy`); push ветки; проверка — журнал сборки показывает установку из корневого `package-lock.json` и версию wrangler из него, выкладка успешна
- [ ] 3.3 Проверить выложенный спайк на адресе workers.dev: `curl …/api/version` отвечает версией из `games/whoami/package.json`, `curl -X POST …/api/create-game` создаёт комнату
- [ ] 3.4 Если 3.2 или 3.3 не прошли — повторить с вариантом B (root directory `/`, выкладка `npx wrangler deploy -c games/whoami/wrangler.jsonc`) и проверить так же
- [ ] 3.5 Задать watch paths (`games/whoami/*`, `package.json`, `package-lock.json`), сделать push, меняющий только корневой документ, и проверить, что сборка пропущена
- [ ] 3.6 Записать выбранный вариант и настройки в design.md (решение 5) — без поддомена workers.dev, ID аккаунта и фрагментов журнала, удалить Worker `parlour-spike` и ветку `spike/monorepo` (локально и на GitHub); проверка — Worker нет в панели, `git ls-remote origin spike/monorepo` пусто

## 4. Перенос whoami в `games/whoami/`

- [x] 4.1 Перенести `git mv` в `games/whoami/`: `worker/`, `game-logic.js`, `public/`, `tests/`, `scripts/`, `wrangler.jsonc`, `playwright.config.js`, `eslint.config.mjs`, `package.json`; проверка — `git diff --cached -M --stat develop` показывает переименования без изменений строк для всего, кроме `package.json`
- [x] 4.2 Корневой `package.json` (`parlour-games`, private, `workspaces: ["games/*"]`, engines, все devDependencies, скрипты `test`, `lint`, `test:e2e` по workspaces), из `games/whoami/package.json` убрать devDependencies, оставить имя `whoami-game`, версию, скрипты и настройки Jest, `repository` указать на `parlour-games` с `directory: games/whoami`; удалить старый lockfile, `npm install` в корне; проверка — один `package-lock.json` в корне, `node_modules` только в корне
- [x] 4.3 Поправить `.gitignore` (шаблоны с косой чертой в середине — на `**/…`, например `**/.claude/settings.local.json`) и `.vscode/settings.json` (`"eslint.workingDirectories": [{ "mode": "auto" }]`); проверка — `git status` после `npm test` и `npm start -w games/whoami` не показывает `.wrangler/`, `test-results/`, `playwright-report/`, а ESLint в VS Code подсвечивает ошибку в `games/whoami/public/js/utils.js`
- [x] 4.4 Проверить, что whoami работает из новой раскладки: `npm test` из корня и `npm test` из `games/whoami/` зелёные (ESLint, Jest, Playwright), `npm start -w games/whoami` открывает игру на `http://localhost:8787`, `/api/version` показывает версию игры
- [x] 4.5 Обновить игровые документы под новые пути и команды: `games/whoami/CLAUDE.md` (Commands, Architecture — пути от папки игры, ссылки на корневые документы), `docs/testing.md` и `docs/publishing.md` переехать в `games/whoami/docs/` (команды с `-w games/whoami` или из папки игры, таблица «Где записан адрес сайта» с новыми путями), скил `verify` — в `games/whoami/.claude/skills/verify/` с командами из новой раскладки; проверка — каждая команда из этих документов выполняется как написана, а скил виден в Claude Code (иначе — перенести в корень как `verify-whoami`, решение 7)

## 5. Документы уровня репозитория

- [ ] 5.1 Корневой `README.md` — коллекция: что это, список игр (whoami со ссылкой на прод и картинкой из `games/whoami/public/img/`), участие, безопасность, лицензия и исключения брендов с путями `games/whoami/…`; README whoami — в `games/whoami/README.md` с поправленными путями и командами; проверка — все относительные ссылки и картинки открываются на GitHub в ветке
- [x] 5.2 Корневой `CLAUDE.md`: раскладка монорепо, команды (корень и `-w`), git flow со ссылкой на `docs/release.md`, решения уровня репозитория (публичная витрина, CI нет, свой Worker и домен у каждой игры, общие лимиты Cloudflare, OpenSpec с архивом в репозитории вместо «план уходит после слияния»); из `games/whoami/CLAUDE.md` эти части убрать, ссылаясь на корень; проверка — ни одно правило не потеряно и не записано дважды (сверка старого и двух новых файлов по разделам)
- [ ] 5.3 `docs/release.md` в корне: настройки Workers Builds из спайка, ветки `release/<игра>-x.y.z` и `hotfix/<игра>-x.y.z`, теги `<игра>-vx.y.z`, `npm version … -w games/<игра>`, проверка после выкладки с `-w games/<игра>`; проверка — шаги выпуска проходят «всухую» до слияния в `master`
- [ ] 5.4 Ссылки на репозиторий: `SECURITY.md`, `README.md`, `package.json`, `CLAUDE.md`, `docs/release.md`; проверка — `git grep -n whoami-game` находит только имя Worker и пакета (`wrangler.jsonc`, `games/whoami/package.json`, `CACHE_NAME`, команды `wrangler tail whoami-game` и панель Cloudflare), но не адрес репозитория
- [ ] 5.5 Описание репозитория на GitHub (`gh repo edit --description …`, с подтверждения владельца); проверка — `gh repo view` показывает новое описание
- [ ] 5.6 Слить `feature/monorepo` в `develop` (`git merge --no-ff`) после зелёного `npm test` из корня; перед push просканировать всю непушенную историю (`origin/develop..develop`: каждый blob, включая `openspec/`, имена файлов, сообщения коммитов) на рабочие и личные данные — ноль находок; push `develop`; проверка — сборка в Cloudflare не запускалась (собирается только `master`)

## 6. Выпуск `whoami-v2.1.0`

- [ ] 6.1 Ветка `release/whoami-2.1.0` от `develop`, `npm version minor -w games/whoami --no-git-tag-version`, `npm test` из корня, коммит «Release whoami 2.1.0»; проверка — `games/whoami/package.json` и корневой lockfile показывают `2.1.0`
- [ ] 6.2 Владелец меняет настройки сборки `whoami-game` по выбранному в спайке варианту (root directory, команда выкладки, watch paths); проверка — настройки в панели совпадают с `docs/release.md`
- [ ] 6.3 Подтверждение владельца на выкладку; слить в `master` с тегом `whoami-v2.1.0`, обратно в `develop`, удалить ветку, `git push origin master develop --tags`; проверка — в Cloudflare Deployments у `whoami-game` успешная сборка этого коммита
- [ ] 6.4 Проверка прода: `curl -s https://whoami.escapist.club/api/version` отвечает `2.1.0`, `npm run test:e2e:prod -w games/whoami` зелёный, сайт открывается и показывает `v2.1.0` внизу, комната, открытая до выкладки, продолжает работать

## Workflow follow-up

- Архивировать change (`/opsx:archive`) после выпуска; архив остаётся в `openspec/changes/archive/`.
- Следующий change — выделение общего ядра в `packages/` и перевод whoami на него; затем — игра Consequences.
