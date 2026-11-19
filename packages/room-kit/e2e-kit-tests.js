// The kit's browser tests: what the kit does, run by every game on its own
// pages, its own server and its own config. The kit's behaviour is tested
// through the games' pages, never on a page of its own (CLAUDE.md, Decisions),
// so each group here is written once and called by a spec file of a game on
// the same subject, as check-tag.spec.js calls e2e-check-tag.js:
//   require('@parlour-games/room-kit/e2e-kit-tests').landingPageTests({ text });
// text is the game's (its pageTexts): a game may give a kit's key a text of
// its own, and a test expects what the game's page shows. A test that only
// asks the server and reads the answer runs in one project: the device
// changes how a page is drawn, not what the server answers
const crypto = require('crypto');
const { test, expect } = require('./e2e');
const {
    createRoom, joinRoom, roomWith, waitForLanding, waitForPlayers, playerCard, leaveGame, iconsOf, pngFile,
    PAGE_STATUS_404, avatarTiles, sleep, listedNames, answerMessage, seedStorage, stubShare, expectCopyButtonsOnOneLine,
    hideSocialWidgets, socialWidgetsHidden,
} = require('./e2e-helpers');
const { MAX_PLAYERS } = require('./shared/players');
/* global showMessage -- the kit's notify.js, called in the page */

const HTTP_ONLY = 'HTTP only: one browser is enough';
const onlyOnDesktop = reason => test.skip(({ isMobile }) => isMobile, reason);

