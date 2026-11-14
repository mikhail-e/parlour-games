// Tests for server-side input validation and character locking
// These protect against malformed/hostile input from modified clients
// and against late events (e.g. blur firing after the game started). A
// player's name and avatar are the kit's: packages/room-kit/tests/players.test.js

const {
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    restartGame,
    sanitizeCharacter
} = require('../game-logic');

describe('Input Validation', () => {
    describe('sanitizeCharacter', () => {
        test('trims and keeps normal characters', () => {
            expect(sanitizeCharacter('  Batman  ')).toBe('Batman');
        });

        test('empty or missing character means "remove assignment"', () => {
            expect(sanitizeCharacter('')).toBe('');
            expect(sanitizeCharacter('   ')).toBe('');
            expect(sanitizeCharacter(null)).toBe('');
            expect(sanitizeCharacter(undefined)).toBe('');
        });

        test('truncates characters longer than 128 characters', () => {
            expect(sanitizeCharacter('A'.repeat(200))).toBe('A'.repeat(128));
        });

        test('truncates by character so an emoji is never cut in half', () => {
            const truncated = sanitizeCharacter('🦄'.repeat(200));

            expect([...truncated]).toHaveLength(128);
            expect(truncated).toBe('🦄'.repeat(128));
            // A naive slice() would leave a broken surrogate at the end
            expect(truncated).not.toContain('🦄'.charAt(0) + '�');
        });

        test('rejects non-string values', () => {
            expect(sanitizeCharacter(123)).toBeNull();
            expect(sanitizeCharacter({ evil: true })).toBeNull();
        });
    });

    describe('assignCharacter validation and locking', () => {
        let games, gameId, playerId1, playerId2;

        beforeEach(() => {
            games = new Map();
            gameId = createGame(games).gameId;
            playerId1 = addPlayerToGame(games, gameId, 'Alice', '😀').player.id;
            playerId2 = addPlayerToGame(games, gameId, 'Bob', '😎').player.id;
        });

        test('trims and truncates the character text', () => {
            const result = assignCharacter(games, gameId, playerId1, '  ' + 'B'.repeat(200), playerId2);
            expect(result.success).toBe(true);
            expect(result.character).toBe('B'.repeat(128));
        });

        test('rejects non-string character values', () => {
            const result = assignCharacter(games, gameId, playerId1, { evil: true }, playerId2);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid character');
        });

        test('blocks character changes after the game has started', () => {
            assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
            assignCharacter(games, gameId, playerId2, 'Superman', playerId1);
            startGame(games, gameId, playerId1);

            const result = assignCharacter(games, gameId, playerId1, 'Joker', playerId2);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Cannot change characters after the game has started');

            // Original character must be untouched
            const game = games.get(gameId);
            expect(game.characters.get(playerId1).character).toBe('Batman');
        });

        test('allows character changes again after restart', () => {
            assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
            assignCharacter(games, gameId, playerId2, 'Superman', playerId1);
            startGame(games, gameId, playerId1);
            restartGame(games, gameId, playerId1);

            const result = assignCharacter(games, gameId, playerId1, 'Joker', playerId2);
            expect(result.success).toBe(true);
            expect(result.character).toBe('Joker');
        });
    });
});
