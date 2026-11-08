// The answer's limit and the fewest players of a round exist twice: on the
// server (game-logic.js) and in the browser (public/js/utils.js), because a
// browser script cannot require() a Node module. This test fails if the copies
// drift apart, which would let the page take an answer the server refuses, or
// offer Start the server refuses. (The name's and the photo avatar's two
// copies are the kit's, and so is their test.)
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

test("the browser's fewest players are the server's", () => {
    expect(readConstant('public/js/utils.js', 'MIN_PLAYERS')).toBe(gameLogic.MIN_PLAYERS);
    expect(gameLogic.MIN_PLAYERS).toBe(2);
});
