// The input limits (and the shapes of a custom avatar and a player ID) exist
// twice: once on the server (game-logic.js) and once on the frontend
// (public/js/utils.js), because a browser script cannot require() a Node module. This test fails if the two copies ever drift apart,
// which would let the UI accept text the server silently truncates or rejects.

const fs = require('fs');
const path = require('path');

const gameLogic = require('../game-logic');

function readConstant(filePath, name) {
    const source = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
    if (!match) throw new Error(`${name} not found in ${filePath}`);
    return Number(match[1]);
}

describe('Input limits stay in sync between server and frontend', () => {
    test('MAX_NAME_LENGTH matches', () => {
        expect(readConstant('public/js/utils.js', 'MAX_NAME_LENGTH'))
            .toBe(gameLogic.MAX_NAME_LENGTH);
    });

    test('MAX_CHARACTER_LENGTH matches', () => {
        expect(readConstant('public/js/utils.js', 'MAX_CHARACTER_LENGTH'))
            .toBe(gameLogic.MAX_CHARACTER_LENGTH);
    });

    test('MAX_CUSTOM_AVATAR_LENGTH matches', () => {
        expect(readConstant('public/js/utils.js', 'MAX_CUSTOM_AVATAR_LENGTH'))
            .toBe(gameLogic.MAX_CUSTOM_AVATAR_LENGTH);
    });

    test.each(['CUSTOM_AVATAR_PATTERN', 'PLAYER_ID_PATTERN'])('%s is character-for-character identical', (name) => {
        const readPattern = (filePath) => {
            const source = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
            const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\/[^\\n]+\\/[a-z]*);`));
            if (!match) throw new Error(`${name} not found in ${filePath}`);
            return match[1];
        };

        expect(readPattern('public/js/utils.js')).toBe(readPattern('game-logic.js'));
    });

    test('the limits are the agreed values', () => {
        expect(gameLogic.MAX_NAME_LENGTH).toBe(128);
        expect(gameLogic.MAX_CHARACTER_LENGTH).toBe(128);
        expect(gameLogic.MAX_CUSTOM_AVATAR_LENGTH).toBe(32768);
    });
});
