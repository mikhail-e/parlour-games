// A browser that played before keeps what it saved: the kit's page scripts read
// the keys whoami has always written (playerId, whoami-player-secret,
// whoami-language), so the player stays the same player, in the same language
const { test, expect, text, seedStorage, createRoom, joinRoom, playerCard, waitForPlayers } = require('./helpers');

/* global PLAYER_ID, PLAYER_SECRET -- the kit's app.js, inside page.evaluate() */

const SAVED = {
    playerId: '7b0c3e1a-5d2f-4a6b-9c8d-1e2f3a4b5c6d',
    'whoami-player-secret': 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b',
    'whoami-language': 'ru',
};

test('a browser with saved data is the same player, in its saved language', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await seedStorage(alice, SAVED);
    const code = await createRoom(alice);

    expect(await alice.page.evaluate(() => [PLAYER_ID, PLAYER_SECRET]))
        .toEqual([SAVED.playerId, SAVED['whoami-player-secret']]);
    await expect(alice.page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(alice.page.getByRole('button', { name: text('startGame', 'ru') })).toBeVisible();

    // The same saved data in another browser is the same player: the server
    // takes its secret, and the room still has one player
    const again = await newPlayer('Alice');
    await seedStorage(again, SAVED);
    await joinRoom(again, code);

    await waitForPlayers(again.page, 1);
    await expect(playerCard(again.page, 'Alice')).toHaveCount(1);
    await waitForPlayers(alice.page, 1);
});
