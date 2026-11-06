// Who am I? Game - Character Editing Race Condition Tests
// Tests for simultaneous character editing scenarios

const {
    createGame,
    addPlayerToGame,
    assignCharacter
} = require('../game-logic');

describe('Character Editing Race Conditions', () => {
    let games;
    let gameId;
    let player1Id;
    let player2Id;
    let player3Id;

    beforeEach(() => {
        games = new Map();
        const createResult = createGame(games);
        gameId = createResult.gameId;

        // Add three players for more complex scenarios
        const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
        const player2Result = addPlayerToGame(games, gameId, 'Bob', '😎');
        const player3Result = addPlayerToGame(games, gameId, 'Charlie', '🤖');

        player1Id = player1Result.player.id;
        player2Id = player2Result.player.id;
        player3Id = player3Result.player.id;
    });

    test('backend handles rapid sequential character assignments correctly', () => {
        // Simulate rapid character assignments from different players
        const result1 = assignCharacter(games, gameId, player1Id, 'Batman', player2Id);
        const result2 = assignCharacter(games, gameId, player2Id, 'Superman', player1Id);
        const result3 = assignCharacter(games, gameId, player3Id, 'Wonder Woman', player1Id);

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        expect(result3.success).toBe(true);

        // Verify all characters are properly stored
        const game = games.get(gameId);
        expect(game.characters.get(player1Id).character).toBe('Batman');
        expect(game.characters.get(player2Id).character).toBe('Superman');
        expect(game.characters.get(player3Id).character).toBe('Wonder Woman');
        expect(game.characters.size).toBe(3);
    });

    test('backend handles character overwriting correctly', () => {
        // Player2 assigns character to Player1
        const result1 = assignCharacter(games, gameId, player1Id, 'Batman', player2Id);
        expect(result1.success).toBe(true);

        // Player3 immediately overwrites Player1's character
        const result2 = assignCharacter(games, gameId, player1Id, 'Spider-Man', player3Id);
        expect(result2.success).toBe(true);

        // Verify the final state
        const game = games.get(gameId);
        const player1Character = game.characters.get(player1Id);
        expect(player1Character.character).toBe('Spider-Man');
        expect(player1Character.assignedBy).toBe(player3Id);
        expect(game.characters.size).toBe(1);
    });

    test('backend maintains assignment metadata correctly during overwrites', () => {
        // Initial assignment
        const result1 = assignCharacter(games, gameId, player1Id, 'Batman', player2Id);
        const firstTimestamp = result1.characters[player1Id].assignedAt;

        // Wait a small amount of time to ensure different timestamps
        const before = Date.now();

        // Overwrite assignment
        const result2 = assignCharacter(games, gameId, player1Id, 'Superman', player3Id);
        const secondTimestamp = result2.characters[player1Id].assignedAt;

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);

        // Verify metadata is updated correctly
        const game = games.get(gameId);
        const finalCharacterData = game.characters.get(player1Id);

        expect(finalCharacterData.character).toBe('Superman');
        expect(finalCharacterData.assignedBy).toBe(player3Id);
        expect(finalCharacterData.assignedAt.getTime()).toBeGreaterThanOrEqual(before);

        // The timestamps should be different (second should be newer)
        expect(secondTimestamp.getTime()).toBeGreaterThanOrEqual(firstTimestamp.getTime());
    });

    test('backend allows multiple players to assign characters to different players simultaneously', () => {
        // Simulate scenario where multiple players assign different characters at same time
        const assignments = [
            { playerId: player1Id, character: 'Batman', assignedBy: player2Id },
            { playerId: player2Id, character: 'Superman', assignedBy: player3Id },
            { playerId: player3Id, character: 'Wonder Woman', assignedBy: player1Id }
        ];

        const results = assignments.map(assignment =>
            assignCharacter(games, gameId, assignment.playerId, assignment.character, assignment.assignedBy)
        );

        // All assignments should succeed
        results.forEach(result => {
            expect(result.success).toBe(true);
        });

        // Verify final state
        const game = games.get(gameId);
        expect(game.characters.size).toBe(3);
        expect(game.characters.get(player1Id).character).toBe('Batman');
        expect(game.characters.get(player2Id).character).toBe('Superman');
        expect(game.characters.get(player3Id).character).toBe('Wonder Woman');
    });

    test('backend prevents invalid race condition assignments', () => {
        // Test that validation still works during rapid assignments

        // Valid assignment first
        const result1 = assignCharacter(games, gameId, player1Id, 'Batman', player2Id);
        expect(result1.success).toBe(true);

        // Try invalid assignment (self-assignment) immediately after
        const result2 = assignCharacter(games, gameId, player2Id, 'Superman', player2Id);
        expect(result2.success).toBe(false);
        expect(result2.error).toBe('Cannot assign character to yourself');

        // Try assignment with non-existent player
        const result3 = assignCharacter(games, gameId, player3Id, 'Wonder Woman', 'invalid-player-id');
        expect(result3.success).toBe(false);
        expect(result3.error).toBe('Assigner not found in game');

        // Verify that only the valid assignment went through
        const game = games.get(gameId);
        expect(game.characters.size).toBe(1);
        expect(game.characters.get(player1Id).character).toBe('Batman');
    });

    test('backend returns consistent character state across all operations', () => {
        // Assign initial characters
        assignCharacter(games, gameId, player1Id, 'Batman', player2Id);
        assignCharacter(games, gameId, player2Id, 'Superman', player1Id);

        // Multiple overwrites in sequence
        const result1 = assignCharacter(games, gameId, player1Id, 'Spider-Man', player3Id);
        const result2 = assignCharacter(games, gameId, player1Id, 'Iron Man', player2Id);

        // Each result should reflect the current complete state
        expect(result1.characters[player1Id].character).toBe('Spider-Man');
        expect(result1.characters[player2Id].character).toBe('Superman');

        expect(result2.characters[player1Id].character).toBe('Iron Man');
        expect(result2.characters[player2Id].character).toBe('Superman');

        // Final game state should match last result
        const game = games.get(gameId);
        const finalCharacters = Object.fromEntries(game.characters);
        expect(finalCharacters).toEqual(result2.characters);
    });

    test('backend handles empty/whitespace character assignments correctly during race conditions', () => {
        // Assign valid character first
        const result1 = assignCharacter(games, gameId, player1Id, 'Batman', player2Id);
        expect(result1.success).toBe(true);

        // Overwrite with empty character
        const result2 = assignCharacter(games, gameId, player1Id, '', player3Id);
        expect(result2.success).toBe(true);

        // Overwrite with whitespace-only character
        const result3 = assignCharacter(games, gameId, player1Id, '   ', player2Id);
        expect(result3.success).toBe(true);

        // Backend should remove whitespace-only characters
        const game = games.get(gameId);
        expect(game.characters.has(player1Id)).toBe(false); // Character should be removed
    });
});