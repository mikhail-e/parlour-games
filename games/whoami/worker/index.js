// The game's Worker (Cloudflare Workers, wrangler.jsonc). The static files of
// public/ are served without it; it answers the addresses run_worker_first
// sends here, in the kit's frame (packages/room-kit/worker/http.js): the
// version, HEAD, the 404 page, an answer to a failure and the security headers
// on every answer of its own are the frame's, the game's addresses are here
import pkg from '../package.json';
import { gameWorker } from '@parlour-games/room-kit/worker/http.js';
import gameLogic from '../game-logic.js';
import { forLog } from './room.js';

// Each room is a Durable Object of its own (worker/room.js)
export { Room } from './room.js';

// The largest join: a name, a code, two IDs and a photo avatar of up to 32 KB
const MAX_BODY_BYTES = 64 * 1024;
// Codes tried for a new room before giving up; a taken one is rare
const CREATE_ATTEMPTS = 5;

const homeWithError = () => new Response(null, { status: 302, headers: { Location: '/?error=room-not-found' } });

// A new game in a room nobody uses: the room takes it only when it has none
async function createGame(env) {
    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
        const code = gameLogic.generateRoomCode();
        const { success } = await env.ROOMS.getByName(code).create(code);
        if (success) return Response.json({ gameId: code, success: true });
    }
    console.error(`No free room code in ${CREATE_ATTEMPTS} attempts`);
    return Response.json({ success: false }, { status: 503 });
}

// The body of a join, or null when it is too large; what is not JSON is empty.
// A body that says it is too large is not read at all
async function readBody(request) {
    if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return null;
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BODY_BYTES) return null;
    try {
        const body = JSON.parse(new TextDecoder().decode(bytes));
        return (body && typeof body === 'object') ? body : {};
    } catch {
        return {};
    }
}

async function joinGame(request, env) {
    const body = await readBody(request);
    if (!body) return Response.json({ success: false }, { status: 413 });
    const { playerName, avatar, playerId } = body;
    // Codes are upper case; one typed in lower case is the same room
    const gameId = typeof body.gameId === 'string' ? body.gameId.toUpperCase() : '';

    // A photo avatar is a data URL of up to 32 KB: the log gets a mark, not
    // the picture. The secret is never written anywhere but the room's storage
    console.log('Join game request:', {
        gameId: forLog(gameId), playerName: forLog(playerName), playerId: forLog(playerId),
        avatar: gameLogic.isCustomAvatar(avatar) ? '[photo]' : forLog(avatar)
    });

    if (!gameId || !playerName || !avatar) {
        console.log('Missing required fields:', { gameId: !!gameId, playerName: !!playerName, avatar: !!avatar });
        return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    // A code that is no room code never reaches a room: random addresses
    // would create rooms
    if (!gameLogic.isValidRoomCode(gameId)) {
        return Response.json({ success: false, error: 'Game not found' }, { status: 400 });
    }

    // The room gets the fields of a join and nothing else, each a text or
    // nothing (the game refuses whatever else was sent: game-logic.js): a
    // value nested thousands of levels deep cannot be handed to a room
    const text = value => (typeof value === 'string' ? value : null);
    const answer = await env.ROOMS.getByName(gameId).join({
        gameId, playerName: text(playerName), avatar: text(avatar), playerId: text(playerId), playerSecret: text(body.playerSecret)
    });
    return Response.json(answer.body, { status: answer.status });
}

// A room's link opens the room page, or goes home when there is no such room
async function roomPage(request, env, code) {
    const roomCode = code.toUpperCase();
    if (!gameLogic.isValidRoomCode(roomCode) || !(await env.ROOMS.getByName(roomCode).hasGame())) {
        return homeWithError();
    }
    return env.ASSETS.fetch(new URL('/game.html', request.url));
}

// The game's addresses; anything else is the frame's (the version, the 404 page)
async function route(request, env, { method, pathname }) {
    if (method === 'POST' && pathname === '/api/create-game') return createGame(env);
    if (method === 'POST' && pathname === '/api/join-game') return joinGame(request, env);

    const room = pathname.match(/^\/game\/([^/]+)$/);
    if (method === 'GET' && room) return roomPage(request, env, room[1]);

    // A room page's socket goes to its room
    const socket = pathname.match(/^\/ws\/([^/]+)$/);
    if (request.method === 'GET' && socket) {
        const roomCode = socket[1].toUpperCase();
        if (!gameLogic.isValidRoomCode(roomCode)) return new Response('No such room', { status: 400 });
        return env.ROOMS.getByName(roomCode).fetch(request);
    }
    return null;
}

export default gameWorker({ route, version: pkg.version });
