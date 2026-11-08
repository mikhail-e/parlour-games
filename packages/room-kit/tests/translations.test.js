// The check of a game's texts (checks.js, translationProblems): its
// translations.js against the kit's texts and the errors its server sends.
// Each game runs it on its own files; here it reads made-up ones, right and wrong
const fs = require('fs');
const os = require('os');
const path = require('path');
const { translationProblems } = require('../checks');

// A folder with a translations.js of these dictionaries and a server file
// sending these errors
function game({ en, ru, copies, sends }) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'translations-'));
    const translations = path.join(folder, 'translations.js');
    fs.writeFileSync(translations, `document.addEventListener('DOMContentLoaded', () => {});
const translations = ${JSON.stringify({ en, ru })};
const serverErrors = ${JSON.stringify({ ru: copies })};
if (typeof module !== 'undefined') module.exports = { translations, serverErrors };`);
    const server = path.join(folder, 'logic.js');
    fs.writeFileSync(server, sends.map(error => `return { error: '${error}' };`).join('\n'));
    return [translations, [server]];
}

test('texts in both languages and a copy of every error are right', () => {
    const [translations, serverFiles] = game({
        en: { greeting: 'Hello, {name}' },
        ru: { greeting: 'Привет, {name}' },
        copies: { 'Too late': 'Слишком поздно' },
        // The kit's error has the kit's copy
        sends: ['Too late', 'Game is full'],
    });

    expect(translationProblems(translations, serverFiles)).toEqual([]);
});

test('the check sees what it looks for', () => {
    const [translations, serverFiles] = game({
        en: { greeting: 'Hello, {name}', farewell: 'Bye', cancel: 'Cancel' },
        ru: { greeting: 'Привет, {player}', welcome: 'Добро пожаловать', cancel: 'Отмена' },
        copies: { 'Too late': 'Слишком поздно', 'Never sent': 'Никогда', 'Game is full': 'Мест нет' },
        sends: ['Too late', 'Too early', 'Game is full'],
    });

    expect(translationProblems(translations, serverFiles)).toEqual([
        '"farewell": no Russian text',
        '"welcome": no English text',
        '"greeting": other placeholders in Russian',
        '"cancel": the kit\'s text',
        'error "Too early": no Russian copy',
        'error "Never sent": a copy, but the game does not send it',
        'error "Game is full": the kit\'s copy',
    ]);
    expect(translationProblems(translations, [])).toContain("no error found in the game's server files");
});
