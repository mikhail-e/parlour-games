# Design

## Context

Мотивация — в proposal.md (Why). Что важно для подхода:

- whoami в проде: `whoami.escapist.club`, Worker `whoami-game`, комнаты — Durable Objects класса `Room` (миграция `v1`). Хранилище комнаты привязано к имени Worker и классу: пока они не меняются, перенос файлов комнаты не трогает.
- Выкладка: Workers Builds собирает каждый push в `master` (ветка прода — `master`, Preview Builds выключены, команда сборки пустая, выкладка `npx wrangler deploy`, корень `/`). Упавшая сборка не выкладывает ничего: прод остаётся на прежней версии.
- CI нет: единственная проверка — `npm test` на машине владельца (ESLint, 24 файла Jest, 19 файлов Playwright на телефоне и компьютере) и `npm run test:e2e:prod` после выкладки.
- Код whoami не ссылается на корень репозитория: `wrangler.jsonc`, `playwright.config.js`, тесты и скрипты используют пути относительно своих файлов. Перенос папкой целиком их не ломает.
- Из документации Cloudflare (проверено): к одному репозиторию можно подключить несколько Worker, у каждого свои root directory, команда выкладки, ветка и build watch paths; Workers Builds **не выполняет** `[build]` из конфигурации wrangler. Как Workers Builds ставит пакеты, когда `package-lock.json` лежит в корне репозитория, а root directory Worker — подпапка, в документации не описано.
- В рабочей копии есть незакоммиченная правка владельца `.claude/settings.json` и уже перенесённые, но не закоммиченные `openspec/`, `.claude/commands/opsx/`, `.claude/skills/openspec-*`.

## Goals / Non-Goals

**Goals:**
- whoami работает из `games/whoami/` и выкладывается оттуда в тот же Worker, без единого изменения для игроков.
- Корень готов принять общее ядро (`packages/`) и вторую игру (`games/consequences/`) без новой перестройки.
- Всё, что касается репозитория в целом (git flow, выпуск, решения, OpenSpec), описано один раз в корне.

**Non-Goals:**
- Выделение общего кода и общих конфигов ESLint/Playwright/Jest — следующий change (`packages/`), там же переезжают общие технические правила из CLAUDE.md whoami.
- Правила выпуска нескольких игр одним поездом (общий `develop`, сборка нескольких Worker одним push) — в change, который добавит вторую игру.
- Переименование локальной папки репозитория, страница-витрина коллекции на сайте.
- Любые изменения кода, вида или поведения whoami.

## Decisions

### 1. Переименовать `whoami-game` на месте, а не заводить новый репозиторий

Переезд в `games/whoami/` — обычный коммит с `git mv`: хэши коммитов и теги `v1.x`–`v2.0.0` остаются верными, `git log --follow` и blame работают, issues, звёзды, Sponsor и private vulnerability reporting остаются у репозитория, GitHub ставит редирект со старого адреса.
Альтернатива — новый репозиторий и импорт истории через `git filter-repo --to-subdirectory-filter`: переписывает все хэши и теги, issues и звёзды остаются в старом. Отклонена владельцем.

### 2. Раскладка: в корне — только уровень репозитория, игра — целиком в своей папке

```
parlour-games/
├── package.json          # private, workspaces: ["games/*"], общие devDependencies, скрипты по всем играм
├── package-lock.json     # один на всё
├── README.md             # коллекция: игры, участие, безопасность, лицензия и исключения брендов
├── CLAUDE.md             # раскладка, команды, git flow, решения уровня репозитория
├── docs/release.md       # выпуск игры из монорепо
├── LICENSE, SECURITY.md, .github/, .gitignore, .vscode/
├── openspec/             # спеки и change, архив остаётся в репозитории
├── .claude/              # settings.json, команды и скилы OpenSpec
└── games/whoami/
    ├── package.json      # name "whoami-game", version (её отдаёт /api/version), scripts, настройки Jest
    ├── wrangler.jsonc, worker/, game-logic.js, public/, tests/, scripts/
    ├── playwright.config.js, eslint.config.mjs
    ├── README.md, CLAUDE.md, docs/testing.md, docs/publishing.md
    └── .claude/skills/verify/
```

Содержимое файлов игры не меняется: в коммите переноса они — переименования на 100 %. Правятся только `package.json` (devDependencies уходят в корень, ссылки на репозиторий) и документы. `wrangler.jsonc` не меняется вовсе: имя Worker, домен, класс комнат и миграции те же.

### 3. npm workspaces, devDependencies в корне

Одна версия wrangler, Jest, Playwright, ESLint и axe на все игры: обновляются один раз, и Workers Builds берёт версию wrangler из одного `package.json`. `package.json` игры хранит имя, версию, скрипты и настройки Jest; npm при запуске скрипта игры находит бинарники в `node_modules/.bin` корня.
Альтернатива — devDependencies в каждой игре: npm всё равно поднимет их в корень, а версии начнут расходиться. В `workspaces` пока только `games/*`; `packages/*` добавит следующий change.

