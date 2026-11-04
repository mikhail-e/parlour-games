// Joining a started game: a latecomer asks, waits on the room page without
// seeing the room, and any player lets them in or declines (the rules:
// tests/late-join.test.js)
const {
    test, expect, text, serverErrorText, playerCard, startedGame, waitForPlayers, askToJoin, waitForLanding,
    assignCharacter, revealOwnCharacter,
} = require('./helpers');

/* global socket, RoomSocket, joinRequestQueue, PLAYER_ID, PLAYER_SECRET -- the room page's names (game-room.js, room-socket.js, utils.js), inside page.evaluate() */

const requestWindow = page => page.locator('#joinRequestModal');
const notifications = page => page.locator('.alert.position-fixed');

// The request window shows this newcomer
async function expectRequestFrom(page, name) {
    await expect(requestWindow(page)).toHaveClass(/\bshow\b/);
    await expect(page.locator('#joinRequestName')).toHaveText(name);
}

test('a newcomer waits without seeing the room', async ({ newPlayer }) => {
    const { code } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');

    await askToJoin(dasha, code);

    await expect(dasha.page.locator('#waitingName')).toHaveText('Dasha');
    await expect(dasha.page.locator('.seal-spinner')).toBeVisible();
    await expect(dasha.page.getByRole('status')).toHaveText(text('waitingForAdmission'));
    await expect(dasha.page.locator('.player-card')).toHaveCount(0);
    // Nothing of the room: not its status line, not its buttons, not its invitations
    await expect(dasha.page.locator('#gameStatus')).toBeHidden();
    await expect(dasha.page.locator('#leaveGame')).toBeHidden();
    await expect(dasha.page.locator('.room-ticket')).toBeHidden();
    await expect(dasha.page.locator('#shareCard')).toBeHidden();
    await expect(dasha.page.locator('#gameInviteCard')).toBeHidden();
});

test('any player can let a newcomer in', async ({ newPlayer }) => {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);

    // Bob did not start the game
    await expectRequestFrom(bob.page, 'Dasha');
    await bob.page.getByRole('button', { name: text('admitPlayer') }).click();

    await waitForPlayers(dasha.page, 3);
    await expect(dasha.page.locator('#waitingSheet')).toBeHidden();
    await expect(playerCard(alice.page, 'Dasha')).toBeVisible();
    await expect(notifications(alice.page)).toContainText(text('playerAdmittedNotification', 'en', { playerName: 'Dasha' }));
});

test('the first answer decides', async ({ newPlayer }) => {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');
    await expectRequestFrom(bob.page, 'Dasha');

    await alice.page.getByRole('button', { name: text('admitPlayer') }).click();

    await expect(requestWindow(bob.page)).not.toHaveClass(/\bshow\b/);
    await waitForPlayers(bob.page, 3);
});

// Two players pressed at once: the second answer reaches the server after the
// first. The window closes for both, and nobody gets an error in their face
test('a late answer to an answered request shows nothing', async ({ newPlayer }) => {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    const dashaId = await dasha.page.evaluate(() => PLAYER_ID);
    await expectRequestFrom(bob.page, 'Dasha');

    await alice.page.getByRole('button', { name: text('admitPlayer') }).click();
    await expect(requestWindow(bob.page)).not.toHaveClass(/\bshow\b/);

    const error = await bob.page.evaluate(id => new Promise(resolve => {
        socket.once('error', resolve);
        socket.emit('admit-player', { playerId: id });
    }), dashaId);
    // The server's answer has arrived and the page has handled it: an alert
    // would fail the test (the guard of newPlayer)
    expect(error).toBe('This request has already been answered');
});

test('a declined newcomer goes home and may ask again', async ({ newPlayer }) => {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(bob.page, 'Dasha');

    await bob.page.getByRole('button', { name: text('declinePlayer') }).click();

    await expect(dasha.page).toHaveURL(new RegExp(`/\\?join=${code}&error=join-declined$`));
    await expect(dasha.page.locator('.alert-danger')).toContainText(text('joinDeclined'));
    await waitForLanding(dasha.page);
    await expect(dasha.page.locator('#roomCode')).toHaveValue(code);
    await expect(requestWindow(alice.page)).not.toHaveClass(/\bshow\b/);
    await waitForPlayers(alice.page, 2);

    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');
});

