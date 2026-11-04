// The game's Worker (Cloudflare Workers, wrangler.jsonc). The static files of
// public/ are served without it; it answers the addresses run_worker_first
// sends here, and puts the security headers on every answer of its own
import pkg from '../package.json';
import gameLogic from '../game-logic.js';
import { forLog } from './room.js';
import SECURITY_HEADERS from './security-headers.json';

// Each room is a Durable Object of its own (worker/room.js)
export { Room } from './room.js';

// The largest join: a name, a code, two IDs and a photo avatar of up to 32 KB
const MAX_BODY_BYTES = 64 * 1024;
// Codes tried for a new room before giving up; a taken one is rare
const CREATE_ATTEMPTS = 5;

// A copy of the answer with the security headers (public/_headers has their
// reasons and puts them on the static files)
export function withSecurityHeaders(response) {
    const answer = new Response(response.body, response);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        answer.headers.set(name, value);
    }
    return answer;
}

// The game's own page for an address nothing answers, with status 404
export async function notFound(request, env) {
    const page = await env.ASSETS.fetch(new URL('/404', request.url));
    return new Response(page.body, { status: 404, headers: page.headers });
}

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

// The body of a join, or null when it is too large; what is not JSON is empty
async function readBody(request) {
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

    const answer = await env.ROOMS.getByName(gameId).join({ ...body, gameId });
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

async function route(request, env) {
    const { pathname } = new URL(request.url);
    const { method } = request;

    // The running version: every page shows it at the bottom, and after a
    // deploy it tells which release is live
    if (method === 'GET' && pathname === '/api/version') {
        return Response.json({ version: pkg.version });
    }
    if (method === 'POST' && pathname === '/api/create-game') return createGame(env);
    if (method === 'POST' && pathname === '/api/join-game') return joinGame(request, env);

    const room = pathname.match(/^\/game\/([^/]+)$/);
    if (method === 'GET' && room) return roomPage(request, env, room[1]);

    return notFound(request, env);
}

export default {
    async fetch(request, env) {
        return withSecurityHeaders(await route(request, env));
    },
};
