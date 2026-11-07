// The players list of shared/players.js on a game that keeps nothing of its
// own (no hooks): what every game on the kit gets. A game's own tests check
// its hooks (whoami: characters, colors, reveals)
const {
    roomPlayers,
    requestToJoin,
    withdrawJoinRequest,
    listJoinRequests,
    checkPlayerSecret,
    markPlayerConnected,
    markPlayerDisconnected,
    restartGhostClocks,
    roomAlarmTime,
    gameToStorage,
    gameFromStorage,
    sanitizePlayerName,
    sanitizeAvatar,
    isCustomAvatar,
    MAX_PLAYERS,
    MAX_NAME_LENGTH,
    MAX_CUSTOM_AVATAR_LENGTH,
    ROOM_EMPTY_MS,
    MAX_DISCONNECTED_MS
} = require('../shared/players');

const { createGame, addPlayerToGame, removePlayerFromGame, removeStaleDisconnectedPlayers } = roomPlayers();

const ID = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SECRET = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;

let games;
let gameId;
let game;

// Each join a millisecond after the last: the list's order is the order of
// first joins, and a returning leaver's place depends on it
beforeEach(() => {
    jest.useFakeTimers({ now: 1_000_000 });
    games = new Map();
    gameId = createGame(games, 'ABC123').gameId;
    game = games.get(gameId);
});

afterEach(() => {
    jest.useRealTimers();
});

const join = (n, name = `Player ${n}`, secret = SECRET(n)) => {
    jest.advanceTimersByTime(1);
    return addPlayerToGame(games, gameId, name, '🎭', ID(n), secret);
};

describe('a new game', () => {
    test('takes the room code given, in the lobby, with nobody in it', () => {
        expect(gameId).toBe('ABC123');
        expect(game).toMatchObject({ id: 'ABC123', players: [], state: 'waiting' });
        expect(game.recentlyLeft).toBeInstanceOf(Map);
        expect(game.secrets).toBeInstanceOf(Map);
        expect(game.joinRequests).toBeInstanceOf(Map);
        expect(game.created).toBeInstanceOf(Date);
    });

    test('without a code gets a free one of its own', () => {
        const other = createGame(games).gameId;
        expect(other).toMatch(/^[A-Z0-9]{6}$/);
        expect(other).not.toBe('ABC123');
    });

    test("carries the game's own fields", () => {
        const withFields = roomPlayers({ fields: () => ({ round: null }) });
        const id = withFields.createGame(games, 'XYZ789').gameId;
        expect(games.get(id)).toHaveProperty('round', null);
    });
});

describe('joining', () => {
    test('a player joins offline, until their page connects', () => {
        const result = join(1, 'Ann');
        expect(result).toMatchObject({ success: true, isNewPlayer: true, game: { id: 'ABC123', state: 'waiting' } });
        expect(result.player).toMatchObject({ id: ID(1), name: 'Ann', avatar: '🎭', isConnected: false });
        expect(game.players).toHaveLength(1);
        expect(checkPlayerSecret(game, ID(1), SECRET(1))).toBe(true);
    });

    test('the secret is kept as a hash, never as it is', () => {
        join(1);
        expect(game.secrets.get(ID(1))).not.toBe(SECRET(1));
        expect(JSON.stringify(gameToStorage(game))).not.toContain(SECRET(1));
    });

    test('a reload is the same player, not a new one', () => {
        join(1, 'Ann');
        const again = join(1, 'Ann');
        expect(again).toMatchObject({ success: true, isNewPlayer: false });
        expect(game.players).toHaveLength(1);
    });

    test("another browser cannot take a player's place", () => {
        join(1, 'Ann');
        const stranger = join(1, 'Ann', SECRET(99));
        expect(stranger).toEqual({ success: false, error: 'This player is playing in another browser' });
        expect(checkPlayerSecret(game, ID(1), SECRET(99))).toBe(false);
    });

    test('the same name twice is two players', () => {
        join(1, 'Ann');
        join(2, 'Ann');
        expect(game.players.map(p => p.name)).toEqual(['Ann', 'Ann']);
    });

    test('a name and an avatar are checked', () => {
        expect(addPlayerToGame(games, gameId, '   ', '🎭', ID(1), SECRET(1))).toEqual({ success: false, error: 'Invalid player name' });
        expect(addPlayerToGame(games, gameId, 'Ann', 'not an emoji at all', ID(1), SECRET(1))).toEqual({ success: false, error: 'Invalid avatar' });
        expect(addPlayerToGame(games, 'NOPE00', 'Ann', '🎭', ID(1), SECRET(1))).toEqual({ success: false, error: 'Game not found' });
    });

    test('the room is full at twelve', () => {
        for (let n = 1; n <= MAX_PLAYERS; n++) expect(join(n).success).toBe(true);
        expect(join(MAX_PLAYERS + 1)).toEqual({ success: false, error: 'Game is full' });
        expect(join(1).success).toBe(true); // a player of the room comes back
    });

    test('the list keeps the order players first joined in', () => {
        join(1, 'Ann');
        join(2, 'Bob');
        join(1, 'Ann');
        expect(game.players.map(p => p.name)).toEqual(['Ann', 'Bob']);
    });
});

