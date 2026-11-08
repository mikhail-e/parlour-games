// The landing page and the way into a room (spec consequences/room): the
// sign, creating a room, joining by its code or its link, the name and the
// avatar, a full room. The form is the kit's landing.js on this page's markup
const crypto = require('crypto');
const { test, expect, text, answerMessage, serverErrorText, createRoom, joinRoom, roomWith, waitForLanding, waitForPlayers, playerCard, pngFile } = require('./helpers');

const avatarTiles = page => page.locator('#avatarSelector .avatar-option');

test('the sign is one picture named Consequences, English on a Russian page too', async ({ newPlayer }) => {
    const { page } = await newPlayer('Аня', { locale: 'ru-RU' });

    await page.goto('/');

    await expect(page.getByRole('img', { name: 'Consequences' })).toBeVisible();
    await expect(page.locator('.brand-sign__name')).toHaveText('CONSEQUENCES');
    await expect(page).toHaveTitle(text('title', 'ru'));
    await expect(page.locator('.tagline')).toHaveText(text('subtitle', 'ru'));
});

test('a new room: its code in the header, its creator the only player', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');

    const code = await createRoom(alice);

    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await expect(alice.page.locator('#roomCode')).toHaveText(code);
    await waitForPlayers(alice.page, 1);
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

test('a link to a room that does not exist leads home with a message', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');

    await alice.page.goto('/game/ZZZZZ9');

    await expect(alice.page).toHaveURL(/\/\?error=room-not-found$/);
    await expect(alice.page.locator('.alert-danger')).toContainText(text('roomNotFound'));
});

test('a room link opened in a new tab leads home with the code ready, and Join enters the room', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    const code = await createRoom(alice);

    await bob.page.goto(`/game/${code}`);

    await expect(bob.page).toHaveURL(new RegExp(`/\\?join=${code}$`));
    await expect(bob.page.locator('#roomCode')).toHaveValue(code);
    await waitForLanding(bob.page);
    await bob.page.fill('#playerName', 'Bob');
    await bob.page.click('#joinBtn');
    await expect(bob.page).toHaveURL(new RegExp(`/game/${code}$`));
    for (const player of [alice, bob]) await waitForPlayers(player.page, 2);
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
    await waitForLanding(bob.page);
    const chosen = await avatarTiles(bob.page).nth(7).getAttribute('data-avatar');
    await avatarTiles(bob.page).nth(7).click();

    await joinRoom(bob, code);
    await bob.page.goto('/');

    await expect(bob.page.locator('#playerName')).toHaveValue('Bob');
    await expect(avatarTiles(bob.page).first()).toHaveAttribute('data-avatar', chosen);
});

test('two players with the same name are two players', async ({ newPlayer }) => {
    const { players: [alice] } = await roomWith(newPlayer, ['Alice', 'Sam', 'Sam']);

    await expect(playerCard(alice.page, 'Sam')).toHaveCount(2);
});

// Eleven friends join over the API, each a browser of its own (an ID and a
// secret); the thirteenth comes through the page and is told the room is full
test('a thirteenth player finds the room full', async ({ newPlayer, request }) => {
    const alice = await newPlayer('Alice');
    const carol = await newPlayer('Carol');
    const code = await createRoom(alice);
    for (let i = 2; i <= 12; i++) {
        const answer = await request.post('/api/join-game', {
            data: { gameId: code, playerName: `Player${i}`, avatar: '😀', playerId: crypto.randomUUID(), playerSecret: crypto.randomUUID() },
        });
        expect(answer.status()).toBe(200);
    }
    await waitForPlayers(alice.page, 12);
    await carol.page.goto(`/game/${code}`);
    await waitForLanding(carol.page);
    // The refused join is an HTTP 400, which the browser reports in the console
    carol.allowConsoleError(/the server responded with a status of 400/);

    await carol.page.fill('#playerName', 'Carol');
    await carol.page.click('#joinBtn');

    await answerMessage(carol.page, serverErrorText('Game is full'));
    await expect(carol.page).toHaveURL(new RegExp(`/\\?join=${code}$`));
    await waitForPlayers(alice.page, 12);
});

test('the coffee plate opens Buy Me a Coffee in a new tab, English in both languages', async ({ newPlayer }) => {
    const { page } = await newPlayer('Аня', { locale: 'ru-RU' });
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Buy me a coffee', exact: true });

    await expect(link).toHaveAttribute('href', 'https://www.buymeacoffee.com/mikhail.e');
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
