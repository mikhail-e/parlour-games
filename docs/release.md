# Выпуск и срочная правка

Прод — https://whoami.escapist.club/. **Каждый push в `master` выкладывает прод**: Workers Builds в Cloudflare ставит пакеты и выполняет `npx wrangler deploy`; другие ветки не собираются, руками прод не выкладывают. Push в `master` — только после подтверждения владельца («выкладывай»).

Настройки сборки — в панели Cloudflare: Worker `whoami-game` → Settings → Build. Репозиторий `mikhail-e/whoami-game`; ветка прода — `master` (сама Cloudflare предлагает `main`: с ней push в `master` молча ничего не выкладывал бы); Preview Builds выключены; команда сборки пустая, команда выкладки `npx wrangler deploy`, корень `/`. Имя Worker в панели совпадает с `name` в `wrangler.jsonc`, иначе сборка падает.

## Ветки (git flow)

| Ветка | Создаётся от | Вливается в | Зачем |
|---|---|---|---|
| `master` | — | — | прод: каждый push выкладывается |
| `develop` | — | — | готовые задачи ждут выпуска |
| `feature/<имя>` | `develop` | `develop` | одна задача |
| `release/x.y.z` | `develop` | `master` (с тегом) и `develop` | выпуск версии |
| `hotfix/x.y.z` | `master` | `master` (с тегом) и `develop` | срочная правка прода |

- В `master` и `develop` напрямую не коммитят: всё идёт через ветки из таблицы.
- Сливают локально, `git merge --no-ff`, без Pull Request. Флаг `--no-ff` оставляет в истории коммит слияния: видно, где ветка началась и закончилась.
- Перед каждым слиянием — `npm test`. CI нет: этот прогон — единственная проверка до прода.

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

Номер по SemVer `x.y.z`:
- `z` (патч) — срочная правка без новых функций;
- `y` (минорная) — выпуск с новыми функциями и исправлениями из `develop`;
- `x` (мажорная) — изменение, после которого прежнее перестаёт работать: открытые комнаты, сохранённое в браузере, установленное приложение.

Номер записан в одном месте — `"version"` в `package.json`. Сервер отдаёт его по адресу `/api/version`, обе страницы показывают его внизу (`tests/e2e/api.spec.js`).

Поднять номер: `npm version minor --no-git-tag-version` (или `patch`). Команда меняет `package.json` и `package-lock.json` вместе; коммит и тег делаются отдельно, по шагам ниже.

Это не версия кеша иконок: `CACHE_NAME` в `public/sw.js` меняется только вместе с иконками (CLAUDE.md, правило 1).

## Выпуск

1. Всё нужное влито в `develop`, `npm test` проходит.
2. `git checkout develop && git pull && git checkout -b release/x.y.z`
3. `npm version minor --no-git-tag-version`
4. `npm test`
5. Коммит «Release x.y.z».
6. **Подтверждение владельца** на выкладку.
7. Влить в `master` с тегом:
   ```bash
   git checkout master && git pull
   git merge --no-ff release/x.y.z
   git tag -a vx.y.z -m "Release x.y.z"
   ```
8. Влить обратно в `develop` и удалить ветку:
   ```bash
   git checkout develop
   git merge --no-ff release/x.y.z
   git branch -d release/x.y.z
   ```
9. `git push origin master develop --tags`
10. Проверка после выкладки (ниже).

## Срочная правка

1. `git checkout master && git pull && git checkout -b hotfix/x.y.z` (`z` — следующий патч).
2. Тест, который падает на старом коде, затем исправление.
3. `npm version patch --no-git-tag-version`, `npm test`, коммит «Release x.y.z».
4. **Подтверждение владельца**, затем шаги 7–10 выпуска с веткой `hotfix/x.y.z`.

## Проверка после выкладки

1. Дождаться в панели Cloudflare, что сборка закончилась: Workers & Pages → `whoami-game` → Deployments, у коммита из `master` — успех. Упала — её журнал там же.
2. Новая версия на проде:
   ```bash
   curl -s https://whoami.escapist.club/api/version
   ```
3. `npm run test:e2e:prod` — все браузерные тесты против прода: партии нескольких игроков на телефоне и компьютере, языки, доступность (`docs/testing.md`).
4. Открыть сайт: внизу страницы — новая версия.
5. В выпуске поменялись превью ссылки или его картинка — проверить карточку в мессенджере (`docs/publishing.md`).

## Выкладка и идущие партии

Выкладка не рвёт сокеты. Спящая комната просыпается уже на новом коде, а комната, которая не спит, работает на прежнем, пока не уснёт, — даже с новыми страницами (CLAUDE.md, Gotchas). Поэтому изменение протокола сокета должно работать и с комнатой прежней версии. Если Cloudflare всё же перезапускает комнату, её сокеты рвутся, страницы подключаются заново, а игра остаётся в хранилище комнаты.
