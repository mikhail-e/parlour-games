// The room: creating it from the landing page, a friend joining by its link
const { test, expect, text, createRoom, joinRoom, waitForPlayers, playerCard } = require('./helpers');

test('a room is created, and a friend joins its lobby by the link', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');

    const code = await createRoom(alice);
    await expect(alice.page.locator('#roomCode')).toHaveText(code);
    await joinRoom(bob, code);

    for (const player of [alice, bob]) {
        await waitForPlayers(player.page, 2);
        await expect(playerCard(player.page, 'Alice')).toBeVisible();
        await expect(playerCard(player.page, 'Bob')).toBeVisible();
    }
    await expect(playerCard(bob.page, 'Bob')).toContainText(text('you'));
});
