// The room's timers (the kit's room with players): a room nobody has open goes
// after the empty-room time (two hours); a player whose page is gone leaves
// after the ghost time (an hour) - but only while somebody plays. These run on
// the local server whose times are seconds (playwright.config.js)
const { test, expect, text, createRoom, joinRoom, waitForPlayers, roomWith, startedRound, seatRow } = require('./helpers');

test.skip(!!process.env.BASE_URL, 'needs the local server with short timers');
test.skip(({ isMobile }) => isMobile, "the room's timers: one browser is enough");
test.use({ baseURL: process.env.E2E_FAST_TIMERS_URL });

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });
// Longer than the ghost time of the fast server, the room's next timer included
const GHOST_WAIT = { timeout: 10_000 };

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
