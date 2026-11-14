# Consequences

The parlour story game, played remotely. Every player answers the same question on the sheet in front of them (who, with whom, when, where and others) and the sheet moves on; nobody sees the answers before theirs. The questions come in sets (classic, fairy tale, detective story and four more), and every round draws its own. At the end everyone reads out the story that came to them. Create a room, send the link to friends and family and play: no accounts, nothing to install.

**Play:** https://story.escapist.club/

## How to Run

The game is one of the [parlour-games](../../README.md) monorepo. Running it needs Node.js 22 or newer: `npm start` runs `wrangler dev`, the Cloudflare Workers runtime on your machine, with the game's rooms (Durable Objects) and files.

```bash
npm install                        # at the repository root
npm start -w games/consequences    # http://localhost:8788 (or npm start in this folder)
```

## Development

In this folder (from the repository root: `-w games/consequences` after the command):

```bash
npx playwright install chromium   # once: the browser for the browser tests
npm test           # all checks: ESLint, Jest, then the game in a real browser (Playwright)
npm run lint       # ESLint only
npm run test:e2e   # browser tests only: a phone and a desktop, several players per room
```

- [`CLAUDE.md`](CLAUDE.md) — architecture and rules (the repository's layout and git flow: the [root CLAUDE.md](../../CLAUDE.md))
- [`docs/testing.md`](../../packages/room-kit/docs/testing.md) (the kit's) — how the tests of the games are organized and written
- [`docs/release.md`](../../docs/release.md) (the repository's) — releases, hotfixes and the check of production

The documents in `docs/` are written in Russian.

## Technologies

- Server: Cloudflare Workers and Durable Objects (one per room), WebSocket
- Browser: plain JavaScript and Bootstrap 5 — no framework, no bundler; the shared kit ([`packages/room-kit/`](../../packages/room-kit/README.md)) is copied into `public/` before the game is served
- Checks: ESLint, Jest, Playwright

## Contributing

This is a personal project, open to read and to learn from. Bug reports and ideas are welcome as [issues](https://github.com/mikhail-e/parlour-games/issues); I don't plan to accept pull requests.

To report a security problem, see [SECURITY.md](../../SECURITY.md) — please don't open a public issue for it.

## License

The code is released under the [MIT License](../../LICENSE). The license does not cover the game's brand; third-party files keep their own licenses: see [License](../../README.md#license) in the repository's README.

## Credits

Developed with [Claude Code](https://claude.ai/claude-code).
