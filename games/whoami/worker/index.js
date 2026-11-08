// The game's Worker (Cloudflare Workers, wrangler.jsonc). The static files of
// public/ are served without it; it answers the addresses run_worker_first
// sends here, all of them the kit's (packages/room-kit/worker/http.js): the
// frame's - the version, HEAD, the 404 page, an answer to a failure, the
// security headers on every answer of its own - and a game's with rooms:
// creating a room, joining it, its page and its socket
import pkg from '../package.json';
import { gameWorker, roomRoutes } from '@parlour-games/room-kit/worker/http.js';

// Each room is a Durable Object of its own (worker/room.js)
export { Room } from './room.js';

export default gameWorker({ route: roomRoutes, version: pkg.version });
