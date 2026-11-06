# Выпуск и срочная правка

Игры лежат в одном репозитории, а выкладываются каждая сама по себе: у каждой свой Worker в Cloudflare, свой адрес и свой номер версии.

| Игра | Папка | Worker | Прод |
|---|---|---|---|
| Who am I? | `games/whoami/` | `whoami-game` | https://whoami.escapist.club/ |

**Каждый push в `master` выкладывает те игры, чьи файлы он меняет**: Workers Builds в Cloudflare ставит пакеты и выкладывает игру; другие ветки не собираются, руками прод не выкладывают. Push в `master` — только после подтверждения владельца («выкладывай»).

## Настройки сборки

В панели Cloudflare: Workers & Pages → Worker игры → Settings → Build. У каждой игры одинаковые, кроме папки:

- репозиторий `mikhail-e/parlour-games`;
- ветка прода — `master` (сама Cloudflare предлагает `main`: с ней push в `master` молча ничего не выкладывал бы); Preview Builds выключены;
- Root directory — `/`, корень репозитория. Только там Workers Builds ставит пакеты из корневого `package-lock.json`. С папкой игры в Root directory npm ставит лишь пакеты самой игры, wrangler не находится, и `npx` скачивает его последнюю версию вместо закреплённой: выкладка проходит, но не тем инструментом;
- команда сборки пустая. Если игре понадобится шаг сборки, он пишется сюда: `[build]` из `wrangler.jsonc` Workers Builds не выполняет;
- команда выкладки — `npx wrangler deploy -c games/<игра>/wrangler.jsonc`;
- Build watch paths: include `games/<игра>/*`, `package.json`, `package-lock.json`; exclude пусто. `*` захватывает и вложенные папки. Правка другой игры, `openspec/` или документов в корне игру не собирает; правка корневых `package.json` и `package-lock.json` собирает все игры.

Имя Worker в панели совпадает с `name` в `games/<игра>/wrangler.jsonc`, иначе сборка падает.

## Ветки (git flow)

| Ветка | Создаётся от | Вливается в | Зачем |
|---|---|---|---|
| `master` | — | — | прод всех игр: push выкладывает игры, чьи файлы он меняет |
| `develop` | — | — | готовые задачи ждут выпуска |
| `feature/<имя>` | `develop` | `develop` | одна задача |
| `release/<игра>-x.y.z` | `develop` | `master` (с тегом) и `develop` | выпуск версии игры |
| `hotfix/<игра>-x.y.z` | `master` | `master` (с тегом) и `develop` | срочная правка прода игры |

- В `master` и `develop` напрямую не коммитят: всё идёт через ветки из таблицы.
- Сливают локально, `git merge --no-ff`, без Pull Request. Флаг `--no-ff` оставляет в истории коммит слияния: видно, где ветка началась и закончилась.
- Перед каждым слиянием — `npm test` в корне: проверки всех игр. CI нет: этот прогон — единственная проверка до прода.

## Задача

```bash
git checkout develop && git pull
git checkout -b feature/<имя>
# работа, коммиты, npm test
git checkout develop && git pull
git merge --no-ff feature/<имя>
git branch -d feature/<имя>
git push origin develop
```

## Версия

У каждой игры свой номер по SemVer `x.y.z`:
- `z` (патч) — срочная правка без новых функций;
- `y` (минорная) — выпуск с новыми функциями и исправлениями из `develop`;
- `x` (мажорная) — изменение, после которого прежнее перестаёт работать: открытые комнаты, сохранённое в браузере, установленное приложение.

Номер записан в одном месте — `"version"` в `games/<игра>/package.json`. Сервер игры отдаёт его по адресу `/api/version`, страницы показывают его внизу (у whoami это проверяет `games/whoami/tests/e2e/api.spec.js`). У корневого `package.json` номера нет.

Поднять номер: `npm version minor -w games/<игра> --no-git-tag-version` (или `patch`). Команда меняет `package.json` игры и её запись в корневом `package-lock.json`; коммит и тег делаются отдельно, по шагам ниже.

Теги — `<игра>-vx.y.z`. Теги без имени игры (`v1.x`–`v2.0.0`) — выпуски whoami до монорепо.

У whoami номер версии — не версия кеша иконок: `CACHE_NAME` в `games/whoami/public/sw.js` меняется только вместе с иконками (`games/whoami/CLAUDE.md`, правило 1).

## Выпуск

1. Всё нужное влито в `develop`, `npm test` проходит.
2. `git checkout develop && git pull && git checkout -b release/<игра>-x.y.z`
3. `npm version minor -w games/<игра> --no-git-tag-version`
4. `npm test`
5. Коммит «Release <игра> x.y.z».
6. **Подтверждение владельца** на выкладку.
7. Влить в `master` с тегом:
   ```bash
   git checkout master && git pull
   git merge --no-ff release/<игра>-x.y.z
   git tag -a <игра>-vx.y.z -m "Release <игра> x.y.z"
   ```
8. Влить обратно в `develop` и удалить ветку:
   ```bash
   git checkout develop
   git merge --no-ff release/<игра>-x.y.z
   git branch -d release/<игра>-x.y.z
   ```
9. `git push origin master develop --tags`
10. Проверка после выкладки (ниже).

## Срочная правка

1. `git checkout master && git pull && git checkout -b hotfix/<игра>-x.y.z` (`z` — следующий патч).
2. Тест, который падает на старом коде, затем исправление.
3. `npm version patch -w games/<игра> --no-git-tag-version`, `npm test`, коммит «Release <игра> x.y.z».
4. **Подтверждение владельца**, затем шаги 7–10 выпуска с веткой `hotfix/<игра>-x.y.z`.

## Проверка после выкладки

1. Дождаться в панели Cloudflare, что сборка закончилась: Workers & Pages → Worker игры → Deployments, у коммита из `master` — успех. Упала — её журнал там же («Build» в строке сборки). Строки с коммитом нет — сборка пропущена: проверить build watch paths.
2. Новая версия на проде (адрес игры — в таблице вверху):
   ```bash
   curl -s https://whoami.escapist.club/api/version
   ```
3. `npm run test:e2e:prod -w games/<игра>` — все браузерные тесты игры против прода (у whoami: партии нескольких игроков на телефоне и компьютере, языки, доступность — `games/whoami/docs/testing.md`).
4. Открыть сайт: внизу страницы — новая версия.
5. В выпуске поменялись превью ссылки или его картинка — проверить карточку в мессенджере (у whoami — `games/whoami/docs/publishing.md`).

## Выкладка и идущие партии

Выкладка не рвёт сокеты. Спящая комната просыпается уже на новом коде, а комната, которая не спит, работает на прежнем, пока не уснёт, — даже с новыми страницами (`games/whoami/CLAUDE.md`, Gotchas). Поэтому изменение протокола сокета должно работать и с комнатой прежней версии. Если Cloudflare всё же перезапускает комнату, её сокеты рвутся, страницы подключаются заново, а игра остаётся в хранилище комнаты.
