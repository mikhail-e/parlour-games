// The check of a game's sign (checks.js, brandSignProblems): the copies of
// the inline <svg class="brand-sign"> in a game's pages. Each game runs it on
// its own pages; here it reads made-up pages, right and wrong
const fs = require('fs');
const os = require('os');
const path = require('path');
const { brandSignProblems } = require('../checks');

const SIGN = `<svg class="brand-sign" viewBox="0 0 600 232" role="img" aria-label="A Game">
    <polygon points="0,-7.5 1.76,-2.43"/><text>A GAME</text></svg>`;

// A folder of pages: name → markup
function pages(markup) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-sign-'));
    for (const [page, html] of Object.entries(markup)) fs.writeFileSync(path.join(folder, page), html);
    return folder;
}

test('copies of one drawing, indented differently, are right', () => {
    const folder = pages({ 'a.html': `<h1>${SIGN}</h1>`, 'b.html': `<p>\n        ${SIGN.replace(/\n {4}/, '\n            ')}</p>` });

    expect(brandSignProblems(folder, ['a.html', 'b.html'], 'A Game')).toEqual([]);
});

test('the check sees what it looks for', () => {
    const folder = pages({
        'a.html': `<h1>${SIGN}</h1>`,
        'b.html': `<h1>${SIGN.replace('A GAME', 'A GAME ★')}</h1>`,
        'c.html': '<h1>No sign</h1>',
        'd.html': SIGN + SIGN,
    });

    expect(brandSignProblems(folder, ['a.html', 'b.html', 'c.html', 'd.html'], 'Another Game')).toEqual([
        'c.html: the sign 0 times, not once',
        'd.html: the sign 2 times, not once',
        "b.html: another drawing than a.html's",
        'a.html: the sign is not named "Another Game"',
        'b.html: a typed star in the sign',
    ]);
    expect(brandSignProblems(pages({ 'a.html': SIGN.replace(' role="img"', '') }), ['a.html'], 'A Game'))
        .toEqual(['a.html: the sign is not one picture (role="img")']);
});