describe('leaving', () => {
    beforeEach(() => {
        join(1, 'Ann');
        join(2, 'Bob');
        join(3, 'Cat');
    });

    test('a leaver of the lobby is gone and may join as anybody does', () => {
        const result = removePlayerFromGame(games, gameId, ID(2));
        expect(result).toMatchObject({ success: true, removedPlayer: { id: ID(2), name: 'Bob' }, gameDeleted: false });
        expect(game.recentlyLeft.size).toBe(0);
        expect(game.secrets.has(ID(2))).toBe(false);
        expect(join(2, 'Bob').isNewPlayer).toBe(true);
        expect(game.players.map(p => p.name)).toEqual(['Ann', 'Cat', 'Bob']);
    });

    test('a leaver of a round comes back to their place, with the same browser only', () => {
        game.state = 'started';
        removePlayerFromGame(games, gameId, ID(2));
        expect(game.recentlyLeft.has(ID(2))).toBe(true);

        expect(join(2, 'Bob', SECRET(99))).toEqual({ success: false, error: 'This player is playing in another browser' });
        expect(join(2, 'Bob')).toMatchObject({ success: true, isNewPlayer: true });
        expect(game.players.map(p => p.name)).toEqual(['Ann', 'Bob', 'Cat']);
        expect(game.recentlyLeft.has(ID(2))).toBe(false);
    });

    test('a newcomer to a round waits; one without a valid ID is turned away', () => {
        game.state = 'started';
        expect(join(4)).toEqual({ success: false, waitingForApproval: true });
        expect(addPlayerToGame(games, gameId, 'Dan', '🎭', 'not-an-id', SECRET(4))).toEqual({ success: false, error: 'Game has already started' });
        expect(game.players).toHaveLength(3);
    });

    test('the last one out takes the game with them', () => {
        removePlayerFromGame(games, gameId, ID(1));
        removePlayerFromGame(games, gameId, ID(2));
        const last = removePlayerFromGame(games, gameId, ID(3));
        expect(last.gameDeleted).toBe(true);
        expect(games.has(gameId)).toBe(false);
    });

    test('a player not in the game cannot leave it', () => {
        expect(removePlayerFromGame(games, gameId, ID(9))).toEqual({ success: false, error: 'Player not found in game' });
    });
});

describe("the game's hooks", () => {
    test('a leaver of a round takes what the game keeps of them, and gets it back', () => {
        const kept = new Map();
        const hooks = roomPlayers({
            newPlayer: () => ({ seat: 'new' }),
            snapshot: (_game, player) => ({ seat: player.seat }),
            restore: (_game, player, snapshot) => { player.seat = snapshot.seat; },
            forget: (_game, playerId) => kept.set(playerId, 'forgotten'),
            view: g => ({ count: g.players.length })
        });
        const id = hooks.createGame(games, 'HOOKED').gameId;
        const hooked = games.get(id);
        const first = hooks.addPlayerToGame(games, id, 'Ann', '🎭', ID(1), SECRET(1));
        expect(first.game.count).toBe(1);
        jest.advanceTimersByTime(1);
        hooks.addPlayerToGame(games, id, 'Bob', '🎭', ID(2), SECRET(2));
        hooked.players[0].seat = 'first';
        hooked.state = 'started';

        const left = hooks.removePlayerFromGame(games, id, ID(1));
        expect(left.count).toBe(1);
        expect(kept.get(ID(1))).toBe('forgotten');
        expect(hooked.recentlyLeft.get(ID(1))).toMatchObject({ seat: 'first' });

        hooks.addPlayerToGame(games, id, 'Ann', '🎭', ID(1), SECRET(1));
        expect(hooked.players[0]).toMatchObject({ id: ID(1), seat: 'first' });
    });
});

