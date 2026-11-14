// The site around the game: only its own code, the security headers, the
// version in the footer, the icons, the service worker and its update banner
// (the kit's tests, packages/room-kit/e2e-kit-tests.js, on this game's
// pages), and the guard every browser test runs under
const { test, expect, text } = require('./helpers');

require('@parlour-games/room-kit/e2e-kit-tests').siteTests({ text });

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
