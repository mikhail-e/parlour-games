// The PWA manifest: the invariants installing the app and opening its links
// depend on. Read from disk, as tests/service-worker.test.js reads sw.js.
//
// What these fields do: Android (installed from Chrome) opens in-scope links
// in the app because scope is "/", and launch_handler reuses the open window
// for them; iOS opens no link in an installed web app at all
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
// JSON.parse throws on invalid JSON, failing the suite loudly
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf8'));

test('the scope covers the whole site, so /game/* links belong to the app', () => {
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/');
});

test('it installs as a standalone app that reuses its open window for links', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.launch_handler).toEqual({ client_mode: 'navigate-existing' });
});

test('it has the icon sizes installing needs (192 and 512), and every icon exists', () => {
    expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons) {
        expect(fs.existsSync(path.join(PUBLIC, icon.src))).toBe(true);
    }
});

// The app's color (the top of the curtain, --curtain-top in style.css) is
// written in five places: the three pages' theme-color and the manifest's two
test('the pages and the manifest name the same app color, the curtain\'s top', () => {
    const style = fs.readFileSync(path.join(PUBLIC, 'css', 'style.css'), 'utf8');
    expect(manifest.theme_color).toBe(style.match(/--curtain-top:\s*(#[0-9a-f]{6})/)[1]);
    expect(manifest.background_color).toBe(manifest.theme_color);
    for (const page of ['index.html', 'game.html', '404.html']) {
        const html = fs.readFileSync(path.join(PUBLIC, page), 'utf8');
        expect(html.match(/<meta name="theme-color" content="([^"]+)">/)[1]).toBe(manifest.theme_color);
    }
});