describe('online, offline and ghosts', () => {
    beforeEach(() => {
        join(1, 'Ann');
        join(2, 'Bob');
    });

    test('a page connects and goes away', () => {
        expect(markPlayerConnected(game, ID(1))).toMatchObject({ isConnected: true });
        expect(game.players[0].disconnectedAt).toBeUndefined();
        expect(markPlayerDisconnected(game, ID(1))).toMatchObject({ isConnected: false });
        expect(game.players[0].disconnectedAt).toEqual(expect.any(Number));
        expect(markPlayerConnected(game, ID(9))).toBeNull();
        expect(markPlayerDisconnected(game, ID(9))).toBeNull();
    });

    test('a player offline for over the ghost time is removed, and may come back', () => {
        markPlayerConnected(game, ID(1));
        game.players[1].disconnectedAt = Date.now() - MAX_DISCONNECTED_MS - 1;
        const removals = removeStaleDisconnectedPlayers(games);
        expect(removals).toEqual([expect.objectContaining({ playerName: 'Bob', removedPlayer: { id: ID(2), name: 'Bob' } })]);
        expect(game.players.map(p => p.name)).toEqual(['Ann']);
        expect(join(2, 'Bob').success).toBe(true);
    });

    test('a player offline for less is kept; one without a clock gets one', () => {
        game.players[1].disconnectedAt = Date.now() - MAX_DISCONNECTED_MS + 60_000;
        delete game.players[0].disconnectedAt;
        expect(removeStaleDisconnectedPlayers(games)).toEqual([]);
        expect(game.players[0].disconnectedAt).toEqual(expect.any(Number));
    });

    test('a reload of an offline player starts their clock again', () => {
        game.players[1].disconnectedAt = 1;
        join(2, 'Bob');
        expect(game.players[1].disconnectedAt).toBe(Date.now());
    });

    test('the first page back after a gap gives every offline player a fresh clock', () => {
        markPlayerConnected(game, ID(1));
        game.players[1].disconnectedAt = 1;
        restartGhostClocks(game, 5000);
        expect(game.players[1].disconnectedAt).toBe(5000);
        expect(game.players[0].disconnectedAt).toBeUndefined();
    });
});

describe("the room's timer", () => {
    beforeEach(() => {
        join(1, 'Ann');
        join(2, 'Bob');
        markPlayerConnected(game, ID(1));
    });

    test('with no page open, the room goes after its empty time', () => {
        expect(roomAlarmTime(game, { playerPagesOpen: false, emptySince: 1000 })).toBe(1000 + ROOM_EMPTY_MS);
        expect(roomAlarmTime(game, { playerPagesOpen: false, emptySince: null })).toBeNull();
        expect(roomAlarmTime(game, { playerPagesOpen: false, emptySince: 1000 }, { emptyRoomMs: 5 })).toBe(1005);
    });

    test('with a page open, the earliest ghost is due', () => {
        game.players[1].disconnectedAt = 2000;
        expect(roomAlarmTime(game, { playerPagesOpen: true, emptySince: null })).toBe(2000 + MAX_DISCONNECTED_MS + 1);
        expect(roomAlarmTime(game, { playerPagesOpen: true, emptySince: null }, { ghostMs: 10 })).toBe(2011);
    });

    test('nobody offline, no game: no timer', () => {
        markPlayerConnected(game, ID(2));
        expect(roomAlarmTime(game, { playerPagesOpen: true, emptySince: null })).toBeNull();
        expect(roomAlarmTime(null, { playerPagesOpen: false, emptySince: 1000 })).toBeNull();
    });
});

