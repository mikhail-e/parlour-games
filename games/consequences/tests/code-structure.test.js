/**
 * How the page code is written
 * The pages run under a Content Security Policy that allows scripts and styles
 * only from the game's own files (public/_headers, the kit's). An onclick="..." attribute is
 * inline code and a style="..." attribute an inline style: the browser blocks
 * both. Handlers go through addEventListener, looks through classes in
 * style.css; a script may still set element.style. This test reads the files
 * as text on purpose: the rule is about the text. The browser tests catch a
 * blocked inline style or handler only on the screens they open; this test
 * sees every page and every piece of HTML a script builds.
 */
const fs = require('fs');
const path = require('path');
const { inlineCodeProblems } = require('@parlour-games/room-kit/checks');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');

test('the pages and their scripts are found', () => {
    expect(fs.readdirSync(PUBLIC_DIR)).toEqual(expect.arrayContaining(['index.html', 'game.html']));
    expect(fs.readdirSync(JS_DIR)).toContain('game-room.js');
});

// The kit's check (checks.js): every page and every script of public/js/
test('no inline event handler or style attributes in the pages or in HTML built by public/js/', () => {
    expect(inlineCodeProblems([PUBLIC_DIR, JS_DIR])).toEqual([]);
});
