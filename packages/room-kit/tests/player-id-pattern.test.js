// The player ID's pattern exists twice, on purpose: the server's copy in
// shared/identity.js, the browser's in public/kit/js/app.js (a page script
// cannot require() a module). A stored ID the server would reject is replaced
// in the browser, so the two must accept the same IDs: this keeps them
// character-for-character equal
const fs = require('fs');
const path = require('path');

const readPattern = file => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const match = source.match(/const\s+PLAYER_ID_PATTERN\s*=\s*(\/[^\n]+\/[a-z]*);/);
    if (!match) throw new Error(`PLAYER_ID_PATTERN not found in ${file}`);
    return match[1];
};

test('the browser and the server take the same player IDs', () => {
    expect(readPattern('public/kit/js/app.js')).toBe(readPattern('shared/identity.js'));
});
