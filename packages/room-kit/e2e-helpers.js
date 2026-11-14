// The helpers of a game's browser tests that act through the kit's pages, the
// way a person would: the landing form (landing.js), entering a room, its
// waiting screen and leaving it (room-page.js), the invitation (invite.js),
// the room's socket (room-socket.js). They find the parts by the ids of the
// kit's markup contract (CLAUDE.md, The landing page, The room page) and the
// players by the kit's player cards (.player-card with its .player-name, one's
// own "Name (You)" in the page's language). A game's tests/e2e/helpers.js
// passes them on with its own, and the texts of its pages (pageTexts).
const path = require('path');
const zlib = require('zlib');
const { expect } = require('./e2e');
// translations.js and the kit's i18n.js run apart from a page
const { loadPageScript } = require('./checks');

// The texts of a game's pages: its translations.js on top of the kit's, as on
// the page. Tests never type the game's texts by hand:
//   text(key, lang, placeholders) - a text with {placeholders} filled the way
//     the page's getText fills them;
//   serverErrorText(error, lang) - a server error (it answers in English) as
//     the page shows it in this language
function pageTexts(translationsFile) {
    const game = loadPageScript(translationsFile);
    const kit = loadPageScript(path.join(__dirname, 'public', 'kit', 'js', 'i18n.js'));
    const translations = kit.withKitTexts(game.translations);
    const serverErrors = kit.withKitServerErrors(game.serverErrors);

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

    function serverErrorText(error, lang = 'en') {
        if (lang === 'en') return error;
        if (!Object.hasOwn(serverErrors[lang] || {}, error)) {
            throw new Error(`No ${lang} text for the server error "${error}"`);
        }
        return serverErrors[lang][error];
    }

    return { text, serverErrorText };
}

// A page the server answers with status 404 (404.html): the browser reports
// that status in the console, and a test that opens such a page expects it
const PAGE_STATUS_404 = /^Failed to load resource: the server responded with a status of 404/;

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

// Leave the room: the Leave button, confirm in the window, wait to be home
async function leaveGame(player) {
    const { page } = player;
    await page.click('#leaveGame');
    await expect(page.locator('#leaveModal')).toHaveClass(/\bshow\b/);
    await page.click('#confirmLeave');
    await expect(page).not.toHaveURL(/\/game\//);
    await waitForLanding(page);
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

// How many lines an element's content takes: an icon beside its label is one;
// a label under its icon, or broken in two, is more
function linesOf(locator) {
    return locator.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const middles = [...range.getClientRects()].map(rect => rect.top + rect.height / 2).sort((a, b) => a - b);
        const halfLine = parseFloat(getComputedStyle(element).lineHeight) / 2;
        return middles.filter((middle, index) => index === 0 || middle - middles[index - 1] > halfLine).length;
    });
}

// Every one of these buttons keeps its label on one line, and its "Copied!"
// after a press (invite.js puts it in the label's place): at the window's width
// and then at each of `widths`. The page may write to the clipboard and has no
// Web Share (stubShare 'unsupported'), so a Share button copies too; a button
// has its label back before the next is pressed
async function expectCopyButtonsOnOneLine(page, buttons, widths = []) {
    for (const width of [page.viewportSize().width, ...widths]) {
        await page.setViewportSize({ width, height: page.viewportSize().height });
        for (const button of buttons) {
            expect(await linesOf(button), `the label at ${width} px`).toBe(1);
            await button.click();
            await expect(button.locator('.icon--check')).toBeVisible();
            expect(await linesOf(button), `"Copied!" at ${width} px`).toBe(1);
            await expect(button.locator('.icon--check')).toHaveCount(0);
        }
    }
}

// What an ad blocker's list of social widgets hides on every site by the name
// alone (Fanboy's Social: uBlock Origin's "EasyList – Social Widgets",
// AdBlock's "Antisocial"): its rules that once hid Consequences' story button
// and the invitation's link and Share, and the two words such rules are about.
// The custom property tells the test the rules are on the page
const SOCIAL_WIDGET_RULES = `
.story-share, .icon--share, #shareButton, #shareLink,
[class*="share" i], [id*="share" i], [class*="social" i], [id*="social" i] { display: none !important; }
:root { --social-widgets: hidden; }
`;

// The player's browser hides what that list hides: its rules come after the
// kit's style sheet, as a blocker's own sheet comes on top of a page's (the
// page's Content Security Policy stops neither). Call before the page loads;
// socialWidgetsHidden(page) says the rules are on it
async function hideSocialWidgets(player) {
    await player.context.route('**/kit/css/playbill.css', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()) + SOCIAL_WIDGET_RULES });
    });
}

async function socialWidgetsHidden(page) {
    const value = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--social-widgets'));
    return value.trim() === 'hidden';
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

// The kit's message window says this, and the player presses its button
async function answerMessage(page, message) {
    await expect(page.locator('.message-window p')).toHaveText(message);
    await page.locator('.message-window button').click();
}

// How many icons a page has, and the masks of those that have no picture
async function iconsOf(page) {
    const masks = await page.evaluate(() =>
        [...document.querySelectorAll('.icon')].map(icon => getComputedStyle(icon).webkitMaskImage));
    return { count: masks.length, broken: masks.filter(mask => !mask.startsWith('url("data:image/svg+xml')) };
}

module.exports = {
    pageTexts,
    iconsOf,
    answerMessage,
    PAGE_STATUS_404,
    pngFile,
    seedStorage,
    playerCard,
    waitForPlayers,
    roomWith,
    waitForLanding,
    createRoom,
    joinRoom,
    askToJoin,
    leaveGame,
    stubShare,
    expectCopyButtonsOnOneLine,
    hideSocialWidgets,
    socialWidgetsHidden,
    holdRoomJoin,
    releaseRoomJoin,
    countSentEvents,
};
