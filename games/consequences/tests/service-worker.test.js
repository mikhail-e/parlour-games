// The game only works online, so the service worker never serves the app
// itself from a cache - only the icons, which never change. What the worker
// does is the kit's (its tests/service-worker.test.js); these tests guard the
// game's part, public/sw.js: caching HTML or JS would leave a player on an old
// version of the game.
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const swSource = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');

// The iconAssets list, read from the source without running the worker
function readIconAssets() {
    const match = swSource.match(/const iconAssets = \[([\s\S]*?)\]/);
    if (!match) throw new Error('iconAssets not found in sw.js');
    return [...match[1].matchAll(/'([^']+)'/g)].map(each => each[1]);
}

test('only the icons are cached: the favicon, the iPhone one and the manifest\'s', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf8'));
    expect(readIconAssets().sort()).toEqual(
        ['/favicon.ico', '/icons/apple-touch-icon.png', ...manifest.icons.map(icon => icon.src)].sort());
});

test('no HTML, CSS or JS is cached', () => {
    expect(readIconAssets().filter(asset => /\.(html|css|js|json)$/.test(asset) || asset === '/')).toEqual([]);
});

test('every cached icon exists', () => {
    for (const asset of readIconAssets()) {
        expect(fs.existsSync(path.join(PUBLIC, asset))).toBe(true);
    }
});

test("the worker is the kit's, given the game's cache and icons", () => {
    expect(swSource).toMatch(/const CACHE_NAME = 'consequences-game-v\d+';/);
    expect(swSource).toContain("importScripts('/kit/js/service-worker.js');");
    expect(swSource).toContain('cacheIconsOnly(CACHE_NAME, iconAssets);');
    // No logic of its own next to the kit's: no listener, no cache
    expect(swSource).not.toMatch(/addEventListener|caches\./);
});
