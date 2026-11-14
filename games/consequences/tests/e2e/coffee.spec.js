// The coffee coupon (the consequences/support spec): the game's one ask for
// support, on the reading sheet under «Another round» once every sheet is
// open, hidden on the browser that pressed it for the rest of that room, and
// nowhere else in the room. Buy Me a Coffee's site is a stub on every player's
// browser: a press opens a real new tab, and nothing goes to their site
const {
    test, expect, text, createRoom, joinRoom, waitForPlayers, startRound, writeToReading, showStories, closeStories,
    confirmAnotherRound, listeningPlayer, messagesOf,
} = require('./helpers');

const COFFEE_PAGE = 'https://www.buymeacoffee.com/mikhail.e';

// Three rounds of eight steps: against production every step ends with its real pause
const THREE_ROUNDS = 'three rounds, each step with its pause';

// The stub for Buy Me a Coffee's pages on a player's browser
async function stubCoffeeSite(player) {
    await player.page.context().route('https://www.buymeacoffee.com/**', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Buy Me a Coffee</title>',
    }));
    return player;
}

const coffeePlayer = async (newPlayer, name, options) => stubCoffeeSite(await newPlayer(name, options));

// A room of these players in the lobby: the first creates it, the others join
async function room(players) {
    const code = await createRoom(players[0]);
    for (const player of players.slice(1)) await joinRoom(player, code);
    for (const player of players) await waitForPlayers(player.page, players.length);
    return code;
}

// The player opens the sheet in front of their seat
const openOwnSheet = player => player.page.locator('#readingCard .reading-sheet').first().locator('.closed-sheet').click();

// The round started, written and every sheet open: «Every story» is on for all
async function playToTheStories(players) {
    await startRound(players);
    await writeToReading(players);
    for (const player of players) await openOwnSheet(player);
    for (const { page } of players) await expect(page.locator('#showStories')).toBeEnabled();
}

const coupon = page => page.locator('#coffeeCoupon');
const coffeeLink = page => coupon(page).getByRole('link', { name: 'Buy me a coffee', exact: true });
const visibleCoffeeLinks = page => page.locator('a[href*="buymeacoffee.com"]:visible');

test('once every sheet is open, the reading sheet holds the coupon under Another round: Intermission, the ask in the page\'s language, the plate in English to Buy Me a Coffee in a new tab', async ({ newPlayer }) => {
    const anna = await coffeePlayer(newPlayer, 'Anna', { locale: 'ru-RU' });
    const boris = await coffeePlayer(newPlayer, 'Boris', { locale: 'en-GB' });
    await room([anna, boris]);
    await startRound([anna, boris]);
    await writeToReading([anna, boris]);

    // One sheet open is not the end of the round
    await openOwnSheet(anna);
    await expect(anna.page.locator('#readingCard .story').first()).toBeVisible();
    await expect(coupon(anna.page)).toHaveCount(0);

    await openOwnSheet(boris);
    for (const [player, lang] of [[anna, 'ru'], [boris, 'en']]) {
        const { page } = player;
        await expect(coupon(page)).toBeVisible();
        await expect(coupon(page).locator('.coffee-coupon__title')).toHaveText(text('intermission', lang));
        await expect(coupon(page).locator('.coffee-coupon__text')).toHaveText(`${text('coffeeAskWhy', lang)} ${text('coffeeAskHow', lang)}`);
        await expect(coffeeLink(page)).toHaveAttribute('href', COFFEE_PAGE);
        await expect(coffeeLink(page)).toHaveAttribute('target', '_blank');
        await expect(coffeeLink(page)).toHaveAttribute('rel', /\bnoopener\b/);
        await expect(coffeeLink(page)).toHaveAttribute('rel', /\bnoreferrer\b/);
        await expect(coffeeLink(page)).toHaveAttribute('lang', 'en');
        // Under «Every story» and «Another round», on the reading sheet
        await expect(page.locator('#readingCard #coffeeCoupon')).toBeVisible();
        const another = await page.locator('#anotherRound').boundingBox();
        expect((await coupon(page).boundingBox()).y).toBeGreaterThan(another.y + another.height);
    }
});

test('pressed, the coupon stays while the round\'s sheet is drawn anew, then is gone on that browser for the rest of the room, a reload and the next round; the other player keeps it, and the next room has it again', async ({ newPlayer }) => {
    test.slow(true, THREE_ROUNDS);
    const anna = await stubCoffeeSite(await listeningPlayer(newPlayer, 'Anna'));
    const boris = await coffeePlayer(newPlayer, 'Boris');
    await room([anna, boris]);
    await playToTheStories([anna, boris]);

    // The plate opens Buy Me a Coffee in a new tab
    const [tab] = await Promise.all([anna.page.context().waitForEvent('page'), coffeeLink(anna.page).click()]);
    await expect(tab).toHaveURL(COFFEE_PAGE);
    await tab.close();

    // Boris's page goes and comes back: the room tells Anna's page twice (his
    // seat away, then here), her sheet is drawn anew each time, and the coupon
    // is still there
    const told = messagesOf(anna, 'round-state').length;
    await boris.page.reload();
    await expect(boris.page.locator('#showStories')).toBeEnabled();
    await expect.poll(() => messagesOf(anna, 'round-state').length).toBeGreaterThanOrEqual(told + 2);
    await expect(coupon(anna.page)).toBeVisible();

    await anna.page.reload();
    await expect(anna.page.locator('#showStories')).toBeEnabled();
    await expect(coupon(anna.page)).toHaveCount(0);
    await expect(coupon(boris.page)).toBeVisible();

    // The next round of the same room
    await confirmAnotherRound(anna);
    await expect(anna.page.locator('#roundsCard')).toBeVisible();
    await playToTheStories([anna, boris]);
    await expect(coupon(boris.page)).toBeVisible();
    await expect(coupon(anna.page)).toHaveCount(0);

    // The next game is another room, with Vera: the coupon is back on Anna's
    // browser (Boris, already a player of a room, would go into a new room's
    // link without the landing page)
    const vera = await coffeePlayer(newPlayer, 'Vera');
    await room([anna, vera]);
    await playToTheStories([anna, vera]);
    await expect(coupon(anna.page)).toBeVisible();
});

test('nowhere else in the room: no link to Buy Me a Coffee in the lobby, while writing, in the window of every story, in the lobby after a round', async ({ newPlayer }) => {
    const players = [await coffeePlayer(newPlayer, 'Anna'), await coffeePlayer(newPlayer, 'Boris')];
    const [anna] = players;
    await room(players);
    await expect(visibleCoffeeLinks(anna.page)).toHaveCount(0);

    await startRound(players);
    await expect(anna.page.locator('#answerText')).toBeVisible();
    await expect(visibleCoffeeLinks(anna.page)).toHaveCount(0);

    await writeToReading(players);
    for (const player of players) await openOwnSheet(player);
    await expect(coupon(anna.page)).toBeVisible();
    await showStories(anna);
    await expect(anna.page.locator('#storiesModal a[href*="buymeacoffee.com"]')).toHaveCount(0);
    await closeStories(anna);

    await confirmAnotherRound(anna);
    await expect(anna.page.locator('#roundsCard')).toBeVisible();
    await expect(visibleCoffeeLinks(anna.page)).toHaveCount(0);
});
