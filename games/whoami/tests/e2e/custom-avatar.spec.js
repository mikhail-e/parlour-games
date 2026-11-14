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

// The colour of these points of a photo, as the page draws it: [r, g, b, a]
function pixelsOf(page, src, points) {
    return page.evaluate(async ([url, spots]) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return spots.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    }, [src, points]);
}

// A point of the top half (grey) and one of the bottom half (see-through) of
// pngFile({ transparent: true }), once shrunk to the avatar's 192 pixels
const SEEN = [96, 30];
const SEE_THROUGH = [96, 170];
const near = (value, expected) => Math.abs(value - expected) <= 8;

// A browser that cannot make a WebP picture, as Safari may be: asked for one,
// it hands back a PNG (the canvas's own fallback)
async function withoutWebp(page) {
    await page.addInitScript(() => {
        const toDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
            return toDataURL.call(this, type === 'image/webp' ? 'image/png' : type, quality);
        };
    });
}

async function uploadedPhoto(page, file) {
    await page.locator('#avatarFileInput').setInputFiles(file);
    await expect(avatarTiles(page).first().locator('img')).toBeVisible();
    return avatarTiles(page).first().locator('img').getAttribute('src');
}

test('a picture with a see-through background keeps it, for every player', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    const bob = await newPlayer('Bob');
    await alice.page.goto('/');

    const photo = await uploadedPhoto(alice.page, pngFile(64, 64, { transparent: true }));

    expect(photo).toMatch(/^data:image\/webp;base64,/);
    const [seen, seeThrough] = await pixelsOf(alice.page, photo, [SEEN, SEE_THROUGH]);
    expect(seen[3]).toBe(255);
    expect(seen.slice(0, 3).every(channel => near(channel, 0x7f))).toBe(true);
    expect(seeThrough[3]).toBe(0);

    // The room keeps it as it is: the other player's page shows the same picture
    const code = await createRoom(alice);
    await joinRoom(bob, code);
    await expect(playerCard(bob.page, 'Alice').locator('img')).toHaveAttribute('src', photo);
});

test('a browser that cannot make a WebP keeps the see-through background in a PNG', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await withoutWebp(page);
    await page.goto('/');

    const photo = await uploadedPhoto(page, pngFile(64, 64, { transparent: true }));

    expect(photo).toMatch(/^data:image\/png;base64,/);
    const [seen, seeThrough] = await pixelsOf(page, photo, [SEEN, SEE_THROUGH]);
    expect(seen).toEqual([0x7f, 0x7f, 0x7f, 255]);
    expect(seeThrough[3]).toBe(0);
});

test('a see-through picture too large as a PNG is still taken, on white, as before', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await withoutWebp(page);
    await page.goto('/');

    const photo = await uploadedPhoto(page, pngFile(192, 192, { transparent: true, noisy: true }));

    expect(photo).toMatch(/^data:image\/jpeg;base64,/);
    const [[r, g, b, a]] = await pixelsOf(page, photo, [SEE_THROUGH]);
    expect([r, g, b].every(channel => near(channel, 255))).toBe(true);
    expect(a).toBe(255);
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
