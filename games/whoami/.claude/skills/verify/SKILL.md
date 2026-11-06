---
name: verify
description: How to run and drive the "Who am I?" game app for end-to-end verification of frontend/backend changes.
---

# Verifying changes in the "Who am I?" game

The game lives in `games/whoami/` of the parlour-games monorepo; paths below are from that folder. A check worth repeating belongs in a browser test (`tests/e2e/`, `docs/testing.md`): its helpers already create rooms, join players and start games (`createRoom`, `joinRoom`, `startedGame`). Drive the app by hand for what a test cannot judge — how a change looks.

## Launch

```bash
npm start -w games/whoami   # from the repository root (or `npm start` in games/whoami/): wrangler dev; background it; ready when it prints "Ready on http://localhost:8787"
```

No build step. Stop with `pkill -f "wrangler dev"`. The rooms' storage stays in the game's `.wrangler/` between runs (gitignored). Changing a file the Worker bundles (worker/, game-logic.js, package.json) or anything in public/ reloads it, and the reload drops every open socket: the pages reconnect.

## Drive (Playwright MCP)

1. Navigate to `http://localhost:8787/` — landing page, in the browser's language (or the one saved in localStorage).
2. Name field is usually prefilled from localStorage; click «Создать новую игру» → redirects to `/game/XXXXXX`.
3. To join as a second player, open a second tab with the room URL (each tab shares the same `localStorage.playerId`, so use a separate browser context for a truly distinct player: in `browser_run_code_unsafe`, `page.context().browser().newContext()`; the room URL first redirects to `/?join=CODE`, where the second player enters a name and clicks Join).
4. Language toggle: call `i18n.setLanguage('en'|'ru')` via evaluate, or click the flag button on the landing page.
5. The pages print their log only with debugging on: `localStorage.setItem('whoami-debug', 'on')`, then reload. Without it the console should hold no logs, warnings or errors.

## Gotchas

- Playwright MCP saves screenshots and snapshots only inside the repository (`.playwright-mcp/` is gitignored) — delete `.playwright-mcp/` before finishing.
- `navigator.share` exists in Playwright's Chromium; a real click on the Share button opens the macOS share sheet, which blocks automation. Stub it via evaluate (`Object.defineProperty(navigator, 'share', {configurable: true, writable: true, value: ...})`) and drive the button with `btn.click()` inside evaluate.
- Button-feedback flashes («✅ Скопировано!») revert after a short delay — read `textContent` in the same evaluate call as the click, not in a separate round trip.
- After any button flash, `textContent = originalText` flattens the `data-i18n` span, so language switching stops updating that button until reload. Reload before testing i18n labels.
- A room lives in its Durable Object's storage: it survives restarting `npm start`, and goes 2 hours after its last player's page closed (or at once when its last player leaves). `npx wrangler tail whoami-game` shows the deployed version's log.
