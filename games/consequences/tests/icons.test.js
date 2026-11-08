// The game's pages show emoji only as avatars, and every icon they name is
// drawn (the kit's CLAUDE.md, Icons)
const path = require('path');
const { emojiProblems, iconProblems } = require('@parlour-games/room-kit/checks');

const PUBLIC = path.join(__dirname, '..', 'public');
const FOLDERS = [PUBLIC, path.join(PUBLIC, 'js'), path.join(PUBLIC, 'css')];

test('emoji are only the avatars', () => {
    expect(emojiProblems(FOLDERS)).toEqual([]);
});

test('every icon the pages name has its style and its picture', () => {
    expect(iconProblems(FOLDERS)).toEqual([]);
});