describe('newcomers waiting for a round', () => {
    const ask = (n, secret = SECRET(n)) => requestToJoin(games, gameId, `New ${n}`, '🎭', ID(n), secret);

    beforeEach(() => {
        join(1, 'Ann');
        join(2, 'Bob');
        game.state = 'started';
    });

    test('a newcomer asks once per browser, in order', () => {
        expect(ask(3)).toEqual({ success: true, request: { playerId: ID(3), name: 'New 3', avatar: '🎭' } });
        expect(ask(3).success).toBe(true);
        expect(ask(4).success).toBe(true);
        expect(listJoinRequests(game)).toEqual([
            { playerId: ID(3), name: 'New 3', avatar: '🎭' },
            { playerId: ID(4), name: 'New 4', avatar: '🎭' }
        ]);
        expect(ask(3, SECRET(99))).toEqual({ success: false, error: 'This player is playing in another browser' });
    });

    test('whoever may simply join is told to join again', () => {
        expect(ask(1)).toEqual({ success: false, retryJoin: true });
        game.state = 'waiting';
        expect(ask(3)).toEqual({ success: false, retryJoin: true });
    });

    test('a request needs an ID, a secret, a name and an avatar', () => {
        expect(requestToJoin(games, gameId, 'New', '🎭', 'bad', SECRET(3))).toEqual({ success: false, error: 'Missing required fields' });
        expect(requestToJoin(games, gameId, 'New', '🎭', ID(3), 'bad')).toEqual({ success: false, error: 'Missing required fields' });
        expect(requestToJoin(games, gameId, '', '🎭', ID(3), SECRET(3))).toEqual({ success: false, error: 'Invalid player name' });
        expect(requestToJoin(games, gameId, 'New', '', ID(3), SECRET(3))).toEqual({ success: false, error: 'Invalid avatar' });
        expect(requestToJoin(games, 'NOPE00', 'New', '🎭', ID(3), SECRET(3))).toEqual({ success: false, error: 'Game not found' });
    });

    test('players and waiting newcomers together fill the room', () => {
        for (let n = 3; n <= MAX_PLAYERS; n++) expect(ask(n).success).toBe(true);
        expect(ask(MAX_PLAYERS + 1)).toEqual({ success: false, error: 'Game is full' });
        expect(join(MAX_PLAYERS + 1)).toEqual({ success: false, error: 'Game is full' });
        expect(ask(3).success).toBe(true); // already waiting
    });

    test('a newcomer who goes away withdraws', () => {
        ask(3);
        expect(withdrawJoinRequest(game, ID(3))).toBe(true);
        expect(withdrawJoinRequest(game, ID(3))).toBe(false);
        expect(listJoinRequests(game)).toEqual([]);
    });

    test('the last player out ends the requests', () => {
        ask(3);
        removePlayerFromGame(games, gameId, ID(1));
        const last = removePlayerFromGame(games, gameId, ID(2));
        expect(last.endedJoinRequests).toEqual([ID(3)]);
    });
});

describe("the room's storage", () => {
    test('a game goes to storage and comes back the same', () => {
        join(1, 'Ann');
        join(2, 'Bob');
        game.state = 'started';
        removePlayerFromGame(games, gameId, ID(2));
        requestToJoin(games, gameId, 'Cat', '🎭', ID(3), SECRET(3));
        game.extra = { set: new Set([1, 2]), when: new Date(5) };

        const stored = JSON.parse(JSON.stringify(gameToStorage(game)));
        const loaded = gameFromStorage(stored);
        expect(loaded).toEqual(game);
        expect(loaded.recentlyLeft).toBeInstanceOf(Map);
        expect(loaded.extra.set).toBeInstanceOf(Set);
        expect(loaded.extra.when).toBeInstanceOf(Date);

        // The loaded game goes on: the leaver comes back, the newcomer waits
        games.set(gameId, loaded);
        expect(join(2, 'Bob').success).toBe(true);
        expect(listJoinRequests(loaded)).toEqual([{ playerId: ID(3), name: 'Cat', avatar: '🎭' }]);
    });
});

describe('the limits of a name and an avatar', () => {
    test('a name is trimmed and counted by character', () => {
        expect(sanitizePlayerName('  Ann  ')).toBe('Ann');
        expect(sanitizePlayerName('😀'.repeat(MAX_NAME_LENGTH))).toBe('😀'.repeat(MAX_NAME_LENGTH));
        expect(sanitizePlayerName('a'.repeat(MAX_NAME_LENGTH + 1))).toBeNull();
        expect(sanitizePlayerName(42)).toBeNull();
    });

    test('an avatar is an emoji or a small photo of a safe kind', () => {
        expect(sanitizeAvatar(' 🎭 ')).toBe('🎭');
        expect(sanitizeAvatar('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
        expect(isCustomAvatar('data:text/html;base64,AAAA')).toBe(false);
        expect(isCustomAvatar('data:image/png;base64,' + 'A'.repeat(MAX_CUSTOM_AVATAR_LENGTH))).toBe(false);
        expect(sanitizeAvatar('javascript:alert(1)')).toBeNull();
    });
});
