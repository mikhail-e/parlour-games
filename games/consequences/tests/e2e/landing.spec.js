// The landing page (spec consequences/room): the game's sign. The form and
// the way into a room are the kit's landing.js on this page's markup
const { test, expect, text, serverErrorText } = require('./helpers');

// A room that is gone, a code or a link in lower case, a full room, a
// player's ID from another browser, the name and the avatar remembered,
// players of one name, a photo, the coffee plate: the kit's tests
// (packages/room-kit/e2e-kit-tests.js)
require('@parlour-games/room-kit/e2e-kit-tests').landingPageTests({ text, serverErrorText });

test('the sign is one picture named Consequences, English on a Russian page too', async ({ newPlayer }) => {
    const { page } = await newPlayer('Аня', { locale: 'ru-RU' });

    await page.goto('/');

    await expect(page.getByRole('img', { name: 'Consequences' })).toBeVisible();
    await expect(page.locator('.brand-sign__name')).toHaveText('CONSEQUENCES');
    await expect(page).toHaveTitle(text('title', 'ru'));
    await expect(page.locator('.tagline')).toHaveText(text('subtitle', 'ru'));
});
