// The reading (the consequences/reading spec): which sheet comes to whom after
// the eighth question, the closed sheet and its opening, reading for an
// absent player, the count of open sheets, every story, Another round. Each
// answer names its writer and its step ("Anna 3"), so a story shows which
// seat wrote what
const {
    test, expect, text, createRoom, joinRoom, waitForPlayers, startedRound, startRound, writeToReading, returnToRound,
    showStories, confirmAnotherRound, seatRow, stubShare, hideSocialWidgets, socialWidgetsHidden,
} = require('./helpers');

/* global currentGame -- the room page's picture of the room (the kit's room-page.js), inside page.evaluate() */

const readFor = (page, name) => seatRow(page, name).getByRole('button', { name: text('readFor', 'en', { name }) });
// The player's own sheet in the reading: the first part of the reading card
const ownSheet = page => page.locator('#readingCard .reading-sheet').first();
const answersOf = locator => locator.locator('.story__answer');
// A sheet among every story, by who read it
const storyReadBy = (page, name) => page.locator('#storyList .sheet').filter({
    has: page.locator('.story-head', { hasText: text('storyReadBy', 'en', { name }) }),
});

test("three players: each reads the sheet the player before them finished, written one seat on at every step", async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);
    const [anna, boris, vera] = players;
    await writeToReading(players);

    await ownSheet(boris.page).locator('.closed-sheet').click();
    await ownSheet(vera.page).locator('.closed-sheet').click();

    // Boris's sheet began with Vera and went round Anna, Boris, Vera...: its last answer is Anna's
    await expect(answersOf(ownSheet(boris.page))).toHaveText(['Vera 1', 'Anna 2', 'Boris 3', 'Vera 4', 'Anna 5', 'Boris 6', 'Vera 7', 'Anna 8']);
    await expect(answersOf(ownSheet(vera.page)).last()).toHaveText('Boris 8');
    await expect(ownSheet(anna.page).locator('.closed-sheet')).toBeVisible();
    await ownSheet(anna.page).locator('.closed-sheet').click();
    await showStories(anna);
    await expect(answersOf(storyReadBy(anna.page, 'Anna')).last()).toHaveText('Vera 8');
});

test('a closed sheet is a sealed envelope, the point of the flap hidden just under the center of the wax', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    const { page } = players[0];

    const envelope = ownSheet(page).locator('.envelope');
    const seal = envelope.locator('.envelope__seal');
    await expect(seal).toBeVisible();
    const wax = await seal.evaluate(element => getComputedStyle(element).backgroundImage.match(/url\("(.+)"\)/)[1]);
    const image = await page.request.get(wax);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/svg');
    const outer = await envelope.boundingBox();
    const inner = await seal.boundingBox();
    expect(Math.abs((inner.x + inner.width / 2) - (outer.x + outer.width / 2))).toBeLessThan(1.5);
    // The flap's lines are drawn in a box as tall as its point is low: the
    // seal's height on the envelope, and a little lower, for the eye
    const flapBox = await envelope.evaluate(element => getComputedStyle(element).backgroundSize);
    const [, sealPercent, lowerBy] = flapBox.match(/calc\(([\d.]+)% \+ ([\d.]+)px\)/);
    expect(Math.abs((inner.y + inner.height / 2) - (outer.y + outer.height * Number(sealPercent) / 100))).toBeLessThan(1.5);
    expect(Number(lowerBy)).toBe(8);
});

test('two players: each reads the sheet the other finished', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading([anna, boris]);

    await ownSheet(anna.page).locator('.closed-sheet').click();

    await expect(answersOf(ownSheet(anna.page)).last()).toHaveText('Boris 8');
    await boris.page.locator('#readingCard .closed-sheet').click();
    await showStories(boris);
    await expect(answersOf(storyReadBy(boris.page, 'Boris')).last()).toHaveText('Anna 8');
});

