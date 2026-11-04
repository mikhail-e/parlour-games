// The room's timer (worker/room.js): a room nobody has open goes after the
// empty-room time (two hours); a player whose page is gone leaves after the
// ghost time (an hour) - but only while somebody plays. These run on the local
// server whose times are seconds (playwright.config.js)
const { test, expect, createRoom, joinRoom, waitForPlayers, roomWith } = require('./helpers');

test.skip(!!process.env.BASE_URL, 'needs the local server with short timers');
test.skip(({ isMobile }) => isMobile, "the room's timers: one browser is enough");
test.use({ baseURL: process.env.E2E_FAST_TIMERS_URL });

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });
// Longer than the ghost time of the fast server, the room's next timer included
const GHOST_WAIT = { timeout: 10_000 };

test('a room nobody has open is gone after the empty-room time', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const code = await createRoom(alice);
    await alice.page.goto('/');

    await sleep(9000); // longer than the empty-room time of the fast server
    await alice.page.goto(`/game/${code}`);

    await expect(alice.page).toHaveURL(/\/\?error=room-not-found$/);
});

test('a player whose page is gone leaves after the ghost time while others play', async ({ newPlayer }) => {
    const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', 'Bob']);

    await bob.page.close();

    await waitForPlayers(alice.page, 1, GHOST_WAIT);
});

test('nobody leaves while every page is closed; the ghost time starts again on return', async ({ newPlayer }) => {
    const { players: [alice, bob], code } = await roomWith(newPlayer, ['Alice', 'Bob']);
    await alice.page.close();
    await bob.page.close();

    // Longer than the ghost time, and well short of the empty-room time: the
    // return below has to reach the room before it goes
    await sleep(4500);
    const back = { name: 'Alice', page: await alice.context.newPage() };
    await joinRoom(back, code);

    await waitForPlayers(back.page, 2); // Bob is still listed: nobody was removed in the gap
    await waitForPlayers(back.page, 1, GHOST_WAIT); // and goes the ghost time after Alice came back
});
