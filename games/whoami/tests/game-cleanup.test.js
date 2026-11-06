// Ghosts: players offline for too long leave the room (the room's timer,
// worker/room.js; tests/room-timers.test.js has when it goes off)

const {
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    removeStaleDisconnectedPlayers
} = require('../game-logic');

const TEN_MINUTES = 10 * 60 * 1000;

// A "ghost" is a player entry nobody controls anymore - typically the same
// person who came back under a NEW player ID (cleared localStorage, messenger
// in-app browser, installed PWA). Ghosts used to stay in the room forever and
// blocked the Start Game button; now the room's timer removes anyone
// disconnected for longer than the timeout (an hour, MAX_DISCONNECTED_MS).
describe('Stale Disconnected Player Cleanup (ghosts)', () => {
    let games;

    beforeEach(() => {
        games = new Map();
    });

    function createGameWithPlayers() {
        const gameId = createGame(games).gameId;
        const p1 = addPlayerToGame(games, gameId, 'Alice', '😀').player;
        const p2 = addPlayerToGame(games, gameId, 'Bob', '😎').player;
        return { gameId, p1, p2 };
    }

    function disconnect(player, msAgo) {
        player.isConnected = false;
        player.disconnectedAt = Date.now() - msAgo;
    }

    test('removes a player disconnected for longer than the timeout', () => {
        const { gameId, p1 } = createGameWithPlayers();
        disconnect(games.get(gameId).players.find(p => p.id === p1.id), TEN_MINUTES + 1000);

        const removals = removeStaleDisconnectedPlayers(games, TEN_MINUTES);

        expect(removals).toHaveLength(1);
        expect(removals[0].removedPlayer.id).toBe(p1.id);
        expect(games.get(gameId).players.map(p => p.id)).toEqual(
            expect.not.arrayContaining([p1.id])
        );
    });

    test('returns everything the player-left broadcast needs', () => {
        const { gameId, p1 } = createGameWithPlayers();
        disconnect(games.get(gameId).players.find(p => p.id === p1.id), TEN_MINUTES + 1000);

        const [removal] = removeStaleDisconnectedPlayers(games, TEN_MINUTES);

        expect(removal.gameId).toBe(gameId);
        expect(removal.playerName).toBe('Alice');
        expect(removal.players).toHaveLength(1);
        expect(removal.characters).toEqual({});
        expect(removal.revealedPlayers).toEqual([]);
        expect(removal.gameDeleted).toBe(false);
    });

    test('keeps connected players and recently disconnected players', () => {
        const { gameId, p1 } = createGameWithPlayers();
        // p1 disconnected just under the limit, p2 still connected
        disconnect(games.get(gameId).players.find(p => p.id === p1.id), TEN_MINUTES - 1000);

        const removals = removeStaleDisconnectedPlayers(games, TEN_MINUTES);

        expect(removals).toEqual([]);
        expect(games.get(gameId).players).toHaveLength(2);
    });

    test('a player without disconnectedAt gets a timestamp instead of being removed', () => {
        // Games restored from disk / recreated from a backup have players
        // marked disconnected but without a timestamp - the first pass only
        // starts the clock, giving them the full timeout to come back
        const { gameId, p1 } = createGameWithPlayers();
        const player = games.get(gameId).players.find(p => p.id === p1.id);
        player.isConnected = false;
        delete player.disconnectedAt;

        expect(removeStaleDisconnectedPlayers(games, TEN_MINUTES)).toEqual([]);
        expect(typeof player.disconnectedAt).toBe('number');

        // ...and once that clock runs out, a later pass removes them
        player.disconnectedAt = Date.now() - (TEN_MINUTES + 1000);
        expect(removeStaleDisconnectedPlayers(games, TEN_MINUTES)).toHaveLength(1);
    });

    test('a ghost removed from a started game can return with the same ID', () => {
        const { gameId, p1, p2 } = createGameWithPlayers();
        assignCharacter(games, gameId, p1.id, 'Batman', p2.id);
        assignCharacter(games, gameId, p2.id, 'Superman', p1.id);
        startGame(games, gameId, p1.id);

        // Spread the same-millisecond test joins into the recent past so
        // the position restore below has a real order to work with
        const base = Date.now();
        const players = games.get(gameId).players;
        players.forEach((player, index) => {
            player.joinedAt = new Date(base - (players.length - index) * 1000);
        });

        disconnect(games.get(gameId).players.find(p => p.id === p1.id), TEN_MINUTES + 1000);
        removeStaleDisconnectedPlayers(games, TEN_MINUTES);
        expect(games.get(gameId).players).toHaveLength(1);

        // Same person, same ID - restored into the started round with
        // their character (via the recentlyLeft snapshot)...
        const rejoin = addPlayerToGame(games, gameId, 'Alice', '😀', p1.id);
        expect(rejoin.success).toBe(true);
        expect(rejoin.game.characters[p1.id].character).toBe('Batman');
        // ...and at their old position in the list, not at the end
        expect(games.get(gameId).players.map(p => p.name)).toEqual(['Alice', 'Bob']);
    });

    test('characters the ghost assigned to other players stay in place', () => {
        const { gameId, p1, p2 } = createGameWithPlayers();
        assignCharacter(games, gameId, p2.id, 'Superman', p1.id); // ghost assigned this

        disconnect(games.get(gameId).players.find(p => p.id === p1.id), TEN_MINUTES + 1000);
        const [removal] = removeStaleDisconnectedPlayers(games, TEN_MINUTES);

        expect(removal.characters[p2.id].character).toBe('Superman');
    });

    test('removing the last player deletes the game', () => {
        const { gameId } = createGameWithPlayers();
        games.get(gameId).players.forEach(p => disconnect(p, TEN_MINUTES + 1000));

        const removals = removeStaleDisconnectedPlayers(games, TEN_MINUTES);

        expect(removals).toHaveLength(2);
        expect(removals[1].gameDeleted).toBe(true);
        expect(games.has(gameId)).toBe(false);
    });

});
