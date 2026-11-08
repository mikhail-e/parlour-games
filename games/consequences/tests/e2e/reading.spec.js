// The reading (the consequences/reading spec): which sheet comes to whom after
// the eighth question, the closed sheet and its opening, reading for an
// absent player, the count of open sheets, every story, Another round. Each
// answer names its writer and its step ("Anna 3"), so a story shows which
// seat wrote what
const {
    test, expect, text, createRoom, joinRoom, waitForPlayers, startedRound, startRound, writeToReading, returnToRound,
    seatRow,
} = require('./helpers');

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

test('the last sheet to open shows every story to everyone, each with who read it', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);
    await writeToReading(players);

    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();

    for (const player of players) {
        await expect(player.page.locator('#storiesCard')).toBeVisible();
        await expect(player.page.locator('#readingCard')).toBeHidden();
        await expect(player.page.locator('#seatsCard')).toBeHidden();
        await expect(player.page.locator('#newRound')).toBeHidden();
        const stories = player.page.locator('#storyList .sheet');
        await expect(stories).toHaveCount(3);
        // Sheet 1 began with Anna, its last answer is Boris's, and the seat after his read it
        await expect(stories.nth(0).locator('.story-head')).toContainText(text('sheetNumber', 'en', { number: 1 }));
        await expect(stories.nth(0).locator('.story-head')).toContainText(text('storyReadBy', 'en', { name: 'Vera' }));
        await expect(stories.nth(0).locator('.story__answer').first()).toHaveText('Anna 1');
        await expect(stories.nth(1).locator('.story-head')).toContainText(text('storyReadBy', 'en', { name: 'Anna' }));
        await expect(stories.nth(2).locator('.story-head')).toContainText(text('storyReadBy', 'en', { name: 'Boris' }));
    }
});

test('Another round takes everyone back to the lobby, without asking', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();
    await expect(players[1].page.locator('#storiesCard')).toBeVisible();

    await players[1].page.click('#anotherRound');

    for (const player of players) {
        await expect(player.page.locator('#playersCard')).toBeVisible();
        await expect(player.page.locator('#storiesCard')).toBeHidden();
        await waitForPlayers(player.page, 2);
    }
    await expect(players[1].page.locator('#newRoundModal')).toBeHidden();
    await startRound(players);
    await expect(players[0].page.locator('#questionText')).toHaveText(text('question1'));
});
