# Tasks

## 1. Начало

- [ ] 1.1 Ветка `feature/another-round-closes-window` от `develop`, первый коммит: этот change (`openspec/changes/another-round-closes-window/`). Проверка: `openspec validate another-round-closes-window --strict` проходит

## 2. Окно закрывается у согласившегося

- [ ] 2.1 `game-room.js`: «Да» в окне «Все истории» (`#confirmWindowNewRound`) закрывает окно, как «Да» листа чтения закрывает своё (`storiesModal.hide()`, затем `sendMove('new-round')`). Окно сразу перестаёт считаться открытым (`storiesWindow.open = false`), чтобы `round-state`, пришедший, пока оно гаснет, не рисовал в нём истории прошлого раунда на месте вопроса. Комментарии в начале файла и над кодом окна говорят об исключении. Проверка: `npm run lint` в папке игры зелёный
- [ ] 2.2 Браузерные тесты:
  - `reading.spec.js`, тест «Another round, said yes to»: у второго игрока тоже открыто окно; согласившийся в окне видит, как оно закрывается само, и под ним лобби, без крестика, а у второго окно открыто на том же раунде;
  - хелпер `confirmAnotherRound` (`helpers.js`): после «Да» в окне ждёт, что окно закрылось само, и не нажимает крестик.

  Проверка: `reading.spec.js`, `history.spec.js`, `accessibility.spec.js` зелёные на телефоне и компьютере; без строки `storiesModal.hide()` тест чтения падает.
- [ ] 2.3 Документы игры: CLAUDE.md, «The room page»: «Да» в окне закрывает его у согласившегося (решение владельца), окна остальных остаются. Проверка: сверка с кодом, без длинного тире в новых строках

## Workflow follow-up

- Владелец решил: обе ветки (`feature/stories-coffee-coupon` и эта) вливаются в `develop` (`--no-ff`), затем один полный `npm test` в корне на обе.
- Выпуск Consequences вместе с талоном (`docs/release.md`); на `master` только после подтверждения владельца.
- `/opsx:archive` после выпуска.
