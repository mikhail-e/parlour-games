// WCAG 2.1 AA checks with axe on every screen and window of the game.
// axe cannot measure contrast on the page's gradient background (it reports
// such text as "incomplete", not as a violation): that needs a pixel check
const {
    test, expect, text, PAGE_STATUS_404, createRoom, joinRoom, waitForPlayers, playerCard, startedGame, askToJoin, axeViolations,
} = require('./helpers');

test('the landing page', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    await expect(page.locator('#avatarSelector .avatar-option')).toHaveCount(12);

    expect(await axeViolations(page)).toEqual([]);
});

// A room link opens the landing page with a notification ("Ready to join")
test('the landing page from a room link', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/?join=ZZZZZZ');
    await expect(page.locator('.alert-info')).toContainText(text('readyToJoin'));

    expect(await axeViolations(page)).toEqual([]);
});

test('the page-not-found page', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    alice.allowConsoleError(PAGE_STATUS_404);
    await alice.page.goto('/no-such/page/here');
    await expect(alice.page.getByRole('heading', { name: text('notFoundTitle') })).toBeVisible();

    expect(await axeViolations(alice.page)).toEqual([]);
});

test('a room while players assign characters', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    const code = await createRoom(alice);
    await joinRoom(bob, code);
    await waitForPlayers(alice.page, 2);

    expect(await axeViolations(alice.page)).toEqual([]);
});

test('a started game', async ({ newPlayer }) => {
    const { players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);

    expect(await axeViolations(alice.page)).toEqual([]);
});

test('the update banner', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    await expect(page.locator('#avatarSelector .avatar-option')).toHaveCount(12);
    // A release cannot be staged in a test: show the banner the way pwa.js
    // does when a new service worker is ready (site-headers.spec.js)
    await page.evaluate(() => window.pwaManager.showUpdateAvailable());
    await expect(page.getByRole('button', { name: text('updateNow') })).toBeVisible();

    expect(await axeViolations(page, '.alert-warning')).toEqual([]);
});

// A newcomer to a started game waits for a player to let them in
test('the waiting screen', async ({ newPlayer }) => {
    const { code } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);

    expect(await axeViolations(dasha.page)).toEqual([]);
});

test('the joinRequestModal window', async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expect(alice.page.locator('#joinRequestModal')).toHaveClass(/\bshow\b/);

    expect(await axeViolations(alice.page, '#joinRequestModal')).toEqual([]);
});

const windows = [
    { id: 'revealModal', open: page => playerCard(page, 'Alice').locator('.character-sticker.mystery').click() },
    { id: 'restartModal', open: page => page.click('#restartGame') },
    { id: 'leaveModal', open: page => page.click('#leaveGame') },
];

for (const { id, open } of windows) {
    test(`the ${id} window`, async ({ newPlayer }) => {
        const { players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);

        await open(alice.page);
        await expect(alice.page.locator(`#${id}`)).toHaveClass(/\bshow\b/);

        expect(await axeViolations(alice.page, `#${id}`)).toEqual([]);
    });
}
