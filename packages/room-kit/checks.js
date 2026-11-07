// Checks of how a game's code is written, for the kit's tests and every
// game's (Jest): the page code's and the sign's checks take what to read and
// return what is wrong, an empty list when nothing is; serverErrorTexts finds
// the errors a server sends, translationProblems holds a game's texts against
// them and the kit's. They read the files as text on purpose - the rules are
// about the text (CLAUDE.md, Rules).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The kit's own page scripts: a game's checks read them next to its own
const KIT_SCRIPTS = path.join(__dirname, 'public', 'kit', 'js');

// [name, text] of every file in dir with this extension (not in subfolders)
function filesOf(dir, extension) {
    return fs.readdirSync(dir)
        .filter(file => file.endsWith(extension))
        .map(file => [file, fs.readFileSync(path.join(dir, file), 'utf8')]);
}

// Names in every /* <kind> a, b, c */ comment of a file
function listedNames(source, kind) {
    const comments = [...source.matchAll(new RegExp(`/\\*\\s*${kind}\\s+([^*]*)\\*/`, 'g'))];
    return comments.flatMap(match => match[1].split(/[\s,]+/).filter(Boolean));
}

// The pages load plain <script> files that share top-level names: a file lists
// what it takes from the others in a "global" comment and what it gives in an
// "exported" one. ESLint checks each file on its own, so it cannot see the lists
// drift apart; this can. `notFromPages`: names that are no page's (`module`,
// with which a script exports itself to Jest)
function sharedNameProblems(scriptFolders, { notFromPages = ['module'] } = {}) {
    const sources = scriptFolders.flatMap(dir => filesOf(dir, '.js'));
    const given = sources.flatMap(([, source]) => listedNames(source, 'exported'));

    const missing = sources.flatMap(([file, source]) =>
        listedNames(source, 'global')
            .filter(name => !notFromPages.includes(name) && !given.includes(name))
            .map(name => `${file} takes ${name}, which no script gives`));
    const undeclared = sources.flatMap(([file, source]) =>
        listedNames(source, 'exported')
            .filter(name => !new RegExp(`^(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`, 'm').test(source))
            .map(name => `${file} gives ${name}, which it does not declare at its top level`));
    return [...missing, ...undeclared];
}

// The pages run under a Content Security Policy that allows scripts and styles
// only from the game's own files: an onclick="..." attribute is inline code and
// a style="..." attribute an inline style, and the browser blocks both - in the
// markup and in HTML a script builds. The browser tests catch them only on the
// screens they open; this sees every file. "file: <tag ... attribute=" per match
function inlineCodeProblems(folders) {
    const sources = folders.flatMap(dir => [...filesOf(dir, '.html'), ...filesOf(dir, '.js')]
        .map(([file, source]) => [path.join(path.basename(dir), file), source]));
    return [/<[^>]*\son[a-z]+\s*=/gi, /<[^>]*\sstyle\s*=/gi].flatMap(pattern =>
        sources.flatMap(([file, source]) =>
            [...source.matchAll(pattern)].map(match => `${file}: ${match[0].slice(0, 80)}`)));
}

// The kit's server code: what a game's server builds on, and so what may send
// a page an error
const KIT_SERVER_FILES = ['shared', 'worker']
    .flatMap(dir => filesOf(path.join(__dirname, dir), '.js').map(([file]) => path.join(__dirname, dir, file)));

