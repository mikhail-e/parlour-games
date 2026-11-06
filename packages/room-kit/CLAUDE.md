# CLAUDE.md - room-kit

The shared kit of the parlour games with rooms: one npm workspace package, `@parlour-games/room-kit`, that every game takes from instead of copying. The repository's layout, commands, git flow and decisions are in the root `CLAUDE.md`; a game's own rules in its `CLAUDE.md`, which imports this file, so the rules here hold for every game on the kit. Paths here are from this folder, `packages/room-kit/`.

## What goes here
- **The kit knows no game**: no event names, no texts of a game, no rules, no layout of a game's pages. Code that does is the game's. When unsure where code goes, it goes into the game
- **Only what a game already uses**: the kit grows when a game needs something shared, not in advance for a game that does not exist yet
- **No version of its own**: the kit goes out with the games' releases (each game's `/api/version` is the game's); a change to the kit is a change to every game on it, so `npm test` at the root, every game's checks, runs before every merge

## Layout
```
package.json               # The package (private, no version), its bin (room-kit-copy-public), scripts and Jest settings; the tools are the root's devDependencies
scripts/copy-public.js     # The copy of public/ into a game's public/ (the bin; a game's `npm run build`)
public/                    # Copied into every game's public/, at the same paths
├── _headers               # The security headers of the static files, with their reasons (not served)
└── kit/
    ├── vendor/bootstrap/  # Bootstrap 5, the same files as the owner's other apps (exact version: the files' headers)
    └── fonts/             # Fira Sans Condensed (Latin + Cyrillic) for the text; Ultra, Oswald, Abril Fatface (Latin only) for whoami's sign and seal; woff2, their licenses, fonts.css with the @font-face rules
worker/                    # ES modules, for the Worker only (wrangler bundles them)
├── room-base.js           # RoomBase: one Durable Object per room — its pages' sockets, what the room knows of each (attachments), broadcast, the silent-socket sweep, the timer
├── http.js                # The frame of a game's Worker: /api/version, HEAD, the 404 page, an answer to a failure, the security headers
└── security-headers.json  # The Worker's copy of the security headers (public/_headers has them and their reasons)
shared/
└── identity.js            # CommonJS, for a game's rules (Jest) and the Worker: room codes, the player ID's format, the hash of a player's secret
tests/                     # Jest: the copy into a game, the two copies of the security headers
eslint.mjs                 # The shared part of ESLint: the rules and one block per environment, the paths the same in the kit and in a game
eslint.config.mjs          # ESLint of the kit itself, on eslint.mjs
README.md                  # What the kit is and how a game takes it
```

## Commands
From the repository root with `-w packages/room-kit`, or in this folder.
```bash
npm test                           # The kit's checks: ESLint, then Jest
npm run lint                       # ESLint only (any warning fails); npm run lint:fix fixes what it can
```

## How a game uses it
- The game names the kit in its `package.json`: `"dependencies": { "@parlour-games/room-kit": "*" }`. npm links the workspace package into the root's `node_modules` (no version needed), and the game imports its files by path, `@parlour-games/room-kit/<file>`. The package has no `exports` map on purpose: every file is reachable by its path, for Node, Jest and wrangler alike
- **The copy in a game's public/**: Cloudflare serves a Worker's static files from one folder, the game's `public/`, so the kit's `public/` is copied over it — `public/_headers` and `public/kit/` (pages link `/kit/vendor/bootstrap/…`, `/kit/fonts/fonts.css`). The copies are not in git (`.gitignore`: `games/*/public/kit/`, `games/*/public/_headers`) and are edited in the kit only: the next copy overwrites a game's change. The game's `build` script is `room-kit-copy-public public`; its `wrangler.jsonc` runs it before serving or uploading (`"build": { "command": "npm run build -w <the game's package name>", "watch_dir": "../../packages/room-kit/public" }`), so `npm start` and the browser tests' servers always start on a fresh copy, and `npm start` copies again when a file of the kit changes. The command names the game, not its path: wrangler runs it in the folder it was started in — the game's for `npm start` and the tests, the root's for Workers Builds. Workers Builds does not run wrangler's `build`; its own Build command runs the copy (root `docs/release.md`)
- **The copy is safe to run twice at once** (the browser tests start two `wrangler dev`): a file is written only when it differs, through a temporary file renamed into place, so a server never reads half a file; what the kit no longer has leaves the game's `public/kit/`, and nothing else of the game's `public/` is touched (`tests/copy-public.test.js`)
- **ESLint**: a game's `eslint.config.mjs` spreads `roomKitEslint({ ignores })` (`eslint.mjs`) and adds blocks of its own (whoami: `game-logic.js`), with `sharedRules` for them. `ignores` is the config's own: a game skips its copy of the kit's files, the kit only the third-party code among them

