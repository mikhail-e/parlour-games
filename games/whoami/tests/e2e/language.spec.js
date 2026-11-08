// English and Russian: the browser's language, the saved choice, the switch,
// and texts the game builds itself (status, cards, notifications)
const {
    test, expect, text, answerMessage, serverErrorText, seedStorage, createRoom, joinRoom, playerCard, waitForPlayers, waitForLanding,
    startedGame, revealOwnCharacter,
} = require('./helpers');

// A page name used inside page.evaluate(): i18n is the page's Localization
// (translations.js)
/* global i18n */

// The h1 is the sign, a logo that stays English: the page's language shows in
// the subtitle under it, and in the tab title of a room
const subtitle = page => page.locator('[data-i18n="subtitle"]');

test('a Russian browser gets Russian', async ({ newPlayer }) => {
    const { page } = await newPlayer('Алиса', { locale: 'ru-RU' });

    await page.goto('/');

    await expect(subtitle(page)).toHaveText(text('subtitle', 'ru'));
});

test('an unknown language falls back to English', async ({ newPlayer }) => {
    const { page } = await newPlayer('Anna', { locale: 'de-DE' });

    await page.goto('/');

    await expect(subtitle(page)).toHaveText(text('subtitle', 'en'));
});

test('the saved choice beats the browser language', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await seedStorage(alice, { 'whoami-language': 'ru' });

    await alice.page.reload();

    await expect(subtitle(alice.page)).toHaveText(text('subtitle', 'ru'));
});

test('an invalid saved language is ignored', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await seedStorage(alice, { 'whoami-language': 'xx' });

    await alice.page.reload();

    await expect(subtitle(alice.page)).toHaveText(text('subtitle', 'en'));
});

test('the switch changes texts, placeholders, titles and aria-labels and is remembered', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');

    await page.locator('.lang-toggle-btn').click();

    await expect(subtitle(page)).toHaveText(text('subtitle', 'ru'));
    await expect(page.locator('#playerName')).toHaveAttribute('placeholder', text('enterName', 'ru'));
    await expect(page.locator('#shuffleAvatars')).toHaveAttribute('title', text('shuffleAvatars', 'ru'));
    await expect(page.locator('#shuffleAvatars')).toHaveAttribute('aria-label', text('shuffleAvatars', 'ru'));

    await page.reload();
    await expect(subtitle(page)).toHaveText(text('subtitle', 'ru'));
});

test('the sign stays English in Russian: it is the logo', async ({ newPlayer }) => {
    const { page } = await newPlayer('Алиса', { locale: 'ru-RU' });
    await page.goto('/');

    await expect(subtitle(page)).toHaveText(text('subtitle', 'ru'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Who am I?');
});

// A screen reader picks its voice by the page's lang, a browser decides by it
// whether to offer a translation
test('the page says which language it is in', async ({ newPlayer }) => {
    const { page } = await newPlayer('Алиса', { locale: 'ru-RU' });
    await page.goto('/');
    await expect(subtitle(page)).toHaveText(text('subtitle', 'ru'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

    await page.locator('.lang-toggle-btn').click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('in a room the switch re-renders the status and the cards', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob', { locale: 'ru-RU' });
    const code = await createRoom(alice);
    await joinRoom(bob, code);
    await waitForPlayers(alice.page, 2);
    await expect(alice.page.locator('#gameStatus')).toHaveText(text('assignCharacters', 'en'));

    await alice.page.locator('.lang-toggle-btn').click();

    await expect(alice.page.locator('#gameStatus')).toHaveText(await bob.page.locator('#gameStatus').textContent());
    await expect(playerCard(alice.page, 'Alice').locator('.player-name')).toHaveText(`Alice (${text('you', 'ru')})`);
});

test('in a lobby the switch re-renders "Assign character"', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    await joinRoom(bob, await createRoom(alice));
    await waitForPlayers(alice.page, 2);

    await alice.page.locator('.lang-toggle-btn').click();

    await expect(playerCard(alice.page, 'Bob').getByRole('button', { name: text('assignCharacter', 'ru') })).toBeVisible();
});

test("the reveal notification reads in each player's language", async ({ newPlayer }) => {
    const { players: { Alice: alice, Bob: bob }, characters } = await startedGame(newPlayer, ['Alice', 'Bob']);
    await bob.page.locator('.lang-toggle-btn').click();
    await expect(bob.page).toHaveTitle(text('gameRoom', 'ru'));

    await revealOwnCharacter(alice);

    await expect(bob.page.locator('.alert.position-fixed')).toContainText(
        text('playerRevealedNotification', 'ru', { playerName: 'Alice', character: characters.Alice }));
    await expect(alice.page.locator('.alert.position-fixed')).toContainText(
        text('playerRevealedNotification', 'en', { playerName: 'Alice', character: characters.Alice }));
});

test("a server error reads in the player's language", async ({ newPlayer }) => {
    const dasha = await newPlayer('Даша', { locale: 'ru-RU' });
    // The server answers 400; the browser logs that response itself
    dasha.allowConsoleError(/status of 400/);

    // A room that does not exist
    await dasha.page.goto('/?join=ZZZZZZ');
    await waitForLanding(dasha.page);
    await dasha.page.fill('#playerName', 'Даша');
    await dasha.page.click('#joinBtn');

    await expect(dasha.page.locator('.message-window button')).toHaveText(text('messageOk', 'ru'));
    await answerMessage(dasha.page, serverErrorText('Game not found', 'ru'));
});

test("the close buttons are named in the player's language", async ({ newPlayer }) => {
    const { players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const { page } = alice;
    await page.locator('.lang-toggle-btn').click();
    await expect(page).toHaveTitle(text('gameRoom', 'ru'));

    await page.click('#leaveGame');
    await expect(page.locator('#leaveModal')).toHaveClass(/\bshow\b/);
    await expect(page.locator('#leaveModal').getByRole('button', { name: text('close', 'ru'), exact: true })).toBeVisible();
    await page.locator('#leaveModal').getByRole('button', { name: text('close', 'ru'), exact: true }).click();
    await expect(page.locator('#leaveModal')).not.toHaveClass(/\bshow\b/);

    // A release cannot be staged in a test: show the banner the way pwa.js does
    await page.evaluate(() => window.pwaManager.showUpdateAvailable());
    await page.locator('.alert-warning').getByRole('button', { name: text('close', 'ru'), exact: true }).click();
    await expect(page.locator('.alert-warning')).toHaveCount(0);
});

test('an unknown text key shows the key itself', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');

    expect(await page.evaluate(() => i18n.getText('noSuchKey'))).toBe('noSuchKey');
});
