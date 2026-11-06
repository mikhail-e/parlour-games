// The sign "Who am I?" is drawn right in the markup of three pages (index.html,
// game.html, 404.html): an inline SVG takes the page's fonts, an <img> could not.
// The three copies are deliberate; this test fails if they ever drift apart.

const fs = require('fs');
const path = require('path');

const PAGES = ['index.html', 'game.html', '404.html'];

function signsOf(page) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
    return html.match(/<svg class="brand-sign"[\s\S]*?<\/svg>/g) || [];
}

// Indentation differs from page to page; the drawing must not
const normalize = svg => svg.replace(/\s+/g, ' ');

describe('The sign', () => {
    test.each(PAGES)('%s has the sign exactly once', page => {
        expect(signsOf(page)).toHaveLength(1);
    });

    test('the three copies are the same drawing', () => {
        const [first, ...rest] = PAGES.map(page => normalize(signsOf(page)[0] || ''));
        for (const copy of rest) expect(copy).toBe(first);
    });

    test('a screen reader hears one picture named "Who am I?"', () => {
        const [sign = ''] = signsOf('index.html');
        expect(sign).toMatch(/role="img"/);
        expect(sign).toMatch(/aria-label="Who am I\?"/);
    });

    // No font of the game has ★: a typed star would be drawn by the system
    // font, different on every phone
    test('the stars are drawn, not typed', () => {
        const [sign] = signsOf('index.html');
        expect(sign).toBeDefined();
        expect(sign).not.toContain('★');
    });
});
