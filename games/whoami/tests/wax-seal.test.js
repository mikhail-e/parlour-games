// The envelope's wax seal on the page (public/img/seal.svg, .seal in style.css)
// is the app icon's seal (scripts/icon.html), drips and all. The copy is
// deliberate; this test fails if the two ever drift apart.

const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Indentation differs from file to file; the drawing must not
const normalize = svg => svg.replace(/\s+/g, ' ');

// The wax's colors, its uneven edge and the ring the stamp pressed in
function sealOf(svg) {
    return ['<radialGradient[\\s\\S]*?</radialGradient>', '<polygon[^>]*>', '<circle[^>]*>']
        .map(pattern => normalize((svg.match(new RegExp(pattern, 'g')) || []).join('')));
}

test('the envelope wears the app icon\'s wax seal', () => {
    const icon = sealOf(read('scripts/icon.html'));
    expect(icon.every(part => part !== '')).toBe(true);
    expect(sealOf(read('public/img/seal.svg'))).toEqual(icon);
});
