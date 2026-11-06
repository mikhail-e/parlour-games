// Who am I? Game - Timeout Protection Tests
// Player connection state: a reconnecting player keeps everything they had
// (the room's own storage is tested in room-storage.test.js)

const {
    createGame,
    addPlayerToGame,
    assignCharacter,
    markPlayerConnected,
    markPlayerDisconnected,
    removeStaleDisconnectedPlayers
} = require('../game-logic');

describe('Timeout Protection System', () => {
    let games;
    let gameId;

    beforeEach(() => {
        games = new Map();
        const createResult = createGame(games);
        gameId = createResult.gameId;
    });

    describe('Player Connection State Management', () => {
        test('a new player is online only once their page connects', () => {
            const result = addPlayerToGame(games, gameId, 'Alice', '😀');
            const game = games.get(gameId);

            expect(result.success).toBe(true);
            expect(result.player.joinedAt).toBeDefined();
            // Joined, but the room page has not connected yet: the ghost clock runs
            expect(result.player.isConnected).toBe(false);
            expect(typeof result.player.disconnectedAt).toBe('number');

            markPlayerConnected(game, result.player.id);

            expect(result.player.isConnected).toBe(true);
            expect(result.player.disconnectedAt).toBeUndefined();
        });

        test('a player whose page never connects becomes a ghost', () => {
            const { player } = addPlayerToGame(games, gameId, 'Alice', '😀');
            player.disconnectedAt = Date.now() - (61 * 60 * 1000);

            const removals = removeStaleDisconnectedPlayers(games);

            expect(removals.map(removal => removal.removedPlayer.id)).toEqual([player.id]);
        });

        test('a player offline for under an hour stays in the room', () => {
            // A phone asleep through a break: the player is still on everyone's list
            const { player } = addPlayerToGame(games, gameId, 'Alice', '😀');
            const game = games.get(gameId);
            markPlayerConnected(game, player.id);
            markPlayerDisconnected(game, player.id);
            player.disconnectedAt = Date.now() - (59 * 60 * 1000);

            expect(removeStaleDisconnectedPlayers(games)).toEqual([]);
            expect(game.players.map(p => p.id)).toEqual([player.id]);
        });

        test('rejoining while offline restarts the ghost clock', () => {
            const { player } = addPlayerToGame(games, gameId, 'Alice', '😀');
            const game = games.get(gameId);
            markPlayerConnected(game, player.id);
            markPlayerDisconnected(game, player.id);
            player.disconnectedAt = Date.now() - (9 * 60 * 1000);

            const reconnectResult = addPlayerToGame(games, gameId, 'Alice', '😀', player.id);

            expect(reconnectResult.isNewPlayer).toBe(false);
            expect(Date.now() - reconnectResult.player.disconnectedAt).toBeLessThan(1000);
        });

        test('connect and disconnect mark the player and nobody else', () => {
            const alice = addPlayerToGame(games, gameId, 'Alice', '😀').player;
            const bob = addPlayerToGame(games, gameId, 'Bob', '😎').player;
            const game = games.get(gameId);
            markPlayerConnected(game, alice.id);
            markPlayerConnected(game, bob.id);

            expect(markPlayerDisconnected(game, alice.id)).toBe(alice);

            expect(alice.isConnected).toBe(false);
            expect(typeof alice.disconnectedAt).toBe('number');
            expect(bob.isConnected).toBe(true);
            expect(markPlayerConnected(game, 'someone-else')).toBeNull();
        });

        test('should preserve player data during reconnection', () => {
            // Add two players (one to assign character to the other)
            const playerResult = addPlayerToGame(games, gameId, 'Alice', '😀');
            const assignerResult = addPlayerToGame(games, gameId, 'Bob', '😎');
            const playerId = playerResult.player.id;
            const assignerId = assignerResult.player.id;
            const originalColor = playerResult.player.stickerColor;

            const assignResult = assignCharacter(games, gameId, playerId, 'Secret Agent', assignerId);
            expect(assignResult.success).toBe(true);

            // Simulate reconnection
            const reconnectResult = addPlayerToGame(games, gameId, 'Alice', '🤖', playerId);

            expect(reconnectResult.success).toBe(true);
            expect(reconnectResult.player.id).toBe(playerId);
            expect(reconnectResult.player.stickerColor).toBe(originalColor);
            expect(reconnectResult.player.avatar).toBe('🤖'); // Avatar can be updated

            // Character should be preserved
            const game = games.get(gameId);
            const characterData = game.characters.get(playerId);
            expect(characterData.character).toBe('Secret Agent');
            expect(characterData.assignedBy).toBe(assignerId);
        });
    });
});