### 4. Инструменты игры остаются в её папке, корень только делегирует

`eslint.config.mjs`, `playwright.config.js` и настройки Jest остаются в `games/whoami/` и работают как раньше, если запускать их из папки игры. Корневые скрипты вызывают скрипты игр: `npm test` → `npm test --workspaces --if-present`, `npm run lint` — так же; игра запускается `npm start -w games/whoami`. Порты whoami (8787 для `npm start`, 3100 и 3101 в тестах) не меняются.
VS Code: ESLint-расширению указывается `"eslint.workingDirectories": [{ "mode": "auto" }]`, чтобы при правке файла игры оно брало конфиг из её папки.
Альтернатива — общие конфиги в корне сразу: сейчас делить нечего, это работа следующего change.

### 5. Workers Builds: два варианта, выбирает спайк

| | Вариант A | Вариант B |
|---|---|---|
| Root directory | `games/whoami` | `/` |
| Команда выкладки | `npx wrangler deploy` | `npx wrangler deploy -c games/whoami/wrangler.jsonc` |
| Где ставятся пакеты | в подпапке, без lockfile рядом — не описано | в корне, рядом с `package-lock.json` |

Предпочтителен A: он ближе к тому, как Cloudflare описывает монорепо, и сверка имени Worker с `wrangler.jsonc` работает как раньше. Если в A пакеты ставятся неверно (нет lockfile, не тот wrangler), берём B. В обоих вариантах:
- ветка прода — `master`, Preview Builds выключены, команда сборки пустая (шага копирования пока нет; когда он появится, его придётся прописать в Build command: `[build]` из wrangler.jsonc Workers Builds не выполняет);
- build watch paths: include `games/whoami/*`, `package.json`, `package-lock.json`. Изменения только в `openspec/`, корневых документах или другой игре whoami не собирают.

**Итог спайка: вариант B.**
- Вариант A отклонён. С root directory `games/whoami` Workers Builds запускает `npm clean-install` в папке игры, и npm ставит только пакеты этого workspace (у игры своих нет), а devDependencies корня — нет. wrangler не находится, и `npx wrangler deploy` скачивает его последнюю версию вместо закреплённой в lockfile. Выкладка при этом проходит, поэтому ошибка была бы незаметной: версия инструмента выкладки менялась бы сама.
- Вариант B проверен: `npm clean-install` в корне ставит все пакеты из корневого `package-lock.json`, `npx wrangler deploy -c games/whoami/wrangler.jsonc` берёт wrangler той версии, что в lockfile, файлы игры — из `games/whoami/public`; сверка имени Worker проходит по конфигу из `-c`. Выложенная версия отвечает `/api/version` версией из `games/whoami/package.json` и создаёт комнаты.
- Настройки Worker игры: root directory `/`, build command пустая, deploy command `npx wrangler deploy -c games/<игра>/wrangler.jsonc`, ветка прода `master`, Preview Builds выключены, build watch paths — include `games/<игра>/*`, `package.json`, `package-lock.json`, exclude пусто.
- Watch paths проверены в обе стороны: push, меняющий только корневой README, сборку не запускает; push с правкой в `games/whoami/tests/e2e/` запускает — `*` захватывает вложенные папки.

### 6. Спайк — на временном Worker, не на проде

Временный Worker `parlour-spike` подключается к репозиторию с веткой прода `spike/monorepo`. В этой ветке — новая раскладка, а в `games/whoami/wrangler.jsonc` имя `parlour-spike`, без `routes` и с `workers_dev: true`, чтобы спайк не мог задеть домен whoami. Проверяется по порядку: журнал сборки (где и чем ставятся пакеты, какая версия wrangler), успешная выкладка, ответ `/api/version` и создание комнаты (`POST /api/create-game`) на адресе workers.dev, пропуск сборки при push, меняющем только корневой документ. Сначала вариант A, при неудаче — B. После этого Worker и ветка удаляются. В репозиторий (в том числе в этот design.md и в архив OpenSpec) из спайка записываются только выбранные настройки: ни поддомена аккаунта на workers.dev, ни ID аккаунта и зоны, ни фрагментов журнала сборки с ними — репозиторий публичный.
Альтернатива — включить сборки не-продовых веток у `whoami-game` (`wrangler versions upload`): проверяет установку и сборку, но не выкладку и трогает настройки прода. Отклонена.

### 7. Документы: уровень репозитория — в корень сейчас, общие технические правила — со следующим change