// The landing page (landing.js) and the way into a room: a room that is gone,
// a code or a link in lower case, a full room, a player's ID from another
// browser, the name and the avatar remembered, players of one name, a photo
// for an avatar, the coffee plate in the footer. serverErrorText is the
// game's (its pageTexts), as text is
function landingPageTests({ text, serverErrorText }) {
    test('a link to a room that does not exist leads home with a message', async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');

        await alice.page.goto('/game/ZZZZZ9');

        await expect(alice.page).toHaveURL(/\/\?error=room-not-found$/);
        await expect(alice.page.locator('.alert-danger')).toContainText(text('roomNotFound'));
    });

    test('a friend joins by the code typed in lower case', async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');
        const bob = await newPlayer('Bob');
        const code = await createRoom(alice);
        await bob.page.goto('/');
        await waitForLanding(bob.page);

        await bob.page.fill('#playerName', 'Bob');
        await bob.page.fill('#roomCode', code.toLowerCase());
        await bob.page.click('#joinBtn');

        await expect(bob.page).toHaveURL(new RegExp(`/game/${code}$`));
        for (const player of [alice, bob]) await waitForPlayers(player.page, 2);
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
        for (const player of [alice, bob]) await waitForPlayers(player.page, 2);
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

    // The others join over the API, each a browser of its own (an ID and a
    // secret); the last comes through the page and is told the room is full
    test('a player over the limit finds the room full', async ({ newPlayer, request }) => {
        const alice = await newPlayer('Alice');
        const carol = await newPlayer('Carol');
        const code = await createRoom(alice);
        for (let index = 2; index <= MAX_PLAYERS; index++) {
            const answer = await request.post('/api/join-game', {
                data: { gameId: code, playerName: `Player${index}`, avatar: '😀', playerId: crypto.randomUUID(), playerSecret: crypto.randomUUID() },
            });
            expect(answer.status()).toBe(200);
        }
        await waitForPlayers(alice.page, MAX_PLAYERS);
        await carol.page.goto(`/game/${code}`);
        await waitForLanding(carol.page);
        // The refused join is an HTTP 400, which the browser reports in the console
        carol.allowConsoleError(/the server responded with a status of 400/);

        await carol.page.fill('#playerName', 'Carol');
        await carol.page.click('#joinBtn');

        await answerMessage(carol.page, serverErrorText('Game is full'));
        await expect(carol.page).toHaveURL(new RegExp(`/\\?join=${code}$`));
        await waitForPlayers(alice.page, MAX_PLAYERS);
    });

    test("another browser with a player's ID is refused: that player plays in another browser", async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');
        const code = await createRoom(alice);
        const alicesId = await alice.page.evaluate(() => localStorage.getItem('playerId'));
        const stranger = await newPlayer('Stranger');
        await seedStorage(stranger, { playerId: alicesId });
        stranger.allowConsoleError(/the server responded with a status of 400/);

        await stranger.page.goto(`/?join=${code}`);
        await waitForLanding(stranger.page);
        await stranger.page.fill('#playerName', 'Stranger');
        await stranger.page.click('#joinBtn');

        await answerMessage(stranger.page, serverErrorText('This player is playing in another browser'));
        await expect(stranger.page).not.toHaveURL(/\/game\//);
        expect(await listedNames(alice.page)).toEqual(['Alice']);
    });

    test('the name and the avatar are remembered after creating a room', async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');
        await alice.page.goto('/');
        await waitForLanding(alice.page);
        const chosen = await avatarTiles(alice.page).nth(4).getAttribute('data-avatar');
        await avatarTiles(alice.page).nth(4).click();

        await createRoom(alice);
        await alice.page.goto('/');

        await expect(alice.page.locator('#playerName')).toHaveValue('Alice');
        await expect(avatarTiles(alice.page).first()).toHaveAttribute('data-avatar', chosen);
        await expect(avatarTiles(alice.page).first()).toHaveClass(/selected/);
    });

    test('the name and the avatar are remembered after joining a room', async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');
        const bob = await newPlayer('Bob');
        const code = await createRoom(alice);
        await bob.page.goto(`/game/${code}`);
        await expect(bob.page).toHaveURL(new RegExp(`/\\?join=${code}$`));
        await waitForLanding(bob.page);
        const chosen = await avatarTiles(bob.page).nth(7).getAttribute('data-avatar');
        await avatarTiles(bob.page).nth(7).click();

        await joinRoom(bob, code);
        await bob.page.goto('/');

        await expect(bob.page.locator('#playerName')).toHaveValue('Bob');
        await expect(avatarTiles(bob.page).first()).toHaveAttribute('data-avatar', chosen);
        await expect(avatarTiles(bob.page).first()).toHaveClass(/selected/);
    });

    test('two players with the same name are two players', async ({ newPlayer }) => {
        const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Sam', 'Sam']);

        await expect(playerCard(alice.page, 'Sam')).toHaveCount(2);
    });

    test('a photo instead of an emoji: every player sees it by the name', async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');
        const bob = await newPlayer('Bob');
        await alice.page.goto('/');
        await alice.page.locator('#avatarFileInput').setInputFiles(pngFile());
        await expect(avatarTiles(alice.page).first()).toHaveClass(/selected/);

        const code = await createRoom(alice);
        await joinRoom(bob, code);

        for (const page of [alice.page, bob.page]) {
            await expect(playerCard(page, 'Alice').locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
        }
    });

    // Like a game's sign, the plate is English on a Russian page too; its name
    // is the words it shows, so a voice command "Buy me a coffee" finds it
    test('the coffee plate opens Buy Me a Coffee in a new tab, English in both languages', async ({ newPlayer }) => {
        const { page } = await newPlayer('Аня', { locale: 'ru-RU' });
        await page.goto('/');
        const link = page.getByRole('link', { name: 'Buy me a coffee', exact: true });

        await expect(link).toHaveAttribute('href', /^https:\/\/www\.buymeacoffee\.com\/[\w.]+$/);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
        await expect(link).toHaveAttribute('lang', 'en');
    });

    // A finger aimed at the language button must not land on the coffee link
    test('the coffee plate stands apart from the language button', async ({ newPlayer }) => {
        const { page } = await newPlayer('Alice');
        await page.goto('/');
        const language = await page.locator('.lang-toggle-btn').boundingBox();
        const coffee = await page.getByRole('link', { name: 'Buy me a coffee', exact: true }).boundingBox();

        expect(coffee.y - (language.y + language.height)).toBeGreaterThanOrEqual(32);
    });
}

