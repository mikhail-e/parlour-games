// A player's own photo as the avatar: upload, the grid, the card in the room
const { test, expect, text, seedStorage, createRoom, joinRoom, playerCard, pngFile } = require('./helpers');

const avatarTiles = page => page.locator('#avatarSelector .avatar-option');
const savedAvatar = page => page.evaluate(() => localStorage.getItem('whoami-player-avatar'));

async function uploadPhoto(page, file = pngFile()) {
    await page.locator('#avatarFileInput').setInputFiles(file);
    await expect(avatarTiles(page).first().locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
}

test('an uploaded photo becomes the selected first tile', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    const upload = page.getByRole('button', { name: text('uploadAvatar') });

    await expect(upload).toHaveAttribute('type', 'button');
    await expect(upload.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#avatarFileInput')).toHaveAttribute('accept', 'image/*');
    await uploadPhoto(page);

    await expect(avatarTiles(page)).toHaveCount(12);
    await expect(avatarTiles(page).first()).toHaveClass(/selected/);
    await expect(page.locator('#selectedAvatar')).toHaveValue(/^data:image\/jpeg;base64,/);
});

test('clicking the photo itself selects its tile', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    await uploadPhoto(page);
    await avatarTiles(page).nth(2).click();

    // A person taps where the photo is drawn; the photo lets the tap through
    // to its tile (pointer-events: none), so click that spot, not the element
    const photo = await avatarTiles(page).first().locator('img').boundingBox();
    await page.mouse.click(photo.x + photo.width / 2, photo.y + photo.height / 2);

    await expect(avatarTiles(page).first()).toHaveClass(/selected/);
});

test('the photo stays first after shuffle', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    await uploadPhoto(page);
    const photo = await avatarTiles(page).first().locator('img').getAttribute('src');

    await page.getByRole('button', { name: text('shuffleAvatars') }).click();

    await expect(avatarTiles(page).first().locator('img')).toHaveAttribute('src', photo);
    await expect(avatarTiles(page)).toHaveCount(12);
});

test('the photo is not saved until the player creates or joins a room', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await alice.page.goto('/');

    await uploadPhoto(alice.page);
    expect(await savedAvatar(alice.page)).toBeNull();

    await createRoom(alice);
    expect(JSON.parse(await savedAvatar(alice.page))).toMatch(/^data:image\/jpeg;base64,/);
});

test('a saved photo comes back first on the next visit', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await alice.page.goto('/');
    await uploadPhoto(alice.page);
    const photo = await avatarTiles(alice.page).first().locator('img').getAttribute('src');
    await createRoom(alice);

    await alice.page.goto('/');

    await expect(avatarTiles(alice.page).first().locator('img')).toHaveAttribute('src', photo);
    await expect(avatarTiles(alice.page).first()).toHaveClass(/selected/);
});

test('both players see the photo on the card', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    await alice.page.goto('/');
    await uploadPhoto(alice.page);

    const code = await createRoom(alice);
    await joinRoom(bob, code);

    for (const page of [alice.page, bob.page]) {
        await expect(playerCard(page, 'Alice').locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    }
});

test('a saved "photo" with HTML or javascript: is never rendered', async ({ newPlayer }) => {
    for (const forged of ['data:image/png;base64,"><img src=x onerror=alert(1)>', 'javascript:alert(1)']) {
        const alice = await newPlayer('Alice');
        await seedStorage(alice, { 'whoami-player-avatar': JSON.stringify(forged) });

        await alice.page.reload();

        await expect(avatarTiles(alice.page)).toHaveCount(12);
        await expect(alice.page.locator('#avatarSelector img')).toHaveCount(0);
        expect(await avatarTiles(alice.page).evaluateAll(tiles => tiles.map(tile => tile.dataset.avatar)))
            .not.toContain(forged);
    }
});

test('a file that is not an image shows the error and leaves the grid as it was', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');

    await page.locator('#avatarFileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });

    await expect(page.locator('.alert-danger')).toContainText(text('avatarNotImage'));
    await expect(avatarTiles(page)).toHaveCount(12);
    await expect(page.locator('#avatarSelector .avatar-option.selected')).toHaveCount(1);
});

test('an image that cannot be read shows the read error', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');

    await page.locator('#avatarFileInput').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a png') });

    await expect(page.locator('.alert-danger')).toContainText(text('avatarReadFailed'));
    await expect(page.locator('#avatarSelector img')).toHaveCount(0);
});
