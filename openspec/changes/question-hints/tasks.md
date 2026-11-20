# Tasks

## 1. Начало

- [x] 1.1 Вид, текст и место подсказки выбраны владельцем на временной странице вариантов вне репозитория (виды A–C, тексты 1–3, место 1–2 на снимках настоящего раунда, телефон и компьютер): B, 1, 1; русские тексты владелец поправил в `games/consequences/question-hints.md` (2026-11-20). Проверка: выбор записан в proposal.md и design.md, тексты в дельте спека
- [x] 1.2 Ветка `feature/question-hints` от `develop`, первый коммит: этот change (`openspec/changes/question-hints/`). Рабочий файл владельца в коммит не входит. Проверка: `openspec validate question-hints --strict` проходит, в `git status` только `question-hints.md` владельца

## 2. Тексты подсказок

- [x] 2.1 `translations.js` (design, решение 1): ключи `<set>Hint1`–`8` каждого из семи наборов сразу после его вопросов, на двух языках, тексты из дельты спека (требования «Подсказки набора …»), с заглавной буквы. Проверка: скрипт сверяет русские подсказки словаря с файлом владельца (с заглавной буквой и «ё»: единственное отличие) и английские со спеком
- [x] 2.2 `tests/translations.test.js`: подсказки входят в тексты набора (`keysOfSet`). Проверка: `npx jest tests/translations.test.js` зелёный; временно убранная подсказка одного набора на одном языке роняет его
- [x] 2.3 Документы игры: CLAUDE.md (How it works, набор раунда: тексты набора с `<set>Hint1`–`8`), `docs/testing.md` (полноту текстов набора, подсказки тоже, держит `translations.test.js`). Без длинного тире в новых строках. Проверка: сверка с кодом
- [x] 2.4 Рабочий файл `games/consequences/question-hints.md` удалить (design, решение 4), после сверки 2.1. Проверка: файла нет, `git status` его не показывает

## 3. Строка под вопросом

- [x] 3.1 `game.html` и `game-room.js` (design, решение 2): `<p class="sheet__question-hint" id="questionHint">` после `h2#questionText` в `#answerForm`; `renderWriting` пишет в неё подсказку вопроса шага через `sayOfSet` рядом с вопросом. Проверка: `npm run lint` в папке игры зелёный; `npx jest tests/code-structure.test.js tests/shared-names.test.js` зелёные
- [x] 3.2 `style.css` (design, решение 3): вид `.sheet__question-hint` (как вид B страницы вариантов) и ряды сетки `#answerForm` на телефоне: подсказка 3, поле и кнопка 4, строка под полем 5. Проверка: снимки по навыку `verify` на телефоне и компьютере совпадают с видом B страницы вариантов
- [x] 3.3 Браузерные тесты по требованию «Подсказка к вопросу» (помощник `hintOf(page, n, lang)` рядом с `questionOf` в `tests/e2e/helpers.js`): в `writing.spec.js` подсказка под первым вопросом у каждого и под вторым на языке страницы каждого (тесты «Start gives every player…» и «each player sees the round in their page's language…»), на листе отсутствующего («Katya answers for Petya…»), на телефоне строка между вопросом и полем, а кнопка у нижнего края поля («on a phone Enter breaks a line…»); в `language.spec.js` подсказка меняется с языком. Требование «Подсказка только у вопроса шага» уже держат точные проверки складок (`writing.spec.js`), вопросов историй и текста для друзей (`reading.spec.js`): новой проверки не нужно, тесты должны остаться зелёными. Проверка: `writing.spec.js`, `language.spec.js`, `reading.spec.js` зелёные на телефоне и компьютере; временно убранная запись подсказки в `renderWriting` роняет новые проверки
- [x] 3.4 Документы игры: CLAUDE.md (How it works, страница комнаты: строка подсказки под вопросом, выбор владельца B, 1, 1; Gotchas, телефон: ряды сетки формы), `docs/testing.md` (помощник `hintOf`). Без длинного тире. Проверка: сверка с кодом

## 4. Проверка целиком

- [x] 4.1 `npm test` в корне зелёный
- [ ] 4.2 После выкладки: `/api/version` Consequences новый; `npm run test:e2e:prod -w games/consequences` зелёный

## Workflow follow-up

- Слияние `feature/question-hints` в `develop` (`--no-ff`) после зелёного `npm test`, ветка удаляется.
- Выпуск Consequences 1.8.0 (минорная; кит и whoami не меняются) по `docs/release.md`; отправка в `master` только после подтверждения владельца, затем проверка прода и 4.2.
- Остановить временный сервер страницы вариантов.
- `/opsx:archive` этого change.
