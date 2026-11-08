// Helpers for the game's browser tests (docs/testing.md). Every player is a
// browser context of their own - their own localStorage, so their own player
// ID - and every helper acts the way a person would: through pages and buttons.
// The guard and the players are the kit's (packages/room-kit/e2e.js), and so
// are the helpers that act through the kit's pages - the landing form,
// entering and leaving a room, the invitation, the socket
// (packages/room-kit/e2e-helpers.js). The game's own act on the round: start
// it, answer a step, write to the reading, come back to a round.
const path = require('path');
const { test, expect } = require('@parlour-games/room-kit/e2e');
const { pageTexts, ...kitHelpers } = require('@parlour-games/room-kit/e2e-helpers');
/* global currentGame -- the room page's picture of the game (the kit's room-page.js), inside page.evaluate() */

const { roomWith, waitForLanding } = kitHelpers;

// The texts of the game's pages, the kit's under them
const { text, serverErrorText } = pageTexts(path.join(__dirname, '..', '..', 'public', 'js', 'translations.js'));

// The round's step as the page knows it: 0-7 a question, 8 the reading,
// null in the lobby. Read from the page, so a check holds in any language
function roundStep(page) {
    return page.evaluate(() => (currentGame && currentGame.round ? currentGame.round.step : null));
}

async function waitForStep(players, step) {
    for (const player of players) {
        await expect.poll(() => roundStep(player.page)).toBe(step);
    }
}

// Start: the first player presses Start, and every page has the first question
async function startRound(players) {
    await players[0].page.click('#startRound');
    await waitForStep(players, 0);
}

// A room of these players with the round started: { players, code }
async function startedRound(newPlayer, names) {
    const room = await roomWith(newPlayer, names);
    await startRound(room.players);
    return room;
}

// Write an answer on the sheet in front of the player and send it
async function answer(player, text) {
    await player.page.fill('#answerText', text);
    await player.page.click('#saveAndPass');
}

// The answer a player writes at a step, unless a test says otherwise:
// "Anna 3" is Anna's answer to the third question
const answerText = (player, step) => `${player.name} ${step + 1}`;

// Every player answers this step's question, and the sheets move on
async function answerStep(players, step, answerOf = answerText) {
    for (const player of players) await answer(player, answerOf(player, step));
    await waitForStep(players, step + 1);
}

// The whole writing, every player answering every step: the round is at the reading
async function writeToReading(players, answerOf = answerText) {
    for (let step = 0; step < 8; step++) await answerStep(players, step, answerOf);
}

// A player goes on from the reading to every story, by their own press
async function showStories(player) {
    await player.page.click('#showStories');
    await expect(player.page.locator('#storiesCard')).toBeVisible();
}

// A player back in the started round by its link, from a new page of their
// browser: the landing page, the name, Join - and the round, not the lobby
async function returnToRound(player, code) {
    const { page } = player;
    await page.goto(`/game/${code}`);
    await expect(page).toHaveURL(new RegExp(`/\\?join=${code}$`));
    await waitForLanding(page);
    await page.fill('#playerName', player.name);
    await page.click('#joinBtn');
    await expect(page).toHaveURL(new RegExp(`/game/${code}$`));
    await expect(page.locator('#seatsCard')).toBeVisible();
}

// The row of the table with exactly this name: one's own reads "Name (You)"
function seatRow(page, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return page.locator('#seatList li').filter({
        has: page.locator('.seat-name', { hasText: new RegExp(`^${escaped}(?: \\(.+\\))?$`) }),
    });
}

module.exports = {
    test,
    expect,
    text,
    serverErrorText,
    ...kitHelpers,
    roundStep,
    waitForStep,
    startRound,
    startedRound,
    answer,
    answerText,
    answerStep,
    writeToReading,
    showStories,
    returnToRound,
    seatRow,
};
