// The room's timers (the kit's room with players): a room nobody has open goes
// after the empty-room time (two hours); a player whose page is gone leaves
// after the ghost time (an hour) - but only while somebody plays. And the
// game's own: the pause after a step's last answer. These run on the local
// server whose times are seconds (playwright.config.js)
const { test, expect, text, createRoom, joinRoom, waitForPlayers, roomWith, startedRound, seatRow, answer, roundStep, waitForStep } = require('./helpers');

test.skip(!!process.env.BASE_URL, 'needs the local server with short timers');
test.skip(({ isMobile }) => isMobile, "the room's timers: one browser is enough");
test.use({ baseURL: process.env.E2E_FAST_TIMERS_URL });

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });
// Longer than the ghost time of the fast server, the room's next timer included
const GHOST_WAIT = { timeout: 10_000 };
// Longer than the fast server's pause after a step's last answer
const LONGER_THAN_PAUSE = 4000;

// Longer than the fast server's pause, shorter than its late alarm (LATE_ALARM_MS)
const SOONER_THAN_THE_LATE_ALARM = { timeout: 15_000 };

test('the sheets move on at the end of the pause even when the alarm runs late', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);

    await answer(anna, 'Anna 1');
    await answer(boris, 'Boris 1');

    await expect.poll(() => roundStep(anna.page), SOONER_THAN_THE_LATE_ALARM).toBe(1);
    await expect.poll(() => roundStep(boris.page), SOONER_THAN_THE_LATE_ALARM).toBe(1);
});

test('a room nobody has open is gone after the empty-room time', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    const code = await createRoom(anna);
    await anna.page.goto('/');

    await sleep(9000); // longer than the empty-room time of the fast server
    await anna.page.goto(`/game/${code}`);

    await expect(anna.page).toHaveURL(/\/\?error=room-not-found$/);
});

test('a player gone for the ghost time in the middle of a round leaves, and keeps their seat', async ({ newPlayer }) => {
    const { players: [anna, boris, vera] } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);

    await vera.page.close();

    await expect(seatRow(anna.page, 'Vera')).toContainText(text('statusLeft'), GHOST_WAIT);
    await expect(seatRow(boris.page, 'Vera')).toContainText(text('statusLeft'));
    // Back in the lobby she is listed no more
    await anna.page.click('#newRound');
    await expect(anna.page.locator('#newRoundModal')).toHaveClass(/\bshow\b/);
    await anna.page.click('#confirmNewRound');
    await waitForPlayers(anna.page, 2);
    await waitForPlayers(boris.page, 2);
});

test('nobody leaves while every page is closed; the ghost time starts again on return', async ({ newPlayer }) => {
    const { players: [anna, boris], code } = await roomWith(newPlayer, ['Anna', 'Boris']);
    await anna.page.close();
    await boris.page.close();

    // Longer than the ghost time, and well short of the empty-room time: the
    // return below has to reach the room before it goes
    await sleep(4500);
    const back = { name: 'Anna', page: await anna.context.newPage() };
    await joinRoom(back, code);

    await waitForPlayers(back.page, 2); // Boris is still listed: nobody was removed in the gap
    await waitForPlayers(back.page, 1, GHOST_WAIT); // and goes the ghost time after Anna came back
});

test('after the last answer the sheets stay for the pause: the last writer can still press Change the answer, then the next question opens', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await answer(anna, 'Anna 1');
    await expect(anna.page.locator('#editAnswer')).toBeVisible();

    await answer(boris, 'Boris 1');

    await expect(boris.page.locator('#editAnswer')).toBeVisible();
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusDone'));
    await sleep(1000); // well inside the pause
    expect(await roundStep(boris.page)).toBe(0);
    await expect(boris.page.locator('#editAnswer')).toBeVisible();

    await waitForStep([anna, boris], 1);
    await expect(boris.page.locator('#questionText')).toHaveText(text('question2'));
    await expect(boris.page.locator('#answerText')).toHaveValue('');
});

test('Change the answer in the pause holds the sheets until the new answer, which starts a whole pause', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await answer(anna, 'Anna 1');
    await expect(anna.page.locator('#editAnswer')).toBeVisible();
    await answer(boris, 'Boris first');

    await boris.page.locator('#editAnswer').click();

    await expect(boris.page.locator('#answerText')).toHaveValue('Boris first');
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusWriting'));
    await sleep(LONGER_THAN_PAUSE);
    expect(await roundStep(anna.page)).toBe(0);
    await expect(boris.page.locator('#answerText')).toHaveValue('Boris first');

    await boris.page.fill('#answerText', 'Boris changed');
    await boris.page.click('#saveAndPass');
    await expect(boris.page.locator('#editAnswer')).toBeVisible();
    await sleep(1000); // well inside the new pause
    expect(await roundStep(anna.page)).toBe(0);
    await waitForStep([anna, boris], 1);
});

test('every page closed in the pause: back after it, the next question is open - the pause is the room\'s, not a page\'s', async ({ newPlayer }) => {
    const { players: [anna, boris], code } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await answer(anna, 'Anna 1');
    await expect(anna.page.locator('#editAnswer')).toBeVisible();
    await answer(boris, 'Boris 1');
    await expect(boris.page.locator('#editAnswer')).toBeVisible();

    await anna.page.goto('about:blank');
    await boris.page.goto('about:blank');
    await sleep(LONGER_THAN_PAUSE); // and well short of the empty-room time

    await anna.page.goto(`/game/${code}`);
    await boris.page.goto(`/game/${code}`);
    await waitForStep([anna, boris], 1);
    await expect(anna.page.locator('#questionText')).toHaveText(text('question2'));
});
