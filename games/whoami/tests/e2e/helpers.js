// Helpers for whoami's browser tests (docs/testing.md). Every player is a
// browser context of their own - their own localStorage, so their own player
// ID - and every helper acts the way a person would: through pages and buttons.
// The guard and the players are the kit's (packages/room-kit/e2e.js), and so
// are the helpers that act through the kit's pages - the landing form,
// entering and leaving a room, the invitation, the socket
// (packages/room-kit/e2e-helpers.js); the game's own are below.
const path = require('path');
const { test, expect } = require('@parlour-games/room-kit/e2e');
const { pageTexts, ...kitHelpers } = require('@parlour-games/room-kit/e2e-helpers');

const { playerCard, waitForPlayers, createRoom, joinRoom } = kitHelpers;
// The texts of the game's pages, the kit's under them
const { text, serverErrorText } = pageTexts(path.join(__dirname, '..', '..', 'public', 'js', 'translations.js'));

// Give the player named toName a character: "+ Assign character" on their card, type, Enter
async function assignCharacter(player, toName, character) {
    const card = playerCard(player.page, toName);
    await card.locator('.add-character-btn').click();
    await card.locator('.character-input').fill(character);
    await card.locator('.character-input').press('Enter');
    await expect(card.locator('.character-sticker')).toHaveText(character);
}

// Press Start Game and wait until the room is in a started game (the own envelope
// shows before the start too; the Restart button appears only after it)
async function startGame(player) {
    await player.page.click('#startGame');
    await expect(player.page.locator('#restartGame')).toBeVisible();
}

// Click your own envelope, confirm in the window, wait for your character to show
async function revealOwnCharacter(player) {
    const { page } = player;
    await playerCard(page, player.name).locator('.character-sticker.mystery').click();
    await expect(page.locator('#revealModal')).toHaveClass(/\bshow\b/);
    await page.click('#confirmReveal');
    await expect(playerCard(page, player.name).locator('.character-sticker.revealed')).toBeVisible();
}

const CHARACTERS = ['Napoleon', 'Cleopatra', 'Gandalf', 'Sherlock', 'Frida', 'Einstein'];

// A started game with these players: the first creates the room, the rest
// join, each gives the next one in the circle a character, the first starts.
// Returns { players: { name: player }, code, characters: { name: what they wear } }
async function startedGame(newPlayer, names) {
    const list = [];
    for (const name of names) list.push(await newPlayer(name));
    const code = await createRoom(list[0]);
    for (const player of list.slice(1)) await joinRoom(player, code);
    for (const player of list) await waitForPlayers(player.page, list.length);

    const characters = {};
    for (const [index, player] of list.entries()) {
        const target = list[(index + 1) % list.length];
        characters[target.name] = CHARACTERS[index];
        await assignCharacter(player, target.name, CHARACTERS[index]);
    }
    for (const player of list) await expect(player.page.locator('#startGame')).toBeEnabled();
    await startGame(list[0]);
    for (const player of list.slice(1)) await expect(player.page.locator('#restartGame')).toBeVisible();

    return { players: Object.fromEntries(list.map(player => [player.name, player])), code, characters };
}

module.exports = {
    test,
    expect,
    text,
    serverErrorText,
    ...kitHelpers,
    assignCharacter,
    startGame,
    revealOwnCharacter,
    startedGame,
};
