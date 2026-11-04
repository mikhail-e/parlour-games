// A room keeps its own game in its storage (worker/room.js) and takes it back
// when it wakes: everything as it was - the clocks, recentlyLeft, the hashes
// of the secrets, the join requests - with nothing checked or reset

const {
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    removePlayerFromGame,
    requestToJoin,
    markPlayerDisconnected,
    checkPlayerSecret,
    gameToStorage,
    gameFromStorage
} = require('../game-logic');

const [A, B, D] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

test('a game comes back from storage exactly as it was', () => {
    const games = new Map();
    const { gameId } = createGame(games);
    const alice = addPlayerToGame(games, gameId, 'Alice', '🐻', null, A).player;
    const bob = addPlayerToGame(games, gameId, 'Bob', '🦊', null, B).player;
    const carol = addPlayerToGame(games, gameId, 'Carol', '🐼', null, crypto.randomUUID()).player;
    assignCharacter(games, gameId, alice.id, 'Napoleon', bob.id);
    assignCharacter(games, gameId, bob.id, 'Cleopatra', alice.id);
    assignCharacter(games, gameId, carol.id, 'Zorro', alice.id);
    startGame(games, gameId, alice.id);
    removePlayerFromGame(games, gameId, bob.id);                          // recentlyLeft
    requestToJoin(games, gameId, 'Dasha', '🐨', crypto.randomUUID(), D);  // joinRequests
    markPlayerDisconnected(games.get(gameId), carol.id);                  // disconnectedAt
    const game = games.get(gameId);
    // The test is only as good as the game it stores
    expect(game.recentlyLeft.size).toBe(1);
    expect(game.joinRequests.size).toBe(1);
    expect(game.revealedPlayers).toBeInstanceOf(Set);

    const back = gameFromStorage(JSON.parse(JSON.stringify(gameToStorage(game))));

    expect(back).toEqual(game);
    expect(back.created).toBeInstanceOf(Date);
    expect(checkPlayerSecret(back, alice.id, A)).toBe(true);
});

test('createGame takes the room code it is given', () => {
    const games = new Map();
    expect(createGame(games, 'ABC123')).toEqual({ gameId: 'ABC123', success: true });
    expect(games.get('ABC123').players).toEqual([]);
});