test("a newcomer's name is shown as text", async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('<b>Dasha</b>');

    await askToJoin(dasha, code);

    await expect(dasha.page.locator('#waitingName')).toHaveText('<b>Dasha</b>');
    await expectRequestFrom(alice.page, '<b>Dasha</b>');
    expect(await dasha.page.locator('#waitingName b').count()).toBe(0);
    expect(await alice.page.locator('#joinRequestName b').count()).toBe(0);
});

test('two newcomers wait in turn', async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    const eve = await newPlayer('Eve');
    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');
    await askToJoin(eve, code);
    // Eve's request has reached Alice's page, behind Dasha's window
    await expect.poll(() => alice.page.evaluate(() => joinRequestQueue.length)).toBe(2);

    await alice.page.getByRole('button', { name: text('admitPlayer') }).click();

    await waitForPlayers(dasha.page, 3);
    await expectRequestFrom(alice.page, 'Eve');
});

test('a request waits while another window is open', async ({ newPlayer }) => {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    await playerCard(alice.page, 'Alice').locator('.character-sticker.mystery').click();
    await expect(alice.page.locator('#revealModal')).toHaveClass(/\bshow\b/);
    const dasha = await newPlayer('Dasha');

    await askToJoin(dasha, code);
    // Once the request has reached Bob, it has reached Alice too
    await expectRequestFrom(bob.page, 'Dasha');
    expect(await requestWindow(alice.page).evaluate(modal => modal.classList.contains('show'))).toBe(false);

    await alice.page.locator('#revealModal .btn-secondary').click();
    await expectRequestFrom(alice.page, 'Dasha');
});

test('the request window closes only by its buttons', async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');

    await alice.page.keyboard.press('Escape');
    // Outside the window: the backdrop
    await alice.page.mouse.click(5, 5);

    expect(await requestWindow(alice.page).evaluate(modal => modal.classList.contains('show'))).toBe(true);
    await expect(dasha.page.locator('#waitingSheet')).toBeVisible();
});

// Dasha types into her console: a socket of her own asks with her real ID and
// secret, then tries to let herself in. A waiting socket is not a player's
test('a waiting socket cannot let itself in', async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');

    const error = await dasha.page.evaluate(gameId => new Promise(resolve => {
        const own = new RoomSocket(`/ws/${gameId}`);
        own.on('connect', () => {
            own.emit('ask-to-join', { gameId, playerId: PLAYER_ID, playerSecret: PLAYER_SECRET, playerName: 'Dasha', avatar: '🐻' });
            own.emit('admit-player', { playerId: PLAYER_ID });
        });
        own.on('error', message => {
            own.disconnect();
            resolve(message);
        });
    }), code);

    expect(error).toBe('You are not in this game');
    await waitForPlayers(alice.page, 2);
    await expect(dasha.page.locator('#waitingSheet')).toBeVisible();
});

// A started round of Alice and Bob, and Dasha let in by Bob
async function admittedNewcomer(newPlayer) {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(bob.page, 'Dasha');
    await bob.page.getByRole('button', { name: text('admitPlayer') }).click();
    await waitForPlayers(dasha.page, 3);
    return { alice, bob, dasha };
}

test('a newcomer gets a character from any player and plays on', async ({ newPlayer }) => {
    const { alice, bob, dasha } = await admittedNewcomer(newPlayer);
    const own = playerCard(dasha.page, 'Dasha').locator('.character-sticker');

    // An envelope still open: nothing in it yet, nothing to press
    await expect(own).toHaveClass(/\bopen-envelope\b/);
    await expect(own).toHaveText(text('envelopeEmpty'));
    await expect(own).toHaveAttribute('title', text('noCharacterYet'));
    await expect(own.locator('.seal')).toHaveCount(0);
    await expect(dasha.page.locator('#gameStatus')).toHaveText(text('waitingForCharacter'));

    await assignCharacter(bob, 'Dasha', 'Gandalf');

    await expect(own.locator('.seal')).toBeVisible();
    await expect(own).not.toHaveClass(/\bopen-envelope\b/);
    await expect(dasha.page.locator('#gameStatus')).toHaveText(text('gameInProgress'));
    // Given once, the character stays
    await playerCard(alice.page, 'Dasha').locator('.character-sticker').click();
    expect(await alice.page.locator('.character-input').count()).toBe(0);

    await revealOwnCharacter(dasha);
    await expect(own).toHaveText('Gandalf');
});

