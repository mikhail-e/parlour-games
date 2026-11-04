/**
 * How the page code is written
 * The pages run under a Content Security Policy that allows scripts and styles
 * only from the game's own files (public/_headers). An onclick="..." attribute is
 * inline code and a style="..." attribute an inline style: the browser blocks
 * both. Handlers go through addEventListener, looks through classes in
 * style.css; a script may still set element.style. This test reads the files
 * as text on purpose: the rule is about the text. The browser tests catch a
 * blocked inline style or handler only on the screens they open; this test
 * sees every page and every piece of HTML a script builds.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');

const filesOf = (dir, extension) => fs.readdirSync(dir)
    .filter(file => file.endsWith(extension))
    .map(file => [path.relative(PUBLIC_DIR, path.join(dir, file)), fs.readFileSync(path.join(dir, file), 'utf8')]);

const sources = [...filesOf(PUBLIC_DIR, '.html'), ...filesOf(JS_DIR, '.js')];

// "file: <tag ... attribute=" for every match, for a readable failure
const findAll = pattern => sources.flatMap(([file, source]) =>
    [...source.matchAll(pattern)].map(match => `${file}: ${match[0].slice(0, 80)}`));

test('the pages and their scripts are found', () => {
    expect(sources.map(([file]) => file)).toEqual(expect.arrayContaining(['index.html', 'game.html', 'js/game-room.js']));
});

test('no inline event handler attributes in the pages or in HTML built by public/js/', () => {
    expect(findAll(/<[^>]*\son[a-z]+\s*=/gi)).toEqual([]);
});

test('no inline style attributes in the pages or in HTML built by public/js/', () => {
    expect(findAll(/<[^>]*\sstyle\s*=/gi)).toEqual([]);
});
