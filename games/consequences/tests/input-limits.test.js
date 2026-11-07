// The answer's limit exists twice: on the server (game-logic.js) and in the
// browser (public/js/utils.js), because a browser script cannot require() a
// Node module. This test fails if the two copies drift apart, which would let
// the page take an answer the server refuses. (The name's and the photo
// avatar's two copies are the kit's, and so is their test.)
const fs = require('fs');
const path = require('path');

const gameLogic = require('../game-logic');

function readConstant(filePath, name) {
    const source = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
    if (!match) throw new Error(`${name} not found in ${filePath}`);
    return Number(match[1]);
}

test('the browser\'s answer limit is the server\'s', () => {
    expect(readConstant('public/js/utils.js', 'MAX_ANSWER_LENGTH')).toBe(gameLogic.MAX_ANSWER_LENGTH);
});

test('the limit is the agreed value', () => {
    expect(gameLogic.MAX_ANSWER_LENGTH).toBe(200);
});
