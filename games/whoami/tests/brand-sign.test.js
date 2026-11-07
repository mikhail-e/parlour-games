// The sign "Who am I?" is drawn right in the markup of three pages (index.html,
// game.html, 404.html): an inline SVG takes the page's fonts, an <img> could not.
// The three copies are deliberate; the kit's check (checks.js,
// brandSignProblems) fails if they ever drift apart, if the sign is not one
// picture named "Who am I?" for a screen reader, or if a star is typed.

const path = require('path');
const { brandSignProblems } = require('@parlour-games/room-kit/checks');

test('the sign is one drawing on the three pages, named "Who am I?"', () => {
    expect(brandSignProblems(path.join(__dirname, '..', 'public'), ['index.html', 'game.html', '404.html'], 'Who am I?')).toEqual([]);
});
