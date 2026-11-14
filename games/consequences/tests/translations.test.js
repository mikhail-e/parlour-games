// The game's texts, the real public/js/translations.js: every text in both
// languages with the same {placeholders}, none of the kit's repeated, and a
// Russian copy of every error the server sends - the kit's check
// (checks.js, translationProblems) - and the texts of every set of questions
// the server draws (game-logic.js). How the texts are shown is the kit's i18n.js.
const path = require('path');
const { translationProblems } = require('@parlour-games/room-kit/checks');
const { MAX_PLAYERS } = require('@parlour-games/room-kit/shared/players');
const { translations } = require('../public/js/translations');
const { QUESTION_SETS, QUESTION_COUNT } = require('../game-logic');

const GAME = path.join(__dirname, '..');

// The texts of a set of questions: its name, its questions, and the round's
// headings in its words - every story of the fullest room among them
function keysOfSet(set) {
    return [
        `${set}Name`,
        ...Array.from({ length: QUESTION_COUNT }, (unused, index) => `${set}Question${index + 1}`),
        `${set}TellingTheStory`, `${set}StoriesReady`, `${set}AllStories`,
        ...Array.from({ length: MAX_PLAYERS }, (unused, index) => `${set}StoryTitle${index + 1}`),
    ];
}

test('the texts are in both languages, and every server error has a Russian copy', () => {
    expect(translationProblems(path.join(GAME, 'public', 'js', 'translations.js'),
        ['game-logic.js', 'worker/index.js', 'worker/room.js'].map(file => path.join(GAME, file)))).toEqual([]);
});

test('every set of questions the server draws has its texts in both languages: its name, its questions, its headings, a title for every story of the fullest room', () => {
    for (const language of ['en', 'ru']) {
        for (const set of QUESTION_SETS) {
            for (const key of keysOfSet(set)) {
                expect([key, translations[language][key]]).toEqual([key, expect.stringMatching(/\S/)]);
            }
        }
    }
});

test('no texts of a set the server does not draw, and none of the one list before the sets', () => {
    const ofSets = new Set(QUESTION_SETS.flatMap(keysOfSet));
    // A text of a set: a set's name, question, heading or story title
    const setText = /(?:name|question\d+|tellingTheStory|storiesReady|allStories|storyTitle\d+)$/i;
    for (const language of ['en', 'ru']) {
        const stray = Object.keys(translations[language])
            .filter(key => setText.test(key) && !ofSets.has(key));
        expect(stray).toEqual([]);
    }
});
