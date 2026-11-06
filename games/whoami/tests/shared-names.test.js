/**
 * Shared names between the page scripts
 * The pages load plain <script> files that share top-level names (CLAUDE.md,
 * rule 7): a file lists what it takes from the others in a "global" comment
 * and what it gives in an "exported" comment. ESLint checks each file on its
 * own, so it cannot see these lists drift apart; this test can.
 */
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'public', 'js');
const sources = Object.fromEntries(
    fs.readdirSync(JS_DIR)
        .filter(file => file.endsWith('.js'))
        .map(file => [file, fs.readFileSync(path.join(JS_DIR, file), 'utf8')])
);

// Names in every /* <kind> a, b, c */ comment of a file
function listedNames(source, kind) {
    const comments = [...source.matchAll(new RegExp(`/\\*\\s*${kind}\\s+([^*]*)\\*/`, 'g'))];
    return comments.flatMap(match => match[1].split(/[\s,]+/).filter(Boolean));
}

// `module` is Jest's, not a page's: translations.js exports itself to the tests with it
const NOT_FROM_PAGES = ['module'];

describe('Names shared between page scripts', () => {
    test('every name a script takes from another file is given by one', () => {
        const given = Object.values(sources).flatMap(source => listedNames(source, 'exported'));

        const missing = Object.entries(sources).flatMap(([file, source]) =>
            listedNames(source, 'global')
                .filter(name => !NOT_FROM_PAGES.includes(name) && !given.includes(name))
                .map(name => `${file}: ${name}`));

        expect(missing).toEqual([]);
    });

    test('every name a file gives is declared at its top level', () => {
        const undeclared = Object.entries(sources).flatMap(([file, source]) =>
            listedNames(source, 'exported')
                .filter(name => !new RegExp(`^(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`, 'm').test(source))
                .map(name => `${file}: ${name}`));

        expect(undeclared).toEqual([]);
    });
});
