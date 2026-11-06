# Proposal

## Why

Владелец делает вторую игру с комнатами — Consequences — и планирует ещё. Переиспользовать код whoami копированием не хотим: решено держать все игры и общее ядро в одном публичном репозитории (монорепо), чтобы правка общего кода сразу проверялась тестами всех игр. Этот change — первый шаг: перенести whoami в раскладку монорепо, ничего не меняя в поведении игры, и до выделения ядра (следующий change) убедиться, что сборка и выкладка в Cloudflare работают в новой раскладке.

## What Changes

- Репозиторий `mikhail-e/whoami-game` переименовывается на GitHub в `mikhail-e/parlour-games` (на месте: история, теги, issues, звёзды и настройки сохраняются, со старого адреса — редирект).
- Весь код whoami переезжает в `games/whoami/` без изменений содержимого: `worker/`, `game-logic.js`, `public/`, `tests/`, `scripts/`, `wrangler.jsonc`, `playwright.config.js`, `eslint.config.mjs`, свой `package.json` (имя `whoami-game`, его версия — та, что показывает `/api/version`).
- Корень становится корнем npm workspaces: общий `package.json` (`parlour-games`, private) с общими devDependencies и единым `package-lock.json`; `npm test` в корне запускает проверки каждой игры.
- Workers Builds для Worker `whoami-game` перенастраивается на новую раскладку: путь к игре, build watch paths (собирается только при изменении файлов whoami или общих файлов). Перед переносом — спайк на временном Worker, потому что поведение Workers Builds с npm workspaces не описано в документации.
- Документация делится на уровень репозитория и уровень игры: корневые `README.md` (коллекция игр), `CLAUDE.md` (раскладка, команды, git flow, решения уровня репозитория), `docs/release.md` (выпуск игры из монорепо); в `games/whoami/` — README, CLAUDE.md и docs игры.
- Теги выпусков получают префикс игры: следующий выпуск — `whoami-v2.1.0` (старые `v1.x`–`v2.0.0` остаются как есть); ветки — `release/whoami-x.y.z`, `hotfix/whoami-x.y.z`.
- OpenSpec живёт в корне монорепо (`openspec/`, команды и скилы в `.claude/`). Решение «план фичи уходит из репозитория после слияния» заменяется: завершённые change остаются в `openspec/changes/archive/`.
- Ссылки на репозиторий (`README.md`, `SECURITY.md`, `package.json`, `CLAUDE.md`, `docs/release.md`) указывают на `parlour-games`.

Для игроков не меняется ничего: тот же адрес `whoami.escapist.club`, тот же Worker и класс комнат (`Room`), те же комнаты в хранилище, те же данные в браузере.

## Capabilities

### New Capabilities

Нет. Change не меняет поведение системы — это перенос кода, инструменты и документация, поэтому спеки не пишутся (`skip_specs: true`). Требования «поведение whoami не изменилось» проверяются существующими тестами whoami и проверкой прода (см. design.md и tasks.md).

### Modified Capabilities

Нет.

## Impact

- **Репозиторий и git**: переименование на GitHub, новый адрес `origin`, все файлы whoami — переименования в `games/whoami/` (без правок содержимого, кроме документов и `package.json`).
- **Cloudflare**: настройки сборки Worker `whoami-game` (Settings → Build); временный Worker для спайка создаётся и удаляется. Сам Worker, его домен, Durable Objects и их миграции не меняются.
- **Инструменты разработки**: команды запускаются из корня с `-w games/whoami` или из папки игры; VS Code ESLint должен находить конфиг игры в подпапке.
- **Документация**: `README.md`, `CLAUDE.md`, `docs/*` делятся на корневые и игровые; скил `verify` переезжает к игре.
- **Выпуск**: следующий выпуск whoami — `2.1.0` по обновлённому `docs/release.md`, с проверкой прода после выкладки.
- **Не входит**: выделение общего ядра (`packages/`) и перевод whoami на него — следующий change; игра Consequences — третий change.
