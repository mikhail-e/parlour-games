// How the kit's page scripts are written (checks.js): the names they share
// are given by one of them or by the game, and they build no inline code.
// Each game runs the same checks on its own scripts and the kit's together
const { KIT_SCRIPTS, sharedNameProblems, inlineCodeProblems } = require('../checks');

// What a game's own scripts give the kit's: the prefix of its keys in
// localStorage (its config.js) and its texts (its translations.js)
const FROM_THE_GAME = ['APP_STORAGE_PREFIX', 'translations', 'serverErrors'];

test("every name a kit script takes is given by another, or by the game", () => {
    expect(sharedNameProblems([KIT_SCRIPTS], { notFromPages: ['module', ...FROM_THE_GAME] })).toEqual([]);
});

test('the kit builds no inline event handlers or styles', () => {
    expect(inlineCodeProblems([KIT_SCRIPTS])).toEqual([]);
});

test('the checks see what they look for', () => {
    expect(sharedNameProblems([KIT_SCRIPTS])).toEqual(expect.arrayContaining([expect.stringContaining('APP_STORAGE_PREFIX')]));
});
