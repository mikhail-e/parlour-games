// WCAG 2.1 AA checks with axe on every screen and window of the game.
// axe cannot measure contrast on the page's gradient background (it reports
// such text as "incomplete", not as a violation): that needs a pixel check
const { AxeBuilder } = require('@axe-core/playwright');
const {
    test, expect, text, PAGE_STATUS_404, createRoom, roomWith, askToJoin, startedRound, answer, writeToReading,
    showStories, seatRow, waitForLanding,
} = require('./helpers');

const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// "rule: element, element" for each violation - a readable diff when it fails
async function violations(page, only) {
    // Measure the colors as they end up, not half-way through a CSS
    // transition (a confirm button under the finger that opened its window
    // turns red). An added <style> tag is inline code the Content Security
    // Policy blocks; a rule put into the page's own stylesheet is allowed
    await page.evaluate(() => {
        const sheet = [...document.styleSheets].find(each => each.href && each.href.endsWith('/css/style.css'));
        sheet.insertRule('*, *::before, *::after { transition: none !important; }', sheet.cssRules.length);
    });
    let builder = new AxeBuilder({ page }).withTags(WCAG_21_AA);
    if (only) builder = builder.include(only);
    const result = await builder.analyze();
    return result.violations.map(violation =>
        `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`);
}

test('the message window', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/');
    await waitForLanding(page);
    await page.click('#createNewGame');
    await expect(page.getByRole('dialog', { name: text('pleaseEnterName') })).toBeVisible();

    expect(await violations(page, '.message-window')).toEqual([]);
});

test('the landing page', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/');
    await expect(page.locator('#avatarSelector .avatar-option')).toHaveCount(12);

    expect(await violations(page)).toEqual([]);
});

// A room link opens the landing page with a notification ("Ready to join")
test('the landing page from a room link', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/?join=ZZZZZZ');
    await expect(page.locator('.alert-info')).toContainText(text('readyToJoin'));

    expect(await violations(page)).toEqual([]);
});

test('the page-not-found page', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    anna.allowConsoleError(PAGE_STATUS_404);
    await anna.page.goto('/no-such/page/here');
    await expect(anna.page.getByRole('heading', { name: text('notFoundTitle') })).toBeVisible();

    expect(await violations(anna.page)).toEqual([]);
});

test('the lobby of one player, Start off', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    await createRoom(anna);
    await expect(anna.page.locator('#startRound')).toBeDisabled();

    expect(await violations(anna.page)).toEqual([]);
});

test('the lobby of two', async ({ newPlayer }) => {
    const { players: [anna] } = await roomWith(newPlayer, ['Anna', 'Boris']);

    expect(await violations(anna.page)).toEqual([]);
});

test('the writing: the question and the answer field', async ({ newPlayer }) => {
    const { players: [anna] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await anna.page.fill('#answerText', 'A pirate grandmother');

    expect(await violations(anna.page)).toEqual([]);
});

test('the writing: the answer folded, a player away, Answer for', async ({ newPlayer }) => {
    const { players: [anna, , vera] } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);
    await vera.page.close();
    await answer(anna, 'Anna 1');
    await expect(seatRow(anna.page, 'Vera').getByRole('button')).toBeVisible();

    expect(await violations(anna.page)).toEqual([]);
});

test('the reading: a closed sheet', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    await expect(players[0].page.locator('#readingCard .closed-sheet')).toBeVisible();

    expect(await violations(players[0].page)).toEqual([]);
});

test('the reading: an open sheet', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    await players[0].page.locator('#readingCard .closed-sheet').click();
    await expect(players[0].page.locator('#readingCard .story')).toBeVisible();

    expect(await violations(players[0].page)).toEqual([]);
});

test('every story', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await player.page.locator('#readingCard .closed-sheet').click();
    await showStories(players[0]);

    expect(await violations(players[0].page)).toEqual([]);
});

// A newcomer to a round waits for the next one
test('the waiting screen', async ({ newPlayer }) => {
    const { code } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);

    expect(await violations(dasha.page)).toEqual([]);
});

test('the update banner', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna');
    await page.goto('/');
    await expect(page.locator('#avatarSelector .avatar-option')).toHaveCount(12);
    // A release cannot be staged in a test: show the banner the way pwa.js
    // does when a new service worker is ready (site.spec.js)
    await page.evaluate(() => window.pwaManager.showUpdateAvailable());
    await expect(page.getByRole('button', { name: text('updateNow') })).toBeVisible();

    expect(await violations(page, '.alert-warning')).toEqual([]);
});

for (const id of ['newRoundModal', 'leaveModal']) {
    test(`the ${id} window`, async ({ newPlayer }) => {
        const { players: [anna] } = await startedRound(newPlayer, ['Anna', 'Boris']);

        await anna.page.click(id === 'newRoundModal' ? '#newRound' : '#leaveGame');
        await expect(anna.page.locator(`#${id}`)).toHaveClass(/\bshow\b/);

        expect(await violations(anna.page, `#${id}`)).toEqual([]);
    });
}
