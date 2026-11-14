// The coffee coupon (the consequences/support spec): the game's one ask for
// support, at the end of the window of every story, hidden on the browser that
// pressed it for the rest of that room, and nowhere else in the room. Buy Me a
// Coffee's site is a stub on every player's browser: a press opens a real new
// tab, and nothing goes to their site
const {
    test, expect, text, createRoom, joinRoom, waitForPlayers, startRound, writeToReading, showStories, closeStories,
} = require('./helpers');

const COFFEE_PAGE = 'https://www.buymeacoffee.com/mikhail.e';

// Two rounds of eight steps: against production every step ends with its real pause
const TWO_ROUNDS = 'two rounds, each step with its pause';

// A player whose browser gets a stub for Buy Me a Coffee's pages
async function coffeePlayer(newPlayer, name, options) {
    const player = await newPlayer(name, options);
    await player.page.context().route('https://www.buymeacoffee.com/**', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Buy Me a Coffee</title>',
    }));
    return player;
}

// A room of these players in the lobby: the first creates it, the others join
async function room(players) {
    const code = await createRoom(players[0]);
    for (const player of players.slice(1)) await joinRoom(player, code);
    for (const player of players) await waitForPlayers(player.page, players.length);
    return code;
}

// The round started, written and every sheet open: «Every story» is on for all
async function playToTheStories(players) {
    await startRound(players);
    await writeToReading(players);
    for (const { page } of players) await page.locator('#readingCard .reading-sheet').first().locator('.closed-sheet').click();
    for (const { page } of players) await expect(page.locator('#showStories')).toBeEnabled();
}

const coupon = page => page.locator('#coffeeCoupon');
const visibleCoffeeLinks = page => page.locator('a[href*="buymeacoffee.com"]:visible');

test('the end of the window of every story holds the coupon: Intermission, the ask in the page\'s language, the plate in English to Buy Me a Coffee in a new tab', async ({ newPlayer }) => {
    const anna = await coffeePlayer(newPlayer, 'Anna', { locale: 'ru-RU' });
    const boris = await coffeePlayer(newPlayer, 'Boris', { locale: 'en-GB' });
    await room([anna, boris]);
    await playToTheStories([anna, boris]);

    for (const [player, lang] of [[anna, 'ru'], [boris, 'en']]) {
        const { page } = player;
        await showStories(player);
        await expect(coupon(page)).toBeVisible();
        await expect(coupon(page).locator('.coffee-coupon__title')).toHaveText(text('intermission', lang));
        await expect(coupon(page).locator('.coffee-coupon__text')).toHaveText(text('coffeeAsk', lang));
        const link = coupon(page).getByRole('link', { name: 'Buy me a coffee', exact: true });
        await expect(link).toHaveAttribute('href', COFFEE_PAGE);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
        await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/);
        await expect(link).toHaveAttribute('lang', 'en');
        // Under the round's buttons and «Another round»
        const another = await page.locator('#windowAnotherRound').boundingBox();
        expect((await coupon(page).boundingBox()).y).toBeGreaterThan(another.y + another.height);
    }
});

test('the window asking about a new round hides the coupon; a round of the lobby\'s rounds played has it at its end', async ({ newPlayer }) => {
    const players = [await coffeePlayer(newPlayer, 'Anna'), await coffeePlayer(newPlayer, 'Boris')];
    const [anna] = players;
    await room(players);
    await playToTheStories(players);
    await showStories(anna);

    await anna.page.click('#windowAnotherRound');
    await expect(anna.page.locator('#windowNewRoundText')).toBeVisible();
    await expect(coupon(anna.page)).toBeHidden();
    await anna.page.click('#cancelWindowNewRound');
    await expect(coupon(anna.page)).toBeVisible();

    await anna.page.click('#windowAnotherRound');
    await anna.page.click('#confirmWindowNewRound');
    await expect(anna.page.locator('#roundsCard')).toBeVisible();
    await closeStories(anna);
    await anna.page.locator('#roundsList .rounds-list__row').first().click();
    await expect(anna.page.locator('#storiesModal')).toHaveClass(/\bshow\b/);
    await expect(coupon(anna.page)).toBeVisible();
});

test('pressed, the coupon stays in the open window, then is gone on that browser for the rest of the room, a reload too; the other player keeps it, and the next room has it again', async ({ newPlayer }) => {
    test.slow(true, TWO_ROUNDS);
    const anna = await coffeePlayer(newPlayer, 'Anna');
    const boris = await coffeePlayer(newPlayer, 'Boris');
    await room([anna, boris]);
    await playToTheStories([anna, boris]);
    await showStories(anna);

    // The plate opens Buy Me a Coffee in a new tab; the open window keeps the coupon
    const [tab] = await Promise.all([
        anna.page.context().waitForEvent('page'),
        coupon(anna.page).getByRole('link', { name: 'Buy me a coffee', exact: true }).click(),
    ]);
    await expect(tab).toHaveURL(COFFEE_PAGE);
    await tab.close();
    await expect(coupon(anna.page)).toBeVisible();

    // Opened anew, the window ends with its buttons and no coupon
    await closeStories(anna);
    await showStories(anna);
    await expect(anna.page.locator('#windowAnotherRound')).toBeVisible();
    await expect(coupon(anna.page)).toBeHidden();

    await anna.page.reload();
    await expect(anna.page.locator('#showStories')).toBeEnabled();
    await showStories(anna);
    await expect(anna.page.locator('#windowAnotherRound')).toBeVisible();
    await expect(coupon(anna.page)).toBeHidden();

    await showStories(boris);
    await expect(coupon(boris.page)).toBeVisible();

    // The next game is another room, with Vera: the coupon is back on Anna's browser
    const vera = await coffeePlayer(newPlayer, 'Vera');
    await room([anna, vera]);
    await playToTheStories([anna, vera]);
    await showStories(anna);
    await expect(coupon(anna.page)).toBeVisible();
});

test('nowhere else in the room: no link to Buy Me a Coffee in the lobby, while writing, on the reading sheet, in the lobby after a round', async ({ newPlayer }) => {
    const players = [await coffeePlayer(newPlayer, 'Anna'), await coffeePlayer(newPlayer, 'Boris')];
    const [anna] = players;
    await room(players);
    await expect(visibleCoffeeLinks(anna.page)).toHaveCount(0);

    await startRound(players);
    await expect(anna.page.locator('#answerText')).toBeVisible();
    await expect(visibleCoffeeLinks(anna.page)).toHaveCount(0);

    await writeToReading(players);
    for (const { page } of players) await page.locator('#readingCard .reading-sheet').first().locator('.closed-sheet').click();
    await expect(anna.page.locator('#showStories')).toBeEnabled();
    await expect(visibleCoffeeLinks(anna.page)).toHaveCount(0);

    await anna.page.click('#anotherRound');
    await expect(anna.page.locator('#newRoundModal')).toHaveClass(/\bshow\b/);
    await anna.page.click('#confirmNewRound');
    await expect(anna.page.locator('#roundsCard')).toBeVisible();
    await expect(visibleCoffeeLinks(anna.page)).toHaveCount(0);
});
