// Duplicate Names Handling Tests
// Tests that players with the same name are treated as different players

const gameLogic = require('../game-logic');

describe('Duplicate Names Handling', () => {
    let games;
    let gameId;

    beforeEach(() => {
        games = new Map();
        const createResult = gameLogic.createGame(games);
        gameId = createResult.gameId;
    });

    test('allows multiple players with the same name as different players', () => {
        // Add first player named "Alice"
        const firstResult = gameLogic.addPlayerToGame(games, gameId, 'Alice', '😀');
        expect(firstResult.success).toBe(true);
        expect(firstResult.isNewPlayer).toBe(true);
        const firstPlayerId = firstResult.player.id;

        // Add second player also named "Alice" - should be treated as different player
        const secondResult = gameLogic.addPlayerToGame(games, gameId, 'Alice', '😎');
        expect(secondResult.success).toBe(true);
        expect(secondResult.isNewPlayer).toBe(true); // Should be new player, not reconnection
        const secondPlayerId = secondResult.player.id;

        // Players should have different IDs
        expect(firstPlayerId).not.toBe(secondPlayerId);

        // Game should have 2 different players
        const game = games.get(gameId);
        expect(game.players).toHaveLength(2);
        expect(game.players[0].name).toBe('Alice');
        expect(game.players[1].name).toBe('Alice');
        expect(game.players[0].id).toBe(firstPlayerId);
        expect(game.players[1].id).toBe(secondPlayerId);
    });

    test('allows reconnection only with correct player ID', () => {
        // Add first player
        const firstResult = gameLogic.addPlayerToGame(games, gameId, 'Alice', '😀');
        const firstPlayerId = firstResult.player.id;

        // Add second player with same name
        const secondResult = gameLogic.addPlayerToGame(games, gameId, 'Alice', '😎');
        const secondPlayerId = secondResult.player.id;

        expect(firstPlayerId).not.toBe(secondPlayerId);

        // Now try to reconnect first player using their ID
        const reconnectResult = gameLogic.addPlayerToGame(games, gameId, 'Alice', '🤖', firstPlayerId);
        expect(reconnectResult.success).toBe(true);
        expect(reconnectResult.isNewPlayer).toBe(false); // Should be reconnection
        expect(reconnectResult.player.id).toBe(firstPlayerId);
        expect(reconnectResult.player.avatar).toBe('🤖'); // Avatar should be updated

        // Game should still have only 2 players
        const game = games.get(gameId);
        expect(game.players).toHaveLength(2);
    });

    test('player reconnection does not match by name alone', () => {
        // Add first player named "Bob"
        const firstResult = gameLogic.addPlayerToGame(games, gameId, 'Bob', '😀');
        const firstPlayerId = firstResult.player.id;

        // Try to "reconnect" with same name but without providing player ID
        // This should create a NEW player, not reconnect to existing one
        const fakeReconnectResult = gameLogic.addPlayerToGame(games, gameId, 'Bob', '😎');
        expect(fakeReconnectResult.success).toBe(true);
        expect(fakeReconnectResult.isNewPlayer).toBe(true); // Should be NEW player
        expect(fakeReconnectResult.player.id).not.toBe(firstPlayerId); // Different ID

        // Game should have 2 different players both named "Bob"
        const game = games.get(gameId);
        expect(game.players).toHaveLength(2);
        expect(game.players[0].name).toBe('Bob');
        expect(game.players[1].name).toBe('Bob');
        expect(game.players[0].id).not.toBe(game.players[1].id);
    });

    test('handles many players with same name', () => {
        const playerIds = [];

        // Add 5 players all named "Player"
        for (let i = 0; i < 5; i++) {
            const result = gameLogic.addPlayerToGame(games, gameId, 'Player', `😀`);
            expect(result.success).toBe(true);
            expect(result.isNewPlayer).toBe(true);
            playerIds.push(result.player.id);
        }

        // All players should have unique IDs
        const uniqueIds = new Set(playerIds);
        expect(uniqueIds.size).toBe(5);

        // Game should have 5 players
        const game = games.get(gameId);
        expect(game.players).toHaveLength(5);

        // All players should have the same name
        game.players.forEach(player => {
            expect(player.name).toBe('Player');
        });
    });

    test('character assignment works correctly with duplicate names', () => {
        // Add two players with same name
        const firstResult = gameLogic.addPlayerToGame(games, gameId, 'Alice', '😀');
        const secondResult = gameLogic.addPlayerToGame(games, gameId, 'Alice', '😎');

        const firstPlayerId = firstResult.player.id;
        const secondPlayerId = secondResult.player.id;

        // Assign characters using player IDs (not names)
        const assignResult1 = gameLogic.assignCharacter(games, gameId, firstPlayerId, 'Batman', secondPlayerId);
        const assignResult2 = gameLogic.assignCharacter(games, gameId, secondPlayerId, 'Superman', firstPlayerId);

        expect(assignResult1.success).toBe(true);
        expect(assignResult2.success).toBe(true);

        // Check characters are assigned to correct players by ID
        const game = games.get(gameId);
        expect(game.characters.get(firstPlayerId).character).toBe('Batman');
        expect(game.characters.get(secondPlayerId).character).toBe('Superman');
    });
});