// Joining a started game: a newcomer asks, any player lets them in or
// declines. The rules live in game-logic.js; the pages and the sockets are
// tested in the browser (tests/e2e/late-join.spec.js)
const crypto = require('crypto');
const {
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    removePlayerFromGame,
    restartGame,
    checkPlayerSecret,
    requestToJoin,
    admitPlayer,
    declinePlayer,
    withdrawJoinRequest,
    listJoinRequests,
    gameToStorage,
    gameFromStorage,
} = require('../game-logic');

const uuid = () => crypto.randomUUID();

// A started round of these players: each gives the next one a character
function startedGame(names = ['Alice', 'Bob']) {
    const games = new Map();
    const gameId = createGame(games).gameId;
    const secrets = names.map(() => uuid());
    const players = names.map((name, i) => addPlayerToGame(games, gameId, name, '😀', uuid(), secrets[i]).player);
    players.forEach((player, index) => {
        const next = players[(index + 1) % players.length];
        assignCharacter(games, gameId, next.id, `Character of ${next.name}`, player.id);
    });
    expect(startGame(games, gameId, players[0].id).success).toBe(true);
    return { games, gameId, game: games.get(gameId), players, secrets };
}

describe('Asking to join a started game', () => {
    test('a stranger joining a started game is asked to wait, and nothing changes yet', () => {
        const { games, gameId, game } = startedGame();

        const result = addPlayerToGame(games, gameId, 'Dasha', '🐻', uuid(), uuid());

        expect(result).toEqual({ success: false, waitingForApproval: true });
        expect(game.players).toHaveLength(2);
        expect(game.joinRequests.size).toBe(0);
    });

    test('without a valid ID the started game still refuses', () => {
        const { games, gameId } = startedGame();

        expect(addPlayerToGame(games, gameId, 'Dasha', '🐻').error).toBe('Game has already started');
    });

    test('the request is recorded and listed without the secret', () => {
        const { games, gameId, game } = startedGame();
        const dasha = uuid();

        const result = requestToJoin(games, gameId, 'Dasha', '🐻', dasha, uuid());

        expect(result).toEqual({ success: true, request: { playerId: dasha, name: 'Dasha', avatar: '🐻' } });
        expect(listJoinRequests(game)).toEqual([{ playerId: dasha, name: 'Dasha', avatar: '🐻' }]);
        expect(JSON.stringify(listJoinRequests(game))).not.toMatch(/secret/i);
        expect(game.players).toHaveLength(2);
    });

    test('a second tab of the same browser keeps one request; another browser is refused', () => {
        const { games, gameId, game } = startedGame();
        const dasha = uuid();
        const secret = uuid();
        requestToJoin(games, gameId, 'Dasha', '🐻', dasha, secret);

        expect(requestToJoin(games, gameId, 'Dasha', '🐻', dasha, secret).success).toBe(true);
        expect(game.joinRequests.size).toBe(1);
        expect(requestToJoin(games, gameId, 'Dasha', '🐻', dasha, uuid()).error)
            .toBe('This player is playing in another browser');
    });

    test('the name, the avatar, the ID and the secret are checked', () => {
        const { games, gameId, game } = startedGame();

        expect(requestToJoin(games, gameId, '   ', '🐻', uuid(), uuid()).error).toBe('Invalid player name');
        expect(requestToJoin(games, gameId, 'Dasha', 'x'.repeat(11), uuid(), uuid()).error).toBe('Invalid avatar');
        expect(requestToJoin(games, gameId, 'Dasha', '🐻', 'nope', uuid()).error).toBe('Missing required fields');
        expect(requestToJoin(games, gameId, 'Dasha', '🐻', uuid(), 'nope').error).toBe('Missing required fields');
        expect(requestToJoin(games, 'ZZZZZZ', 'Dasha', '🐻', uuid(), uuid()).error).toBe('Game not found');
        expect(game.joinRequests.size).toBe(0);
    });

    test('whoever may simply join is told to join again instead', () => {
        const { games, gameId, players: [alice, bob] } = startedGame(['Alice', 'Bob', 'Carol']);

        // A player of the room (a reload) and a leaver of this round
        expect(requestToJoin(games, gameId, 'Bob', '😀', bob.id, uuid())).toEqual({ success: false, retryJoin: true });
        removePlayerFromGame(games, gameId, alice.id);
        expect(requestToJoin(games, gameId, 'Alice', '😀', alice.id, uuid())).toEqual({ success: false, retryJoin: true });

        // A lobby is open to everybody
        const lobby = new Map();
        const lobbyId = createGame(lobby).gameId;
        expect(requestToJoin(lobby, lobbyId, 'Dasha', '🐻', uuid(), uuid())).toEqual({ success: false, retryJoin: true });
        expect(games.get(gameId).joinRequests.size).toBe(0);
    });

    test('players and waiting newcomers together are at most 12', () => {
        const names = Array.from({ length: 10 }, (_, i) => `P${i + 1}`);
        const { games, gameId, game } = startedGame(names);
        const first = uuid();
        const firstSecret = uuid();
        requestToJoin(games, gameId, 'N1', '🐻', first, firstSecret);
        requestToJoin(games, gameId, 'N2', '🐻', uuid(), uuid());

        expect(requestToJoin(games, gameId, 'N3', '🐻', uuid(), uuid()).error).toBe('Game is full');
        expect(addPlayerToGame(games, gameId, 'N3', '🐻', uuid(), uuid()).error).toBe('Game is full');
        // A newcomer already waiting is not turned away by their own request
        expect(requestToJoin(games, gameId, 'N1', '🐻', first, firstSecret).success).toBe(true);
        expect(addPlayerToGame(games, gameId, 'N1', '🐻', first, firstSecret).waitingForApproval).toBe(true);
        expect(game.joinRequests.size).toBe(2);
    });

    test('a withdrawn request is gone', () => {
        const { games, gameId, game } = startedGame();
        const dasha = uuid();
        requestToJoin(games, gameId, 'Dasha', '🐻', dasha, uuid());

        expect(withdrawJoinRequest(game, dasha)).toBe(true);
        expect(withdrawJoinRequest(game, dasha)).toBe(false);
        expect(listJoinRequests(game)).toEqual([]);
    });

    // A room sleeps between messages: a request outlives its sleep (the room
    // drops it only once no waiting page of the newcomer is left)
    test('join requests are kept in storage', () => {
        const { games, gameId, game } = startedGame();
        requestToJoin(games, gameId, 'Dasha', '🐻', uuid(), uuid());

        expect(gameFromStorage(JSON.parse(JSON.stringify(gameToStorage(game)))).joinRequests.size).toBe(1);
    });
});

