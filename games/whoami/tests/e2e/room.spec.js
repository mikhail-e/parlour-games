// The room before the game: joining, the players list, assigning characters,
// the Start Game button
const {
    test, expect, text, createRoom, joinRoom, playerCard, waitForPlayers, assignCharacter, countSentEvents, roomWith,
    startGame, revealOwnCharacter, leaveGame, waitForLanding,
} = require('./helpers');

// The names in the list, without the "(You)" label of the viewer's own card
const listedNames = page => page.locator('.player-name').evaluateAll(names =>
    names.map(name => name.firstChild.textContent));

test('both players see both cards in join order', async ({ newPlayer }) => {
    const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', 'Bob']);

    expect(await listedNames(alice.page)).toEqual(['Alice', 'Bob']);
    expect(await listedNames(bob.page)).toEqual(['Alice', 'Bob']);
});

test('two players may have the same name', async ({ newPlayer }) => {
    const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Sam', 'Sam']);

    await expect(playerCard(alice.page, 'Sam')).toHaveCount(2);
});

test('no + on your own card', async ({ newPlayer }) => {
    const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Bob']);

    await expect(playerCard(alice.page, 'Alice').locator('.add-character-btn')).toHaveCount(0);
    await expect(playerCard(alice.page, 'Bob').locator('.add-character-btn')).toHaveCount(1);
});

test('"Assign character" is a button the keyboard reaches', async ({ newPlayer }) => {
    const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Bob']);

    await playerCard(alice.page, 'Bob').getByRole('button', { name: text('assignCharacter') }).focus();
    await alice.page.keyboard.press('Enter');

    await expect(playerCard(alice.page, 'Bob').locator('.character-input')).toBeFocused();
});

// Tags lean a little; a long name must still wrap inside the card on a phone
test('a long character stays inside its card', async ({ newPlayer }) => {
    const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Bob']);

    await assignCharacter(alice, 'Bob', 'W'.repeat(128));

    const tag = playerCard(alice.page, 'Bob').locator('.character-sticker');
    const card = await playerCard(alice.page, 'Bob').boundingBox();
    const box = await tag.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(card.x);
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
    // The text wraps inside the tag instead of running out of it
    expect(await tag.evaluate(sticker => sticker.scrollWidth - sticker.clientWidth)).toBeLessThanOrEqual(0);
});

// The others' names and tags are read at arm's length, the phone on the
// table: a phone writes them larger than a computer does
test('names and tags are larger on a phone', async ({ newPlayer }) => {
    const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Bob', 'Carol']);
    await assignCharacter(alice, 'Bob', 'Napoleon');
    await assignCharacter(alice, 'Carol', 'Captain Jack Sparrow of the Pirates of the Caribbean');

    const fontSize = locator => locator.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    const fontSizes = async () => ({
        name: await fontSize(playerCard(alice.page, 'Bob').locator('.player-name')),
        tag: await fontSize(playerCard(alice.page, 'Bob').locator('.character-sticker')),
        longTag: await fontSize(playerCard(alice.page, 'Carol').locator('.character-sticker')),
    });
    await alice.page.setViewportSize({ width: 412, height: 915 });
    const phone = await fontSizes();
    await alice.page.setViewportSize({ width: 1280, height: 800 });
    const computer = await fontSizes();

    expect(phone.name).toBeGreaterThan(computer.name);
    expect(phone.tag).toBeGreaterThan(computer.tag);
    expect(phone.longTag).toBeGreaterThan(computer.longTag);
    // A long character is still written smaller than a short one
    expect(phone.longTag).toBeLessThan(phone.tag);
});

test('Enter saves a character; the target does not see it, the others do', async ({ newPlayer }) => {
    const { players: [alice, bob, carol] } = await roomWith(newPlayer, ['Alice', 'Bob', 'Carol']);

    await assignCharacter(alice, 'Bob', 'Napoleon');

    await expect(playerCard(carol.page, 'Bob').locator('.character-sticker')).toHaveText('Napoleon');
    await expect(playerCard(bob.page, 'Bob').locator('.character-sticker.mystery .seal')).toBeVisible();
    expect(await bob.page.content()).not.toContain('Napoleon');
});

