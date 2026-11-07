# CLAUDE.md - Consequences

One game of the parlour-games monorepo: the repository's layout, commands, git flow and decisions are in the root `CLAUDE.md`. Paths here are from this folder, `games/consequences/`.

The game is built on the shared kit, `packages/room-kit/`; the kit's rules hold here too:
@../../packages/room-kit/CLAUDE.md

## Project Overview
Web application to play Consequences, the folded-paper story game, remotely with friends and family. Players join a room by a 6-character code; in a round every player answers the same question on the sheet in front of them, the answer is folded away and the sheets move on, eight questions in all (Who? / With whom? / When? / Where? / What were they doing? / How did it all end? / What did people say? / What is the moral?); at the end each player reads out the story that came to them. Adaptive UI works on desktop and mobile browsers.

- **Production:** not published yet — the game runs only locally until its address is named (root `docs/release.md`)
- **Repository:** https://github.com/mikhail-e/parlour-games, folder `games/consequences/` — public, a showcase (root CLAUDE.md, Decisions)
- **Stack:** the same as every game on the kit: Cloudflare Workers + Durable Objects (one per room, `wrangler`), vanilla JavaScript + Bootstrap 5 (the kit's local copy), Jest and Playwright. No frontend framework and no bundler: the only build step copies the kit's files into `public/` (`npm run build`, run by wrangler itself).

## Commands
In this folder; from the repository root the npm scripts take `-w games/consequences` (`npm start -w games/consequences`). Installing the packages and the once-per-machine steps: root CLAUDE.md.
```bash
npm start                          # wrangler dev: copies the kit's files (npm run build), then the Worker, its rooms and the files on http://localhost:8788
npm test                           # The game's checks: ESLint, Jest, then Playwright (before a merge: npm test at the root, every game's)
npm run lint                       # ESLint only (any warning fails); npm run lint:fix fixes what it can
npx jest tests/game-logic.test.js  # Run a single Jest file (in this folder only: Jest's settings are in its package.json)
npm run test:e2e                   # Browser tests only (Playwright); :headed and :ui variants
```

## Architecture
```
package.json               # The game's name, version (/api/version reads it), the kit in dependencies, scripts (build: the kit's copy) and Jest settings; the tools are the root's devDependencies
wrangler.jsonc             # Cloudflare: the Worker, the kit's copy before serving (build), npm start's port (8788), the static files of public/, the rooms' Durable Object class and its migrations
worker/
├── index.js               # The Worker: the kit's frame (version, HEAD, 404, failures, security headers) with the kit's room addresses (create, join, room page, socket)
└── room.js                # The game's room (extends the kit's GameRoom): the game's moves
game-logic.js              # Pure game logic: the round — seats, sheets, steps, answers, absent seats, the reading, a new round — no Cloudflare in it, unit-testable; the players list (joins, leavers, ghosts, the room's timers and storage, name and avatar limits) is the kit's, with the game's hooks
public/
├── kit/, _headers         # The kit's copy (its page scripts, Bootstrap, fonts, the playbill look; the static files' security headers): not in git, edited in the kit only
├── .assetsignore          # What in public/ is not uploaded (.DS_Store)
├── index.html             # Landing page: the rules; the kit's form (name, avatar, create/join)
├── game.html              # Game room page, noindex
├── 404.html               # Page for an address nothing answers (sent with status 404; links start at /)
├── css/style.css          # The game's own look on the kit's playbill.css
└── js/                    # The game's page scripts; the kit's come from /kit/js/
    ├── config.js          # The game's settings for the kit's scripts: the prefix of its keys in localStorage ('consequences'), loaded first
    ├── translations.js    # The game's texts (en/ru) and the Russian copies of the server's errors; the kit's i18n.js shows them
    ├── utils.js           # The game's shared page code: the answer's length limit — the game's reusable page code goes HERE
    └── game-room.js       # The game's part of the room page, on the kit's room-page.js
tests/                     # Jest: game logic, the round in the room's storage, checks of deliberate copies and of how code is written
└── e2e/                   # Playwright: the game in Chromium (phone + desktop), several players per room, the HTTP API; helpers.js, on the kit's guard and helpers
playwright.config.js       # Browser tests on the kit's shared config: own wrangler dev on 3200 (and 3201 with short room timers), mobile + desktop
README.md                  # What the game is, how to run it
eslint.config.mjs          # ESLint: the kit's blocks per environment, and the game logic's own
```
Releases, the license and the security policy are the repository's: root `docs/release.md`, `LICENSE`, `SECURITY.md`.

### How it works
- **Rooms, entering, leaving and the players list are the kit's**, as in every game on it (`packages/room-kit/CLAUDE.md`: The room, The room with players, The Worker's frame, The players of a room, The landing page, The room page): a room per 6-character code, the HTTP API (`POST /api/create-game`, `POST /api/join-game`, `GET /game/:roomCode`, the socket `/ws/CODE`, `GET /api/version`), the player's ID and secret per browser, joining with the secret, the first-join order of the list, online and offline, ghosts after the kit's hour, the room's timers and storage, the security headers. **Who acts is the player the socket is registered for**, never an ID from the message
- **The round** (`game.round` in game-logic.js, with the model in its header): at the start every player of the list takes a seat in the list's order — offline ones too: a phone that slept in the lobby must not leave its owner out — with a blank sheet of eight questions (`QUESTION_COUNT`); at least two players (`startRound`). `step` 0–7 is a question, 8 the reading. At step s seat i holds sheet `(i − s) mod N` (`sheetAt`): sheet j starts at seat j, its last answer is written at seat `(j + 7) mod N` and it is read at `(j + 8) mod N` — the seat after, so for any N ≥ 2 nobody reads the sheet whose last answer is theirs. An answer is trimmed, never empty, at most 200 characters counted as a person counts them (`MAX_ANSWER_LENGTH`; longer is refused, not cut: a sent answer is final, and the page holds the same limit), and stays as sent, with who wrote it (`by`). A step ends when every sheet has its answer: `step + 1`, `takenBy` cleared — a slow player online is waited for
- **Absent seats** (`isAbsent`): a seat whose player is offline or has left. A player who has answered this step and holds nothing takes an absent seat's blank sheet (`takeSheet`, "Answer for"); in the reading any player who holds nothing takes an absent seat's closed sheet ("Read for"). The first to ask gets it — the room takes its messages one at a time — and `takenBy` says who holds it. The sheet goes back on the table with "Put it back" (`returnSheet`), its answer or its opening, the taker leaving (the `forget` hook), and the taker's last page going (`releaseSheetsOf`, the room's part). A player back while another holds their sheet waits for the next step (or lets the reader read)
- **Leavers keep their seats**: a leaver of the round goes from `players` but stays in `seats`; the kit's snapshot (`recentlyLeft`) keeps their secret's hash, join time and — the game's hook — name and avatar, so the others see whose seat it is, and the same browser comes back to its seat and its place in the list without asking. Ghosts removed by the kit's timer leave the same way
- **The reading** (step 8): a player opens the sheet in front of their seat, or an absent seat's sheet they took (`openSheet`); `openedBy` says who opened which. Until every sheet is open a sheet's answers go only to who opened it (`sheetsOpenedBy`, for their page after a reload too); once the last opens, every story with who read it is everybody's (`allStories`)
- **A new round** (`newRound`): in the middle of a round (the page asks first) or after every story — back to the lobby with the same players; the round, the leavers' snapshots (their seats) and the waiting newcomers' requests go, and the room tells the newcomers' pages to join again (`endedJoinRequests`)
- **The kit and the game:** what knows nothing of the game is the kit's; the game's part is `worker/room.js` (its moves), `game-logic.js` (its rules and its hooks for the players list), the pages' markup, `style.css` (its own look), `game-room.js` (its field and events) and its brand. When unsure where code goes, it goes into the game's part

