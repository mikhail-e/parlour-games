// The landing page: avatars, the Join and Create buttons, remembered choices
const { test, expect, text, seedStorage, createRoom, joinRoom } = require('./helpers');

const avatarTiles = page => page.locator('#avatarSelector .avatar-option');
const avatarValues = page => avatarTiles(page).evaluateAll(tiles => tiles.map(tile => tile.dataset.avatar));

test('twelve avatars, the first one selected', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');

    await expect(avatarTiles(page)).toHaveCount(12);
    await expect(avatarTiles(page).first()).toHaveClass(/selected/);
    const first = await avatarTiles(page).first().getAttribute('data-avatar');
    await expect(page.locator('#selectedAvatar')).toHaveValue(first);
});

test('clicking an avatar selects it', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    const fourth = avatarTiles(page).nth(3);

    await fourth.click();

    await expect(fourth).toHaveClass(/selected/);
    await expect(page.locator('#avatarSelector .avatar-option.selected')).toHaveCount(1);
    await expect(page.locator('#selectedAvatar')).toHaveValue(await fourth.getAttribute('data-avatar'));
});

test('shuffle is a labelled button that deals another set without submitting the form', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    const shuffle = page.getByRole('button', { name: text('shuffleAvatars') });
    const before = await avatarValues(page);

    await expect(shuffle.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    await shuffle.click();

    // An empty name would stop a submit with an alert: the guard would catch it
    await expect.poll(() => avatarValues(page)).not.toEqual(before);
    await expect(avatarTiles(page)).toHaveCount(12);
    await expect(page).toHaveURL(/\/$/);
});

test('the grid has 4 columns on a phone and 6 on a desktop; tiles are square', async ({ newPlayer }, testInfo) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');

    const columns = await page.locator('#avatarSelector').evaluate(grid =>
        getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(testInfo.project.name === 'mobile' ? 4 : 6);

    const tile = await avatarTiles(page).first().boundingBox();
    expect(Math.abs(tile.width - tile.height)).toBeLessThanOrEqual(1);
});

test('Join needs a 6-character code, which disables Create', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    const join = page.locator('#joinBtn');
    const create = page.locator('#createNewGame');

    await expect(join).toBeDisabled();
    await page.fill('#roomCode', 'abc');
    await expect(join).toBeDisabled();
    await expect(create).toBeEnabled();

    await page.fill('#roomCode', 'abc123');
    await expect(page.locator('#roomCode')).toHaveValue('ABC123');
    await expect(join).toBeEnabled();
    await expect(create).toBeDisabled();

    await page.fill('#roomCode', '');
    await expect(join).toBeDisabled();
    await expect(create).toBeEnabled();
});

test('a ?join= link fills in the code', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');

    await page.goto('/?join=abc123');

    await expect(page.locator('#roomCode')).toHaveValue('ABC123');
    await expect(page.locator('#joinBtn')).toBeEnabled();
});

test('an empty name asks for a name', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await alice.page.goto('/');
    alice.expectDialog(text('pleaseEnterName'));

    await alice.page.click('#createNewGame');

    await expect.poll(() => alice.expectedDialogs.length).toBe(0);
    await expect(alice.page).toHaveURL(/\/$/);
});

test('a name longer than the limit is cut', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');

    await page.locator('#playerName').pressSequentially('a'.repeat(200));

    await expect(page.locator('#playerName')).toHaveValue('a'.repeat(128));
});

test('the name and the avatar are remembered after creating a room', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await alice.page.goto('/');
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
    const chosen = await avatarTiles(bob.page).nth(7).getAttribute('data-avatar');
    await avatarTiles(bob.page).nth(7).click();

    await joinRoom(bob, code);
    await bob.page.goto('/');

    await expect(bob.page.locator('#playerName')).toHaveValue('Bob');
    await expect(avatarTiles(bob.page).first()).toHaveAttribute('data-avatar', chosen);
    await expect(avatarTiles(bob.page).first()).toHaveClass(/selected/);
});

test('a tampered saved avatar is ignored', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await seedStorage(alice, { 'whoami-player-avatar': JSON.stringify('<b>x</b>') });

    await alice.page.reload();

    await expect(avatarTiles(alice.page)).toHaveCount(12);
    expect(await avatarValues(alice.page)).not.toContain('<b>x</b>');
});

test('the coffee button opens Buy Me a Coffee in a new tab', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Buy me a coffee', exact: true });

    await expect(link).toHaveAttribute('href', 'https://www.buymeacoffee.com/mikhail.e');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
});

// Like the sign, the coffee button is English on a Russian page too; its name
// is the words it shows, so a voice command "Buy me a coffee" finds it
test('the coffee button is English in both languages', async ({ newPlayer }) => {
    const { page } = await newPlayer('Алиса', { locale: 'ru-RU' });
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Buy me a coffee', exact: true });

    await expect(link).toHaveAttribute('lang', 'en');
    await expect(link).toHaveAttribute('href', 'https://www.buymeacoffee.com/mikhail.e');
});

// A finger aimed at the language button must not land on the coffee link
test('the coffee button stands apart from the language button', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    const language = await page.locator('.lang-toggle-btn').boundingBox();
    const coffee = await page.getByRole('link', { name: 'Buy me a coffee', exact: true }).boundingBox();

    expect(coffee.y - (language.y + language.height)).toBeGreaterThanOrEqual(32);
});