test('a newcomer without a character keeps the empty envelope after a reload', async ({ newPlayer }) => {
    const { alice, dasha } = await admittedNewcomer(newPlayer);

    await dasha.page.reload();

    await expect(playerCard(dasha.page, 'Dasha').locator('.character-sticker.open-envelope')).toBeVisible();
    await expect(playerCard(alice.page, 'Dasha').locator('.add-character-btn')).toBeVisible();
});

test("a newcomer who cancels is gone from the players' window", async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');

    // The landing page answers slowly (a poor network, a busy server): the
    // request must go at once, not when the next page has loaded
    let releaseLanding;
    const landingHeld = new Promise(resolve => { releaseLanding = resolve; });
    await dasha.page.route(/\/\?join=/, async route => {
        await landingHeld;
        await route.continue();
    });

    // click() waits for the next page to start loading: let it wait aside
    const cancelled = dasha.page.getByRole('button', { name: text('cancel') }).click();

    await expect(requestWindow(alice.page)).not.toHaveClass(/\bshow\b/);
    releaseLanding();
    await cancelled;
    await expect(dasha.page).toHaveURL(new RegExp(`/\\?join=${code}$`));
});

test('a newcomer who closes the page is gone too', async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');

    await dasha.page.close();

    await expect(requestWindow(alice.page)).not.toHaveClass(/\bshow\b/);
});

test('a newcomer waiting in two tabs is let in in both', async ({ newPlayer }) => {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');
    // A tab of its own: the same browser, the landing page and Join again.
    // Its request reaches the players as one more join-requested
    await alice.page.evaluate(() => {
        window.requestsHeard = 0;
        socket.on('join-requested', () => { window.requestsHeard += 1; });
    });
    const second = { name: 'Dasha', page: await dasha.context.newPage() };
    await askToJoin(second, code);
    await expect.poll(() => alice.page.evaluate(() => window.requestsHeard)).toBe(1);

    // The first tab's socket goes, as when the tab is closed. An explicit
    // disconnect reaches the server at once (a closed tab's socket a moment
    // later), so Bob's page opened next learns what is still waiting
    await dasha.page.evaluate(() => socket.disconnect());
    await bob.page.reload();
    await expectRequestFrom(bob.page, 'Dasha');
    await expect(requestWindow(alice.page)).toHaveClass(/\bshow\b/);

    await alice.page.getByRole('button', { name: text('admitPlayer') }).click();
    await waitForPlayers(second.page, 3);
});

test('a newcomer whose connection drops keeps waiting', async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');

    // The phone loses its socket for a moment and the page connects a new one
    // (after its reconnection delay), which asks again. Whether the players'
    // window closes meanwhile depends on how soon the room hears of the drop
    await dasha.page.evaluate(() => {
        window.connects = 0;
        socket.on('connect', () => { window.connects += 1; });
        socket.ws.close();
    });
    await expect.poll(() => dasha.page.evaluate(() => window.connects >= 1 && socket.connected),
        { timeout: 15_000 }).toBe(true);
    await expect(requestWindow(alice.page)).toHaveClass(/\bshow\b/, { timeout: 15_000 });
    await expect(dasha.page.locator('#waitingSheet')).toBeVisible();

    await alice.page.getByRole('button', { name: text('admitPlayer') }).click();
    await waitForPlayers(dasha.page, 3);
});

test('a reloaded player page shows the waiting newcomer', async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(alice.page, 'Dasha');

    await alice.page.reload();

    await expectRequestFrom(alice.page, 'Dasha');
});

test('a restart lets the waiting newcomer into the lobby', async ({ newPlayer }) => {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    await alice.page.click('#restartGame');
    await expect(alice.page.locator('#restartModal')).toHaveClass(/\bshow\b/);
    const dasha = await newPlayer('Dasha');
    await askToJoin(dasha, code);
    await expectRequestFrom(bob.page, 'Dasha');

    await alice.page.click('#confirmRestart');

    await waitForPlayers(dasha.page, 3);
    await expect(dasha.page.locator('#startGame')).toBeVisible();
    await expect(dasha.page.locator('#waitingSheet')).toBeHidden();
    await expect(requestWindow(bob.page)).not.toHaveClass(/\bshow\b/);
    await waitForPlayers(bob.page, 3);
});