test("a tapped sheet opens: eight answers in order, read as one text without their questions, a line between them; the others' stay closed", async ({ newPlayer }) => {
    const anna = await newPlayer('Anna', { locale: 'ru-RU' });
    const boris = await newPlayer('Boris');
    const vera = await newPlayer('Vera');
    const code = await createRoom(anna);
    await joinRoom(boris, code);
    await joinRoom(vera, code);
    await waitForPlayers(anna.page, 3);
    const players = [anna, boris, vera];
    await startRound(players);
    await writeToReading(players);
    await expect(anna.page.locator('#readingCard .opened-count')).toHaveText(text('openedCount', 'ru', { opened: 0, count: 3 }));
    await expect(ownSheet(anna.page).locator('.closed-sheet')).toContainText(text('tapToOpen', 'ru'));
    // The writing's New round is there in the reading too
    await expect(anna.page.locator('#newRound')).toBeVisible();

    await ownSheet(anna.page).locator('.closed-sheet').click();

    await expect(answersOf(ownSheet(anna.page))).toHaveText([/ 1$/, / 2$/, / 3$/, / 4$/, / 5$/, / 6$/, / 7$/, / 8$/]);
    for (const number of [1, 2, 3, 4, 5, 6, 7, 8]) {
        await expect(ownSheet(anna.page).locator('.story')).not.toContainText(text(`question${number}`, 'ru'));
    }
    const lineUnder = item => item.evaluate(element => getComputedStyle(element).borderBottomStyle);
    const lines = ownSheet(anna.page).locator('.story li');
    expect(await lineUnder(lines.first())).toBe('dashed');
    expect(await lineUnder(lines.last())).toBe('none');
    await expect(ownSheet(boris.page).locator('.closed-sheet')).toBeVisible();
    await expect(ownSheet(vera.page).locator('.closed-sheet')).toBeVisible();
    await expect(boris.page.locator('#readingCard .opened-count')).toHaveText(text('openedCount', 'en', { opened: 1, count: 3 }));
    await expect(seatRow(boris.page, 'Anna')).toContainText(text('statusOpen'));
    await expect(seatRow(boris.page, 'Vera')).toContainText(text('statusClosed'));
});

test('an open sheet is open again after a reload, with the same answers', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);
    const [anna] = players;
    await writeToReading(players);
    await ownSheet(anna.page).locator('.closed-sheet').click();
    await expect(answersOf(ownSheet(anna.page))).toHaveCount(8);
    const answers = await answersOf(ownSheet(anna.page)).allTextContents();

    await anna.page.reload();

    await expect(answersOf(ownSheet(anna.page))).toHaveText(answers);
    await expect(ownSheet(anna.page).locator('.closed-sheet')).toHaveCount(0);
});

test("Katya reads for Petya: she gets his sheet closed and opens it, the others see who reads it", async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);
    const [katya, masha, petya] = players;
    await writeToReading(players);

    await petya.page.close();
    await expect(seatRow(katya.page, 'Petya')).toContainText(text('statusOffline'));
    await readFor(katya.page, 'Petya').click();

    const petyasSheet = katya.page.locator('#readingCard .reading-sheet').filter({ hasText: text('sheetOfPlayer', 'en', { name: 'Petya' }) });
    await expect(petyasSheet.locator('.closed-sheet')).toBeVisible();
    await expect(seatRow(masha.page, 'Petya')).toContainText(text('statusReadBy', 'en', { name: 'Katya' }));
    await expect(readFor(masha.page, 'Petya')).toHaveCount(0);

    await petyasSheet.locator('.closed-sheet').click();

    await expect(answersOf(petyasSheet)).toHaveCount(8);
    // Her own sheet is still hers to open
    await expect(ownSheet(katya.page).locator('.closed-sheet')).toBeVisible();
    await expect(masha.page.locator('#readingCard .opened-count')).toHaveText(text('openedCount', 'en', { opened: 1, count: 3 }));
});

test('Petya back before anyone took his sheet opens it himself; "Read for Petya" is gone', async ({ newPlayer }) => {
    const { players, code } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);
    const [katya, masha, petya] = players;
    await writeToReading(players);
    await petya.page.close();
    await expect(readFor(katya.page, 'Petya')).toBeVisible();

    const back = { name: 'Petya', page: await petya.context.newPage() };
    await returnToRound(back, code);

    await expect(ownSheet(back.page).locator('.closed-sheet')).toBeVisible();
    await expect(readFor(katya.page, 'Petya')).toHaveCount(0);
    await expect(readFor(masha.page, 'Petya')).toHaveCount(0);
    await ownSheet(back.page).locator('.closed-sheet').click();
    await expect(answersOf(ownSheet(back.page))).toHaveCount(8);
});

test('every story is off until the last sheet opens; that changes no screen, and each player goes on by their own press', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const [anna, boris] = players;
    await writeToReading(players);
    await expect(anna.page.locator('#showStories')).toBeDisabled();

    await ownSheet(anna.page).locator('.closed-sheet').click();
    await expect(ownSheet(anna.page).locator('.lead-on-sheet')).toHaveText(text('readThisAloud'));
    await expect(anna.page.locator('#showStories')).toBeDisabled();

    await ownSheet(boris.page).locator('.closed-sheet').click();

    // The last to open reads their sheet like everyone else
    for (const player of players) {
        await expect(player.page.locator('#showStories')).toBeEnabled();
        await expect(player.page.locator('#storiesCard')).toBeHidden();
        await expect(answersOf(ownSheet(player.page))).toHaveCount(8);
        await expect(player.page.locator('#seatsCard')).toBeVisible();
    }

    await showStories(boris);
    await expect(boris.page.locator('#readingCard')).toBeHidden();
    await expect(anna.page.locator('#storiesCard')).toBeHidden();
    await expect(answersOf(ownSheet(anna.page))).toHaveCount(8);
});

