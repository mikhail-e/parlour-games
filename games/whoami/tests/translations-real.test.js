// Tests that exercise the REAL public/js/translations.js file.
//
// The other localization tests re-declare their own copy of the Localization
// class, so a bug in the shipped file would go unnoticed. These tests import
// the actual module instead.

// translations.js runs `document.addEventListener` at load time and reads
// localStorage/navigator, so the globals must exist before requiring it.
const storage = {};
global.localStorage = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: (key) => { delete storage[key]; }
};
global.navigator = { language: 'en-US' };

const dispatched = [];
global.document = {
    addEventListener: () => {},
    dispatchEvent: (event) => { dispatched.push(event); return true; },
    querySelector: () => null,
    querySelectorAll: () => []
};
global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
    }
};

const fs = require('fs');
const path = require('path');
const { translations, serverErrors, Localization } = require('../public/js/translations');

// Every error text the server can send: game-logic.js, the Worker and the
// room answer in English, as `error: '...'`, emit('error', '...') or
// this.send(ws, 'error', '...'), in either quotes
const SERVER_ERROR_TEXTS = [...new Set(['game-logic.js', 'worker/index.js', 'worker/room.js'].flatMap(file => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    return [...source.matchAll(/error:\s*(['"])(.+?)\1|emit\(\s*(['"])error\3\s*,\s*(['"])(.+?)\4|send\(\s*\w+\s*,\s*(['"])error\6\s*,\s*(['"])(.+?)\7/g)]
        .map(match => match[2] || match[5] || match[8]);
}))];

describe('Real translations.js', () => {
    let i18n;

    beforeEach(() => {
        dispatched.length = 0;
        Object.keys(storage).forEach(k => delete storage[k]);

        i18n = Object.create(Localization.prototype);
        i18n.currentLanguage = 'en';
        // Stub the DOM-touching methods - we only test text logic here
        i18n.updateTexts = () => {};
        i18n.updateLanguageSwitcher = () => {};
    });

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
    });

    describe('getText placeholders', () => {
        test('replaces a placeholder', () => {
            const result = i18n.getText('playerRevealedNotification', {
                playerName: 'Bob',
                character: 'Superman'
            });

            expect(result).toContain('Bob');
            expect(result).toContain('Superman');
        });

        test('inserts values containing regex special characters literally', () => {
            // "$&" is a regex replacement pattern - a naive String.replace would
            // expand it into the matched text instead of inserting it literally
            const result = i18n.getText('playerRevealedNotification', {
                playerName: '$& $1 $`',
                character: 'Superman'
            });

            expect(result).toContain('$& $1 $`');
            expect(result).not.toContain('{playerName}');
        });

        test('leaves unknown placeholders untouched', () => {
            const result = i18n.getText('playerRevealedNotification', { playerName: 'Charlie' });
            expect(result).toContain('{character}');
        });

        test('falls back to English for a key missing in the current language', () => {
            i18n.currentLanguage = 'ru';
            expect(i18n.getText('title')).toBe(translations.ru.title);
        });

        test('returns the key itself when it does not exist anywhere', () => {
            expect(i18n.getText('definitelyNotAKey')).toBe('definitelyNotAKey');
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

        test('reads in the current language', () => {
            expect(i18n.serverErrorText('Game has already started')).toBe('Game has already started');
            i18n.currentLanguage = 'ru';
            expect(i18n.serverErrorText('Game has already started')).toBe(serverErrors.ru['Game has already started']);
        });

        test('a text the list does not know is shown as it came', () => {
            i18n.currentLanguage = 'ru';
            expect(i18n.serverErrorText('Failed to fetch')).toBe('Failed to fetch');
            expect(i18n.serverErrorText('constructor')).toBe('constructor');
        });
    });

    describe('setLanguage', () => {
        test('switches language and persists the choice', () => {
            i18n.setLanguage('ru');

            expect(i18n.currentLanguage).toBe('ru');
            expect(storage['whoami-language']).toBe('ru');
        });

        test('dispatches a languagechanged event so dynamic UI can re-render', () => {
            i18n.setLanguage('ru');

            expect(dispatched).toHaveLength(1);
            expect(dispatched[0].type).toBe('languagechanged');
            expect(dispatched[0].detail).toEqual({ language: 'ru' });
        });

        test('ignores an unsupported language', () => {
            i18n.setLanguage('klingon');

            expect(i18n.currentLanguage).toBe('en');
            expect(dispatched).toHaveLength(0);
        });
    });
});
