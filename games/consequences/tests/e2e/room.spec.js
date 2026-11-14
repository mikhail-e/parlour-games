// The room of Consequences between rounds and around them: the lobby and its
// invitation, one browser as one player (a reload, another browser), a player
// offline in the middle of a round and back, leaving. The room's timers
// (ghosts, an empty room) are in room-timers.spec.js, entering from the
// landing page in landing.spec.js
const {
    test, expect, text, answerMessage, serverErrorText, createRoom, roomWith, waitForPlayers, waitForLanding, seedStorage,
    startedRound, answer, answerStep, waitForStep, returnToRound, seatRow, hideSocialWidgets, socialWidgetsHidden,
    stubShare, expectCopyButtonsOnOneLine, questionOf, listedNames,
} = require('./helpers');
/* global showMessage -- the kit's notify.js, called in the page */

// Leaving the lobby, in every tab, the last one out, and Copy Link: the kit's
// tests (packages/room-kit/e2e-kit-tests.js)
require('@parlour-games/room-kit/e2e-kit-tests').roomPageTests({ text });

// The names of the round's table, in their order
const seatedNames = page => page.locator('#seatList .seat-name').evaluateAll(names =>
    names.map(name => name.firstChild.textContent));

test('the lobby lists the players in the order they came, the same on every screen', async ({ newPlayer }) => {
    const { players } = await roomWith(newPlayer, ['Anna', 'Boris', 'Vera']);

    for (const player of players) {
        expect(await listedNames(player.page)).toEqual(['Anna', 'Boris', 'Vera']);
        await expect(player.page.locator('#inviteCard')).toBeVisible();
        await expect(player.page.locator('#playerCount')).toHaveText('3');
    }
});

test("an ad blocker's list of social widgets hides nothing of the invitation: the link, Copy Link, Share and its icon", async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    await hideSocialWidgets(anna);
    await createRoom(anna);
    expect(await socialWidgetsHidden(anna.page)).toBe(true);

    await expect(anna.page.getByRole('textbox', { name: text('shareLinkLabel') })).toBeVisible();
    await expect(anna.page.getByRole('button', { name: text('copyLink') })).toBeVisible();
    const share = anna.page.getByRole('button', { name: text('share') });
    await expect(share).toBeVisible();
    await expect(share.locator('.icon')).toBeVisible();
});

// Russian has the longer words. A computer's window from 768 px up (Bootstrap's
// md) sets the buttons side by side, and 768 leaves them the least room
test('the invitation\'s buttons keep their labels on one line in Russian, "Copied!" included, the narrowest window too', async ({ newPlayer, isMobile }) => {
    const anna = await newPlayer('Anna', { locale: 'ru-RU' });
    await anna.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await stubShare(anna.page, 'unsupported');
    await createRoom(anna);
    const { page } = anna;

    await expectCopyButtonsOnOneLine(page, [page.locator('#copyLink'), page.locator('#inviteButton')], isMobile ? [] : [768]);
});

test('"Copied!" goes by itself, a second press included, and the button is back with its icon and a label that follows the language', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna', { locale: 'en-GB' });
    await anna.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await createRoom(anna);
    const button = anna.page.locator('#copyLink');

    await button.click();
    await expect(button.locator('.icon--check')).toBeVisible();
    await button.click();

    await expect(button).toHaveText(text('copyLink', 'en'));
    await expect(button.locator('.icon--copy')).toBeVisible();
    await anna.page.locator('.lang-toggle-btn').click();
    await expect(button).toHaveText(text('copyLink', 'ru'));
});

test('a message goes over an open window, as text and once, and Escape closes it alone', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    await createRoom(anna);
    const { page } = anna;
    await page.click('#leaveGame');
    await expect(page.locator('#leaveModal')).toHaveClass(/\bshow\b/);

    await page.evaluate(() => { showMessage('<b>One</b>'); showMessage('<b>One</b>'); showMessage('Two'); });

    await answerMessage(page, '<b>One</b>');
    await expect(page.locator('.message-window p')).toHaveText('Two');
    await page.keyboard.press('Escape');
    await expect(page.locator('.message-window')).toHaveCount(0);
    await expect(page.locator('#leaveModal')).toHaveClass(/\bshow\b/);
});

test('a reload keeps the player at their place, without a double', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await roomWith(newPlayer, ['Anna', 'Boris', 'Vera']);

    await boris.page.reload();

    await waitForPlayers(boris.page, 3);
    expect(await listedNames(boris.page)).toEqual(['Anna', 'Boris', 'Vera']);
    await waitForPlayers(anna.page, 3);
});

test('a page that fails to draw as it enters stays in the room, and its error is not called a connection error', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    // The first drawing after the reload finds no answer button, as a page does
    // whose browser kept an old script next to new markup
    await boris.page.addInitScript(() => {
        const getElementById = document.getElementById.bind(document);
        let missing = true;
        document.getElementById = id => {
            if (id === 'saveAndPass' && missing) {
                missing = false;
                return null;
            }
            return getElementById(id);
        };
    });
    boris.allowConsoleError(/^Drawing the room failed/);

    await boris.page.reload();

    // Still in the room at his question, and his page is in the room again:
    // his answer goes through
    await expect(boris.page).toHaveURL(/\/game\/[A-Z0-9]{6}$/);
    await expect(boris.page.locator('#questionText')).toHaveText(await questionOf(boris.page, 1));
    await answerStep([anna, boris], 0);
});

test("another browser with a player's ID is refused: that player plays in another browser", async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    const code = await createRoom(anna);
    const annasId = await anna.page.evaluate(() => localStorage.getItem('playerId'));
    const stranger = await newPlayer('Stranger');
    await seedStorage(stranger, { playerId: annasId });
    stranger.allowConsoleError(/the server responded with a status of 400/);

    await stranger.page.goto(`/?join=${code}`);
    await waitForLanding(stranger.page);
    await stranger.page.fill('#playerName', 'Stranger');
    await stranger.page.click('#joinBtn');

    await answerMessage(stranger.page, serverErrorText('This player is playing in another browser'));
    await expect(stranger.page).not.toHaveURL(/\/game\//);
    expect(await listedNames(anna.page)).toEqual(['Anna']);
});

test('a player whose page goes is offline for the others, and comes back to their seat where the round is now', async ({ newPlayer }) => {
    const { players: [anna, boris, vera], code } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);

    await vera.page.close();

    await expect(seatRow(anna.page, 'Vera')).toContainText(text('statusOffline'));
    await expect(seatRow(boris.page, 'Vera')).toContainText(text('statusOffline'));
    expect(await seatedNames(anna.page)).toEqual(['Anna', 'Boris', 'Vera']);

    // The round goes on without her: Anna answers for her
    await answer(anna, 'Anna 1');
    await answer(boris, 'Boris 1');
    await seatRow(anna.page, 'Vera').getByRole('button').click();
    await answer(anna, 'for Vera 1');
    await waitForStep([anna, boris], 1);

    const back = { name: 'Vera', page: await vera.context.newPage() };
    await returnToRound(back, code);

    await expect(seatRow(anna.page, 'Vera')).not.toContainText(text('statusOffline'));
    await expect(seatRow(anna.page, 'Vera')).toContainText(text('statusWriting'));
    expect(await seatedNames(back.page)).toEqual(['Anna', 'Boris', 'Vera']);
    await expect(back.page.locator('#questionText')).toHaveText(await questionOf(back.page, 2));
    await answerStep([anna, boris, back], 1);
});