В корневой `CLAUDE.md` переходят: раскладка и команды монорепо, git flow, решения уровня репозитория (публичная витрина, CI нет, у каждой игры свой Worker и домен, лимиты бесплатного плана Cloudflare общие на аккаунт, OpenSpec и его архив). Решение «Docs hold principles, not history» переформулируется: CLAUDE.md и `docs/` по-прежнему держат принципы, а планы и их история живут в OpenSpec — `openspec/specs/` описывает текущее поведение, `openspec/changes/archive/` хранит завершённые change.
Технические правила (CSP, i18n, `debugLog`, service worker, Bootstrap, шрифты, комнаты и сокеты) пока остаются в `games/whoami/CLAUDE.md`: они описывают код, который переедет в ядро только в следующем change. Перенести их сейчас — значит описывать в корне код, который лежит в игре.
`docs/release.md` переходит в корень; `docs/testing.md` и `docs/publishing.md` — к игре. Claude Code читает вложенные `CLAUDE.md` и находит скилы в `games/whoami/.claude/skills/` по папке; если скил `verify` по папке не находится, он переносится в корень под именем `verify-whoami`.

### 8. Версии и теги — свои у каждой игры

Версия игры — `version` в её `package.json`, как и раньше: `/api/version` читает её через `import pkg from '../package.json'` из `games/whoami/worker/index.js`. Корневой `package.json` версией не пользуется. Теги — `<игра>-v<x.y.z>`, ветки — `release/<игра>-<x.y.z>` и `hotfix/<игра>-<x.y.z>`; поднять версию — `npm version minor -w games/whoami --no-git-tag-version` (меняет `package.json` игры и корневой lockfile). Старые теги без префикса не переписываются. Этот перенос выходит как `whoami-v2.1.0` по обычному процессу выпуска: новая версия на `/api/version` подтверждает, что выкладка из новой раскладки прошла.

## Risks / Trade-offs

- [Workers Builds неверно ставит пакеты в workspaces] → спайк до переноса (решение 6), запасной вариант B.
- [После переименования репозитория Workers Builds теряет связь с ним] → сразу после переименования проверить в Settings → Build у `whoami-game`, при необходимости подключить `parlour-games` заново. Пока в `master` нет push, сборок нет, и прод не затронут.
- [Push в `master` при старых настройках сборки] → сборка упадёт (в корне нет `wrangler.jsonc`), прод останется на 2.0.0. Порядок в плане ниже: сначала настройки, потом push; упавшую сборку повторить после исправления.
- [Выложено, но сломано] → откат в панели Cloudflare (Deployments → предыдущая версия) или `npx wrangler rollback`. Имя Worker, класс комнат и формат хранилища не меняются, поэтому откат безопасен для открытых комнат.
- [Watch paths настроены неверно, и whoami молча не выкладывается] → шаг проверки прода: `/api/version` должен показать `2.1.0`.
- [Поднятие пакетов в корневой `node_modules` меняет, какую копию пакета видит инструмент] → полный `npm test` из корня и из папки игры, `npm start -w games/whoami` вручную.
- [Шаблоны `.gitignore` с косой чертой в середине (`.claude/settings.local.json`) привязаны к корню] → такие шаблоны переписываются на `**/…`, остальные (`node_modules/`, `.wrangler/`, `test-results/`…) уже действуют на любой глубине.
- [Связанные релизы, длиннее `npm test`, сложнее инструменты] — известная цена монорепо, принята владельцем; правила поезда выпусков — в change второй игры.

## Migration Plan

1. Чистая рабочая копия: правка владельца в `.claude/settings.json` закоммичена или отложена; ветка `feature/monorepo` от `develop`; первый коммит — настройка OpenSpec (`openspec/`, `.claude/commands/opsx/`, `.claude/skills/openspec-*`) вместе с этим change.
2. Переименование на GitHub (`gh repo rename parlour-games`), `git remote set-url origin git@github.com:mikhail-e/parlour-games.git`, проверка связи Workers Builds с репозиторием.
3. Спайк (решение 6) → выбран вариант A или B.
4. Перенос в ветке: `git mv` в `games/whoami/`, корневой `package.json` и lockfile, документы; `npm test` из корня зелёный; слияние в `develop`, push `develop` (не собирается).
5. Выпуск `release/whoami-2.1.0` по новому `docs/release.md`; до слияния в `master` — настройки сборки `whoami-game` по выбранному варианту; подтверждение владельца; push `master` и тега `whoami-v2.1.0`.
6. Проверка прода: сборка успешна, `/api/version` = `2.1.0`, `npm run test:e2e:prod -w games/whoami`, сайт открывается, открытые до выкладки комнаты живы.

Откат: сборка упала — прод не тронут, исправить настройки и повторить сборку; выложено с ошибкой — откат версии Worker в панели, затем исправление в `hotfix/whoami-2.1.1`. Переименование репозитория откатывается обратным `gh repo rename`, но не требуется для отката прода.

## Open Questions

- Переименовывать ли локальную папку репозитория по новому имени: на работу не влияет, но настройки и память Claude Code привязаны к пути папки.
- Описание и поле Website репозитория на GitHub (`gh repo edit`): пока второй игры нет, Website может оставаться `whoami.escapist.club`.