### The room
`worker/room-base.js`: a game's room `extends RoomBase` (whoami: `worker/room.js`), one Durable Object per room code, found by the code (`env.ROOMS.getByName(code)`). Cloudflare puts a room to sleep between messages and may take it out of memory at any moment (the WebSocket Hibernation API: a sleeping room costs nothing), so **nothing lives only in memory**: what the room knows of a socket lives in the socket itself — its attachment (`getInfo` / `setInfo`), which survives the sleep; a game keeps there whose the socket is (whoami: a player's or a waiting newcomer's role) — and everything else in the room's storage, which the game's room loads as it wakes.
- `fetch` accepts a page's socket (anything else: 426); messages are JSON `{ event, data }`. A message that is not that gets no answer, and a handler that fails cannot break the room: `onEvent(ws, event, data)` is the game's, `onEventError` answers a failure the game's way, `onSocketGone(ws, info)` hears a socket that closed, broke or went silent — once, with what the room knew of it
- `send(ws, event, data)` to one socket (a socket that has just gone takes nothing, and that is no error); `broadcast(event, data, { only, except })` to every socket whose info passes `only`, the sender included unless it is `except`; `sockets(filter)` — the open ones
- **Connection check**: a page pings, and the room answers `pong` without waking (an auto-response). While sockets are open, the game's timer calls `sweepSilentSockets()` every `SWEEP_EVERY_MS` (a minute): a socket not heard for `SOCKET_SILENCE_MS` (2 minutes) counts gone — a phone asleep with its socket open. The ping's time is asked of the runtime; a socket that never pinged counts from its connection
- `setAlarmAt(times)` — the room's one timer at the earliest of the times given (none: no timer); which times, is the game's

### The Worker's frame
`worker/http.js`: a game's `worker/index.js` is `export default gameWorker({ route, version: pkg.version })` plus its room classes. `route(request, env, { method, pathname })` answers the game's addresses, or nothing for an address that is not the game's. The frame answers `GET /api/version` with the game's version (its package.json), a HEAD as the GET it asks about without the body, an address nothing answers with the game's `public/404.html` and status 404, and a failure with `{ success: false }`, status 500 — JSON the page can read, never Cloudflare's error page. It puts the security headers on every answer but an accepted socket's (`withSecurityHeaders`; `notFound` is exported too). Which addresses reach the Worker at all is the game's `run_worker_first` in wrangler.jsonc: the static files are served without it, and cost nothing of the day's request limit

### Room codes and players
`shared/identity.js`, CommonJS (a game's rules require it, Node's `crypto` comes through `nodejs_compat`): a room code is 6 characters of `A-Z0-9` (`generateRoomCode` takes them from the cryptographic generator — the code is all that lets a stranger into a room; `isValidRoomCode`); a player ID is a UUID, and so is a player's secret (`PLAYER_ID_PATTERN`, `isValidPlayerId`; keep the pattern on one line: its browser copy is compared with it); the server keeps a hash of a secret, never the secret itself (`hashSecret`). whoami's `game-logic.js` exports them on under their own names

