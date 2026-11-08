// The limits of a name and a photo avatar exist twice, on purpose: the
// server's in shared/players.js, the browser's in public/kit/js/limits.js (a
// page script cannot require() a module). A page that accepted what the server
// cuts or refuses would lose the player's text silently: this keeps the two
// copies equal
const fs = require('fs');
const path = require('path');

const SERVER = 'shared/players.js';
const BROWSER = 'public/kit/js/limits.js';

const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function readConstant(file, name) {
    const match = source(file).match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
    if (!match) throw new Error(`${name} not found in ${file}`);
    return Number(match[1]);
}

function readPattern(file) {
    const match = source(file).match(/const\s+CUSTOM_AVATAR_PATTERN\s*=\s*(\/[^\n]+\/[a-z]*);/);
    if (!match) throw new Error(`CUSTOM_AVATAR_PATTERN not found in ${file}`);
    return match[1];
}

test.each(['MAX_NAME_LENGTH', 'MAX_CUSTOM_AVATAR_LENGTH'])('%s is the same in the browser and on the server', name => {
    expect(readConstant(BROWSER, name)).toBe(readConstant(SERVER, name));
});

test('the photo avatar pattern is character-for-character the same', () => {
    expect(readPattern(BROWSER)).toBe(readPattern(SERVER));
});

test('the limits are the agreed values', () => {
    const { MAX_NAME_LENGTH, MAX_CUSTOM_AVATAR_LENGTH } = require('../shared/players');
    expect(MAX_NAME_LENGTH).toBe(128);
    expect(MAX_CUSTOM_AVATAR_LENGTH).toBe(32768);
});
