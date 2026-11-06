// The site around the game: unknown rooms, the version in the footer, and the
// guard every browser test runs under
const { test, expect, text, createRoom } = require('./helpers');

test('a link to a room that does not exist leads home with a message', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');

    await alice.page.goto('/game/ZZZZZ9');

    await expect(alice.page).toHaveURL(/\/\?error=room-not-found$/);
    await expect(alice.page.locator('.alert-danger')).toContainText(text('roomNotFound'));
});

test('both pages show the version the server answers', async ({ newPlayer, request }) => {
    const { version } = await (await request.get('/api/version')).json();
    const alice = await newPlayer('Alice');
    const footerVersion = alice.page.locator('footer [data-app-version]');

    await alice.page.goto('/');
    await expect(footerVersion).toHaveText(`v${version}`);

    await createRoom(alice);
    await expect(footerVersion).toHaveText(`v${version}`);
});

// iOS cannot read an SVG apple-touch-icon: the home-screen icon must be a PNG.
// An ICO file has two names for its type; browsers take either
test('the icons the pages name are served, the iPhone one as a PNG', async ({ newPlayer, request }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');

    for (const [rel, type] of [['icon', /^image\/(x-icon|vnd\.microsoft\.icon)$/], ['apple-touch-icon', /^image\/png$/]]) {
        const answer = await request.get(await page.locator(`link[rel="${rel}"]`).getAttribute('href'));
        expect(answer.status(), rel).toBe(200);
        expect(answer.headers()['content-type'], rel).toMatch(type);
    }
});

test('the guard fails a test when a page throws', async ({ newPlayer }) => {
    test.fail(true, 'a JavaScript error on any player page must fail the test');
    const alice = await newPlayer('Alice');

    await alice.page.goto('/');
    await alice.page.evaluate(() => setTimeout(() => { throw new Error('boom'); }));
    await expect(alice.page.locator('body')).toBeVisible();
});

test('the guard fails a test when a page breaks the Content Security Policy', async ({ newPlayer }) => {
    test.fail(true, 'a style the policy blocks must fail the test');
    const alice = await newPlayer('Alice');

    await alice.page.goto('/');
    await alice.page.evaluate(() => document.body.setAttribute('style', 'outline: 1px solid red'));
    await expect(alice.page.locator('body')).toBeVisible();
});
