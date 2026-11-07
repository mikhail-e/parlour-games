// The frame of a game's Worker (Cloudflare Workers): what every answer of a
// game gets, whatever the address. The game gives its own addresses (route)
// and its version; the frame answers /api/version, a HEAD as the GET it asks
// about, an address nothing answers with the game's 404 page, and a failure
// with JSON the page can read - and puts the security headers on everything
// but an accepted socket. The static files of public/ are served without the
// Worker: their headers come from the copy of public/_headers.
import SECURITY_HEADERS from './security-headers.json';
import identity from '../shared/identity.js';
import players from '../shared/players.js';
import { forLog } from './game-room.js';

const { generateRoomCode, isValidRoomCode } = identity;
const { isCustomAvatar } = players;

// A copy of the answer with the security headers (public/_headers has their
// reasons and puts them on the static files)
export function withSecurityHeaders(response) {
    const answer = new Response(response.body, response);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        answer.headers.set(name, value);
    }
    return answer;
}

// The game's own page for an address nothing answers (its public/404.html),
// with status 404
export async function notFound(request, env) {
    const page = await env.ASSETS.fetch(new URL('/404', request.url));
    return new Response(page.body, { status: 404, headers: page.headers });
}

// The answer to a request: the version, or the game's route's, or its 404 page.
// The route gets the method a HEAD asks about (fetch below leaves the body out)
async function answer(request, env, route, version) {
    const { pathname } = new URL(request.url);
    const method = request.method === 'HEAD' ? 'GET' : request.method;

    // The running version (the game's package.json): every page shows it at
    // the bottom, and after a deploy it tells which release is live
    if (method === 'GET' && pathname === '/api/version') {
        return Response.json({ version });
    }
    return (await route(request, env, { method, pathname })) || notFound(request, env);
}

// A game's Worker: `export default gameWorker({ route, version })`. route is
// async (request, env, { method, pathname }) => a Response, or nothing for an
// address that is not the game's. Should it fail, the page still gets JSON it
// can read, with the headers, not Cloudflare's error page
export function gameWorker({ route, version }) {
    return {
        async fetch(request, env) {
            let response;
            try {
                response = await answer(request, env, route, version);
            } catch (error) {
                console.error(`Error answering ${request.method} ${new URL(request.url).pathname}:`, error);
                response = Response.json({ success: false }, { status: 500 });
            }
            // An accepted socket is no page: its answer goes back as it is
            if (response.webSocket) return response;
            if (request.method === 'HEAD') response = new Response(null, response);
            return withSecurityHeaders(response);
        },
    };
}

// The addresses of a game with rooms (its rooms: a Durable Object class on
// the kit's GameRoom, bound as ROOMS; its room page: public/game.html).
// A game's Worker passes this as its route, or calls it from its own

// The largest join: a name, a code, two IDs and a photo avatar of up to 32 KB
const MAX_BODY_BYTES = 64 * 1024;
// Codes tried for a new room before giving up; a taken one is rare
const CREATE_ATTEMPTS = 5;

const homeWithError = () => new Response(null, { status: 302, headers: { Location: '/?error=room-not-found' } });

// A new game in a room nobody uses: the room takes it only when it has none
async function createGame(env) {
    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
        const code = generateRoomCode();
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
        avatar: isCustomAvatar(avatar) ? '[photo]' : forLog(avatar)
    });

    if (!gameId || !playerName || !avatar) {
        console.log('Missing required fields:', { gameId: !!gameId, playerName: !!playerName, avatar: !!avatar });
        return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    // A code that is no room code never reaches a room: random addresses
    // would create rooms
    if (!isValidRoomCode(gameId)) {
        return Response.json({ success: false, error: 'Game not found' }, { status: 400 });
    }

    // The room gets the fields of a join and nothing else, each a text or
    // nothing (the players list refuses whatever else was sent): a value
    // nested thousands of levels deep cannot be handed to a room
    const text = value => (typeof value === 'string' ? value : null);
    const answer = await env.ROOMS.getByName(gameId).join({
        gameId, playerName: text(playerName), avatar: text(avatar), playerId: text(playerId), playerSecret: text(body.playerSecret)
    });
    return Response.json(answer.body, { status: answer.status });
}

// A room's link opens the room page, or goes home when there is no such room
async function roomPage(request, env, code) {
    const roomCode = code.toUpperCase();
    if (!isValidRoomCode(roomCode) || !(await env.ROOMS.getByName(roomCode).hasGame())) {
        return homeWithError();
    }
    return env.ASSETS.fetch(new URL('/game.html', request.url));
}

// POST /api/create-game, POST /api/join-game, GET /game/CODE (the room page),
// GET /ws/CODE (the room page's socket); nothing for any other address
export async function roomRoutes(request, env, { method, pathname }) {
    if (method === 'POST' && pathname === '/api/create-game') return createGame(env);
    if (method === 'POST' && pathname === '/api/join-game') return joinGame(request, env);

    const room = pathname.match(/^\/game\/([^/]+)$/);
    if (method === 'GET' && room) return roomPage(request, env, room[1]);

    // A room page's socket goes to its room
    const socket = pathname.match(/^\/ws\/([^/]+)$/);
    if (request.method === 'GET' && socket) {
        const roomCode = socket[1].toUpperCase();
        if (!isValidRoomCode(roomCode)) return new Response('No such room', { status: 400 });
        return env.ROOMS.getByName(roomCode).fetch(request);
    }
    return null;
}
