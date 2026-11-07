// The errors the kit's server code sends (shared/, worker/) answer in English,
// and the kit's i18n.js holds their Russian copies (KIT_SERVER_ERRORS): a
// player reads an error in the page's language. A game's own test checks its
// errors, on top of these (whoami: translations-real.test.js)

// i18n.js waits for the page's DOMContentLoaded as it loads
global.document = { addEventListener: () => {} };

const { KIT_SERVER_ERRORS } = require('../public/kit/js/i18n');
const { KIT_SERVER_FILES, serverErrorTexts } = require('../checks');

const SENT = serverErrorTexts(KIT_SERVER_FILES);

test('the texts are found, in each form', () => {
    // error: '...' (the players list) and this.send(ws, 'error', '...') (the room)
    expect(SENT).toEqual(expect.arrayContaining(['Game is full', 'You are not in this game']));
});

test('every error the kit sends has a Russian text', () => {
    expect(SENT.filter(text => !Object.hasOwn(KIT_SERVER_ERRORS.ru, text))).toEqual([]);
});

test('every Russian text is of an error the kit sends', () => {
    expect(Object.keys(KIT_SERVER_ERRORS.ru).filter(text => !SENT.includes(text))).toEqual([]);
});
