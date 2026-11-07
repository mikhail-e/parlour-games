// The game's texts, the REAL public/js/translations.js: every text in both
// languages, and a Russian copy of every error the server sends. How the texts
// are shown (placeholders, the page's language, the player's choice) is the
// kit's i18n.js, and its tests are the kit's.

// translations.js waits for the page's DOMContentLoaded as it loads
global.document = { addEventListener: () => {} };

const fs = require('fs');
const path = require('path');
const { translations, serverErrors } = require('../public/js/translations');
const { KIT_TEXTS } = require('@parlour-games/room-kit/public/kit/js/i18n');

// Every error text the server can send: game-logic.js, the Worker and the
// room answer in English, as `error: '...'`, emit('error', '...') or
// this.send(ws, 'error', '...'), in either quotes
const SERVER_ERROR_TEXTS = [...new Set(['game-logic.js', 'worker/index.js', 'worker/room.js'].flatMap(file => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    return [...source.matchAll(/error:\s*(['"])(.+?)\1|emit\(\s*(['"])error\3\s*,\s*(['"])(.+?)\4|send\(\s*\w+\s*,\s*(['"])error\6\s*,\s*(['"])(.+?)\7/g)]
        .map(match => match[2] || match[5] || match[8]);
}))];

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

    // The server's English texts have a copy in serverErrors (translations.js):
    // a player reads a server error in the page's language
    describe('server errors', () => {
        test('the server texts are found', () => {
            // One text of each form: error: '...' (game-logic.js) and this.send(ws, 'error', '...') (the room)
            expect(SERVER_ERROR_TEXTS).toEqual(expect.arrayContaining(['Game has already started', 'Something went wrong, please try again', 'You are not in this game']));
        });

        test('every error the server sends has a Russian text', () => {
            const missing = SERVER_ERROR_TEXTS.filter(text => !Object.hasOwn(serverErrors.ru, text));
            expect(missing).toEqual([]);
        });

        test('every translated error is one the server sends', () => {
            const stale = Object.keys(serverErrors.ru).filter(text => !SERVER_ERROR_TEXTS.includes(text));
            expect(stale).toEqual([]);
        });
    });
});