test('a reload on every story goes back to the player\'s sheet, with the button on', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();
    await showStories(players[0]);

    await players[0].page.reload();

    await expect(answersOf(ownSheet(players[0].page))).toHaveCount(8);
    await expect(players[0].page.locator('#showStories')).toBeEnabled();
    await expect(players[0].page.locator('#storiesCard')).toBeHidden();
});

test('the press of one round does not carry over to the next', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();
    await showStories(players[0]);
    await confirmAnotherRound(players[0]);
    await waitForPlayers(players[1].page, 2);

    await startRound(players);
    await writeToReading(players);
    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();

    await expect(players[0].page.locator('#showStories')).toBeEnabled();
    await expect(players[0].page.locator('#storiesCard')).toBeHidden();
});

test('every story shows each sheet with who read it', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);
    await writeToReading(players);

    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();

    for (const player of players) {
        await showStories(player);
        await expect(player.page.locator('#readingCard')).toBeHidden();
        await expect(player.page.locator('#seatsCard')).toBeHidden();
        await expect(player.page.locator('#newRound')).toBeHidden();
        const stories = player.page.locator('#storyList .sheet');
        await expect(stories).toHaveCount(3);
        // Sheet 1 began with Anna, its last answer is Boris's, and the seat after his read it
        await expect(stories.nth(0).locator('.story-head')).toContainText(text('storyTitle1', 'en'));
        await expect(stories.nth(0).locator('.story-head')).toContainText(text('storyReadBy', 'en', { name: 'Vera' }));
        await expect(stories.nth(0).locator('.story__answer').first()).toHaveText('Anna 1');
        await expect(stories.nth(1).locator('.story-head')).toContainText(text('storyTitle2', 'en'));
        await expect(stories.nth(1).locator('.story-head')).toContainText(text('storyReadBy', 'en', { name: 'Anna' }));
        await expect(stories.nth(2).locator('.story-head')).toContainText(text('storyReadBy', 'en', { name: 'Boris' }));
    }
});

test('two stories side by side: the strip to share each is at the bottom of its sheet, the short one too', async ({ newPlayer, isMobile }) => {
    test.skip(isMobile, 'a phone shows the stories in one column');
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    // Seat i holds sheet (i - step) mod 2: sheet 1 gets the long answers, sheet 2 the short ones
    const long = (player, step) => `${player.name} ${step + 1} ${'and then a long while after that '.repeat(5)}`;
    await writeToReading(players, (player, step) => (players.indexOf(player) + step) % 2 === 0 ? long(player, step) : `${player.name} ${step + 1}`);
    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();
    const [anna] = players;
    await showStories(anna);

    const sheets = anna.page.locator('#storyList .sheet');
    const [tall, short] = [await sheets.nth(0).boundingBox(), await sheets.nth(1).boundingBox()];
    expect(short.y).toBeCloseTo(tall.y, 0);
    expect(short.height).toBeCloseTo(tall.height, 0);
    for (const sheet of [sheets.nth(0), sheets.nth(1)]) {
        const [paper, strip] = [await sheet.boundingBox(), await sheet.locator('.story-send').boundingBox()];
        expect(strip.y + strip.height).toBeCloseTo(paper.y + paper.height, 0);
    }
    // The short story really is shorter: its strip is not right under it
    const story = await sheets.nth(1).locator('.story').boundingBox();
    const strip = await sheets.nth(1).locator('.story-send').boundingBox();
    expect(strip.y - (story.y + story.height)).toBeGreaterThan(50);
});

// Everyone opens their sheet; the player goes on to every story with the
// share sheet stubbed (the stand-in comes with the next page load), and with
// whatever else `prepare` sets up for that load
async function storiesToShare(newPlayer, behaviour, prepare = async () => {}) {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();
    const [anna] = players;
    await expect(anna.page.locator('#showStories')).toBeEnabled();
    await stubShare(anna.page, behaviour);
    await prepare(anna);
    await anna.page.reload();
    await expect(anna.page.locator('#showStories')).toBeEnabled();
    await showStories(anna);
    return { anna, story: storyReadBy(anna.page, 'Anna') };
}

