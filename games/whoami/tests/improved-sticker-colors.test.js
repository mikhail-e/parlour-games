// Who am I? Game - Improved Sticker Colors Tests
// Tests for fixed and unique color assignment system

const fs = require('fs');
const path = require('path');
const {
    createGame,
    addPlayerToGame,
    assignUniqueColor
} = require('../game-logic');

describe('Improved Sticker Colors System', () => {
    let games;
    let gameId;

    beforeEach(() => {
        games = new Map();
        const createResult = createGame(games);
        gameId = createResult.gameId;
    });

    describe('assignUniqueColor function', () => {
        test('should assign first color to first player', () => {
            const players = [];
            const color = assignUniqueColor(players);
            expect(color).toBe('red');
        });

        test('should assign unique colors to different players', () => {
            const players = [
                { stickerColor: 'red' },
                { stickerColor: 'blue' }
            ];
            const color = assignUniqueColor(players);
            expect(color).toBe('purple'); // Next available color
        });

        test('should skip used colors and find next available', () => {
            const players = [
                { stickerColor: 'red' },
                { stickerColor: 'purple' },
                { stickerColor: 'green' }
            ];
            const color = assignUniqueColor(players);
            expect(color).toBe('blue'); // First unused color
        });

        test('should handle all colors being used (8+ players)', () => {
            const players = [
                { stickerColor: 'red' },
                { stickerColor: 'blue' },
                { stickerColor: 'purple' },
                { stickerColor: 'orange' },
                { stickerColor: 'green' },
                { stickerColor: 'pink' },
                { stickerColor: 'indigo' }
            ];
            const color = assignUniqueColor(players);
            // Should cycle back when all colors are used
            expect(['red', 'blue', 'purple', 'orange', 'green', 'pink', 'indigo']).toContain(color);
        });

        test('should handle players without stickerColor (fallback)', () => {
            const players = [
                { name: 'Player1' }, // No stickerColor
                { stickerColor: 'blue' },
                { stickerColor: 'purple' }
            ];
            const color = assignUniqueColor(players);
            expect(color).toBe('red'); // Should still work, ignoring players without colors
        });

        test('should cycle correctly with more than 7 players', () => {
            const players = [];
            for (let i = 0; i < 10; i++) {
                players.push({ stickerColor: `color${i}` }); // Mock colors
            }
            const color = assignUniqueColor(players);
            // Should use modulo logic for 10 players
            expect(['red', 'blue', 'purple', 'orange', 'green', 'pink', 'indigo']).toContain(color);
        });
    });

    describe('Player color assignment in game', () => {
        test('should assign unique colors when players join', () => {
            // Add first player
            const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
            expect(player1Result.success).toBe(true);
            expect(player1Result.player.stickerColor).toBe('red');

            // Add second player
            const player2Result = addPlayerToGame(games, gameId, 'Bob', '😎');
            expect(player2Result.success).toBe(true);
            expect(player2Result.player.stickerColor).toBe('blue');

            // Add third player
            const player3Result = addPlayerToGame(games, gameId, 'Charlie', '🤖');
            expect(player3Result.success).toBe(true);
            expect(player3Result.player.stickerColor).toBe('purple');

            // Verify all colors are different
            const colors = [
                player1Result.player.stickerColor,
                player2Result.player.stickerColor,
                player3Result.player.stickerColor
            ];
            const uniqueColors = new Set(colors);
            expect(uniqueColors.size).toBe(3); // All different
        });

        test('should preserve colors for reconnecting players', () => {
            // Add player
            const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
            const originalColor = player1Result.player.stickerColor;
            const playerId = player1Result.player.id;

            // Add another player
            addPlayerToGame(games, gameId, 'Bob', '😎');

            // Player 1 reconnects
            const reconnectResult = addPlayerToGame(games, gameId, 'Alice', '😀', playerId);
            expect(reconnectResult.success).toBe(true);
            expect(reconnectResult.isNewPlayer).toBe(false);
            expect(reconnectResult.player.stickerColor).toBe(originalColor);
        });

        test('should assign all 7 colors uniquely', () => {
            const expectedColors = ['red', 'blue', 'purple', 'orange', 'green', 'pink', 'indigo'];
            const assignedColors = [];

            // Add 7 players
            for (let i = 0; i < 7; i++) {
                const result = addPlayerToGame(games, gameId, `Player${i + 1}`, '😀');
                expect(result.success).toBe(true);
                assignedColors.push(result.player.stickerColor);
            }

            // All colors should be unique and match expected palette
            expect(assignedColors.sort()).toEqual(expectedColors.sort());
        });

        test('should handle maximum players (12) with color cycling', () => {
            const assignedColors = [];

            // Add 12 players (more than available colors)
            for (let i = 0; i < 12; i++) {
                const result = addPlayerToGame(games, gameId, `Player${i + 1}`, '😀');
                expect(result.success).toBe(true);
                assignedColors.push(result.player.stickerColor);
            }

            // Should have exactly 7 unique colors (some will repeat)
            const uniqueColors = new Set(assignedColors);
            expect(uniqueColors.size).toBe(7);

            // All assigned colors should be from the valid palette
            const validColors = ['red', 'blue', 'purple', 'orange', 'green', 'pink', 'indigo'];
            assignedColors.forEach(color => {
                expect(validColors).toContain(color);
            });
        });

        test('should maintain color uniqueness when players leave and rejoin', () => {
            // Add 3 players
            addPlayerToGame(games, gameId, 'Alice', '😀');
            const player2 = addPlayerToGame(games, gameId, 'Bob', '😎');
            addPlayerToGame(games, gameId, 'Charlie', '🤖');

            // Remove middle player (simulate leaving)
            const game = games.get(gameId);
            game.players = game.players.filter(p => p.id !== player2.player.id);

            // Add new player - should get the "freed" color
            const player4 = addPlayerToGame(games, gameId, 'David', '🚀');
            expect(player4.success).toBe(true);

            // New player should get the second color (blue)
            expect(player4.player.stickerColor).toBe('blue');
        });
    });

    describe('Color consistency and persistence', () => {
        test('should maintain fixed colors throughout game lifecycle', () => {
            // Add players
            addPlayerToGame(games, gameId, 'Alice', '😀');
            addPlayerToGame(games, gameId, 'Bob', '😎');

            const game = games.get(gameId);

            // Colors should be stored in player objects
            expect(game.players[0].stickerColor).toBeDefined();
            expect(game.players[1].stickerColor).toBeDefined();
            expect(game.players[0].stickerColor).not.toBe(game.players[1].stickerColor);
        });

        test('should not assign color to reconnecting players who already have one', () => {
            // Add player
            const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
            const originalPlayerId = player1Result.player.id;
            const originalColor = player1Result.player.stickerColor;

            // Simulate player reconnection by providing player ID
            const reconnectResult = addPlayerToGame(games, gameId, 'Alice', '😀', originalPlayerId);

            expect(reconnectResult.success).toBe(true);
            expect(reconnectResult.isNewPlayer).toBe(false);
            expect(reconnectResult.player.stickerColor).toBe(originalColor);
            expect(reconnectResult.player.id).toBe(originalPlayerId);
        });
    });

    describe('Edge cases and error handling', () => {
        test('should handle empty player list', () => {
            const color = assignUniqueColor([]);
            expect(color).toBe('red');
        });

        test('should handle undefined stickerColor in player objects', () => {
            const players = [
                { name: 'Player1' }, // No stickerColor property
                { name: 'Player2', stickerColor: undefined },
                { name: 'Player3', stickerColor: null }
            ];
            const color = assignUniqueColor(players);
            expect(color).toBe('red'); // Should start from first color
        });

        test('should work with mixed valid and invalid player data', () => {
            const players = [
                { stickerColor: 'red' },
                { name: 'Player2' }, // No stickerColor
                { stickerColor: 'blue' },
                { stickerColor: '' }, // Empty string
                { stickerColor: 'purple' }
            ];
            const color = assignUniqueColor(players);
            expect(color).toBe('orange'); // Next available after red, blue, purple
        });
    });

    // The server picks the color, the browser only puts it into a class name
    // (color-<name>): every color needs its sticker style
    test('every color the server assigns has a sticker style in style.css', () => {
        const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/style.css'), 'utf8');
        const players = [];
        for (let i = 0; i < 10; i++) {
            players.push({ stickerColor: assignUniqueColor(players) });
        }

        for (const { stickerColor } of players) {
            expect(css).toContain(`.character-sticker.color-${stickerColor} {`);
        }
    });
});