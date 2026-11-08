// A newcomer to a round waits for the lobby (the consequences/room spec): the
// waiting screen, the players seeing who waits, the next round letting them
// in without a tap, and a newcomer who gives up. The waiting screen and the
// request are the kit's; letting in at the next round is the game's
const {
    test, expect, text, askToJoin, waitForPlayers, startedRound, writeToReading, showStories, seatRow,
} = require('./helpers');

const waitingLine = page => page.locator('#waitingNewcomers');

test('a newcomer to a round waits for the next one, and the players see who waits', async ({ newPlayer }) => {
    const { players: [anna, boris], code } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const dasha = await newPlayer('Dasha');

    await askToJoin(dasha, code);

    await expect(dasha.page.locator('#waitingSheet')).toContainText(text('waitForNextRound'));
    await expect(dasha.page.locator('#writingCard')).toBeHidden();
    await expect(dasha.page.locator('#seatsCard')).toBeHidden();
    for (const player of [anna, boris]) {
        await expect(waitingLine(player.page)).toBeVisible();
        await expect(waitingLine(player.page)).toHaveText(text('waitingNewcomers', 'en', { names: 'Dasha' }));
    }
    // A player's page opened later sees her too
    await anna.page.reload();
    await expect(waitingLine(anna.page)).toBeVisible();
    await expect(waitingLine(anna.page)).toHaveText(text('waitingNewcomers', 'en', { names: 'Dasha' }));
    await expect(seatRow(anna.page, 'Dasha')).toHaveCount(0);
});

test('Another round lets the waiting newcomer into the lobby without a tap', async ({ newPlayer }) => {
    const { players, code } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await writeToReading(players);
    for (const player of players) await player.page.locator('#readingCard .closed-sheet').first().click();
    await showStories(players[0]);

    await players[0].page.click('#anotherRound');

    await expect(dasha.page.locator('#waitingSheet')).toBeHidden();
    for (const player of [...players, dasha]) {
        await waitForPlayers(player.page, 3);
        await expect(player.page.locator('#startRound')).toBeEnabled();
    }
});

test('a newcomer who closes the page waits no more', async ({ newPlayer }) => {
    const { players: [anna], code } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expect(waitingLine(anna.page)).toBeVisible();

    await dasha.page.close();

    await expect(waitingLine(anna.page)).toBeHidden();
});
