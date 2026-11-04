// The game only works online, so the service worker must never serve the app
// itself from cache - only the icons, which never change. These tests guard
// that rule: caching HTML or JS again would resurrect the "player stuck on an
// old version" class of bugs.

const fs = require('fs');
const path = require('path');

const swSource = fs.readFileSync(path.join(__dirname, '..', 'public/sw.js'), 'utf8');

// Pull the iconAssets array out of the source without executing the worker
function readIconAssets() {
    const match = swSource.match(/const iconAssets = \[([\s\S]*?)\]/);
    if (!match) throw new Error('iconAssets not found in sw.js');

    return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('Service Worker caching policy', () => {
    test('only icons and the favicon are pre-cached', () => {
        const assets = readIconAssets();

        // The six icons of the manifest and the iPhone's home-screen icon
        expect(assets).toContain('/favicon.ico');
        expect(assets).toContain('/icons/apple-touch-icon.png');
        expect(assets.filter(a => a.startsWith('/icons/'))).toHaveLength(7);
        expect(assets).toHaveLength(8);
    });

    test('no HTML, CSS or JS is pre-cached', () => {
        const assets = readIconAssets();
        const appFiles = assets.filter(a => /\.(html|css|js|json)$/.test(a) || a === '/');

        expect(appFiles).toEqual([]);
    });

    test('every pre-cached icon actually exists on disk', () => {
        readIconAssets().forEach(asset => {
            const filePath = path.join(__dirname, '..', 'public', asset);
            expect(fs.existsSync(filePath)).toBe(true);
        });
    });

    test('the worker responds to icon requests only', () => {
        // A single respondWith(), and it serves icons from cache. Anything else
        // (app files, the room's socket, /api/) falls through to the browser untouched.
        const respondWithCalls = swSource.match(/event\.respondWith\(/g) || [];

        expect(respondWithCalls).toHaveLength(1);
        expect(swSource).toMatch(/isIconAsset\(request\.url\)[\s\S]{0,120}event\.respondWith\(cacheFirstStrategy\(request\)\)/);
    });

    test('cache-first is the only caching strategy left', () => {
        expect(swSource).toContain('cacheFirstStrategy');
        expect(swSource).not.toContain('networkFirstStrategy');
    });

    test('the cache version is bumped past the caching rewrite', () => {
        const version = swSource.match(/const CACHE_NAME = 'whoami-game-v([\d.]+)'/)[1];
        const [major, minor] = version.split('.').map(Number);

        expect(major * 100 + minor).toBeGreaterThanOrEqual(105); // >= v1.5.0
    });
});