### Security headers
The Content Security Policy, Referrer-Policy, Permissions-Policy, nosniff — the list of the owner's Flying Solo — on every answer of every game: `public/_headers` (copied into each game) puts them on the static files, and a game's Worker on its own answers from `worker/security-headers.json`. The two are deliberate copies (`tests/security-headers.test.js` keeps them equal); the reasons are written in `_headers`, as JSON holds no comments. **One list for every game**: a source one game needs (whoami's `data:` and `blob:` images for photo avatars) is allowed for all, so each reason in `_headers` says whose it is; `data:` images are Bootstrap's own too (its icons). A game's `site-headers.spec.js` checks what a browser gets — and so catches a copy that did not happen

### Fonts
The games' own files (`public/kit/fonts/`, Fontsource; licenses next to them: Ultra's is Apache 2.0, the others' SIL OFL), never a CDN: the CSP allows fonts only from the game's site. `fonts.css` next to them holds the `@font-face` rules, and a page links it before its own style sheet; a game's style sheet only names the families. Latin and Cyrillic are separate files by `unicode-range` (the browser downloads Cyrillic only for a page that has it), and there are no italic files (nothing is italic; the browser would slant the letters itself). Ultra and Abril Fatface have `font-display: block`: a logo flashing in a fallback serif looks worse than a short pause. Which face sets what is a game's look (whoami's CLAUDE.md, Fonts)

## Rules
1. **Only the game's own code runs on its pages** (Content Security Policy, `public/_headers`) — no `style="..."` or `on...="..."` attributes, neither in the markup nor in HTML a script builds: looks go through classes in a style sheet, handlers through `addEventListener`; a script may still set `element.style`. Third-party code goes to `public/kit/vendor/`, never a CDN. A new source in the CSP (another site, `data:`, `blob:`) is a deliberate decision for every game, with a comment in `public/_headers` (and the same value in `worker/security-headers.json`)
2. **The copies of the kit's files in a game are never edited**: change the kit, the next copy brings it

## Gotchas
- **A deploy keeps the sockets open**: a sleeping room wakes on the new code, its sockets and storage in place; a room that stays awake runs the previous code until it sleeps, new pages included. So for a while after a deploy a room may run the old code next to new pages: a change of the socket protocol must still work with a room on the previous version. A room that Cloudflare does restart drops its sockets: the pages reconnect, and the game's room puts its bookkeeping right as it loads
- **Locally the Worker sees the production host** in `request.url`: `wrangler dev` takes it from the route in wrangler.jsonc. It turns that host back into the local one in a `Location` header, so a redirect stays local; anything else built from `request.url` — an absolute link in an answer, a check of the browser's `Origin` against the host — would name production or fail locally. Answer with paths
- **A new or renamed room class needs a new migration entry** in a game's wrangler.jsonc (`migrations`: `new_sqlite_classes` for a new class — SQLite storage is the kind the free plan has —, `renamed_classes` for a new name); a migration that deletes a class deletes every room's storage with it
- **A game's `public/` is uploaded as it is**, the kit's copy included: a file in it is a file of the site, unless the game's `public/.assetsignore` names it (`.DS_Store` from a Mac); `_headers` and `.assetsignore` themselves are not served
- **A new `bin` of the kit needs its link renewed**: `npm install` answers "up to date" and links nothing. Remove `node_modules/@parlour-games/room-kit` and run `npm install` again: the lockfile then records the bin, and `npm clean-install` in Workers Builds links it

## Decisions (why it is so)
The owner's decisions, with the reason.
- **Bare Durable Objects, one per room** (on Cloudflare Workers, root CLAUDE.md): a room's state, sockets (the WebSocket Hibernation API: a sleeping room costs nothing) and timer in one place. No PartyServer or partysocket: fewer dependencies, all the code in sight, and the room base is the pattern every game follows
- **The kit's browser files reach a game by a copy at build time**, not by symlinks in git (wrangler means to skip symlinks in the static files and uploads them only by accident: a fix on its side would silently drop the kit's files from production), not served by the Worker (every file would be a request of the day's limit, where static files are free), not as committed copies (every file twice: what the monorepo avoids)
- **One list of security headers for every game**: the games follow one policy, the list of the owner's Flying Solo
- **Bootstrap is local, not on a CDN**: the Content Security Policy allows only the game's own site, and the owner's apps share one Bootstrap
- **The fonts are the kit's**: the games share the playbill typography; which face sets what stays each game's look
