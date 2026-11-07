// The kit's translations (public/kit/js/i18n.js), the real file: the page's
// language, texts with placeholders, the game's texts on top of the kit's,
// the server's errors, the player's choice kept under the game's prefix.
// A game's own tests check its dictionaries (whoami: translations-real.test.js).

// i18n.js reads localStorage and navigator and touches the page as it starts,
// so the globals must exist before requiring it
const storage = {};
global.localStorage = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: (key) => { delete storage[key]; }
};
global.navigator = { language: 'en-US' };
const dispatched = [];
global.document = {
    documentElement: {},
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
// What a game's config.js gives
global.APP_STORAGE_PREFIX = 'some-game';

const { KIT_TEXTS, withKitTexts, Localization } = require('../public/kit/js/i18n');

// A game's dictionaries, as its translations.js gives them
const GAME_TEXTS = {
    en: { greeting: 'Hello, {name}! You are {role}.', onlyEnglish: 'Only in English', close: 'Shut' },
    ru: { greeting: 'Привет, {name}! Ты — {role}.', close: 'Закрыть' },
};
const GAME_ERRORS = {
    ru: { 'Game not found': 'Игра не найдена' },
};

const startIn = (language) => {
    navigator.language = language;
    return new Localization(GAME_TEXTS, GAME_ERRORS);
};

beforeEach(() => {
    dispatched.length = 0;
    Object.keys(storage).forEach(key => delete storage[key]);
    navigator.language = 'en-US';
});

describe("the kit's own texts", () => {
    test('every text is in both languages, with the same placeholders', () => {
        const placeholdersOf = (text) => (String(text).match(/\{(\w+)\}/g) || []).sort();

        expect(Object.keys(KIT_TEXTS.ru).sort()).toEqual(Object.keys(KIT_TEXTS.en).sort());
        Object.keys(KIT_TEXTS.en).forEach(key => {
            expect(placeholdersOf(KIT_TEXTS.ru[key])).toEqual(placeholdersOf(KIT_TEXTS.en[key]));
        });
    });

    test("a game's text takes the place of the kit's, the others stay", () => {
        const texts = withKitTexts(GAME_TEXTS);

        expect(texts.en.close).toBe('Shut');
        expect(texts.en.updateNow).toBe(KIT_TEXTS.en.updateNow);
        expect(texts.ru.updateNow).toBe(KIT_TEXTS.ru.updateNow);
        expect(texts.en.greeting).toBe(GAME_TEXTS.en.greeting);
    });
});

describe("the page's language", () => {
    test("is the browser's when the player chose none", () => {
        expect(startIn('ru-RU').currentLanguage).toBe('ru');
    });

    test('is English for a language the game does not have', () => {
        expect(startIn('de-DE').currentLanguage).toBe('en');
    });

    test("is the player's choice, kept under the game's prefix", () => {
        storage['some-game-language'] = 'ru';

        expect(startIn('en-US').currentLanguage).toBe('ru');
    });

    test('a change is kept, and the page hears of it', () => {
        const i18n = startIn('en-US');

        i18n.setLanguage('ru');

        expect(i18n.currentLanguage).toBe('ru');
        expect(storage['some-game-language']).toBe('ru');
        expect(dispatched).toHaveLength(1);
        expect(dispatched[0].type).toBe('languagechanged');
        expect(dispatched[0].detail).toEqual({ language: 'ru' });
    });

    test('a language the game does not have is ignored', () => {
        const i18n = startIn('en-US');

        i18n.setLanguage('klingon');

        expect(i18n.currentLanguage).toBe('en');
        expect(dispatched).toHaveLength(0);
    });
});

describe('getText', () => {
    test('fills the placeholders', () => {
        expect(startIn('en-US').getText('greeting', { name: 'Bob', role: 'Superman' })).toBe('Hello, Bob! You are Superman.');
    });

    test('inserts values containing regex special characters literally', () => {
        // "$&" is a regex replacement pattern - a naive String.replace would
        // expand it into the matched text instead of inserting it literally
        const result = startIn('en-US').getText('greeting', { name: '$& $1 $`', role: 'Superman' });

        expect(result).toBe('Hello, $& $1 $`! You are Superman.');
    });

    test('leaves unknown placeholders untouched', () => {
        expect(startIn('en-US').getText('greeting', { name: 'Charlie' })).toBe('Hello, Charlie! You are {role}.');
    });

    test('falls back to English for a key missing in the current language', () => {
        expect(startIn('ru-RU').getText('onlyEnglish')).toBe('Only in English');
    });

    test("gives the kit's texts in the page's language", () => {
        expect(startIn('ru-RU').getText('updateNow')).toBe(KIT_TEXTS.ru.updateNow);
    });

    test('returns the key itself when it does not exist anywhere', () => {
        expect(startIn('en-US').getText('definitelyNotAKey')).toBe('definitelyNotAKey');
    });
});

describe("the server's errors", () => {
    test('read in the current language', () => {
        expect(startIn('en-US').serverErrorText('Game not found')).toBe('Game not found');
        expect(startIn('ru-RU').serverErrorText('Game not found')).toBe('Игра не найдена');
    });

    test('a text the list does not know is shown as it came', () => {
        const i18n = startIn('ru-RU');

        expect(i18n.serverErrorText('Failed to fetch')).toBe('Failed to fetch');
        expect(i18n.serverErrorText('constructor')).toBe('constructor');
    });
});
