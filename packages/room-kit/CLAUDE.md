# CLAUDE.md - room-kit

The shared kit of the parlour games with rooms: one npm workspace package, `@parlour-games/room-kit`, that every game takes from instead of copying. The repository's layout, commands, git flow and decisions are in the root `CLAUDE.md`; a game's own rules in its `CLAUDE.md`, which imports this file, so the rules here hold for every game on the kit. Paths here are from this folder, `packages/room-kit/`.

## What goes here
- **The kit knows no game**: no event names, no texts of a game, no rules, no layout of a game's pages. Code that does is the game's. When unsure where code goes, it goes into the game
- **Only what a game already uses**: the kit grows when a game needs something shared, not in advance for a game that does not exist yet
- **No version of its own**: the kit goes out with the games' releases (each game's `/api/version` is the game's); a change to the kit is a change to every game on it, so `npm test` at the root, every game's checks, runs before every merge

## Layout
```
package.json               # The package (private, no version), its scripts; the tools are the root's devDependencies
eslint.mjs                 # The shared part of ESLint: the rules and one block per environment, the paths the same in the kit and in a game
eslint.config.mjs          # ESLint of the kit itself, on eslint.mjs
README.md                  # What the kit is and how a game takes it
```

## Commands
From the repository root with `-w packages/room-kit`, or in this folder.
```bash
npm test                           # The kit's checks: ESLint
npm run lint                       # ESLint only (any warning fails); npm run lint:fix fixes what it can
```

## How a game uses it
- The game names the kit in its `package.json`: `"dependencies": { "@parlour-games/room-kit": "*" }`. npm links the workspace package into the root's `node_modules` (no version needed), and the game imports its files by path, `@parlour-games/room-kit/<file>`. The package has no `exports` map on purpose: every file is reachable by its path, for Node, Jest and wrangler alike
- **ESLint**: a game's `eslint.config.mjs` spreads `roomKitEslint({ ignores })` (`eslint.mjs`) and adds blocks of its own (whoami: `game-logic.js`), with `sharedRules` for them. `ignores` is the config's own: a game skips its copy of the kit's files, the kit only the third-party code among them