describe('Answering a request', () => {
    // A started round of Alice and Bob, Dasha asking to join
    function withRequest() {
        const setup = startedGame();
        const dasha = { id: uuid(), secret: uuid() };
        requestToJoin(setup.games, setup.gameId, 'Dasha', '🐻', dasha.id, dasha.secret);
        return { ...setup, dasha };
    }

    test('any player lets the newcomer in: last in the list, with a color of their own and their secret', () => {
        const { games, gameId, game, players: [alice, bob], dasha } = withRequest();

        const result = admitPlayer(games, gameId, dasha.id, bob.id);

        expect(result.success).toBe(true);
        expect(result.player).toMatchObject({ id: dasha.id, name: 'Dasha', avatar: '🐻', isConnected: false });
        expect(result.players.map(p => p.id)).toEqual([alice.id, bob.id, dasha.id]);
        expect(result.player.stickerColor).toEqual(expect.any(String));
        expect([alice.stickerColor, bob.stickerColor]).not.toContain(result.player.stickerColor);
        expect(checkPlayerSecret(game, dasha.id, dasha.secret)).toBe(true);
        expect(game.joinRequests.size).toBe(0);
        // No character yet: the round goes on without one for Dasha
        expect(result.characters[dasha.id]).toBeUndefined();
    });

    test('the first answer decides: a second one is refused', () => {
        const { games, gameId, players: [alice, bob], dasha } = withRequest();
        admitPlayer(games, gameId, dasha.id, alice.id);

        expect(admitPlayer(games, gameId, dasha.id, bob.id).error).toBe('This request has already been answered');
        expect(declinePlayer(games, gameId, dasha.id, bob.id).error).toBe('This request has already been answered');
        expect(admitPlayer(games, gameId, uuid(), bob.id).error).toBe('This request has already been answered');
    });

    test('only a player of the room answers', () => {
        const { games, gameId, game, dasha } = withRequest();

        expect(admitPlayer(games, gameId, dasha.id, uuid()).error).toBe('Player not found in game');
        expect(declinePlayer(games, gameId, dasha.id, dasha.id).error).toBe('Player not found in game');
        expect(game.joinRequests.size).toBe(1);
    });

    test('a declined newcomer is not let in', () => {
        const { games, gameId, game, players: [, bob], dasha } = withRequest();

        expect(declinePlayer(games, gameId, dasha.id, bob.id)).toEqual({ success: true, playerName: 'Dasha' });
        expect(game.joinRequests.size).toBe(0);
        expect(game.players).toHaveLength(2);
    });

    test('a restart ends every request', () => {
        const { games, gameId, game, players: [alice], dasha } = withRequest();
        const eve = uuid();
        requestToJoin(games, gameId, 'Eve', '🦊', eve, uuid());

        const result = restartGame(games, gameId, alice.id);

        expect(result.endedJoinRequests).toEqual([dasha.id, eve]);
        expect(game.joinRequests.size).toBe(0);
    });

    test('the room deleted by its last leaver ends the requests; an ordinary leave does not', () => {
        const { games, gameId, players: [alice, bob], dasha } = withRequest();

        expect(removePlayerFromGame(games, gameId, alice.id).endedJoinRequests).toEqual([]);
        const last = removePlayerFromGame(games, gameId, bob.id);
        expect(last.gameDeleted).toBe(true);
        expect(last.endedJoinRequests).toEqual([dasha.id]);
    });

    test('a full room lets nobody else in, not even someone already waiting', () => {
        // 12 players asked to start; one leaves, Dasha asks, the leaver comes back
        const names = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
        const { games, gameId, game, players, secrets } = startedGame(names);
        removePlayerFromGame(games, gameId, players[11].id);
        const dasha = uuid();
        expect(requestToJoin(games, gameId, 'Dasha', '🐻', dasha, uuid()).success).toBe(true);
        expect(addPlayerToGame(games, gameId, 'P12', '😀', players[11].id, secrets[11]).success).toBe(true);

        expect(admitPlayer(games, gameId, dasha, players[0].id).error).toBe('Game is full');
        expect(game.players).toHaveLength(12);
        // The request stays: somebody may leave, and then Dasha can be let in
        expect(game.joinRequests.has(dasha)).toBe(true);
    });

    test('after the start a character goes only to a player who has none, and stays', () => {
        const { games, gameId, players: [alice, bob], dasha } = withRequest();
        admitPlayer(games, gameId, dasha.id, bob.id);
        const locked = 'Cannot change characters after the game has started';

        expect(assignCharacter(games, gameId, dasha.id, '   ', alice.id).error).toBe(locked);
        expect(assignCharacter(games, gameId, dasha.id, 'Gandalf', alice.id).success).toBe(true);
        expect(assignCharacter(games, gameId, dasha.id, 'Frodo', bob.id).error).toBe(locked);
        expect(assignCharacter(games, gameId, alice.id, 'Frodo', dasha.id).error).toBe(locked);
        expect(games.get(gameId).characters.get(dasha.id).character).toBe('Gandalf');
    });
});
