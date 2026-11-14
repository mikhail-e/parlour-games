// WCAG 2.1 AA checks with axe on every screen and window of the game.
// axe cannot measure contrast on the page's gradient background (it reports
// such text as "incomplete", not as a violation): that needs a pixel check
const {
    test, expect, text, PAGE_STATUS_404, createRoom, roomWith, askToJoin, startedRound, answer, writeToReading,
    showStories, confirmAnotherRound, seatRow, waitForLanding, axeViolations,
} = require('./helpers');
/* global showMessage -- the kit's notify.js, called in the page */

test('the message window', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/');
    await waitForLanding(page);
    await page.evaluate(() => { showMessage('A message'); });
    await expect(page.getByRole('dialog', { name: 'A message' })).toBeVisible();

    expect(await axeViolations(page, '.message-window')).toEqual([]);
});

test('the landing page', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/');
    await expect(page.locator('#avatarSelector .avatar-option')).toHaveCount(12);

    expect(await axeViolations(page)).toEqual([]);
});

// A room link opens the landing page with a notification ("Ready to join")
test('the landing page from a room link', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/?join=ZZZZZZ');
    await expect(page.locator('.alert-info')).toContainText(text('readyToJoin'));

    expect(await axeViolations(page)).toEqual([]);
});

test('the page-not-found page', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    anna.allowConsoleError(PAGE_STATUS_404);
    await anna.page.goto('/no-such/page/here');
    await expect(anna.page.getByRole('heading', { name: text('notFoundTitle') })).toBeVisible();

    expect(await axeViolations(anna.page)).toEqual([]);
});

test('the lobby of one player, Start off', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    await createRoom(anna);
    await expect(anna.page.locator('#startRound')).toBeDisabled();

    expect(await axeViolations(anna.page)).toEqual([]);
});

test('the lobby of two', async ({ newPlayer }) => {
    const { players: [anna] } = await roomWith(newPlayer, ['Anna', 'Boris']);

    expect(await axeViolations(anna.page)).toEqual([]);
});

test('the writing: the question and the answer field', async ({ newPlayer }) => {
    const { players: [anna] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await anna.page.fill('#answerText', 'A pirate grandmother');

    expect(await axeViolations(anna.page)).toEqual([]);
});

test('the writing: the answer folded, a player away, Answer for', async ({ newPlayer }) => {
    const { players: [anna, , vera] } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);
    await vera.page.close();
    await answer(anna, 'Anna 1');
    await expect(seatRow(anna.page, 'Vera').getByRole('button')).toBeVisible();

    expect(await axeViolations(anna.page)).toEqual([]);
});

test('the reading: a closed sheet', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    await expect(players[0].page.locator('#readingCard .closed-sheet')).toBeVisible();

    expect(await axeViolations(players[0].page)).toEqual([]);
});

test('the reading: an open sheet', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    await players[0].page.locator('#readingCard .closed-sheet').click();
    await expect(players[0].page.locator('#readingCard .story')).toBeVisible();

    expect(await axeViolations(players[0].page)).toEqual([]);
});

test('the reading: every sheet open, the coffee coupon under Another round', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await player.page.locator('#readingCard .closed-sheet').click();
    await expect(players[0].page.locator('#coffeeCoupon')).toBeVisible();

    expect(await axeViolations(players[0].page)).toEqual([]);
});

test('every story', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await player.page.locator('#readingCard .closed-sheet').click();
    await showStories(players[0]);

    expect(await axeViolations(players[0].page)).toEqual([]);
});

test('every story: Another round asked inside the window', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await player.page.locator('#readingCard .closed-sheet').click();
    await showStories(players[0]);
    await players[0].page.click('#windowAnotherRound');
    await expect(players[0].page.locator('#confirmWindowNewRound')).toBeVisible();

    expect(await axeViolations(players[0].page, '#storiesModal')).toEqual([]);
});

// A round played: the lobby lists it, and its row opens the window on it
test('the rounds played in the lobby, and a round of them in the window', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await player.page.locator('#readingCard .closed-sheet').click();
    await confirmAnotherRound(players[0]);
    const { page } = players[0];
    await expect(page.locator('#roundsList .rounds-list__row')).toHaveCount(1);

    expect(await axeViolations(page)).toEqual([]);

    await page.locator('#roundsList .rounds-list__row').click();
    await expect(page.locator('#storyList .sheet')).toHaveCount(2);
    expect(await axeViolations(page)).toEqual([]);
});

// A newcomer to a round waits for the next one
test('the waiting screen', async ({ newPlayer }) => {
    const { code } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);

    expect(await axeViolations(dasha.page)).toEqual([]);
});

test('the update banner', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/');
    await expect(page.locator('#avatarSelector .avatar-option')).toHaveCount(12);
    // A release cannot be staged in a test: show the banner the way pwa.js
    // does when a new service worker is ready (site.spec.js)
    await page.evaluate(() => window.pwaManager.showUpdateAvailable());
    await expect(page.getByRole('button', { name: text('updateNow') })).toBeVisible();

    expect(await axeViolations(page, '.alert-warning')).toEqual([]);
});

for (const id of ['newRoundModal', 'leaveModal']) {
    test(`the ${id} window`, async ({ newPlayer }) => {
        const { players: [anna] } = await startedRound(newPlayer, ['Anna', 'Boris']);

        await anna.page.click(id === 'newRoundModal' ? '#newRound' : '#leaveGame');
        await expect(anna.page.locator(`#${id}`)).toHaveClass(/\bshow\b/);

        expect(await axeViolations(anna.page, `#${id}`)).toEqual([]);
    });
}
