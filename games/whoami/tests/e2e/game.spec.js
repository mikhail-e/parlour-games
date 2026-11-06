// The started game: the mystery sticker, revealing your character, restarting
const {
    test, expect, text, playerCard, startedGame, revealOwnCharacter, createRoom, joinRoom, assignCharacter, startGame,
} = require('./helpers');

const notifications = page => page.locator('.alert.position-fixed');

/* global socket -- the room page's RoomSocket (game-room.js), inside page.evaluate() */

test('your own character is a sealed envelope that reveals it', async ({ newPlayer }) => {
    const { players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const own = playerCard(alice.page, 'Alice').locator('.character-sticker');

    await expect(own).toHaveClass(/\bmystery\b/);
    await expect(own).not.toHaveClass(/\bcolor-/);
    await expect(own.locator('.seal')).toHaveText('?');
    // The seal's "?" is the one place Abril Fatface draws: its own file, not a fallback serif
    await expect.poll(() => alice.page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].some(face => face.family.replace(/["']/g, '') === 'Abril Fatface' && face.status === 'loaded');
    })).toBe(true);
    // The wax is a picture, the app icon's seal with its drips (public/img/seal.svg):
    // decode() fails on a picture that is missing or broken
    const waxDrawn = await own.locator('.seal').evaluate(async seal => {
        const [, address] = getComputedStyle(seal, '::before').backgroundImage.match(/url\("?(.+?)"?\)/) || [];
        if (!address) return 'no picture';
        const wax = new Image();
        wax.src = address;
        await wax.decode();
        return address.endsWith('/img/seal.svg') || address;
    });
    expect(waxDrawn).toBe(true);
    await expect(own).toHaveAttribute('title', text('yourCharacterClickReveal'));
    // A light envelope: every channel of its paper is pale
    const paper = await own.evaluate(sticker => getComputedStyle(sticker).backgroundColor);
    for (const channel of paper.match(/\d+/g).slice(0, 3).map(Number)) expect(channel).toBeGreaterThanOrEqual(200);
    await expect(alice.page.locator('#gameSteps li').nth(3)).toHaveText(text('step4'));
});

test("the others' characters keep their player colors", async ({ newPlayer }) => {
    const { players, characters } = await startedGame(newPlayer, ['Alice', 'Bob', 'Carol']);

    for (const name of ['Bob', 'Carol']) {
        const sticker = playerCard(players.Alice.page, name).locator('.character-sticker');
        await expect(sticker).toHaveText(characters[name]);
        await expect(sticker).toHaveClass(/\bcolor-[a-z]+\b/);
    }
});

test('characters cannot be edited after the start', async ({ newPlayer }) => {
    const { players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);

    await playerCard(alice.page, 'Bob').locator('.character-sticker').click();

    await expect(alice.page.locator('.character-input')).toHaveCount(0);
});

test('Cancel in the reveal window reveals nothing', async ({ newPlayer }) => {
    const { players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);

    await playerCard(alice.page, 'Alice').locator('.character-sticker.mystery').click();
    await expect(alice.page.locator('#revealModal')).toHaveClass(/\bshow\b/);
    await alice.page.locator('#revealModal .btn-secondary').click();
    await expect(alice.page.locator('#revealModal')).not.toHaveClass(/\bshow\b/);

    // Nothing to wait for when nothing happens: let Bob reveal, and once his
    // reveal has reached both pages, anything Alice's Cancel sent has too
    await revealOwnCharacter(bob);
    await expect(playerCard(alice.page, 'Bob').locator('.character-sticker.revealed')).toBeVisible();
    expect(await playerCard(bob.page, 'Alice').locator('.character-sticker.revealed').count()).toBe(0);
    expect(await playerCard(alice.page, 'Alice').locator('.character-sticker.mystery').count()).toBe(1);
});

test('revealing shows your character and tells everyone', async ({ newPlayer }) => {
    const { players: { Alice: alice, Bob: bob }, characters } = await startedGame(newPlayer, ['Alice', 'Bob']);

    await revealOwnCharacter(alice);

    await expect(playerCard(alice.page, 'Alice').locator('.character-sticker')).toHaveText(characters.Alice);
    await expect(notifications(bob.page)).toContainText(
        text('playerRevealedNotification', 'en', { playerName: 'Alice', character: characters.Alice }));
    await expect(playerCard(bob.page, 'Alice').locator('.character-sticker.revealed')).toHaveText(characters.Alice);
    // The whole card of a revealed player turns gold, for everyone
    await expect(playerCard(bob.page, 'Alice')).toHaveClass(/\brevealed\b/);
});

test('restart returns the room to assigning characters', async ({ newPlayer }) => {
    const { players: { Alice: alice, Bob: bob } } = await startedGame(newPlayer, ['Alice', 'Bob']);

    await alice.page.click('#restartGame');
    await expect(alice.page.locator('#restartModal')).toHaveClass(/\bshow\b/);
    await alice.page.click('#confirmRestart');

    for (const page of [alice.page, bob.page]) {
        await expect(page.locator('.character-sticker')).toHaveCount(0);
        await expect(page.locator('.add-character-btn')).toHaveCount(1);
        await expect(page.locator('#startGame')).toBeDisabled();
        await expect(page.locator('#restartGame')).toBeHidden();
    }
});

// The ticket shows friends the room code, in the lobby and during the game
// too: a latecomer asks to join then
test('the room code ticket shows in the lobby and stays once the game starts', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    const code = await createRoom(alice);
    await joinRoom(bob, code);
    await expect(alice.page.locator('.room-ticket')).toContainText(code);

    await assignCharacter(alice, 'Bob', 'Napoleon');
    await assignCharacter(bob, 'Alice', 'Cleopatra');
    await startGame(alice);

    await expect(alice.page.locator('.room-ticket')).toBeVisible();
    await expect(alice.page.locator('.room-ticket')).toContainText(code);
});

test('a reveal made while the connection is down happens once it is back', async ({ newPlayer }) => {
    const { players: { Alice: alice, Bob: bob }, characters } = await startedGame(newPlayer, ['Alice', 'Bob']);
    // The phone loses the network (and its socket) for a moment, as when it
    // wakes from sleep; Alice reveals in that moment
    await alice.context.setOffline(true);
    await alice.page.evaluate(() => socket.ws.close());
    await playerCard(alice.page, 'Alice').locator('.character-sticker.mystery').click();
    await alice.page.click('#confirmReveal');

    await alice.context.setOffline(false);

    // The socket comes back after its reconnection delay (up to a few seconds)
    await expect(playerCard(bob.page, 'Alice').locator('.character-sticker.revealed'))
        .toHaveText(characters.Alice, { timeout: 15_000 });
    await expect(playerCard(alice.page, 'Alice').locator('.character-sticker.revealed')).toHaveText(characters.Alice);
});
