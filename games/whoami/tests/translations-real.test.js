// The game's texts, the real public/js/translations.js: every text in both
// languages with the same {placeholders}, none of the kit's repeated, and a
// Russian copy of every error the server sends - the kit's check
// (checks.js, translationProblems). How the texts are shown (placeholders, the
// page's language, the player's choice) is the kit's i18n.js, and its tests
// are the kit's.
const path = require('path');
const { translationProblems } = require('@parlour-games/room-kit/checks');

const GAME = path.join(__dirname, '..');

test('the texts are in both languages, and every server error has a Russian copy', () => {
    expect(translationProblems(path.join(GAME, 'public', 'js', 'translations.js'),
        ['game-logic.js', 'worker/index.js', 'worker/room.js'].map(file => path.join(GAME, file)))).toEqual([]);
});
