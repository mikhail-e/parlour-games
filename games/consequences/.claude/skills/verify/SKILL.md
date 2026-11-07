---
name: verify
description: How to run and drive the Consequences game app for end-to-end verification of frontend/backend changes.
---

# Verifying changes in the Consequences game

The game lives in `games/consequences/` of the parlour-games monorepo; paths below are from that folder. A check worth repeating belongs in a browser test (`tests/e2e/`, `docs/testing.md`): its helpers already create rooms, join players, start a round, answer a step and write to the reading (`roomWith`, `startedRound`, `answerStep`, `writeToReading`). Drive the app by hand for what a test cannot judge — how a change looks.

## Launch

```bash
npm start -w games/consequences   # from the repository root (or `npm start` in games/consequences/): wrangler dev; background it; ready when it prints "Ready on http://localhost:8788"
```

wrangler first copies the kit's files into `public/kit/` and `public/_headers` (`npm run build`; they are copies — edit them in `packages/room-kit/public/`). Stop with `pkill -f "wrangler dev"` (it stops whoami's too, if it runs). The rooms' storage stays in the game's `.wrangler/` between runs (gitignored). Changing a file the Worker bundles (worker/, game-logic.js, package.json) or anything in public/ reloads it, and the reload drops every open socket: the pages reconnect.

## Drive (Playwright MCP)

1. Navigate to `http://localhost:8788/` — landing page, in the browser's language (or the one saved in localStorage).
2. Enter a name, click «Создать новую игру» → redirects to `/game/XXXXXX`, the lobby.
3. A round needs two players. Every player is a browser context of their own (each tab of one context is the same player: the same `localStorage.playerId`): in `browser_run_code_unsafe`, `page.context().browser().newContext()`; the room URL first redirects to `/?join=CODE`, where the player enters a name and clicks Join.
4. «Начать» starts the round; each player writes in `#answerText` and presses «Загнуть и передать». A step ends when every seat has its answer, so drive every context; close a context's page to see a seat go offline and «Ответить за» appear for those who answered.
5. After the eighth question each player taps the closed sheet (`.closed-sheet`); the last one opens every story.
6. Language toggle: the flag button at the end of the page, or `i18n.setLanguage('en'|'ru')` via evaluate — the round's screens redraw.
7. The pages print their log only with debugging on: `localStorage.setItem('consequences-debug', 'on')`, then reload. Without it the console should hold no logs, warnings or errors.

## Gotchas

- Playwright MCP saves screenshots and snapshots only inside the repository (`.playwright-mcp/` is gitignored) — delete `.playwright-mcp/` before finishing.
- `navigator.share` exists in Playwright's Chromium; a real click on the Share button opens the macOS share sheet, which blocks automation. Stub it via evaluate (`Object.defineProperty(navigator, 'share', {configurable: true, writable: true, value: ...})`) and drive the button with `btn.click()` inside evaluate.
- The answers are secrets until every sheet is open: no page, the author's included, gets an answer's text while the round is written, so there is nothing to read back from a page in the middle of a step.
- A room lives in its Durable Object's storage: it survives restarting `npm start`, and goes 2 hours after its last player's page closed (or at once when its last player leaves).