test('the waiting newcomer learns that the room is gone', async ({ newPlayer }) => {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    for (const player of [alice, bob]) {
        await player.page.click('#leaveGame');
        await expect(player.page.locator('#leaveModal')).toHaveClass(/\bshow\b/);
    }
    const dasha = await newPlayer('Dasha');
    dasha.expectDialog(serverErrorText('Game not found'));
    // Joining a room that is gone: the server answers 400, the page logs it
    dasha.allowConsoleError(/status of 400|Join game failed/);
    await askToJoin(dasha, code);
    // The request has reached Alice's page, behind her open window
    await expect.poll(() => alice.page.evaluate(() => joinRequestQueue.length)).toBe(1);

    await bob.page.click('#confirmLeave');
    await waitForPlayers(alice.page, 1);
    await alice.page.click('#confirmLeave');

    await expect.poll(() => dasha.expectedDialogs.length).toBe(0);
    await expect(dasha.page).toHaveURL(/\/$/);
});

// Escape, or a tap elsewhere with the field still empty, takes the newcomer's
// card back to its button - a character after the start is never empty
test('backing out of a character for the newcomer shows no error', async ({ newPlayer }) => {
    const { alice } = await admittedNewcomer(newPlayer);
    const card = playerCard(alice.page, 'Dasha');

    await card.locator('.add-character-btn').click();
    await alice.page.keyboard.press('Escape');
    await expect(card.locator('.add-character-btn')).toBeVisible();

    await card.locator('.add-character-btn').click();
    await alice.page.locator('#gameStatus').click();
    await expect(card.locator('.add-character-btn')).toBeVisible();
    // An error alert would have failed the test (the guard of newPlayer)
});

// A character given after the start is for good: a request window must not
// take the focus from a half-typed one and send it
test('a request waits while a player types a character', async ({ newPlayer }) => {
    const { alice, dasha } = await admittedNewcomer(newPlayer);
    const card = playerCard(alice.page, 'Dasha');
    await card.locator('.add-character-btn').click();
    await card.locator('.character-input').fill('Gand');
    const code = new URL(dasha.page.url()).pathname.split('/').pop();
    const eve = await newPlayer('Eve');

    await askToJoin(eve, code);
    await expect.poll(() => alice.page.evaluate(() => joinRequestQueue.length)).toBe(1);
    expect(await requestWindow(alice.page).evaluate(modal => modal.classList.contains('show'))).toBe(false);
    await expect(card.locator('.character-input')).toBeFocused();

    await card.locator('.character-input').pressSequentially('alf');
    await card.locator('.character-input').press('Enter');
    await expect(playerCard(dasha.page, 'Dasha').locator('.character-sticker .seal')).toBeVisible();
    await expect(card.locator('.character-sticker')).toHaveText('Gandalf');
    await expectRequestFrom(alice.page, 'Eve');
});

// A player types into the console: a socket of their own asks to join for an
// invented newcomer, then joins the room as the player. The request has no
// waiting page any more, so it goes
test("a socket that asked to join and then joins as a player takes the request away", async ({ newPlayer }) => {
    const { code, players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    await bob.page.evaluate(gameId => new Promise(resolve => {
        window.own = new RoomSocket(`/ws/${gameId}`);
        window.own.on('connect', () => {
            window.own.emit('ask-to-join', {
                gameId, playerId: crypto.randomUUID(), playerSecret: crypto.randomUUID(), playerName: 'Ghost', avatar: '🐻',
            });
            resolve();
        });
    }), code);
    await expectRequestFrom(alice.page, 'Ghost');

    await bob.page.evaluate(gameId => {
        window.own.emit('join-room', { gameId, playerId: PLAYER_ID, playerSecret: PLAYER_SECRET });
    }, code);

    await expect(requestWindow(alice.page)).not.toHaveClass(/\bshow\b/);
});