// The room page (room-page.js, invite.js, notify.js): the lobby's list and a
// reload, leaving, in every tab and last, the invitation (Copy Link and
// "Copied!", its buttons in Russian, an ad blocker), a message over a window
function roomPageTests({ text }) {
    test('the lobby lists the players in the order they came, the same on every screen', async ({ newPlayer }) => {
        const { players } = await roomWith(newPlayer, ['Alice', 'Bob', 'Carol']);

        for (const player of players) expect(await listedNames(player.page)).toEqual(['Alice', 'Bob', 'Carol']);
    });

    test('a reload keeps the player at their place, with the same ID, without a double', async ({ newPlayer }) => {
        const { players: [alice, bob] } = await roomWith(newPlayer, ['Alice', 'Bob', 'Carol']);
        const storedId = page => page.evaluate(() => localStorage.getItem('playerId'));
        const id = await storedId(bob.page);

        await bob.page.reload();

        await waitForPlayers(bob.page, 3);
        expect(await listedNames(bob.page)).toEqual(['Alice', 'Bob', 'Carol']);
        expect(await storedId(bob.page)).toBe(id);
        await waitForPlayers(alice.page, 3);
    });

    test('leaving the lobby goes home with the code and the name filled in, and the others see who left', async ({ newPlayer }) => {
        const { players: [alice, bob], code } = await roomWith(newPlayer, ['Alice', 'Bob']);

        await leaveGame(bob);

        await expect(bob.page).toHaveURL(new RegExp(`/\\?join=${code}$`));
        await expect(bob.page.locator('#playerName')).toHaveValue('Bob');
        await expect(bob.page.locator('#roomCode')).toHaveValue(code);
        await waitForPlayers(alice.page, 1);
        await expect(alice.page.locator('.alert.position-fixed')).toContainText(
            text('playerLeftNotification', 'en', { playerName: 'Bob' }));
        await expect(alice.page.locator('.alert.position-fixed .icon--left')).toBeVisible();
    });

    test('Leave in one tab takes the player out of the room in every tab', async ({ newPlayer }) => {
        const { players: [alice, bob], code } = await roomWith(newPlayer, ['Alice', 'Bob']);
        // A second tab of the same browser is the same player
        const secondTab = { name: 'Alice', page: await alice.context.newPage() };
        await joinRoom(secondTab, code);
        await waitForPlayers(bob.page, 2);

        await leaveGame(alice);

        await expect(secondTab.page).toHaveURL(new RegExp(`/\\?join=${code}$`));
        await waitForPlayers(bob.page, 1);
    });

    test('the last player to leave deletes the room', async ({ newPlayer }) => {
        const { players: [alice, bob], code } = await roomWith(newPlayer, ['Alice', 'Bob']);

        await leaveGame(bob);
        await waitForPlayers(alice.page, 1);
        await leaveGame(alice);

        await expect(alice.page).toHaveURL(/\/$/);
        await alice.page.goto(`/game/${code}`);
        await expect(alice.page).toHaveURL(/\/\?error=room-not-found$/);
    });

    test('Copy Link puts the room link on the clipboard and confirms the copy', async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');
        await alice.context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const code = await createRoom(alice);

        await alice.page.locator('#copyLink').click();

        await expect(alice.page.locator('#copyLink')).toHaveText(text('copiedSuccess'));
        expect(await alice.page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/game/${code}$`));
    });

    test('"Copied!" goes by itself, a second press included, and the button is back with its icon and a label that follows the language', async ({ newPlayer }) => {
        const alice = await newPlayer('Alice', { locale: 'en-GB' });
        await alice.context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await createRoom(alice);
        const button = alice.page.locator('#copyLink');

        await button.click();
        await expect(button.locator('.icon--check')).toBeVisible();
        await button.click();

        await expect(button).toHaveText(text('copyLink', 'en'));
        await expect(button.locator('.icon--copy')).toBeVisible();
        await alice.page.locator('.lang-toggle-btn').click();
        await expect(button).toHaveText(text('copyLink', 'ru'));
    });

    // Russian has the longer words. A computer's window from 768 px up
    // (Bootstrap's md) sets the buttons side by side, and 768 leaves them the
    // least room
    test('the lobby\'s invitation keeps its buttons\' labels on one line in Russian, "Copied!" included, the narrowest window too', async ({ newPlayer, isMobile }) => {
        const alice = await newPlayer('Alice', { locale: 'ru-RU' });
        await alice.context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await stubShare(alice.page, 'unsupported');
        await createRoom(alice);
        const { page } = alice;

        await expectCopyButtonsOnOneLine(page, [page.locator('#copyLink'), page.locator('#inviteButton')], isMobile ? [] : [768]);
    });

    // An ad blocker's list of social widgets hides on every site what is named
    // after sharing: the invitation's names say nothing of it (CLAUDE.md, Rules)
    test("an ad blocker's list of social widgets hides nothing of the lobby's invitation: the link, Copy Link, Share and its icon", async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');
        await hideSocialWidgets(alice);
        await createRoom(alice);
        expect(await socialWidgetsHidden(alice.page)).toBe(true);

        await expect(alice.page.getByRole('textbox', { name: text('shareLinkLabel') })).toBeVisible();
        await expect(alice.page.getByRole('button', { name: text('copyLink') })).toBeVisible();
        const share = alice.page.getByRole('button', { name: text('share') });
        await expect(share).toBeVisible();
        await expect(share.locator('.icon')).toBeVisible();
    });

    test('a message goes over an open window, as text and once, and Escape closes it alone', async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');
        await createRoom(alice);
        const { page } = alice;
        await page.click('#leaveGame');
        await expect(page.locator('#leaveModal')).toHaveClass(/\bshow\b/);

        await page.evaluate(() => { showMessage('<b>One</b>'); showMessage('<b>One</b>'); showMessage('Two'); });

        await answerMessage(page, '<b>One</b>');
        await expect(page.locator('.message-window p')).toHaveText('Two');
        await page.keyboard.press('Escape');
        await expect(page.locator('.message-window')).toHaveCount(0);
        await expect(page.locator('#leaveModal')).toHaveClass(/\bshow\b/);
    });
}

// Longer than the ghost time of the game's server with short timers, the
// room's next timer included
const GHOST_WAIT = { timeout: 10_000 };
// Longer than its empty-room time, the room's timer included
const EMPTY_ROOM_WAIT = { timeout: 20_000 };

// The room's timers (game-room.js): a room nobody has open goes after the
// empty-room time; nobody leaves while every page is closed. They run on the
// game's server whose times are seconds: the game's room-timers.spec.js sets
// that server, and skips the file against production and on the phone
function roomTimerTests() {
    test('a room nobody has open is gone after the empty-room time', async ({ newPlayer, request }) => {
        const alice = await newPlayer('Alice');
        const code = await createRoom(alice);
        await alice.page.goto('/');

        // A question about a room changes nothing in it, so asking again and
        // again does not keep it alive; once it is gone its address sends home
        await expect.poll(async () => (await request.get(`/game/${code}`, { maxRedirects: 0 })).status(), EMPTY_ROOM_WAIT)
            .toBe(302);
        await alice.page.goto(`/game/${code}`);
        await expect(alice.page).toHaveURL(/\/\?error=room-not-found$/);
    });

    test('nobody leaves while every page is closed; the ghost time starts again on return', async ({ newPlayer }) => {
        const { players: [alice, bob], code } = await roomWith(newPlayer, ['Alice', 'Bob']);
        await alice.page.close();
        await bob.page.close();

        // Longer than the ghost time, and well short of the empty-room time:
        // the gap itself is what is checked, and the return below has to
        // reach the room before it goes
        await sleep(4500);
        const back = { name: 'Alice', page: await alice.context.newPage() };
        await joinRoom(back, code);

        await waitForPlayers(back.page, 2); // Bob is still listed: nobody was removed in the gap
        await waitForPlayers(back.page, 1, GHOST_WAIT); // and goes the ghost time after Alice came back
    });
}

// Each address with the status of its answer. /game/ZZZZZZ is a room that
// does not exist: its answer is a redirect home, checked itself rather than
// the page it leads to. The files come straight from the static files, the
// kit's as well as the game's (its config.js is every game's), the API and the
// rooms from the code (public/_headers, the kit's copy, and the Worker's copy
// of it)
const ADDRESSES = {
    '/': 200,
    '/js/config.js': 200,
    '/sw.js': 200,
    '/kit/vendor/bootstrap/bootstrap.min.css': 200,
    '/kit/fonts/fonts.css': 200,
    '/no-such/page': 404,
    '/api/version': 200,
    '/api/no-such-thing': 404,
    '/game/ZZZZZZ': 302,
    'a room': 200,
};

// The site around the game (http.js, _headers, pwa.js): only its own code,
// the security headers, the version in the footer, the icons, the service
// worker and its update banner
function siteTests({ text }) {
    test('the pages load nothing from other sites', async ({ newPlayer, baseURL }) => {
        const alice = await newPlayer('Alice');
        const origin = new URL(baseURL).origin;
        const foreign = [];
        alice.page.on('request', request => {
            const url = request.url();
            if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) foreign.push(url);
        });

        await createRoom(alice);
        await alice.page.goto('/');
        await waitForLanding(alice.page);
        await alice.page.waitForLoadState('load');

        expect(foreign).toEqual([]);
    });

    test.describe(() => {
        onlyOnDesktop(HTTP_ONLY);

        for (const [address, status] of Object.entries(ADDRESSES)) {
            test(`${address} answers with the security headers`, async ({ newPlayer, request }) => {
                let url = address;
                if (address === 'a room') url = `/game/${await createRoom(await newPlayer('Alice'))}`;
                const response = await request.get(url, { maxRedirects: 0 });
                expect(response.status()).toBe(status);
                const headers = response.headers();
                const policy = headers['content-security-policy'] || '';
                for (const rule of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
                    expect(policy).toContain(rule);
                }
                expect(headers['x-content-type-options']).toBe('nosniff');
                expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
                expect(headers['permissions-policy']).toContain('camera=()');
                expect(headers['x-powered-by']).toBeUndefined();
            });
        }
    });

    test('both pages show the version the server answers', async ({ newPlayer, request }) => {
        const { version } = await (await request.get('/api/version')).json();
        const alice = await newPlayer('Alice');
        const footerVersion = alice.page.locator('footer [data-app-version]');

        await alice.page.goto('/');
        await expect(footerVersion).toHaveText(`v${version}`);

        await createRoom(alice);
        await expect(footerVersion).toHaveText(`v${version}`);
    });

    // iOS cannot read an SVG apple-touch-icon: the home-screen icon must be a
    // PNG. An ICO file has two names for its type; browsers take either. The
    // manifest and its icons come too
    test('the icons the pages name are served, the iPhone one as a PNG', async ({ newPlayer, request }) => {
        const { page } = await newPlayer('Alice');
        await page.goto('/');

        for (const [rel, type] of [['icon', /^image\/(x-icon|vnd\.microsoft\.icon)$/], ['apple-touch-icon', /^image\/png$/]]) {
            const answer = await request.get(await page.locator(`link[rel="${rel}"]`).getAttribute('href'));
            expect(answer.status(), rel).toBe(200);
            expect(answer.headers()['content-type'], rel).toMatch(type);
        }
        const manifest = await (await request.get(await page.locator('link[rel="manifest"]').getAttribute('href'))).json();
        for (const icon of manifest.icons) {
            expect((await request.get(icon.src)).headers()['content-type'], icon.src).toBe('image/png');
        }
    });

    test('the icons of the room page and the language button come from the site', async ({ newPlayer }) => {
        const alice = await newPlayer('Alice');
        await createRoom(alice);

        await expect(alice.page.locator('.lang-toggle-btn .icon--language')).toBeVisible();
        const { count, broken } = await iconsOf(alice.page);
        expect(count).toBeGreaterThan(4);
        expect(broken).toEqual([]);
    });

    // The page registers the game's service worker (the kit's pwa.js)
    test('the page registers the service worker', async ({ newPlayer }) => {
        const { page } = await newPlayer('Alice');
        await page.goto('/');
        await waitForLanding(page);

        const worker = await page.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready;
            return new URL(registration.active.scriptURL).pathname;
        });

        expect(worker).toBe('/sw.js');
    });

    test('Update now on the update banner reloads the page', async ({ newPlayer }) => {
        const { page } = await newPlayer('Alice');
        await page.goto('/');
        await waitForLanding(page);
        // A release cannot be staged in a test: show the banner the way pwa.js
        // does when a new service worker is ready (a stand-in, like stubShare)
        await page.evaluate(() => { window.beforeReload = true; window.pwaManager.showUpdateAvailable(); });

        await expect(page.locator('.alert .icon--update')).toBeVisible();
        await page.getByRole('button', { name: text('updateNow') }).click();

        await expect.poll(() => page.evaluate(() => window.beforeReload)).toBeUndefined();
    });
}

// An address nobody answers gets the game's own page, public/404.html, with
// status 404 (http.js) - at any depth, so its links all start at the site
// root. brand: the name of the game's sign, as a screen reader reads it
function notFoundTests({ text, brand }) {
    test('a missing address answers 404 with a page in the style of the game', async ({ newPlayer, baseURL }) => {
        const alice = await newPlayer('Alice');
        alice.allowConsoleError(PAGE_STATUS_404);
        const { page } = alice;
        const origin = new URL(baseURL).origin;
        const failedFiles = [];
        page.on('response', response => {
            if (response.url().startsWith(origin) && response.request().resourceType() !== 'document' && !response.ok()) {
                failedFiles.push(`${response.status()} ${response.url()}`);
            }
        });

        const response = await page.goto('/no-such/page/here');

        expect(response.status()).toBe(404);
        await expect(page.getByRole('heading', { name: text('notFoundTitle') })).toBeVisible();
        await expect(page.getByRole('img', { name: brand })).toBeVisible();
        await page.waitForLoadState('load');
        expect(failedFiles).toEqual([]);
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain('linear-gradient');

        await page.getByRole('link', { name: text('openGame') }).click();
        await waitForLanding(page);
    });

    test("the 404 page speaks the player's language", async ({ newPlayer }) => {
        const alice = await newPlayer('Алиса', { locale: 'ru-RU' });
        alice.allowConsoleError(PAGE_STATUS_404);

        await alice.page.goto('/no-such-page');

        await expect(alice.page.getByRole('heading', { name: text('notFoundTitle', 'ru') })).toBeVisible();
    });

    test.describe(() => {
        onlyOnDesktop(HTTP_ONLY);

        test('an unknown API address answers 404, not a page of the game', async ({ request }) => {
            const response = await request.get('/api/no-such-thing');
            expect(response.status()).toBe(404);
            expect(await response.text()).toContain('data-i18n="notFoundTitle"');
        });

        // A file that sits next to the site's files without being one of them:
        // the Mac's folder notes, the list of what is not published, the
        // headers' rules
        for (const address of ['/.DS_Store', '/.assetsignore', '/_headers']) {
            test(`${address} is not served`, async ({ request }) => {
                const response = await request.get(address, { maxRedirects: 0 });
                expect(response.status()).toBe(404);
            });
        }

        // The pages have names of their own (game.html, index.html, 404.html):
        // an address without the extension is no page of the game. A room page
        // without a code would only tell the player it has none
        for (const address of ['/game', '/index', '/404']) {
            test(`${address} answers the 404 page`, async ({ request }) => {
                const response = await request.get(address, { maxRedirects: 0 });

                expect(response.status()).toBe(404);
                expect(await response.text()).toContain('data-i18n="notFoundTitle"');
            });
        }
    });
}

// WhatsApp is known to drop a preview picture bigger than this
const MAX_PICTURE_BYTES = 300 * 1024;

// The page's head as a bot reads it: the server's answer, parsed, no scripts
// run. Redirects are not followed: the card must be the one of this very address
async function headOf(page, request, url) {
    const answer = await request.get(url, { maxRedirects: 0 });
    expect(answer.status(), url).toBe(200);
    const html = await answer.text();
    return page.evaluate(source => {
        const doc = new DOMParser().parseFromString(source, 'text/html');
        const tags = {};
        for (const meta of doc.querySelectorAll('meta[property], meta[name]')) {
            tags[meta.getAttribute('property') || meta.getAttribute('name')] = meta.getAttribute('content');
        }
        const ldJson = doc.querySelector('script[type="application/ld+json"]');
        return {
            tags,
            // The services document property="og:..." and name="twitter:..."
            misplaced: [...doc.querySelectorAll('meta[name^="og:"], meta[property^="twitter:"]')].map(meta => meta.outerHTML),
            canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
            ldJson: ldJson ? ldJson.textContent : null,
        };
    }, html);
}

// A Disallow rule as robots read it (RFC 9309): a path prefix, * for any
// characters, $ for the end of the address
function closes(rule, address) {
    const pattern = rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${pattern}`).test(address);
}

// What a link to the game looks like when it is shared: a messenger's bot
// downloads the page and reads the tags in <head> without running the page's
// scripts, then fetches the picture (a game's docs/publishing.md). Search
// engines and AI assistants read robots.txt and llms.txt the same way. brand:
// the game's name, as the cards and llms.txt write it
function linkPreviewTests({ brand }) {
    const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startsWithBrand = new RegExp(`^${escapedBrand}`);
    const pages = {
        'the landing page': async () => '/',
        'a room': async newPlayer => `/game/${await createRoom(await newPlayer('Alice'))}`,
    };

    test.describe(() => {
        onlyOnDesktop('the cards are HTML: one browser is enough');

        for (const [name, address] of Object.entries(pages)) {
            test(`a link to ${name} shows a card with a title, a description and a picture`, async ({ newPlayer, request }) => {
                const url = await address(newPlayer);
                const { page } = await newPlayer('Reader');
                const { tags, misplaced } = await headOf(page, request, url);

                expect(tags['og:type']).toBe('website');
                expect(tags['og:locale']).toBe('en_US');
                expect(tags['og:site_name']).toBe(brand);
                expect(tags['og:title']).toMatch(startsWithBrand);
                expect(tags['og:description']).toBeTruthy();
                expect(tags['og:image']).toMatch(/^https:\/\/[^/]+\/.+\.jpg$/);
                expect(tags['og:image:alt']).toBeTruthy();
                expect(tags['twitter:card']).toBe('summary_large_image');
                expect(tags['twitter:title']).toBe(tags['og:title']);
                expect(tags['twitter:description']).toBe(tags['og:description']);
                expect(tags['twitter:image']).toBe(tags['og:image']);
                expect(tags['twitter:image:alt']).toBe(tags['og:image:alt']);
                expect(misplaced).toEqual([]);
            });
        }

        test('the picture of a card is a 1200×630 JPEG of this site, small enough for WhatsApp', async ({ newPlayer, request }) => {
            const { page } = await newPlayer('Reader');
            const { tags, canonical } = await headOf(page, request, '/');
            const picture = new URL(tags['og:image']);
            expect(picture.origin).toBe(new URL(canonical).origin);

            // The address in the tag is the production one: the file is fetched
            // by its path from the site under test
            const answer = await request.get(picture.pathname);
            expect(answer.status()).toBe(200);
            expect(answer.headers()['content-type']).toBe('image/jpeg');
            expect(tags['og:image:type']).toBe('image/jpeg');
            expect((await answer.body()).length).toBeLessThan(MAX_PICTURE_BYTES);

            // Measured inside a page of the game: Chrome's own viewer of a bare
            // image styles itself inline, and the Content Security Policy blocks that
            await page.goto('/');
            const size = await page.evaluate(async address => {
                const image = new Image();
                image.src = address;
                await image.decode();
                return `${image.naturalWidth}×${image.naturalHeight}`;
            }, picture.pathname);
            expect(size).toBe('1200×630');
            expect(`${tags['og:image:width']}×${tags['og:image:height']}`).toBe(size);
        });

        test('the landing page names its own address, and Google gets a description of the game', async ({ newPlayer, request }) => {
            const { page } = await newPlayer('Reader');
            const { tags, canonical, ldJson } = await headOf(page, request, '/');

            expect(canonical).toMatch(/^https:\/\/[^/]+\/$/);
            expect(tags['og:url']).toBe(canonical);
            expect(tags.robots).toBeUndefined();

            const description = JSON.parse(ldJson);
            expect(description['@type']).toBe('WebApplication');
            expect(description.name).toBe(brand);
            expect(description.url).toBe(canonical);
        });

        // Against a deployed site the cards name that very site: a card with
        // another address sends the reader and the bot's picture request
        // elsewhere. Locally the cards hold the production address, so this
        // runs only with BASE_URL
        test('the cards name the site they are served from', async ({ newPlayer, request, baseURL }) => {
            test.skip(!process.env.BASE_URL, 'the cards hold the production address');
            const { page } = await newPlayer('Reader');
            const site = new URL(baseURL).origin;
            const landing = await headOf(page, request, '/');
            expect(new URL(landing.canonical).origin).toBe(site);
            expect(new URL(landing.tags['og:url']).origin).toBe(site);
            const room = await headOf(page, request, `/game/${await createRoom(await newPlayer('Alice'))}`);
            for (const tags of [landing.tags, room.tags]) {
                expect(new URL(tags['og:image']).origin).toBe(site);
            }
        });

        test('a link to a room that has ended leads to the landing page and its card', async ({ newPlayer, request }) => {
            const answer = await request.get('/game/ZZZZZZ', { maxRedirects: 0 });
            expect(answer.status()).toBe(302);
            const target = answer.headers().location;
            expect(new URL(target, 'http://site').pathname).toBe('/');

            const { page } = await newPlayer('Reader');
            const { tags } = await headOf(page, request, target);
            expect(tags['og:title']).toMatch(startsWithBrand);
            expect(tags['og:image']).toBeTruthy();
        });

        test('a room link keeps its card but stays out of search results', async ({ newPlayer, request }) => {
            const url = `/game/${await createRoom(await newPlayer('Alice'))}`;
            const { page } = await newPlayer('Reader');
            const { tags, canonical } = await headOf(page, request, url);

            expect(tags.robots).toBe('noindex');
            // One file serves every room: an address in it would send the card
            // to another page than the room it was shared for
            expect(tags['og:url']).toBeUndefined();
            expect(canonical).toBeNull();

            // Both pages carry the card as a copy of their own: the same game, one card
            const landing = (await headOf(page, request, '/')).tags;
            for (const key of ['og:title', 'og:description', 'og:image', 'og:image:alt', 'og:image:width', 'og:image:height']) {
                expect(tags[key], key).toBe(landing[key]);
            }
        });

        test('robots.txt lets every robot in: the pages, the rooms and the picture of the card', async ({ newPlayer, request }) => {
            const answer = await request.get('/robots.txt');
            expect(answer.status()).toBe(200);
            expect(answer.headers()['content-type']).toMatch(/^text\/plain/);
            const rules = await answer.text();
            expect(rules).toMatch(/^User-agent: \*$/m);

            // X shows no card for a page or a picture robots.txt closes
            const { page } = await newPlayer('Reader');
            const picture = new URL((await headOf(page, request, '/')).tags['og:image']).pathname;
            const closed = [...rules.matchAll(/^disallow:[ \t]*(\S+)/gim)].map(([, rule]) => rule)
                .filter(rule => ['/', '/game/ABC123', picture].some(address => closes(rule, address)));
            expect(closed).toEqual([]);
        });

        test('llms.txt describes the game in plain text', async ({ request }) => {
            const answer = await request.get('/llms.txt');
            expect(answer.status()).toBe(200);
            expect(answer.headers()['content-type']).toMatch(/^text\/plain/);
            expect(await answer.text()).toMatch(new RegExp(`^# ${escapedBrand}\\n`));
        });
    });
}

module.exports = {
    landingPageTests,
    roomPageTests,
    roomTimerTests,
    siteTests,
    notFoundTests,
    linkPreviewTests,
};
