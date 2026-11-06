/**
 * Custom avatar (uploaded photo) tests
 *
 * A player can upload a photo instead of picking an emoji. The photo travels
 * as a small base64 data URL in the same player.avatar field the emoji uses,
 * so every persistence flow (join, reconnect, disk restore)
 * carries it automatically. These tests cover the server-side validation gate
 * and the game logic; tests/e2e/custom-avatar.spec.js checks the upload and the
 * rendering in the browser.
 */

const {
    createGame,
    addPlayerToGame,
    isCustomAvatar,
    MAX_CUSTOM_AVATAR_LENGTH
} = require('../game-logic');

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
// addPlayerToGame only honors a provided playerId if it is a valid UUID
const PLAYER_ID = '11111111-1111-1111-1111-111111111111';

describe('isCustomAvatar validation gate', () => {
    test('accepts the three safe raster image types', () => {
        expect(isCustomAvatar('data:image/jpeg;base64,/9j/AA==')).toBe(true);
        expect(isCustomAvatar('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
        expect(isCustomAvatar('data:image/webp;base64,UklGRg==')).toBe(true);
    });

    test('rejects emoji, other schemes and other MIME types', () => {
        expect(isCustomAvatar('😀')).toBe(false);
        expect(isCustomAvatar('javascript:alert(1)')).toBe(false);
        expect(isCustomAvatar('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
        expect(isCustomAvatar('data:image/svg+xml;base64,AAAA')).toBe(false);
        expect(isCustomAvatar('data:image/jpeg;base64,AB CD')).toBe(false);
        expect(isCustomAvatar(null)).toBe(false);
        expect(isCustomAvatar(42)).toBe(false);
    });

    test('enforces the length limit exactly at the boundary', () => {
        const prefix = 'data:image/jpeg;base64,';
        const atLimit = prefix + 'A'.repeat(MAX_CUSTOM_AVATAR_LENGTH - prefix.length);
        const overLimit = atLimit + 'A';

        expect(atLimit.length).toBe(MAX_CUSTOM_AVATAR_LENGTH);
        expect(isCustomAvatar(atLimit)).toBe(true);
        expect(isCustomAvatar(overLimit)).toBe(false);
    });
});

describe('Custom avatars flow through the game logic', () => {
    let games, gameId;

    beforeEach(() => {
        games = new Map();
        gameId = createGame(games).gameId;
    });

    test('a player can join with a data URL avatar', () => {
        const result = addPlayerToGame(games, gameId, 'Alice', DATA_URL, PLAYER_ID);

        expect(result.success).toBe(true);
        expect(result.player.avatar).toBe(DATA_URL);
    });

    test('a reconnect with the same playerId can switch emoji -> photo', () => {
        addPlayerToGame(games, gameId, 'Alice', '😀', PLAYER_ID);
        const result = addPlayerToGame(games, gameId, 'Alice', DATA_URL, PLAYER_ID);

        expect(result.success).toBe(true);
        expect(result.isNewPlayer).toBe(false);
        expect(result.player.avatar).toBe(DATA_URL);
    });

});
