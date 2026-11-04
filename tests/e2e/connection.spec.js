// The room's socket (public/js/room-socket.js and worker/room-base.js): a
// page that reloads, and messages that are not the game's, change nothing for
// the players. A connection that drops mid-round: game.spec.js
const { test, expect, playerCard, waitForPlayers, assignCharacter, roomWith } = require('./helpers');

/* global socket -- the room page's RoomSocket (game-room.js), inside page.evaluate() */

// The new page's socket joins the room before the old one is gone: the player
// stays in, and their moves reach everybody
test('after a reload the player still moves', async ({ newPlayer }) => {
    const { players: [, bob, carol] } = await roomWith(newPlayer, ['Alice', 'Bob', 'Carol']);

    await bob.page.reload();
    await waitForPlayers(bob.page, 3);
    await assignCharacter(bob, 'Alice', 'Napoleon');

    await expect(playerCard(carol.page, 'Alice').locator('.character-sticker')).toHaveText('Napoleon');
});

test('junk on the socket breaks nothing', async ({ newPlayer }) => {
    const { players: [alice, , carol] } = await roomWith(newPlayer, ['Alice', 'Bob', 'Carol']);

    await alice.page.evaluate(() => {
        for (const junk of ['not json', '{}', '[1,2]', JSON.stringify({ event: 5 }), JSON.stringify({ event: 'no-such-event', data: 1 })]) {
            socket.ws.send(junk);
        }
    });
    await assignCharacter(alice, 'Bob', 'Zorro');

    await expect(playerCard(carol.page, 'Bob').locator('.character-sticker')).toHaveText('Zorro');
});

// A desktop tab hidden for a while gets its timers once a minute (Chrome's
// intensive throttling): its pings go a minute apart, and the room's answer
// to the last one is a minute old by the next. That is no dead connection
test('a page whose timers run once a minute keeps its connection', async ({ newPlayer }) => {
    const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Bob']);

    const replaced = await alice.page.evaluate(() => {
        const before = socket.ws;
        socket.lastHeard = Date.now() - 65_000; // the pong of the previous tick, a throttled minute ago
        socket.checkConnection();
        return socket.ws !== before;
    });

    expect(replaced).toBe(false);
});
