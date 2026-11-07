// A player's secret (PLAYER_SECRET, the kit's app.js) proves that a browser IS the
// player with that ID. The ID is public - every page in a room sees the
// players list - so without the secret anybody could act in a player's name.
// The server records the secret on the first join and never sends it to a page.

const {
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    removePlayerFromGame,
    checkPlayerSecret,
    serializeGame,
    gameToStorage,
    gameFromStorage
} = require('../game-logic');

const ALICE = '00000000-0000-4000-8000-0000000000a1';
const ALICE_SECRET = '00000000-0000-4000-8000-00000000a5ec';
const OTHER_SECRET = '00000000-0000-4000-8000-0000000bad00';

describe("A player's secret", () => {
    let games, gameId;

    beforeEach(() => {
        games = new Map();
        gameId = createGame(games).gameId;
        addPlayerToGame(games, gameId, 'Alice', '😀', ALICE, ALICE_SECRET);
    });

    test('joining again as the player takes the same secret', () => {
        expect(addPlayerToGame(games, gameId, 'Alice', '😀', ALICE, ALICE_SECRET).success).toBe(true);

        const impostor = addPlayerToGame(games, gameId, 'Alice', '🐍', ALICE, OTHER_SECRET);
        const noSecret = addPlayerToGame(games, gameId, 'Alice', '🐍', ALICE);

        expect(impostor).toEqual({ success: false, error: 'This player is playing in another browser' });
        expect(noSecret.success).toBe(false);
        // Nothing of Alice changed
        expect(games.get(gameId).players[0].avatar).toBe('😀');
    });

    test('checkPlayerSecret answers only for the right secret of a player of the room', () => {
        const game = games.get(gameId);

        expect(checkPlayerSecret(game, ALICE, ALICE_SECRET)).toBe(true);
        expect(checkPlayerSecret(game, ALICE, OTHER_SECRET)).toBe(false);
        expect(checkPlayerSecret(game, ALICE, undefined)).toBe(false);
        expect(checkPlayerSecret(game, '00000000-0000-4000-8000-00000000b0b0', ALICE_SECRET)).toBe(false);
    });

    test('no page ever gets a secret', () => {
        const bob = addPlayerToGame(games, gameId, 'Bob', '😎', null, OTHER_SECRET);

        expect(JSON.stringify(bob)).not.toContain(OTHER_SECRET);
        expect(JSON.stringify(bob)).not.toContain(ALICE_SECRET);
        expect(JSON.stringify(serializeGame(games.get(gameId)))).not.toContain(ALICE_SECRET);
    });

    test("the room's storage keeps the secrets as hashes, and the room still checks them after a sleep", () => {
        const stored = JSON.parse(JSON.stringify(gameToStorage(games.get(gameId))));
        const woken = gameFromStorage(stored);

        // A browser uses one secret in every room: the storage never holds it
        expect(JSON.stringify(stored)).not.toContain(ALICE_SECRET);
        expect(checkPlayerSecret(woken, ALICE, ALICE_SECRET)).toBe(true);
        expect(checkPlayerSecret(woken, ALICE, OTHER_SECRET)).toBe(false);
    });

    test('a leaver returns to the started round only with their own secret', () => {
        const bob = addPlayerToGame(games, gameId, 'Bob', '😎', null, OTHER_SECRET).player;
        assignCharacter(games, gameId, ALICE, 'Batman', bob.id);
        assignCharacter(games, gameId, bob.id, 'Superman', ALICE);
        startGame(games, gameId, ALICE);
        removePlayerFromGame(games, gameId, ALICE);

        const impostor = addPlayerToGame(games, gameId, 'Alice', '🐍', ALICE, OTHER_SECRET);
        const alice = addPlayerToGame(games, gameId, 'Alice', '😀', ALICE, ALICE_SECRET);

        expect(impostor.success).toBe(false);
        expect(alice.success).toBe(true);
        expect(games.get(gameId).characters.get(ALICE).character).toBe('Batman');
    });


});
