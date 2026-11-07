// Helpers for the browser tests (docs/testing.md). Every player is a browser
// context of their own - their own localStorage, so their own player ID - and
// every helper acts the way a person would: through pages and buttons.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

// translations.js and the kit's i18n.js are page scripts: they wait for the
// page's DOMContentLoaded as they load. Run them apart, with just enough of a
// page, and take their texts and copies of the server's errors: the game's on
// top of the kit's, as on the page
function loadPageScript(file) {
    const source = fs.readFileSync(file, 'utf8');
    const sandbox = { module: { exports: {} }, document: { addEventListener() {} } };
    vm.runInNewContext(source, sandbox);
    return sandbox.module.exports;
}

const KIT_JS = path.join(path.dirname(require.resolve('@parlour-games/room-kit/package.json')), 'public', 'kit', 'js');
const game = loadPageScript(path.join(__dirname, '..', '..', 'public', 'js', 'translations.js'));
const kitI18n = loadPageScript(path.join(KIT_JS, 'i18n.js'));
const translations = kitI18n.withKitTexts(game.translations);
const serverErrors = kitI18n.withKitServerErrors(game.serverErrors);

// A text from translations.js (or the kit's), with {placeholders} filled the way
// Localization.getText fills them: tests never type the game's texts by hand
function text(key, lang = 'en', placeholders = {}) {
    let value = translations[lang][key] || translations.en[key];
    if (value === undefined) {
        throw new Error(`No translation for "${key}"`);
    }
    for (const [placeholder, replacement] of Object.entries(placeholders)) {
        value = value.split(`{${placeholder}}`).join(String(replacement));
    }
    return value;
}

// A server error (it answers in English) as the page shows it in this language
function serverErrorText(error, lang = 'en') {
    if (lang === 'en') return error;
    if (!Object.hasOwn(serverErrors[lang] || {}, error)) {
        throw new Error(`No ${lang} text for the server error "${error}"`);
    }
    return serverErrors[lang][error];
}

// A page the server answers with status 404 (404.html): the browser reports
// that status in the console, and a test that opens such a page expects it
const PAGE_STATUS_404 = /^Failed to load resource: the server responded with a status of 404/;

// The guard and the players are the kit's (packages/room-kit/e2e.js)
const { test, expect } = require('@parlour-games/room-kit/e2e');

// Put values into the player's localStorage (the app stores JSON for its own
// keys). Leaves the player on the landing page; reload or navigate next
async function seedStorage(player, entries) {
    await player.page.goto('/');
    await player.page.evaluate(values => {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    }, entries);
}

// The card of the player with exactly this name. The viewer's own card reads
// "Name (You)" in the page's language, so a label in brackets may follow
function playerCard(page, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return page.locator('.player-card').filter({
        has: page.locator('.player-name', { hasText: new RegExp(`^${escaped}(?: \\(.+\\))?$`) }),
    });
}

async function waitForPlayers(page, count, options = {}) {
    await expect(page.locator('.player-card')).toHaveCount(count, options);
}

// A room of these players, every one of them on the room page and seeing all
async function roomWith(newPlayer, names) {
    const players = await Promise.all(names.map(name => newPlayer(name)));
    const code = await createRoom(players[0]);
    for (const player of players.slice(1)) await joinRoom(player, code);
    for (const player of players) await waitForPlayers(player.page, players.length);
    return { players, code };
}

// Wait until the landing page has set itself up. Its buttons work only after
// the kit's landing.js has run: a click before that submits the form the old
// way and reloads the page. The avatar grid is filled by the same setup, so 12
// tiles mean the buttons are ready - the moment a person would see the page
async function waitForLanding(page) {
    await expect(page.locator('#avatarSelector .avatar-option')).toHaveCount(12);
}

// Create a room from the landing page and return its code. A player already on
// the landing page stays on it, so a test can pick an avatar first
async function createRoom(player) {
    const { page } = player;
    if (new URL(page.url(), 'http://x').pathname !== '/') {
        await page.goto('/');
    }
    await waitForLanding(page);
    await page.fill('#playerName', player.name);
    await page.click('#createNewGame');
    await expect(page).toHaveURL(/\/game\/[A-Z0-9]{6}$/);
    await expect(playerCard(page, player.name).first()).toBeVisible();
    return new URL(page.url()).pathname.split('/').pop();
}

