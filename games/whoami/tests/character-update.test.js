// Character Update System Tests
// Tests for the simplified character update architecture

const gameLogic = require('../game-logic');

describe('Simplified Character Update System', () => {
    let games;
    let gameId;
    let playerId1;
    let playerId2;

    beforeEach(() => {
        games = new Map();

        // Create game
        const createResult = gameLogic.createGame(games);
        gameId = createResult.gameId;

        // Add two players
        const player1Result = gameLogic.addPlayerToGame(games, gameId, 'Alice', '😀');
        playerId1 = player1Result.player.id;

        const player2Result = gameLogic.addPlayerToGame(games, gameId, 'Bob', '😎');
        playerId2 = player2Result.player.id;
    });

    describe('Character Assignment and Updates', () => {
        test('assigns character correctly with simplified system', () => {
            const result = gameLogic.assignCharacter(games, gameId, playerId1, 'Albert Einstein', playerId2);

            expect(result.success).toBe(true);
            expect(result.playerId).toBe(playerId1);
            expect(result.character).toBe('Albert Einstein');
            expect(result.assignedBy).toBe(playerId2);

            // Verify character is stored in game state
            const game = games.get(gameId);
            expect(game.characters.get(playerId1)).toEqual(expect.objectContaining({
                character: 'Albert Einstein',
                assignedBy: playerId2,
                assignedAt: expect.any(Date)
            }));
        });

        test('updates character with new simplified approach', () => {
            // Initial character assignment
            gameLogic.assignCharacter(games, gameId, playerId1, 'Einstein', playerId2);

            // Update character (simulating edit)
            const updateResult = gameLogic.assignCharacter(games, gameId, playerId1, 'Newton', playerId2);

            expect(updateResult.success).toBe(true);
            expect(updateResult.character).toBe('Newton');

            // Verify updated character in game state
            const game = games.get(gameId);
            expect(game.characters.get(playerId1).character).toBe('Newton');
        });

        test('handles multiple character assignments without conflicts', () => {
            // Assign character to player 1
            const result1 = gameLogic.assignCharacter(games, gameId, playerId1, 'Batman', playerId2);

            // Assign character to player 2
            const result2 = gameLogic.assignCharacter(games, gameId, playerId2, 'Superman', playerId1);

            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);

            const game = games.get(gameId);
            expect(game.characters.get(playerId1).character).toBe('Batman');
            expect(game.characters.get(playerId2).character).toBe('Superman');
        });

        test('validates player ID exists before assignment', () => {
            const result = gameLogic.assignCharacter(games, gameId, 'invalid-player', 'Batman', playerId1);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Player not found in game');
        });

        test('validates assignedBy player exists', () => {
            const result = gameLogic.assignCharacter(games, gameId, playerId1, 'Batman', 'invalid-assigner');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Assigner not found in game');
        });

        test('prevents self-assignment of characters', () => {
            const result = gameLogic.assignCharacter(games, gameId, playerId1, 'Batman', playerId1);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Cannot assign character to yourself');
        });
    });

    describe('Character State Management', () => {
        test('maintains character state across player reconnections', () => {
            // Assign character
            gameLogic.assignCharacter(games, gameId, playerId1, 'Einstein', playerId2);

            // Simulate player reconnection
            const reconnectResult = gameLogic.addPlayerToGame(games, gameId, 'Alice', '🎯', playerId1);

            expect(reconnectResult.success).toBe(true);
            expect(reconnectResult.isNewPlayer).toBe(false);

            // Character should still be assigned
            const game = games.get(gameId);
            expect(game.characters.get(playerId1)).toEqual(expect.objectContaining({
                character: 'Einstein',
                assignedBy: playerId2,
                assignedAt: expect.any(Date)
            }));
        });

        test('clears character assignments on game restart', () => {
            // Assign characters
            gameLogic.assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
            gameLogic.assignCharacter(games, gameId, playerId2, 'Superman', playerId1);

            // Start game first
            gameLogic.startGame(games, gameId, playerId1);

            // Restart game
            const restartResult = gameLogic.restartGame(games, gameId, playerId1);

            expect(restartResult.success).toBe(true);

            const game = games.get(gameId);
            expect(game.characters.size).toBe(0);
            expect(game.revealedPlayers.size).toBe(0);
            expect(game.state).toBe('waiting');
        });

        test('preserves character assignments during game play', () => {
            // Assign characters to all players
            gameLogic.assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
            gameLogic.assignCharacter(games, gameId, playerId2, 'Superman', playerId1);

            // Start game
            const startResult = gameLogic.startGame(games, gameId, playerId1);
            expect(startResult.success).toBe(true);

            // Characters should be preserved
            const game = games.get(gameId);
            expect(game.characters.get(playerId1).character).toBe('Batman');
            expect(game.characters.get(playerId2).character).toBe('Superman');
        });
    });

    describe('Game State Consistency', () => {
        test('returns consistent game state after character updates', () => {
            const result1 = gameLogic.assignCharacter(games, gameId, playerId1, 'Einstein', playerId2);
            const result2 = gameLogic.assignCharacter(games, gameId, playerId2, 'Newton', playerId1);

            // Both results should include complete character map
            expect(result1.characters).toEqual(expect.objectContaining({
                [playerId1]: expect.objectContaining({
                    character: 'Einstein',
                    assignedBy: playerId2
                })
            }));

            expect(result2.characters).toEqual(expect.objectContaining({
                [playerId1]: expect.objectContaining({
                    character: 'Einstein',
                    assignedBy: playerId2
                }),
                [playerId2]: expect.objectContaining({
                    character: 'Newton',
                    assignedBy: playerId1
                })
            }));
        });

        test('handles rapid sequential character updates', () => {
            // Simulate rapid updates that could cause race conditions
            const update1 = gameLogic.assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
            const update2 = gameLogic.assignCharacter(games, gameId, playerId1, 'Superman', playerId2);
            const update3 = gameLogic.assignCharacter(games, gameId, playerId1, 'Wonder Woman', playerId2);

            expect(update1.success).toBe(true);
            expect(update2.success).toBe(true);
            expect(update3.success).toBe(true);

            // Final state should reflect the last update
            const game = games.get(gameId);
            expect(game.characters.get(playerId1).character).toBe('Wonder Woman');
        });
    });

    describe('Error Handling', () => {
        test('handles invalid game ID gracefully', () => {
            const result = gameLogic.assignCharacter(games, 'INVALID', playerId1, 'Batman', playerId2);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Game not found');
        });

        test('handles empty character name', () => {
            // First assign a character
            gameLogic.assignCharacter(games, gameId, playerId1, 'Batman', playerId2);

            // Then remove it with empty string
            const result = gameLogic.assignCharacter(games, gameId, playerId1, '', playerId2);

            // Should still succeed - empty string is a valid character removal
            expect(result.success).toBe(true);
            expect(result.character).toBe('');

            // Character should be removed from game state
            const game = games.get(gameId);
            expect(game.characters.has(playerId1)).toBe(false);
        });

        test('handles whitespace-only character name', () => {
            // First assign a character
            gameLogic.assignCharacter(games, gameId, playerId1, 'Batman', playerId2);

            // Then remove it with whitespace-only string
            const result = gameLogic.assignCharacter(games, gameId, playerId1, '   ', playerId2);

            // Should still succeed - whitespace-only is also character removal
            expect(result.success).toBe(true);
            expect(result.character).toBe('');

            // Character should be removed from game state
            const game = games.get(gameId);
            expect(game.characters.has(playerId1)).toBe(false);
        });

        test('handles special characters in character names', () => {
            const specialName = 'Albert "The Genius" Einstein & Newton 🧠';
            const result = gameLogic.assignCharacter(games, gameId, playerId1, specialName, playerId2);

            expect(result.success).toBe(true);
            expect(result.character).toBe(specialName);

            const game = games.get(gameId);
            expect(game.characters.get(playerId1).character).toBe(specialName);
        });

        test('truncates character names longer than the limit', () => {
            const longName = 'A'.repeat(200);
            const result = gameLogic.assignCharacter(games, gameId, playerId1, longName, playerId2);

            expect(result.success).toBe(true);
            expect(result.character).toBe('A'.repeat(gameLogic.MAX_CHARACTER_LENGTH));
        });
    });
});