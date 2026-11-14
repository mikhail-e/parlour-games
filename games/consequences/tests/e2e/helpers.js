// Helpers for the game's browser tests (docs/testing.md). Every player is a
// browser context of their own - their own localStorage, so their own player
// ID - and every helper acts the way a person would: through pages and buttons.
// The guard and the players are the kit's (packages/room-kit/e2e.js), and so
// are the helpers that act through the kit's pages - the landing form,
// entering and leaving a room, the invitation, the socket
// (packages/room-kit/e2e-helpers.js). The game's own act on the round: start
// it, answer a step, write to the reading, come back to a round; and they read
// the round's set of questions off the screen, as a player does.
const path = require('path');
const { test, expect } = require('@parlour-games/room-kit/e2e');
const { pageTexts, ...kitHelpers } = require('@parlour-games/room-kit/e2e-helpers');
// The sets a round draws from: their texts are the pages' (translations.js)
const { QUESTION_SETS } = require('../../game-logic');
/* global currentGame, sendMove -- the room page's picture of the game and its move (the kit's room-page.js), inside page.evaluate() */

const { roomWith, waitForLanding } = kitHelpers;

// The texts of the game's pages, the kit's under them
const { text, serverErrorText } = pageTexts(path.join(__dirname, '..', '..', 'public', 'js', 'translations.js'));

// The round's set of questions, as a player sees it - by the title on the
// screen: the sheet's while writing (the set's name, «Fairy Tale»), the
// reading's («The tales are ready»), every story's («Every tale»). A test
// cannot choose the set (the same tests run against production), so it reads
// it as a player does, in the page's language
const SET_TITLES = [['#setTitle', 'Name'], ['#readingCard > .sheet-title', 'StoriesReady'], ['#storiesTitle', 'AllStories']];

async function setOf(page, lang = 'en') {
    let seen = null;
    await expect.poll(async () => {
        for (const [selector, key] of SET_TITLES) {
            const title = page.locator(selector);
            if (await title.isVisible()) {
                seen = [key, (await title.textContent()).trim()];
                return true;
            }
        }
        return false;
    }, { message: 'a title of the round on the screen' }).toBe(true);
    const [key, title] = seen;
    const set = QUESTION_SETS.find(each => text(`${each}${key}`, lang) === title);
    if (!set) throw new Error(`The title "${title}" is no set's (${key}, ${lang}): a text of the sets changed?`);
    return set;
}

// A text of the round's set: setText(page, 'AllStories'), setText(page, 'StoryTitle1', 'ru')
async function setText(page, key, lang = 'en', placeholders = {}) {
    return text(`${await setOf(page, lang)}${key}`, lang, placeholders);
}

// The round's question with this number (1-8), as the page shows it
function questionOf(page, number, lang = 'en') {
    return setText(page, `Question${number}`, lang);
}

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

// A player goes on from the reading to every story, by their own press: the
// window of every story opens over their sheet
async function showStories(player) {
    await player.page.click('#showStories');
    await expect(player.page.locator('#storiesModal')).toHaveClass(/\bshow\b/);
}

// The window of every story closed with its cross: the room's screen under it
async function closeStories(player) {
    await player.page.click('#storiesModal .btn-close');
    await expect(player.page.locator('#storiesModal')).toBeHidden();
}

// Another round, and back in the lobby. With the window of every story open,
// from under its last story, the question inside the window - and then the
// window is closed, as it stays open on its round when the round ends; else
// from the reading sheet, the question in its own window
async function confirmAnotherRound(player) {
    const { page } = player;
    if (await page.locator('#storiesModal').isVisible()) {
        await page.click('#windowAnotherRound');
        await page.click('#confirmWindowNewRound');
        await expect.poll(() => roundStep(page)).toBeNull();
        await closeStories(player);
        return;
    }
    await page.click('#anotherRound');
    await expect(page.locator('#newRoundModal')).toHaveClass(/\bshow\b/);
    await page.click('#confirmNewRound');
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

// What the room sends: a player whose page keeps every message its room
// sockets receive (secret.spec.js, history.spec.js read them)
async function listeningPlayer(newPlayer, name) {
    const player = await newPlayer(name);
    player.received = [];
    player.page.on('websocket', socket => socket.on('framereceived', frame => {
        if (typeof frame.payload === 'string') player.received.push(frame.payload);
    }));
    return player;
}

// Every message of this event a listening player's page received, as data
function messagesOf(player, event) {
    // A page's ping on a long run is answered with a bare "pong"
    return player.received.filter(payload => payload !== 'pong').map(payload => JSON.parse(payload))
        .filter(message => message.event === event).map(message => message.data);
}

// The latest message of this event, or null
function latestMessage(player, event) {
    const messages = messagesOf(player, event);
    return messages.length ? messages[messages.length - 1] : null;
}

// A move sent the way the room page sends it (the kit's sendMove), without a button
const sendRoomMove = (player, event, data) => player.page.evaluate(([name, payload]) => sendMove(name, payload), [event, data]);

module.exports = {
    test,
    expect,
    text,
    serverErrorText,
    ...kitHelpers,
    setOf,
    setText,
    questionOf,
    roundStep,
    waitForStep,
    startRound,
    startedRound,
    answer,
    answerText,
    answerStep,
    writeToReading,
    showStories,
    closeStories,
    confirmAnotherRound,
    returnToRound,
    seatRow,
    listeningPlayer,
    messagesOf,
    latestMessage,
    sendRoomMove,
};
