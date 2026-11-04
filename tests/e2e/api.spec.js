// The HTTP API: creating and joining a game, the version, a room link.
// Characters, reveals and the rest of a game travel over the room's socket:
// their rules are tested in game-logic.test.js and through the pages
const crypto = require('crypto');
const { test, expect } = require('./helpers');
const { version } = require('../../package.json');

test.skip(({ isMobile }) => isMobile, 'HTTP only: one browser is enough');

// Every page sends its browser's secret with a join (PLAYER_SECRET in
// utils.js). Here each player name is a browser of its own
const secrets = new Map();
function withSecret(body) {
    if (!secrets.has(body.playerName)) secrets.set(body.playerName, crypto.randomUUID());
    return { playerSecret: secrets.get(body.playerName), ...body };
}

async function createGame(request) {
    const response = await request.post('/api/create-game');
    expect(response.status()).toBe(200);
    return (await response.json()).gameId;
}

async function join(request, body, status = 200) {
    const response = await request.post('/api/join-game', { data: body });
    expect(response.status()).toBe(status);
    return response.json();
}

test('GET /api/version answers the version from package.json', async ({ request }) => {
    const response = await request.get('/api/version');

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ version });
});

test('creates a new game', async ({ request }) => {
    const response = await request.post('/api/create-game');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, gameId: expect.any(String) });
    expect(body.gameId).toMatch(/^[A-Z0-9]{6}$/);
});

test('every new game gets a code of its own', async ({ request }) => {
    const codes = [await createGame(request), await createGame(request), await createGame(request)];

    expect(new Set(codes).size).toBe(3);
});

test('joins a game', async ({ request }) => {
    const gameId = await createGame(request);

    const body = await join(request, withSecret({ gameId, playerName: 'Alice', avatar: '😀' }));

    expect(body).toMatchObject({
        success: true,
        player: { name: 'Alice', avatar: '😀', id: expect.any(String) },
        game: {
            id: gameId,
            players: expect.arrayContaining([expect.objectContaining({ name: 'Alice', avatar: '😀' })])
        }
    });
});

test('a player joining again keeps their ID and takes the new avatar', async ({ request }) => {
    const gameId = await createGame(request);
    const first = await join(request, withSecret({ gameId, playerName: 'Alice', avatar: '😀' }));
    const playerId = first.player.id;

    const second = await join(request, withSecret({ gameId, playerName: 'Alice', avatar: '😎', playerId }));

    expect(second.player.id).toBe(playerId);
    expect(second.player.avatar).toBe('😎');
    expect(second.game.players).toHaveLength(1);
});

test('several players join in the order they came', async ({ request }) => {
    const gameId = await createGame(request);
    await join(request, withSecret({ gameId, playerName: 'Alice', avatar: '😀' }));
    await join(request, withSecret({ gameId, playerName: 'Bob', avatar: '😎' }));

    const body = await join(request, withSecret({ gameId, playerName: 'Charlie', avatar: '🤖' }));

    expect(body.game.players.map(p => p.name)).toEqual(['Alice', 'Bob', 'Charlie']);
});

test('a code that is no room answers Game not found', async ({ request }) => {
    const body = await join(request, withSecret({ gameId: 'INVALID', playerName: 'Alice', avatar: '😀' }), 400);

    expect(body).toMatchObject({ success: false, error: 'Game not found' });
});

test('a thirteenth player finds the game full', async ({ request }) => {
    const gameId = await createGame(request);
    for (let i = 1; i <= 12; i++) {
        await join(request, withSecret({ gameId, playerName: `Player${i}`, avatar: '😀' }));
    }

    const body = await join(request, withSecret({ gameId, playerName: 'Player13', avatar: '😀' }), 400);

    expect(body).toMatchObject({ success: false, error: 'Game is full' });
});

test('a lost room is reported before the secret is asked for', async ({ request }) => {
    const body = await join(request, { gameId: 'GONE00', playerName: 'Alice', avatar: '😀' }, 400);

    expect(body.error).toBe('Game not found');
});

test('a join without a name, an avatar or a code is refused', async ({ request }) => {
    const gameId = await createGame(request);

    await join(request, withSecret({ gameId, avatar: '😀' }), 400);
    await join(request, withSecret({ gameId, playerName: 'Alice' }), 400);
    await join(request, withSecret({ playerName: 'Alice', avatar: '😀' }), 400);
});

test('a player comes back by their ID', async ({ request }) => {
    const gameId = await createGame(request);
    const alice = await join(request, withSecret({ gameId, playerName: 'Alice', avatar: '😀' }));
    await join(request, withSecret({ gameId, playerName: 'Bob', avatar: '😎' }));

    const body = await join(request, withSecret({ gameId, playerName: 'Alice', avatar: '🎯', playerId: alice.player.id }));

    expect(body).toMatchObject({
        success: true,
        isNewPlayer: false,
        player: { id: alice.player.id, name: 'Alice', avatar: '🎯' }
    });
});

test("joining as a player takes that player's secret", async ({ request }) => {
    const gameId = await createGame(request);
    const alice = await join(request, withSecret({ gameId, playerName: 'Alice', avatar: '😀' }));
    const someoneElse = { gameId, playerName: 'Mallory', avatar: '🐍', playerId: alice.player.id };

    const wrongSecret = await join(request, { ...someoneElse, playerSecret: crypto.randomUUID() }, 400);
    const noSecret = await join(request, someoneElse, 400);

    expect(wrongSecret.error).toBe('This player is playing in another browser');
    expect(noSecret.error).toBe('Missing required fields');
});

test('an ID that is no UUID gets a new one', async ({ request }) => {
    const gameId = await createGame(request);

    const body = await join(request, withSecret({ gameId, playerName: 'Charlie', avatar: '🤖', playerId: 'invalid-player-id' }));

    expect(body).toMatchObject({ success: true, isNewPlayer: true, player: { name: 'Charlie', avatar: '🤖' } });
    expect(body.player.id).not.toBe('invalid-player-id');
});

test('a join with no body or an empty one is refused', async ({ request }) => {
    expect((await request.post('/api/join-game')).status()).toBe(400);
    await join(request, withSecret({}), 400);
});

test('a room link that is not a room code goes home', async ({ request }) => {
    const response = await request.get('/game/not-a-code', { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('/?error=room-not-found');
});

test('there is no room recovery from a browser copy', async ({ request }) => {
    const response = await request.post('/api/recreate-game', { data: { roomCode: 'ABC123', gameState: { players: [] } } });

    expect(response.status()).toBe(404);
});
