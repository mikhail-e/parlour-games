// Sending the room link: the Share button (the phone's share sheet, or a copy
// where there is none) and Copy Link, in the lobby and in a started game. The
// real share sheet never opens in a test: it would stop the browser, so
// stubShare() stands in for it
const { test, expect, text, createRoom, stubShare, startedGame, hideSocialWidgets, socialWidgetsHidden } = require('./helpers');

const inviteButton = page => page.getByRole('button', { name: text('share') });

// The page may write to the clipboard as a player's click lets it, and the
// test reads it back
async function allowClipboard(player) {
    await player.context.grantPermissions(['clipboard-read', 'clipboard-write']);
}

function clipboardText(page) {
    return page.evaluate(() => navigator.clipboard.readText());
}

test('Share opens the share sheet with the room link', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await stubShare(alice.page, 'record');
    const code = await createRoom(alice);

    await expect(inviteButton(alice.page)).toHaveAttribute('type', 'button');
    await inviteButton(alice.page).click();

    await expect.poll(() => alice.page.evaluate(() => window.shareCalls.length)).toBe(1);
    const [shared] = await alice.page.evaluate(() => window.shareCalls);
    expect(shared.url).toMatch(new RegExp(`/game/${code}$`));
    expect(shared.text).toBe(text('shareText'));
});

test('closing the share sheet is silent', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await stubShare(alice.page, 'abort');
    await createRoom(alice);
    await alice.page.evaluate(() => {
        window.copiedTexts = [];
        navigator.clipboard.writeText = async copied => { window.copiedTexts.push(copied); };
    });

    await inviteButton(alice.page).click();

    await expect.poll(() => alice.page.evaluate(() => window.shareCalls.length)).toBe(1);
    // The sheet's refusal is handled by then: no copy fallback, no message
    // (an error would fail the guard)
    expect(await alice.page.evaluate(() => window.copiedTexts)).toEqual([]);
});

test('without Web Share the link is copied', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await stubShare(alice.page, 'unsupported');
    const code = await createRoom(alice);

    await alice.page.locator('#inviteButton').click();

    await expect(alice.page.locator('#inviteButton')).toHaveText(text('copiedSuccess'));
    await expect(alice.page.locator('#roomLink')).toHaveValue(new RegExp(`/game/${code}$`));
});

test('Copy Link puts the room link on the clipboard and confirms the copy', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await allowClipboard(alice);
    const code = await createRoom(alice);

    await alice.page.locator('#copyLink').click();

    await expect(alice.page.locator('#copyLink')).toHaveText(text('copiedSuccess'));
    expect(await clipboardText(alice.page)).toMatch(new RegExp(`/game/${code}$`));
});

// A page the clipboard is closed to (one opened over plain http, as a phone on
// the home network) copies the old way, by selecting the link field. Only
// reading is allowed here, so the test can check what was copied
test('Copy Link copies where the clipboard is closed to the page', async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await alice.context.grantPermissions(['clipboard-read']);
    const code = await createRoom(alice);

    await alice.page.locator('#copyLink').click();

    await expect(alice.page.locator('#copyLink')).toHaveText(text('copiedSuccess'));
    expect(await clipboardText(alice.page)).toMatch(new RegExp(`/game/${code}$`));
});

// A started game keeps inviting: a latecomer asks to join, and any player lets
// them in. The invitation is short and waits below the game controls, so the
// round's screen starts with the players
test('a started game invites below the game controls, without the link field', async ({ newPlayer }) => {
    const { players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const { page } = alice;
    const invitation = page.locator('#gameInviteCard');

    await expect(invitation).toBeVisible();
    await expect(invitation).toContainText(text('inviteDuringGame'));
    await expect(page.locator('#gameCopyLink')).toContainText(text('copyRoomLink'));
    await expect(page.locator('#inviteCard')).toBeHidden();
    await expect(page.locator('#roomLink')).toBeHidden();
    const top = (await invitation.boundingBox()).y;
    expect(top).toBeGreaterThan((await page.locator('#playerList').boundingBox()).y);
    expect(top).toBeGreaterThan((await page.locator('#restartGame').boundingBox()).y);
});

test('Copy Link in a started game puts the room link on the clipboard', async ({ newPlayer }) => {
    const { code, players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    await allowClipboard(alice);

    await alice.page.locator('#gameCopyLink').click();

    await expect(alice.page.locator('#gameCopyLink')).toHaveText(text('copiedSuccess'));
    expect(await clipboardText(alice.page)).toMatch(new RegExp(`/game/${code}$`));
});

test('Share in a started game opens the share sheet with the room link', async ({ newPlayer }) => {
    // The share sheet stands in before each page loads
    const withShareSheet = async name => {
        const player = await newPlayer(name);
        await stubShare(player.page, 'record');
        return player;
    };
    const { code, players: { Alice: alice } } = await startedGame(withShareSheet, ['Alice', 'Bob']);

    await inviteButton(alice.page).click();

    await expect.poll(() => alice.page.evaluate(() => window.shareCalls.length)).toBe(1);
    const [shared] = await alice.page.evaluate(() => window.shareCalls);
    expect(shared.url).toMatch(new RegExp(`/game/${code}$`));
});

test('a restart brings the lobby invitation back', async ({ newPlayer }) => {
    const { players: { Alice: alice } } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const { page } = alice;

    await page.click('#restartGame');
    await expect(page.locator('#restartModal')).toHaveClass(/\bshow\b/);
    await page.click('#confirmRestart');

    await expect(page.locator('#startGame')).toBeVisible();
    await expect(page.locator('#roomLink')).toBeVisible();
    await expect(page.locator('#gameInviteCard')).toBeHidden();
});

// An ad blocker's list of social widgets hides on every site what is named
// after sharing: the invitation's names say nothing of it
test("an ad blocker's list of social widgets hides nothing of the lobby's invitation: the link, Copy Link, Share and its icon", async ({ newPlayer }) => {
    const alice = await newPlayer('Alice');
    await hideSocialWidgets(alice);
    await createRoom(alice);
    expect(await socialWidgetsHidden(alice.page)).toBe(true);

    await expect(alice.page.getByRole('textbox', { name: text('shareLinkLabel') })).toBeVisible();
    await expect(alice.page.getByRole('button', { name: text('copyLink') })).toBeVisible();
    await expect(inviteButton(alice.page)).toBeVisible();
    await expect(inviteButton(alice.page).locator('.icon')).toBeVisible();
});

test("an ad blocker's list of social widgets hides nothing of a started game's invitation", async ({ newPlayer }) => {
    const withBlocker = async name => {
        const player = await newPlayer(name);
        await hideSocialWidgets(player);
        return player;
    };
    const { players: { Alice: alice } } = await startedGame(withBlocker, ['Alice', 'Bob']);
    expect(await socialWidgetsHidden(alice.page)).toBe(true);

    await expect(alice.page.getByRole('button', { name: text('copyRoomLink') })).toBeVisible();
    await expect(inviteButton(alice.page)).toBeVisible();
    await expect(inviteButton(alice.page).locator('.icon')).toBeVisible();
});
