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
worker/
└── security-headers.json  # The Worker's copy of the security headers (public/_headers has them and their reasons)
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

### Security headers
The Content Security Policy, Referrer-Policy, Permissions-Policy, nosniff — the list of the owner's Flying Solo — on every answer of every game: `public/_headers` (copied into each game) puts them on the static files, and a game's Worker on its own answers from `worker/security-headers.json`. The two are deliberate copies (`tests/security-headers.test.js` keeps them equal); the reasons are written in `_headers`, as JSON holds no comments. **One list for every game**: a source one game needs (whoami's `data:` and `blob:` images for photo avatars) is allowed for all, so each reason in `_headers` says whose it is; `data:` images are Bootstrap's own too (its icons). A game's `site-headers.spec.js` checks what a browser gets — and so catches a copy that did not happen

### Fonts
The games' own files (`public/kit/fonts/`, Fontsource; licenses next to them: Ultra's is Apache 2.0, the others' SIL OFL), never a CDN: the CSP allows fonts only from the game's site. `fonts.css` next to them holds the `@font-face` rules, and a page links it before its own style sheet; a game's style sheet only names the families. Latin and Cyrillic are separate files by `unicode-range` (the browser downloads Cyrillic only for a page that has it), and there are no italic files (nothing is italic; the browser would slant the letters itself). Ultra and Abril Fatface have `font-display: block`: a logo flashing in a fallback serif looks worse than a short pause. Which face sets what is a game's look (whoami's CLAUDE.md, Fonts)

## Rules
1. **Only the game's own code runs on its pages** (Content Security Policy, `public/_headers`) — no `style="..."` or `on...="..."` attributes, neither in the markup nor in HTML a script builds: looks go through classes in a style sheet, handlers through `addEventListener`; a script may still set `element.style`. Third-party code goes to `public/kit/vendor/`, never a CDN. A new source in the CSP (another site, `data:`, `blob:`) is a deliberate decision for every game, with a comment in `public/_headers` (and the same value in `worker/security-headers.json`)
2. **The copies of the kit's files in a game are never edited**: change the kit, the next copy brings it

## Gotchas
- **A new `bin` of the kit needs its link renewed**: `npm install` answers "up to date" and links nothing. Remove `node_modules/@parlour-games/room-kit` and run `npm install` again: the lockfile then records the bin, and `npm clean-install` in Workers Builds links it

## Decisions (why it is so)
The owner's decisions, with the reason.
- **The kit's browser files reach a game by a copy at build time**, not by symlinks in git (wrangler means to skip symlinks in the static files and uploads them only by accident: a fix on its side would silently drop the kit's files from production), not served by the Worker (every file would be a request of the day's limit, where static files are free), not as committed copies (every file twice: what the monorepo avoids)
- **One list of security headers for every game**: the games follow one policy, the list of the owner's Flying Solo
- **Bootstrap is local, not on a CDN**: the Content Security Policy allows only the game's own site, and the owner's apps share one Bootstrap
- **The fonts are the kit's**: the games share the playbill typography; which face sets what stays each game's look
