// An address nobody answers gets the game's own page, public/404.html, with
// status 404 - at any depth, so its links all start at the site root
const { test, expect, text, PAGE_STATUS_404, waitForLanding } = require('./helpers');

test('a missing address answers 404 with a page in the style of the game', async ({ newPlayer, baseURL }) => {
    const anna = await newPlayer('Anna');
    anna.allowConsoleError(PAGE_STATUS_404);
    const { page } = anna;
    const origin = new URL(baseURL).origin;
    const failedFiles = [];
    page.on('response', response => {
        if (response.url().startsWith(origin) && response.request().resourceType() !== 'document' && !response.ok()) {
            failedFiles.push(`${response.status()} ${response.url()}`);
        }
    });

    const response = await page.goto('/no-such/page/here');

    expect(response.status()).toBe(404);
    await expect(page.getByRole('heading', { name: text('notFoundTitle') })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Consequences' })).toBeVisible();
    await page.waitForLoadState('load');
    expect(failedFiles).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain('linear-gradient');

    await page.getByRole('link', { name: text('openGame') }).click();
    await waitForLanding(page);
});

test("the 404 page speaks the player's language", async ({ newPlayer }) => {
    const anna = await newPlayer('Аня', { locale: 'ru-RU' });
    anna.allowConsoleError(PAGE_STATUS_404);
    await anna.page.goto('/no-such-page');
    await expect(anna.page.getByRole('heading', { name: text('notFoundTitle', 'ru') })).toBeVisible();
});

test('an unknown API address answers 404, not a page of the game', async ({ request }) => {
    const response = await request.get('/api/no-such-thing');
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('data-i18n="notFoundTitle"');
});

// A file that sits next to the site's files without being one of them: the
// Mac's folder notes, the list of what is not published, the headers' rules
for (const address of ['/.DS_Store', '/.assetsignore', '/_headers']) {
    test(`${address} is not served`, async ({ request }) => {
        const response = await request.get(address, { maxRedirects: 0 });
        expect(response.status()).toBe(404);
    });
}

// The pages have names of their own (game.html, index.html, 404.html): an
// address without the extension is no page of the game. A room page without
// a code would only tell the player it has none
for (const address of ['/game', '/index', '/404']) {
    test(`${address} answers the 404 page`, async ({ request }) => {
        const response = await request.get(address, { maxRedirects: 0 });

        expect(response.status()).toBe(404);
        expect(await response.text()).toContain('data-i18n="notFoundTitle"');
    });
}