test('clicking away saves the character', async ({ newPlayer }) => {
    const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', 'Bob']);
    const bobOnAlice = playerCard(alice.page, 'Bob');

    await bobOnAlice.locator('.add-character-btn').click();
    await bobOnAlice.locator('.character-input').fill('Napoleon');
    await alice.page.click('#gameStatus');

    await expect(bobOnAlice.locator('.character-sticker')).toHaveText('Napoleon');
    await expect(playerCard(bob.page, 'Bob').locator('.character-sticker.mystery')).toBeVisible();
});

test('Enter followed by losing focus saves once', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    const sent = countSentEvents(alice.page, 'assign-character');
    const code = await createRoom(alice);
    await joinRoom(bob, code);
    await waitForPlayers(alice.page, 2);
    const bobOnAlice = playerCard(alice.page, 'Bob');

    await bobOnAlice.locator('.add-character-btn').click();
    await bobOnAlice.locator('.character-input').fill('Napoleon');
    // Enter, then focus leaves the field before the server answers
    await bobOnAlice.locator('.character-input').evaluate(input => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        input.blur();
    });

    await expect(bobOnAlice.locator('.character-sticker')).toHaveText('Napoleon');
    await expect(playerCard(bob.page, 'Bob').locator('.character-sticker.mystery')).toBeVisible();
    expect(sent()).toBe(1);
});

test('Escape restores the previous character', async ({ newPlayer }) => {
    const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Bob']);
    await assignCharacter(alice, 'Bob', 'Napoleon');
    const bobOnAlice = playerCard(alice.page, 'Bob');

    await bobOnAlice.locator('.character-sticker').click();
    await bobOnAlice.locator('.character-input').fill('Caesar');
    await bobOnAlice.locator('.character-input').press('Escape');

    await expect(bobOnAlice.locator('.character-input')).toHaveCount(0);
    await expect(bobOnAlice.locator('.character-sticker')).toHaveText('Napoleon');
});

test('Escape on a new character gives the Assign button back', async ({ newPlayer }) => {
    const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', 'Bob']);
    const bobOnAlice = playerCard(alice.page, 'Bob');

    await bobOnAlice.locator('.add-character-btn').click();
    await bobOnAlice.locator('.character-input').fill('Caesar');
    await bobOnAlice.locator('.character-input').press('Escape');

    await expect(bobOnAlice.locator('.character-input')).toHaveCount(0);
    await expect(bobOnAlice.locator('.add-character-btn')).toBeVisible();
    await expect(playerCard(bob.page, 'Bob').locator('.character-sticker')).toHaveCount(0);
});

test('an empty or blank character removes it', async ({ newPlayer }) => {
    const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', 'Bob']);
    await assignCharacter(alice, 'Bob', 'Napoleon');
    await expect(playerCard(bob.page, 'Bob').locator('.character-sticker.mystery')).toBeVisible();
    const bobOnAlice = playerCard(alice.page, 'Bob');

    await bobOnAlice.locator('.character-sticker').click();
    await bobOnAlice.locator('.character-input').fill('   ');
    await bobOnAlice.locator('.character-input').press('Enter');

    await expect(bobOnAlice.locator('.add-character-btn')).toBeVisible();
    await expect(playerCard(bob.page, 'Bob').locator('.character-sticker')).toHaveCount(0);
});

test('the character field stops at the limit', async ({ newPlayer }) => {
    const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Bob']);
    const bobOnAlice = playerCard(alice.page, 'Bob');

    await bobOnAlice.locator('.add-character-btn').click();
    await bobOnAlice.locator('.character-input').pressSequentially('x'.repeat(200));

    await expect(bobOnAlice.locator('.character-input')).toHaveValue('x'.repeat(128));
});

