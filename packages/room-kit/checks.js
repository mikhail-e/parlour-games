// Checks of how a game's page code is written, for the kit's tests and every
// game's (Jest): each takes the folders to read and returns what is wrong, an
// empty list when nothing is. They read the files as text on purpose - the
// rules are about the text (CLAUDE.md, Rules).
const fs = require('fs');
const path = require('path');

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

module.exports = { KIT_SCRIPTS, sharedNameProblems, inlineCodeProblems };
