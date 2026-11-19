// The room's timer (worker/room.js): a room nobody has open goes after the
// empty-room time (two hours); a player whose page is gone leaves after the
// ghost time (an hour) - but only while somebody plays. These run on the local
// server whose times are seconds (playwright.config.js)
const { test, waitForPlayers, roomWith } = require('./helpers');

test.skip(!!process.env.BASE_URL, 'needs the local server with short timers');
test.skip(({ isMobile }) => isMobile, "the room's timers: one browser is enough");
test.use({ baseURL: process.env.E2E_FAST_TIMERS_URL });

// A room nobody has open goes, nobody leaves while every page is closed: the
// kit's tests (packages/room-kit/e2e-kit-tests.js), on this server too
require('@parlour-games/room-kit/e2e-kit-tests').roomTimerTests();

// Longer than the ghost time of the fast server, the room's next timer included
const GHOST_WAIT = { timeout: 10_000 };

test('a player whose page is gone leaves after the ghost time while others play', async ({ newPlayer }) => {
    const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', 'Bob']);

    await bob.page.close();

    await waitForPlayers(alice.page, 1, GHOST_WAIT);
});

