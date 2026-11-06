# room-kit

The shared kit of the parlour games with rooms in this repository: what every game needs and none of them owns. A game on the kit is still its own app — its own Cloudflare Worker, address, rooms and deploy; the kit is code it takes from one place instead of copying.

The kit knows no game: no event names, no texts of a game, no rules. A game builds on it and adds its own.

## How a game uses it

The kit is an npm workspace package, `@parlour-games/room-kit`, private and never published. A game names it in its `package.json`:

```json
"dependencies": { "@parlour-games/room-kit": "*" }
```

`npm install` at the repository root links it into `node_modules`, and the game imports from it by path:

```js
// eslint.config.mjs of a game
import roomKitEslint, { sharedRules } from "@parlour-games/room-kit/eslint.mjs";
```

The kit has no version of its own: it goes out with the games' releases, and `npm test` at the root checks the kit and every game on it at once.

## Commands

```bash
npm test -w packages/room-kit      # the kit's checks (from the repository root)
npm run lint -w packages/room-kit  # ESLint only
```

`CLAUDE.md` here holds the kit's layout and rules.
