// The character's input limit exists twice: once on the server
// (game-logic.js) and once on the frontend (public/js/utils.js), because a
// browser script cannot require() a Node module. This test fails if the two
// copies ever drift apart, which would let the UI accept text the server
// silently truncates. (The name's and the photo avatar's two copies are the
// kit's, and so is their test.)

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
    test('MAX_CHARACTER_LENGTH matches', () => {
        expect(readConstant('public/js/utils.js', 'MAX_CHARACTER_LENGTH'))
            .toBe(gameLogic.MAX_CHARACTER_LENGTH);
    });

    test('the limit is the agreed value', () => {
        expect(gameLogic.MAX_CHARACTER_LENGTH).toBe(128);
    });
});