test('Start Game waits for two players and a character for everyone', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    const code = await createRoom(alice);
    const start = page => page.locator('#startGame');

    await expect(start(alice.page)).toBeDisabled();

    await joinRoom(bob, code);
    await waitForPlayers(alice.page, 2);
    await expect(start(alice.page)).toBeDisabled();

    await assignCharacter(alice, 'Bob', 'Napoleon');
    await expect(start(alice.page)).toBeDisabled();

    // A blank character is no character
    await playerCard(bob.page, 'Alice').locator('.add-character-btn').click();
    await playerCard(bob.page, 'Alice').locator('.character-input').fill('   ');
    await playerCard(bob.page, 'Alice').locator('.character-input').press('Enter');
    await expect(playerCard(bob.page, 'Alice').locator('.add-character-btn')).toBeVisible();
    await expect(start(bob.page)).toBeDisabled();

    await assignCharacter(bob, 'Alice', 'Cleopatra');
    await expect(start(alice.page)).toBeEnabled();
    await expect(start(bob.page)).toBeEnabled();
});

test('a name and a character with HTML stay text on every screen', async ({ newPlayer }) => {
    const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', '<b>Bob</b>']);
    const forged = '<img src=x onerror=alert(1)>';

    await assignCharacter(alice, '<b>Bob</b>', forged);

    for (const page of [alice.page, bob.page]) {
        const card = playerCard(page, '<b>Bob</b>');
        await expect(card).toHaveCount(1);
        await expect(card.locator('.player-name b, .character-sticker img')).toHaveCount(0);
    }
    await expect(playerCard(alice.page, '<b>Bob</b>').locator('.character-sticker')).toHaveText(forged);
    // An alert from onerror would fail the test through the guard
});

test('a name and a character with HTML stay text in notifications too', async ({ newPlayer }) => {
    const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', '<b>Bob</b>']);
    const forged = '<img src=x onerror=alert(1)>';
    const notification = alice.page.locator('.alert.position-fixed');
    await assignCharacter(alice, '<b>Bob</b>', forged);
    await assignCharacter(bob, 'Alice', 'Cleopatra');
    await startGame(alice);
    await expect(bob.page.locator('#restartGame')).toBeVisible();

    await revealOwnCharacter(bob);
    await expect(notification).toContainText(
        text('playerRevealedNotification', 'en', { playerName: '<b>Bob</b>', character: forged }));
    await expect(notification.locator('b, img')).toHaveCount(0);

    await leaveGame(bob);
    await expect(notification.last()).toContainText(text('playerLeftNotification', 'en', { playerName: '<b>Bob</b>' }));
    await expect(notification.locator('b, img')).toHaveCount(0);
    // An alert from onerror would fail the test through the guard
});

test('a lower-case room link opens the room', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    const code = await createRoom(alice);

    await bob.page.goto(`/game/${code.toLowerCase()}`);
    await expect(bob.page).toHaveURL(new RegExp(`/\\?join=${code}$`, 'i'));
    await waitForLanding(bob.page);
    await bob.page.fill('#playerName', 'Bob');
    await bob.page.click('#joinBtn');

    await expect(bob.page).toHaveURL(new RegExp(`/game/${code}$`));
    await waitForPlayers(alice.page, 2);
    await waitForPlayers(bob.page, 2);
});

test('a lower-case link in a tab that is already in the room keeps the player there', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    const code = await createRoom(alice);
    await joinRoom(bob, code);

    await bob.page.goto(`/game/${code.toLowerCase()}`);

    await expect(bob.page.locator('#roomCode')).toHaveText(code);
    await waitForPlayers(bob.page, 2);
    await expect(bob.page.locator('#roomLink')).toHaveValue(new RegExp(`/game/${code}$`));
});

test('a player who joins during an edit appears once the edit ends', async ({ newPlayer }) => {
    const { players: [alice], code } = await roomWith(newPlayer, ['Alice', 'Bob']);
    const carol = await newPlayer('Carol');
    const bobOnAlice = playerCard(alice.page, 'Bob');
    await bobOnAlice.locator('.add-character-btn').click();
    await bobOnAlice.locator('.character-input').fill('Napoleon');

    await joinRoom(carol, code);
    await bobOnAlice.locator('.character-input').press('Enter');

    await waitForPlayers(alice.page, 3);
    await expect(playerCard(alice.page, 'Carol')).toBeVisible();
});