// Join a room the way a friend does: open the room link, land on /?join=CODE,
// enter a name, press Join. A player already on that page stays on it
async function joinRoom(player, code) {
    const { page } = player;
    if (!page.url().endsWith(`/?join=${code}`)) {
        await page.goto(`/game/${code}`);
        await expect(page).toHaveURL(new RegExp(`/\\?join=${code}$`));
    }
    await waitForLanding(page);
    await page.fill('#playerName', player.name);
    await page.click('#joinBtn');
    await expect(page).toHaveURL(new RegExp(`/game/${code}$`));
    await expect(playerCard(page, player.name).first()).toBeVisible();
}

// Ask to join a started game the way a latecomer does: the room link (or the
// landing page it led to), a name, Join - and the room page that waits for a
// player to let them in. A player already on /?join=CODE stays on it
async function askToJoin(player, code) {
    const { page } = player;
    if (!page.url().includes(`/?join=${code}`)) {
        await page.goto(`/game/${code}`);
        await expect(page).toHaveURL(new RegExp(`/\\?join=${code}$`));
    }
    await waitForLanding(page);
    await page.fill('#playerName', player.name);
    await page.click('#joinBtn');
    await expect(page).toHaveURL(new RegExp(`/game/${code}$`));
    await expect(page.locator('#waitingSheet')).toBeVisible();
}

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

// Leave the room: the Leave button, confirm in the window, wait to be home
async function leaveGame(player) {
    const { page } = player;
    await page.click('#leaveGame');
    await expect(page.locator('#leaveModal')).toHaveClass(/\bshow\b/);
    await page.click('#confirmLeave');
    await expect(page).not.toHaveURL(/\/game\//);
    await waitForLanding(page);
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

// Stand in for the phone's share sheet (the real one would stop the browser).
// Call before the page loads. 'record' keeps every navigator.share() argument
// in window.shareCalls; 'abort' records too, then fails the way a closed sheet
// does (AbortError); 'unsupported' takes Web Share away, like a desktop browser
async function stubShare(page, behaviour) {
    await page.addInitScript(mode => {
        window.shareCalls = [];
        const share = mode === 'unsupported' ? undefined : async data => {
            window.shareCalls.push(data);
            if (mode === 'abort') throw new DOMException('Share canceled', 'AbortError');
        };
        Object.defineProperty(Navigator.prototype, 'share', { value: share, configurable: true, writable: true });
    }, behaviour);
}

// A slow connection: the room page draws the room from its HTTP join, but its
// socket asks to join the room (join-room) only after releaseRoomJoin(page).
// Every other message goes out at once. Call before the page loads
async function holdRoomJoin(page) {
    await page.addInitScript(() => {
        const send = WebSocket.prototype.send;
        let heldJoin = null;
        let released = false;
        window.releaseRoomJoin = () => {
            released = true;
            if (heldJoin) heldJoin();
        };
        WebSocket.prototype.send = function (message) {
            if (!released && typeof message === 'string' && message.includes('"event":"join-room"')) {
                heldJoin = () => send.call(this, message);
                return;
            }
            send.call(this, message);
        };
    });
}

async function releaseRoomJoin(page) {
    await page.evaluate(() => window.releaseRoomJoin());
}

// Count the room socket's events of this name the page sends to the server.
// Call it before the player opens the room: the socket connects as the room
// page loads. Returns a function that answers the count so far
function countSentEvents(page, eventName) {
    const marker = `"${eventName}"`;
    let count = 0;
    page.on('websocket', socket => socket.on('framesent', frame => {
        if (typeof frame.payload === 'string') count += frame.payload.split(marker).length - 1;
    }));
    return () => count;
}

// CRC-32 of a PNG chunk (type + data), as the PNG format requires
function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, crc]);
}

// A small solid-colour PNG photo for the upload control, built in code so the
// repository holds no binary test files
function pngFile(width = 64, height = 64) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bits per channel
    header[9] = 2; // RGB
    const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7f)]); // filter byte + grey pixels
    const pixels = zlib.deflateSync(Buffer.concat(Array(height).fill(row)));
    const buffer = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', pixels),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
    return { name: 'photo.png', mimeType: 'image/png', buffer };
}

module.exports = {
    test,
    expect,
    text,
    serverErrorText,
    PAGE_STATUS_404,
    pngFile,
    seedStorage,
    playerCard,
    waitForPlayers,
    createRoom,
    joinRoom,
    askToJoin,
    assignCharacter,
    countSentEvents,
    roomWith,
    holdRoomJoin,
    releaseRoomJoin,
    startGame,
    revealOwnCharacter,
    startedGame,
    leaveGame,
    waitForLanding,
    stubShare,
};