test('a story is shared with its text and an invitation that names the game and its site, and nothing else', async ({ newPlayer }) => {
    const { anna, story } = await storiesToShare(newPlayer, 'record');
    await expect(anna.page.locator('.story-send')).toHaveCount(2);
    await expect(story.locator('.story-send')).toHaveText(text('shareStory'));
    await expect(story.locator('.story-send .icon--export')).toBeVisible();

    await story.locator('.story-send').click();

    await expect.poll(() => anna.page.evaluate(() => window.shareCalls.length)).toBe(1);
    const answers = await answersOf(story).allTextContents();
    expect(answers).toHaveLength(8);
    const site = new URL(anna.page.url()).host;
    const invitation = text('shareStoryInvitation', 'en', { site });
    expect(invitation).toContain(text('title'));
    expect(invitation).toContain(site);
    expect((await anna.page.evaluate(() => window.shareCalls))[0]).toEqual({
        title: text('title'),
        text: `${answers.join('\n')}\n\n${invitation}`,
    });
});

test("an ad blocker's list of social widgets hides no story's Share, nor its icon", async ({ newPlayer }) => {
    const { anna } = await storiesToShare(newPlayer, 'record', hideSocialWidgets);
    expect(await socialWidgetsHidden(anna.page)).toBe(true);

    const buttons = anna.page.getByRole('button', { name: text('shareStory') });
    await expect(buttons).toHaveCount(2);
    for (const button of await buttons.all()) await expect(button.locator('.icon')).toBeVisible();
});

test('closing the share sheet of a story is silent', async ({ newPlayer }) => {
    const { anna, story } = await storiesToShare(newPlayer, 'abort');
    await anna.page.evaluate(() => {
        window.copiedTexts = [];
        navigator.clipboard.writeText = async copied => { window.copiedTexts.push(copied); };
    });

    await story.locator('.story-send').click();

    await expect.poll(() => anna.page.evaluate(() => window.shareCalls.length)).toBe(1);
    // The sheet's refusal is handled by then: nothing went to be copied
    expect(await anna.page.evaluate(() => window.copiedTexts)).toEqual([]);
});

test('without a share sheet the story is copied, and the button says so', async ({ newPlayer }) => {
    const { anna, story } = await storiesToShare(newPlayer, 'unsupported');
    await anna.context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await story.locator('.story-send').click();

    await expect(story.locator('.story-send')).toHaveText(text('copiedSuccess'));
    const answers = await answersOf(story).allTextContents();
    const copied = await anna.page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith(answers.join('\n'))).toBe(true);
    expect(copied.endsWith(text('shareStoryInvitation', 'en', { site: new URL(anna.page.url()).host }))).toBe(true);
});

test('Another round asks first: while a player is still reading, a No changes nothing', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading([anna, boris]);
    for (const player of [anna, boris]) await ownSheet(player.page).locator('.closed-sheet').click();
    await showStories(anna);

    await anna.page.click('#anotherRound');

    const window = anna.page.locator('#newRoundModal');
    await expect(window).toHaveClass(/\bshow\b/);
    await expect(window).toContainText(text('newRoundText'));
    await window.locator('[data-bs-dismiss="modal"]').first().click();
    await expect(window).not.toHaveClass(/\bshow\b/);
    await expect(anna.page.locator('#storiesCard')).toBeVisible();
    await expect(answersOf(ownSheet(boris.page))).toHaveCount(8);
});

test('the question of Another round stays open through what happens in the room', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading([anna, boris]);
    for (const player of [anna, boris]) await ownSheet(player.page).locator('.closed-sheet').click();
    await showStories(anna);
    await anna.page.click('#anotherRound');
    await expect(anna.page.locator('#newRoundModal')).toHaveClass(/\bshow\b/);

    await boris.page.goto('about:blank');
    await expect(anna.page.locator('#storiesCard')).toBeVisible();
    await expect.poll(() => anna.page.evaluate(() => currentGame.round.seats[1].absent)).toBe('offline');

    await expect(anna.page.locator('#newRoundModal')).toHaveClass(/\bshow\b/);
});

test('Another round, said yes to, takes everyone back to the lobby', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();
    await showStories(players[1]);

    await confirmAnotherRound(players[1]);

    for (const player of players) {
        await expect(player.page.locator('#playersCard')).toBeVisible();
        await expect(player.page.locator('#storiesCard')).toBeHidden();
        await waitForPlayers(player.page, 2);
    }
    await expect(players[1].page.locator('#newRoundModal')).toBeHidden();
    await startRound(players);
    await expect(players[0].page.locator('#questionText')).toHaveText(text('question1'));
});
