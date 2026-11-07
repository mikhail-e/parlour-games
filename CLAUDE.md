# CLAUDE.md - parlour-games

Parlour games to play remotely with friends and family. Each game is a web app with rooms, whole in its own folder under `games/`, built on the shared kit in `packages/room-kit/`. The repository only stores the code: every game has its own Cloudflare Worker, domain, rooms and deploy.

- **Repository:** https://github.com/mikhail-e/parlour-games — public, a showcase (see Decisions)
- **Games:**
  - `games/whoami/` — "Who am I?", https://whoami.escapist.club/ (the Worker `whoami-game`). Its architecture, rules and gotchas: `games/whoami/CLAUDE.md`, which Claude Code reads when working in that folder
  - `games/consequences/` — Consequences, the folded-paper story game, https://story.escapist.club/ (the Worker `consequences-game`). Its architecture, rules and gotchas: `games/consequences/CLAUDE.md`
- **The kit:** `packages/room-kit/` — what every game with rooms shares (`@parlour-games/room-kit`). Its layout and rules: `packages/room-kit/CLAUDE.md`, which every game's CLAUDE.md imports

## Layout
```
package.json               # parlour-games (private): npm workspaces games/* and packages/*, the tools of every game (devDependencies), scripts that run every workspace's
package-lock.json          # The one lockfile: the exact version of every package, for every game
games/<game>/              # A game, whole: Worker, pages, tests, configs, package.json (name, version, scripts, the kit in dependencies), README, CLAUDE.md, docs
packages/room-kit/         # The shared kit of the games (an npm workspace package, private, no version): its code, tests, docs (testing.md: the games' tests), CLAUDE.md, README
docs/release.md            # Git flow, versions, releasing a game, the Workers Builds settings, the check of production
openspec/                  # OpenSpec: config.yaml, the current behaviour (specs/), changes in progress (changes/), finished ones (changes/archive/)
.claude/                   # Claude Code: settings.json (shared), the OpenSpec commands (commands/opsx/) and skills (skills/openspec-*)
README.md                  # The collection: the games, contributing, security, license
LICENSE                    # MIT for the code; each game's brand is not covered (README, License)
SECURITY.md                # How to report a vulnerability privately (GitHub's private vulnerability reporting)
.github/FUNDING.yml        # The Sponsor button on GitHub: the owner's Buy Me a Coffee
.vscode/                   # Shared VS Code settings: ESLint fixes on save, the ESLint extension recommended, each game's ESLint config found by its folder
```

## Commands
```bash
npm install                        # At the root only (Node.js 22+: wrangler needs it): the packages of every game, into the root's node_modules (the kit linked there)
npm test                           # Every game's checks (ESLint, Jest, then Playwright) and the kit's — run before every merge
npm run lint                       # Every game's and the kit's ESLint
npm run test:e2e                   # Every game's browser tests
npm start -w games/whoami          # One game: any of its scripts with -w games/<game>, or run in its folder (whoami on 8787, consequences on 8788)
npm test -w games/whoami           # One game's checks
npm test -w packages/room-kit      # The kit's checks
npx playwright install chromium    # Once per machine: the browser for the tests
npx wrangler login                 # Once per machine: the owner's Cloudflare account, for the live log
```
- A tool package goes to the root: `npm install -D <package>` here; a game's or the kit's package.json has no devDependencies
- `npx jest` and `npx playwright` run in a game's (or the kit's) folder: their settings are there

## Git Workflow (git flow)
Steps and commands: `docs/release.md`.
- `master` — production of every game. **A push to `master` deploys every game whose files it changes**: Cloudflare's Workers Builds builds each game's Worker by its own settings (root directory, build watch paths: `docs/release.md`); no other branch is built. Never commit to it directly
- `develop` — integration branch. Never commit to it directly
- **All changes go in feature branches**: `feature/<short-name>` from `develop`, finished with a local `git merge --no-ff` into `develop` (no Pull Requests), then the branch is deleted
- Before every merge: `npm test` at the root must pass
- **Release of a game**: `release/<game>-<x.y.z>` from `develop` → bump the game's version (`npm version minor -w games/<game> --no-git-tag-version`) → merge `--no-ff` into `master`, tag `<game>-v<x.y.z>`, merge back into `develop` → push `master`, `develop` and tags. **Push to `master` only after the owner confirms** (it deploys production), then check production (`docs/release.md`). The tags without a game's name (`v1.x`–`v2.0.0`) are whoami's
- **Hotfix**: `hotfix/<game>-<x.y.z>` from `master` → a test that fails on the old code, the fix, a patch bump → merge `--no-ff` into `master` (tag) and `develop`

## Decisions (why it is so)
The owner's decisions, with the reason. A game's own decisions are in its CLAUDE.md.
- **One repository for every game (a monorepo)**: the games share code from one place instead of copies, a change of shared code is checked by every game's tests at once, and the tools have one version for all. The price, accepted: one `npm test` for every game, the games' releases on one `develop`
- **Each game is its own app**: its own Worker, domain, Durable Objects and deploy — the repository is code storage only. A game's version is its own (`version` in its package.json, tags `<game>-v<x.y.z>`)
- **The games' shared code is a package, `packages/room-kit/`**: a game takes it from the package (an npm workspace dependency), never from a copy, so a fix of the shared code reaches every game and `npm test` checks them all against it. The kit has no version or releases: it goes out with each game's release. What belongs in the kit, and what stays in a game: `packages/room-kit/CLAUDE.md`
- **Cloudflare Workers**: the owner plans more apps with rooms, each at no extra cost. Cloudflare's free plan is per account, not per app, and over a limit the requests fail until midnight UTC — there is no bill; Workers Paid would cover every app at once. What counts against the free plan: requests a day for all the owner's apps together (a socket's connection is one, the messages it sends count twenty to one; static files nothing), the rooms' time awake and the rows they write — check the current numbers on Cloudflare's pricing page before relying on them
- **No CI**: `npm test` on the developer's machine is the only check before code reaches `develop` and production
- **The repository is public — a showcase**: anyone may read the code and learn from it; issues are welcome, pull requests are not expected (only collaborators can open them). The code is MIT (`LICENSE`); each game's brand is not covered (README, License). Vulnerabilities are reported privately (`SECURITY.md`). New commits use the owner's GitHub noreply address as author and committer (`includeIf` in `~/.gitconfig`); older history keeps the personal address. No committed text — plans included — holds private details: no account or zone IDs, account subdomains, tokens, addresses or local paths
- **OpenSpec plans the changes**: a change is proposed, designed and split into tasks in `openspec/changes/<name>/` (the artifacts are in Russian: `openspec/config.yaml`), implemented with `/opsx:apply` and archived with `/opsx:archive`. The archive (`openspec/changes/archive/`) stays in the repository; `openspec/specs/` describes the current behaviour
- **Docs hold principles, not history**: CLAUDE.md, `docs/` and the skills say how things work and why; no development history, dates or measured numbers (sizes, counts, timings) — those live in the code and in git. Plans and their history live in OpenSpec; what stays true of a change goes into the docs
