// The game's texts, the REAL public/js/translations.js: every text in both
// languages, and a Russian copy of every error the server sends. How the texts
// are shown (placeholders, the page's language, the player's choice) is the
// kit's i18n.js, and its tests are the kit's.

// translations.js waits for the page's DOMContentLoaded as it loads
global.document = { addEventListener: () => {} };

const path = require('path');
const { translations, serverErrors } = require('../public/js/translations');
const { KIT_TEXTS, KIT_SERVER_ERRORS } = require('@parlour-games/room-kit/public/kit/js/i18n');
const { KIT_SERVER_FILES, serverErrorTexts } = require('@parlour-games/room-kit/checks');

// Every error text the server can send (the kit's serverErrorTexts finds them):
// the game's own - game-logic.js, the Worker, the room - and the kit's server
// code they build on, whose Russian copies are the kit's
const GAME_ERROR_TEXTS = serverErrorTexts(['game-logic.js', 'worker/index.js', 'worker/room.js']
    .map(file => path.join(__dirname, '..', file)));
const SERVER_ERROR_TEXTS = [...new Set([...GAME_ERROR_TEXTS, ...serverErrorTexts(KIT_SERVER_FILES)])];

describe('Real translations.js', () => {
    describe('language parity', () => {
        test('every English key has a Russian translation', () => {
            const missing = Object.keys(translations.en).filter(key => !(key in translations.ru));
            expect(missing).toEqual([]);
        });

        test('every Russian key exists in English', () => {
            const extra = Object.keys(translations.ru).filter(key => !(key in translations.en));
            expect(extra).toEqual([]);
        });

        test('matching keys use the same placeholders in both languages', () => {
            const placeholdersOf = (text) => (String(text).match(/\{(\w+)\}/g) || []).sort();

            Object.keys(translations.en).forEach(key => {
                expect(placeholdersOf(translations.ru[key])).toEqual(placeholdersOf(translations.en[key]));
            });
        });

        // The kit's texts (the update banner, Close) are the kit's: a copy here
        // would be a second place to change them
        test("the game's texts do not repeat the kit's", () => {
            expect(Object.keys(translations.en).filter(key => key in KIT_TEXTS.en)).toEqual([]);
        });
    });

    // The server's English texts have a copy in serverErrors (translations.js)
    // or in the kit's: a player reads a server error in the page's language
    describe('server errors', () => {
        test('the server texts are found', () => {
            // The game's own (error: '...' in game-logic.js) and the kit's
            // (this.send(ws, 'error', '...') in its room)
            expect(GAME_ERROR_TEXTS).toEqual(expect.arrayContaining(['Need at least 2 players to start']));
            expect(SERVER_ERROR_TEXTS).toEqual(expect.arrayContaining(['Game has already started', 'Something went wrong, please try again', 'You are not in this game']));
        });

        test('every error the server sends has a Russian text', () => {
            const missing = SERVER_ERROR_TEXTS.filter(text =>
                !Object.hasOwn(serverErrors.ru, text) && !Object.hasOwn(KIT_SERVER_ERRORS.ru, text));
            expect(missing).toEqual([]);
        });

        test("every game's copy is of an error the game itself sends", () => {
            const stale = Object.keys(serverErrors.ru).filter(text => !GAME_ERROR_TEXTS.includes(text));
            expect(stale).toEqual([]);
        });

        // The kit's copies are the kit's: a second one here would be a second
        // place to change them
        test("the game's copies do not repeat the kit's", () => {
            expect(Object.keys(serverErrors.ru).filter(text => Object.hasOwn(KIT_SERVER_ERRORS.ru, text))).toEqual([]);
        });
    });
});