// Every error text these server files send: the server answers in English,
// as `error: '...'`, emit('error', '...') or send(ws, 'error', '...'), in
// either quotes - written literally, never built from pieces, so the texts
// can be found and each given a copy in the page's language
function serverErrorTexts(files) {
    return [...new Set(files.flatMap(file => {
        const source = fs.readFileSync(file, 'utf8');
        return [...source.matchAll(/error:\s*(['"])(.+?)\1|emit\(\s*(['"])error\3\s*,\s*(['"])(.+?)\4|send\(\s*\w+\s*,\s*(['"])error\6\s*,\s*(['"])(.+?)\7/g)]
            .map(match => match[2] || match[5] || match[8]);
    }))];
}

// A game's sign is drawn right in the markup of its pages, an inline
// <svg class="brand-sign"> (an inline SVG takes the page's fonts, an <img>
// could not): deliberate copies, one per page, that must stay the same
// drawing. It is a logo, one picture for a screen reader, named `label`; its
// stars are drawn, never typed (no font of the games has ★: the system font
// would draw it differently on every phone). "page: what is wrong" per problem
function brandSignProblems(publicFolder, pages, label) {
    const signs = pages.map(page => [page, (fs.readFileSync(path.join(publicFolder, page), 'utf8')
        .match(/<svg class="brand-sign"[\s\S]*?<\/svg>/g) || [])
        .map(svg => svg.replace(/\s+/g, ' '))]);
    const [[firstPage, [first = '']]] = signs;
    return [
        ...signs.filter(([, found]) => found.length !== 1).map(([page, found]) => `${page}: the sign ${found.length} times, not once`),
        ...signs.filter(([, [sign]]) => sign && sign !== first).map(([page]) => `${page}: another drawing than ${firstPage}'s`),
        ...(first && !/role="img"/.test(first) ? [`${firstPage}: the sign is not one picture (role="img")`] : []),
        ...(first && !first.includes(`aria-label="${label}"`) ? [`${firstPage}: the sign is not named "${label}"`] : []),
        ...signs.filter(([, found]) => found.some(sign => sign.includes('★'))).map(([page]) => `${page}: a typed star in the sign`),
    ];
}

// A page script that exports itself to Node (translations.js, the kit's
// i18n.js), run apart with just enough of a page: such scripts wait for the
// page's DOMContentLoaded as they load. What it exports
function loadPageScript(file) {
    const source = fs.readFileSync(file, 'utf8');
    const sandbox = { module: { exports: {} }, document: { addEventListener() {} } };
    vm.runInNewContext(source, sandbox);
    return sandbox.module.exports;
}

// A game's texts (its translations.js) against the kit's and the server's:
// every text in both languages with the same {placeholders}, none of the
// kit's texts repeated, a Russian copy of every error the server sends -
// those of the game's server files in the game's serverErrors, the kit's
// server code's in the kit's - and no copy of an error the game does not
// send. "what is wrong" per problem
function translationProblems(translationsFile, gameServerFiles) {
    const { translations, serverErrors } = loadPageScript(translationsFile);
    const { KIT_TEXTS, KIT_SERVER_ERRORS } = loadPageScript(path.join(KIT_SCRIPTS, 'i18n.js'));
    const placeholdersOf = text => (String(text).match(/\{\w+\}/g) || []).sort().join(' ');
    const [en, ru] = [translations.en, translations.ru];
    const gameErrors = serverErrorTexts(gameServerFiles);
    const sent = [...new Set([...gameErrors, ...serverErrorTexts(KIT_SERVER_FILES)])];
    const has = (dictionary, key) => Object.hasOwn(dictionary, key);
    return [
        ...Object.keys(en).filter(key => !has(ru, key)).map(key => `"${key}": no Russian text`),
        ...Object.keys(ru).filter(key => !has(en, key)).map(key => `"${key}": no English text`),
        ...Object.keys(en).filter(key => has(ru, key) && placeholdersOf(en[key]) !== placeholdersOf(ru[key]))
            .map(key => `"${key}": other placeholders in Russian`),
        ...Object.keys(en).filter(key => has(KIT_TEXTS.en, key)).map(key => `"${key}": the kit's text`),
        ...(gameErrors.length === 0 ? ["no error found in the game's server files"] : []),
        ...sent.filter(error => !has(serverErrors.ru, error) && !has(KIT_SERVER_ERRORS.ru, error))
            .map(error => `error "${error}": no Russian copy`),
        ...Object.keys(serverErrors.ru).filter(error => !gameErrors.includes(error))
            .map(error => `error "${error}": a copy, but the game does not send it`),
        ...Object.keys(serverErrors.ru).filter(error => has(KIT_SERVER_ERRORS.ru, error))
            .map(error => `error "${error}": the kit's copy`),
    ];
}

module.exports = {
    KIT_SCRIPTS, KIT_SERVER_FILES, sharedNameProblems, inlineCodeProblems, serverErrorTexts, brandSignProblems,
    loadPageScript, translationProblems,
};
