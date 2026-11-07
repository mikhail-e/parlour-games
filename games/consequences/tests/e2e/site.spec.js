// The site around the game: its own rules (only its own code, the security
// headers), the version in the footer, the icons, the update banner
const { test, expect, text, createRoom, waitForLanding } = require('./helpers');

test('the pages load nothing from other sites', async ({ newPlayer, baseURL }) => {
    const anna = await newPlayer('Anna');
    const origin = new URL(baseURL).origin;
    const foreign = [];
    anna.page.on('request', request => {
        const url = request.url();
        if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) foreign.push(url);
    });

    await createRoom(anna);
    await anna.page.goto('/');
    await waitForLanding(anna.page);
    await anna.page.waitForLoadState('load');

    expect(foreign).toEqual([]);
});

// Each address with the status of its answer. /game/ZZZZZZ is a room that
// does not exist: its answer is a redirect home, checked itself rather than
// the page it leads to. The files come straight from the static files, the
// kit's as well as the game's, the API and the rooms from the code
// (public/_headers, the kit's copy, and the Worker's copy of it)
const ADDRESSES = {
    '/': 200,
    '/js/game-room.js': 200,
    '/sw.js': 200,
    '/kit/vendor/bootstrap/bootstrap.min.css': 200,
    '/kit/fonts/fonts.css': 200,
    '/no-such/page': 404,
    '/api/version': 200,
    '/api/no-such-thing': 404,
    '/game/ZZZZZZ': 302,
    'a room': 200,
};

for (const [address, status] of Object.entries(ADDRESSES)) {
    test(`${address} answers with the security headers`, async ({ newPlayer, request }) => {
        let url = address;
        if (address === 'a room') url = `/game/${await createRoom(await newPlayer('Anna'))}`;
        const response = await request.get(url, { maxRedirects: 0 });
        expect(response.status()).toBe(status);
        const headers = response.headers();
        const policy = headers['content-security-policy'] || '';
        for (const rule of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
            expect(policy).toContain(rule);
        }
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
        expect(headers['permissions-policy']).toContain('camera=()');
        expect(headers['x-powered-by']).toBeUndefined();
    });
}

test('both pages show the version the server answers', async ({ newPlayer, request }) => {
    const { version } = await (await request.get('/api/version')).json();
    const anna = await newPlayer('Anna');
    const footerVersion = anna.page.locator('footer [data-app-version]');

    await anna.page.goto('/');
    await expect(footerVersion).toHaveText(`v${version}`);

    await createRoom(anna);
    await expect(footerVersion).toHaveText(`v${version}`);
});

// iOS cannot read an SVG apple-touch-icon: the home-screen icon must be a PNG.
// An ICO file has two names for its type; browsers take either. The manifest
// and its icons come too
test('the icons the pages name are served, the iPhone one as a PNG', async ({ newPlayer, request }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/');

    for (const [rel, type] of [['icon', /^image\/(x-icon|vnd\.microsoft\.icon)$/], ['apple-touch-icon', /^image\/png$/]]) {
        const answer = await request.get(await page.locator(`link[rel="${rel}"]`).getAttribute('href'));
        expect(answer.status(), rel).toBe(200);
        expect(answer.headers()['content-type'], rel).toMatch(type);
    }
    const manifest = await (await request.get(await page.locator('link[rel="manifest"]').getAttribute('href'))).json();
    for (const icon of manifest.icons) {
        expect((await request.get(icon.src)).headers()['content-type'], icon.src).toBe('image/png');
    }
});

// The page registers the game's service worker (the kit's pwa.js)
test('the page registers the service worker', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/');
    await waitForLanding(page);

    const worker = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return new URL(registration.active.scriptURL).pathname;
    });

    expect(worker).toBe('/sw.js');
});

test('Update now on the update banner reloads the page', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/');
    await waitForLanding(page);
    // A release cannot be staged in a test: show the banner the way pwa.js
    // does when a new service worker is ready (a stand-in, like stubShare)
    await page.evaluate(() => { window.beforeReload = true; window.pwaManager.showUpdateAvailable(); });

    await page.getByRole('button', { name: text('updateNow') }).click();

    await expect.poll(() => page.evaluate(() => window.beforeReload)).toBeUndefined();
});
