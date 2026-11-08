// The quill on the envelope's wax seal is the app icon's, a deliberate copy:
// an SVG file cannot take a drawing from another file. Their colors differ
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// The vane of the icon's quill and its notches: the first five shapes of its drawing
function iconQuill() {
    const icon = read('scripts/icon.html');
    const start = icon.indexOf('<g transform="translate(62 140) rotate(42)">');
    expect(start).toBeGreaterThan(-1);
    return [...icon.slice(start).matchAll(/ d="([^"]+)"/g)].slice(0, 5).map(match => match[1]);
}

test('the seal has the app icon\'s quill', () => {
    const quill = iconQuill();
    expect(quill).toHaveLength(5);
    const seal = read('public/img/seal.svg');
    for (const shape of quill) expect(seal).toContain(`d="${shape}"`);
});
