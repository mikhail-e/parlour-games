// When a room's timer goes off (worker/room.js): a room nobody has open goes
// two hours after its last page closed; ghosts go an hour after they left,
// but only while somebody plays - and their hour starts again when the first
// page comes back after a gap

const {
    createGame,
    addPlayerToGame,
    markPlayerConnected,
    markPlayerDisconnected,
    removeStaleDisconnectedPlayers,
    roomAlarmTime,
    restartGhostClocks,
    ROOM_EMPTY_MS,
    MAX_DISCONNECTED_MS
} = require('../game-logic');

// A room with these players; each one online or offline since a given time
function roomWith(players) {
    const games = new Map();
    const { gameId } = createGame(games);
    const game = games.get(gameId);
    for (const { name, offlineSince } of players) {
        const { player } = addPlayerToGame(games, gameId, name, '🐻', null, crypto.randomUUID());
        markPlayerConnected(game, player.id);
        if (offlineSince !== undefined) {
            markPlayerDisconnected(game, player.id);
            player.disconnectedAt = offlineSince;
        }
    }
    return { games, game };
}

test('an empty room is due two hours after its last page closed', () => {
    const { game } = roomWith([{ name: 'Alice', offlineSince: 500 }]);
    expect(ROOM_EMPTY_MS).toBe(2 * 60 * 60 * 1000);
    expect(roomAlarmTime(game, { playerPagesOpen: false, emptySince: 1000 })).toBe(1000 + 2 * 60 * 60 * 1000);
});

test('an empty room without emptySince has no alarm', () => {
    const { game } = roomWith([{ name: 'Alice', offlineSince: 500 }]);
    expect(roomAlarmTime(game, { playerPagesOpen: false, emptySince: null })).toBeNull();
});

test('a room without a game has no alarm', () => {
    expect(roomAlarmTime(undefined, { playerPagesOpen: false, emptySince: 1000 })).toBeNull();
});

test('with a page open, the alarm is the earliest ghost hour', () => {
    const { game } = roomWith([
        { name: 'Alice' },
        { name: 'Bob', offlineSince: 9000 },
        { name: 'Carol', offlineSince: 5000 }
    ]);
    expect(MAX_DISCONNECTED_MS).toBe(60 * 60 * 1000);
    expect(roomAlarmTime(game, { playerPagesOpen: true, emptySince: null })).toBe(5000 + 60 * 60 * 1000 + 1);
});

test('with a page open and everybody online there is no alarm', () => {
    const { game } = roomWith([{ name: 'Alice' }, { name: 'Bob' }]);
    expect(roomAlarmTime(game, { playerPagesOpen: true, emptySince: null })).toBeNull();
});

test('the times can be shortened', () => {
    const { game } = roomWith([{ name: 'Alice' }, { name: 'Bob', offlineSince: 100 }]);
    expect(roomAlarmTime(game, { playerPagesOpen: false, emptySince: 0 }, { emptyRoomMs: 6000 })).toBe(6000);
    expect(roomAlarmTime(game, { playerPagesOpen: true, emptySince: null }, { ghostMs: 3000 })).toBe(3101);
});

test('restartGhostClocks gives every offline player a fresh hour', () => {
    const { games, game } = roomWith([{ name: 'Alice' }, { name: 'Bob', offlineSince: 0 }]);
    const [alice, bob] = game.players;
    const now = Date.now();

    restartGhostClocks(game, now);

    expect(bob.disconnectedAt).toBe(now);
    expect(alice).not.toHaveProperty('disconnectedAt');
    expect(removeStaleDisconnectedPlayers(games)).toEqual([]);
});