## Rules (important!)
1. **No code duplication across files** — code every game shares goes to the kit (`packages/room-kit/`)
2. **Update tests whenever logic changes**: a game rule → Jest with `game-logic.js`; what the player sees or does → a browser test in `tests/e2e/` (the kit's `docs/testing.md`). Run `npm test` before committing
3. **Localize all UI text** — every user-facing string of the game needs both `en` and `ru` entries in `public/js/translations.js` (the kit's rule and its `data-i18n*` attributes: `packages/room-kit/CLAUDE.md`, Translations); a text the kit already has is the kit's, not repeated. An error the server sent is shown through `serverErrorText()`
4. **Never build DOM from user data with `innerHTML`** — player names and answers go through `textContent`, avatars through the kit's `renderAvatar()`
5. **Debug output goes through `debugLog()`** — the kit's rule (`packages/room-kit/CLAUDE.md`, Rules); here it prints after `localStorage.setItem('consequences-debug', 'on')` and a reload
6. **The pages share names through plain `<script>` files** — the kit's rule; the game's scripts take the kit's names and give the kit `APP_STORAGE_PREFIX` (config.js), `translations` and `serverErrors` (translations.js); `tests/shared-names.test.js` checks the game's scripts and the kit's together
7. **Only the game's own code runs on its pages** — the kit's rule: no `style="..."` or `on...="..."` attributes; `tests/code-structure.test.js` checks the game's pages and scripts, the browser tests' guard any other blocked code

## Gotchas
- **The answer's length limit (200) exists twice** — the server's in `game-logic.js` and `public/js/utils.js` for the browser (a browser script cannot `require()` a Node module); `tests/input-limits.test.js` fails if they drift apart. Counted by character, not UTF-16 code unit, like a name: an emoji counts as one
- **The list's order is the order of first joins** (the kit's): Jest tests that join several players advance fake time between the joins, as people never join in one millisecond — with equal join times a returning leaver would not get their place back
- `game-logic.js` must stay free of Cloudflare imports (CommonJS) so Jest tests it in Node; its functions take a `Map` of games, and a room passes a Map of its one game
- **`npm start` listens on 8788**, the browser tests on 3200 and 3201: whoami's are 8787, 3100 and 3101, so both games can run side by side

## Git Workflow
Git flow, releases and hotfixes are the repository's: root CLAUDE.md and `docs/release.md`; this game's name in its branches and tags is `consequences`.

## Decisions (why it is so)
The owner's decisions, with the reason. The repository's own are in the root CLAUDE.md, the kit's in its CLAUDE.md.
- **The version is written only in package.json**: the server reads it (`/api/version`), the pages ask the server — no copy to keep in sync
- **The look is the kit's playbill**, like whoami's: the games are one collection; the game's own sign and field are its brand
- **Entering works as in whoami**: the kit's landing form, room codes and links, the player's browser as the player
