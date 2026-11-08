// The room of Consequences between rounds and around them: the lobby and its
// invitation, one browser as one player (a reload, another browser), a player
// offline in the middle of a round and back, leaving. The room's timers
// (ghosts, an empty room) are in room-timers.spec.js, entering from the
// landing page in landing.spec.js
const {
    test, expect, text, serverErrorText, createRoom, joinRoom, roomWith, waitForPlayers, waitForLanding, leaveGame,
    seedStorage, startedRound, answer, answerStep, waitForStep, returnToRound, seatRow,
} = require('./helpers');

// The names of the lobby's cards, in their order, without "(You)"
const listedNames = page => page.locator('.player-name').evaluateAll(names =>
    names.map(name => name.firstChild.textContent));
// The names of the round's table, in their order
const seatedNames = page => page.locator('#seatList .seat-name').evaluateAll(names =>
    names.map(name => name.firstChild.textContent));

test('the lobby lists the players in the order they came, the same on every screen', async ({ newPlayer }) => {
    const { players } = await roomWith(newPlayer, ['Anna', 'Boris', 'Vera']);

    for (const player of players) {
        expect(await listedNames(player.page)).toEqual(['Anna', 'Boris', 'Vera']);
        await expect(player.page.locator('#shareCard')).toBeVisible();
        await expect(player.page.locator('#playerCount')).toHaveText('3');
    }
});

test('Copy Link puts the room link on the clipboard', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    await anna.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const code = await createRoom(anna);

    await anna.page.locator('#copyLink').click();

    await expect(anna.page.locator('#copyLink')).toHaveText(text('copiedSuccess'));
    expect(await anna.page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/game/${code}$`));
});

test('"Copied!" goes by itself, a second press included, and the button is back with its icon and a label that follows the language', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna', { locale: 'en-GB' });
    await anna.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await createRoom(anna);
    const button = anna.page.locator('#copyLink');

    await button.click();
    await expect(button.locator('.icon--check')).toBeVisible();
    await button.click();

    await expect(button).toHaveText(text('copyLink', 'en'));
    await expect(button.locator('.icon--copy')).toBeVisible();
    await anna.page.locator('.lang-toggle-btn').click();
    await expect(button).toHaveText(text('copyLink', 'ru'));
});

test('a reload keeps the player at their place, without a double', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await roomWith(newPlayer, ['Anna', 'Boris', 'Vera']);

    await boris.page.reload();

    await waitForPlayers(boris.page, 3);
    expect(await listedNames(boris.page)).toEqual(['Anna', 'Boris', 'Vera']);
    await waitForPlayers(anna.page, 3);
});

test('a page that fails to draw as it enters stays in the room, and its error is not called a connection error', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    // The first drawing after the reload finds no answer button, as a page does
    // whose browser kept an old script next to new markup
    await boris.page.addInitScript(() => {
        const getElementById = document.getElementById.bind(document);
        let missing = true;
        document.getElementById = id => {
            if (id === 'saveAndPass' && missing) {
                missing = false;
                return null;
            }
            return getElementById(id);
        };
    });
    boris.allowConsoleError(/^Drawing the room failed/);

    await boris.page.reload();

    // Still in the room at his question, and his page is in the room again:
    // his answer goes through
    await expect(boris.page).toHaveURL(/\/game\/[A-Z0-9]{6}$/);
    await expect(boris.page.locator('#questionText')).toHaveText(text('question1'));
    await answerStep([anna, boris], 0);
});

test("another browser with a player's ID is refused: that player plays in another browser", async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    const code = await createRoom(anna);
    const annasId = await anna.page.evaluate(() => localStorage.getItem('playerId'));
    const stranger = await newPlayer('Stranger');
    await seedStorage(stranger, { playerId: annasId });
    stranger.expectDialog(serverErrorText('This player is playing in another browser'));
    stranger.allowConsoleError(/the server responded with a status of 400/);

    await stranger.page.goto(`/?join=${code}`);
    await waitForLanding(stranger.page);
    await stranger.page.fill('#playerName', 'Stranger');
    await stranger.page.click('#joinBtn');

    await expect.poll(() => stranger.expectedDialogs.length).toBe(0);
    await expect(stranger.page).not.toHaveURL(/\/game\//);
    expect(await listedNames(anna.page)).toEqual(['Anna']);
});

test('a player whose page goes is offline for the others, and comes back to their seat where the round is now', async ({ newPlayer }) => {
    const { players: [anna, boris, vera], code } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);

    await vera.page.close();

    await expect(seatRow(anna.page, 'Vera')).toContainText(text('statusOffline'));
    await expect(seatRow(boris.page, 'Vera')).toContainText(text('statusOffline'));
    expect(await seatedNames(anna.page)).toEqual(['Anna', 'Boris', 'Vera']);

    // The round goes on without her: Anna answers for her
    await answer(anna, 'Anna 1');
    await answer(boris, 'Boris 1');
    await seatRow(anna.page, 'Vera').getByRole('button').click();
    await answer(anna, 'for Vera 1');
    await waitForStep([anna, boris], 1);

    const back = { name: 'Vera', page: await vera.context.newPage() };
    await returnToRound(back, code);

    await expect(seatRow(anna.page, 'Vera')).not.toContainText(text('statusOffline'));
    await expect(seatRow(anna.page, 'Vera')).toContainText(text('statusWriting'));
    expect(await seatedNames(back.page)).toEqual(['Anna', 'Boris', 'Vera']);
    await expect(back.page.locator('#questionText')).toHaveText(text('question2'));
    await answerStep([anna, boris, back], 1);
});

test('leaving the lobby goes home with the code filled in, and the others see who left', async ({ newPlayer }) => {
    const { players: [anna, boris], code } = await roomWith(newPlayer, ['Anna', 'Boris']);

    await leaveGame(boris);

    await expect(boris.page).toHaveURL(new RegExp(`/\\?join=${code}$`));
    await expect(boris.page.locator('#roomCode')).toHaveValue(code);
    await waitForPlayers(anna.page, 1);
    await expect(anna.page.locator('.alert.position-fixed')).toContainText(
        text('playerLeftNotification', 'en', { playerName: 'Boris' }));
    await expect(anna.page.locator('.alert.position-fixed .icon--left')).toBeVisible();
});

test('Leave in one tab takes the player out of the room in every tab', async ({ newPlayer }) => {
    const { players: [anna, boris], code } = await roomWith(newPlayer, ['Anna', 'Boris']);
    const secondTab = { name: 'Anna', page: await anna.context.newPage() };
    await joinRoom(secondTab, code);

    await leaveGame(anna);

    await expect(secondTab.page).toHaveURL(new RegExp(`/\\?join=${code}$`));
    await waitForPlayers(boris.page, 1);
});

test('the last player to leave deletes the room', async ({ newPlayer }) => {
    const { players: [anna, boris], code } = await roomWith(newPlayer, ['Anna', 'Boris']);

    await leaveGame(boris);
    await waitForPlayers(anna.page, 1);
    await leaveGame(anna);

    await expect(anna.page).toHaveURL(/\/$/);
    await anna.page.goto(`/game/${code}`);
    await expect(anna.page).toHaveURL(/\/\?error=room-not-found$/);
});
