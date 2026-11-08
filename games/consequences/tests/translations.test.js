// The game's texts, the real public/js/translations.js: every text in both
// languages with the same {placeholders}, none of the kit's repeated, and a
// Russian copy of every error the server sends - the kit's check
// (checks.js, translationProblems). How the texts are shown is the kit's i18n.js.
const path = require('path');
const { translationProblems } = require('@parlour-games/room-kit/checks');
const { MAX_PLAYERS } = require('@parlour-games/room-kit/shared/players');
const { translations } = require('../public/js/translations');

const GAME = path.join(__dirname, '..');

test('the texts are in both languages, and every server error has a Russian copy', () => {
    expect(translationProblems(path.join(GAME, 'public', 'js', 'translations.js'),
        ['game-logic.js', 'worker/index.js', 'worker/room.js'].map(file => path.join(GAME, file)))).toEqual([]);
});

test('every story of the fullest room has its title, the number in words', () => {
    for (const language of ['en', 'ru']) {
        for (let number = 1; number <= MAX_PLAYERS; number++) {
            expect(translations[language][`storyTitle${number}`]).toEqual(expect.any(String));
        }
    }
});
