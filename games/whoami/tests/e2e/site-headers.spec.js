// The site's own rules: only its own code on its pages, the security headers
const { test, expect, text, createRoom, waitForLanding } = require('./helpers');

test('the pages load nothing from other sites', async ({ newPlayer, baseURL }) => {
    const alice = await newPlayer('Alice');
    const origin = new URL(baseURL).origin;
    const foreign = [];
    alice.page.on('request', request => {
        const url = request.url();
        if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) foreign.push(url);
    });

    await createRoom(alice);
    await alice.page.goto('/');
    await waitForLanding(alice.page);
    await alice.page.waitForLoadState('load');

    expect(foreign).toEqual([]);
});

// Each address with the status of its answer. /game/ZZZZZZ is a room that
// does not exist: its answer is a redirect home, checked itself rather than
// the page it leads to. The files come straight from the static files, the
// API and the rooms from the code (public/_headers and its copy)
const ADDRESSES = {
    '/': 200,
    '/js/game.js': 200,
    '/vendor/bootstrap/bootstrap.min.css': 200,
    '/no-such/page': 404,
    '/api/version': 200,
    '/api/no-such-thing': 404,
    '/game/ZZZZZZ': 302,
    'a room': 200,
};

for (const [address, status] of Object.entries(ADDRESSES)) {
    test(`${address} answers with the security headers`, async ({ newPlayer, request }) => {
        let url = address;
        if (address === 'a room') url = `/game/${await createRoom(await newPlayer('Alice'))}`;
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

test('Update now on the update banner reloads the page', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    await waitForLanding(page);
    // A release cannot be staged in a test: show the banner the way pwa.js
    // does when a new service worker is ready (a stand-in, like stubShare)
    await page.evaluate(() => { window.beforeReload = true; window.pwaManager.showUpdateAvailable(); });

    await page.getByRole('button', { name: text('updateNow') }).click();

    await expect.poll(() => page.evaluate(() => window.beforeReload)).toBeUndefined();
});
