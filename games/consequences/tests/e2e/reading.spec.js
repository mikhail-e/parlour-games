// The reading (the consequences/reading spec): which sheet comes to whom after
// the eighth question, the closed sheet and its opening, reading for an
// absent player, the count of open sheets, every story, Another round. Each
// answer names its writer and its step ("Anna 3"), so a story shows which
// seat wrote what
const {
    test, expect, text, createRoom, joinRoom, waitForPlayers, startedRound, startRound, writeToReading, returnToRound,
    showStories, closeStories, confirmAnotherRound, seatRow, stubShare, countingSent, hideSocialWidgets, socialWidgetsHidden, setOf, setText, questionOf, roundStep,
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
    // seal's height on the envelope, and a little lower, for the eye - under
    // the seal's center, hidden by the wax (how much lower is the style's)
    const flapBox = await envelope.evaluate(element => getComputedStyle(element).backgroundSize);
    const [, sealPercent, lowerBy] = flapBox.match(/calc\(([\d.]+)% \+ ([\d.]+)px\)/);
    expect(Math.abs((inner.y + inner.height / 2) - (outer.y + outer.height * Number(sealPercent) / 100))).toBeLessThan(1.5);
    expect(Number(lowerBy)).toBeGreaterThan(0);
    expect(Number(lowerBy)).toBeLessThan(inner.height / 2);
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
        await expect(ownSheet(anna.page).locator('.story')).not.toContainText(await questionOf(anna.page, number, 'ru'));
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
        await expect(player.page.locator('#storiesModal')).toBeHidden();
        await expect(answersOf(ownSheet(player.page))).toHaveCount(8);
        await expect(player.page.locator('#seatsCard')).toBeVisible();
    }

    // Boris's window opens over his sheet, on this round, the room's first
    await showStories(boris);
    await expect(boris.page.locator('#storiesRound')).toHaveText(text('roundOf', 'en', { n: 1, count: 1 }));

    // Closed, it leaves Boris at his sheet, as he left it
    await closeStories(boris);
    await expect(answersOf(ownSheet(boris.page))).toHaveCount(8);
    await expect(boris.page.locator('#showStories')).toBeEnabled();
});

test('a reload on every story goes back to the player\'s sheet, with the button on', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();
    await showStories(players[0]);

    await players[0].page.reload();

    await expect(answersOf(ownSheet(players[0].page))).toHaveCount(8);
    await expect(players[0].page.locator('#showStories')).toBeEnabled();
    await expect(players[0].page.locator('#storiesModal')).toBeHidden();
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
    await expect(players[0].page.locator('#storiesModal')).toBeHidden();
});

test('every story shows each sheet with who read it', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);
    await writeToReading(players);

    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();

    for (const player of players) {
        await showStories(player);
        // «Another round» on the reading sheet has taken the place of «New round»
        await expect(player.page.locator('#newRound')).toBeHidden();
        const stories = player.page.locator('#storyList .sheet');
        await expect(stories).toHaveCount(3);
        // Sheet 1 began with Anna, its last answer is Boris's, and the seat
        // after his read it. The stories' titles are the set's: the last test
        await expect(stories.nth(0).locator('.story-head')).toContainText(text('storyReadBy', 'en', { name: 'Vera' }));
        await expect(stories.nth(0).locator('.story__answer').first()).toHaveText('Anna 1');
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

// The first line of a shared story: the round's set in capitals between two
// stars, in the page's language
async function sharedTitle(page, lang = 'en') {
    return `★ ${(await setText(page, 'Name', lang)).toUpperCase()} ★`;
}

test('a story is shared under the name of the round\'s set, with its text and an invitation that names the game and its site, and nothing else', async ({ newPlayer }) => {
    const { anna, story } = await storiesToShare(newPlayer, 'record');
    await expect(anna.page.locator('.story-send')).toHaveCount(2);
    await expect(story.locator('.story-send')).toHaveText(text('shareStory'));
    await expect(story.locator('.story-send .icon--export')).toBeVisible();

    await story.locator('.story-send').click();

    await expect.poll(() => anna.page.evaluate(() => window.shareCalls.length)).toBe(1);
    const answers = await answersOf(story).allTextContents();
    expect(answers).toHaveLength(8);
    // That the invitation names the game and its site is translations.test.js's
    const invitation = text('shareStoryInvitation', 'en', { site: new URL(anna.page.url()).host });
    expect((await anna.page.evaluate(() => window.shareCalls))[0]).toEqual({
        title: text('title'),
        text: `${await sharedTitle(anna.page)}\n\n${answers.join('\n')}\n\n${invitation}`,
    });

    // In Russian the title is the set's Russian name: the language button is
    // the room's, under the window
    await closeStories(anna);
    await anna.page.locator('.lang-toggle-btn').click();
    await showStories(anna);
    await expect(anna.page.locator('.story-send').first()).toHaveText(text('shareStory', 'ru'));
    await anna.page.locator('.story-send').first().click();
    await expect.poll(() => anna.page.evaluate(() => window.shareCalls.length)).toBe(2);
    const [, inRussian] = await anna.page.evaluate(() => window.shareCalls);
    expect(inRussian.text.startsWith(`${await sharedTitle(anna.page, 'ru')}\n\n`)).toBe(true);
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

test('without a share sheet the story is copied, under the name of the round\'s set, and the button says so', async ({ newPlayer }) => {
    const { anna, story } = await storiesToShare(newPlayer, 'unsupported');
    await anna.context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await story.locator('.story-send').click();

    await expect(story.locator('.story-send')).toHaveText(text('copiedSuccess'));
    const answers = await answersOf(story).allTextContents();
    const copied = await anna.page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith(`${await sharedTitle(anna.page)}\n\n${answers.join('\n')}\n\n`)).toBe(true);
    expect(copied.endsWith(text('shareStoryInvitation', 'en', { site: new URL(anna.page.url()).host }))).toBe(true);
});

// A page the clipboard is closed to (plain http, as a phone on the home
// network): no navigator.clipboard, and the old way's copy records what is
// selected in the field that has the focus, as the browser would copy it
async function closeClipboard(player) {
    await player.page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'clipboard', { value: undefined, configurable: true });
        window.copiedTexts = [];
        document.execCommand = command => {
            const field = document.activeElement;
            if (command === 'copy' && field instanceof HTMLTextAreaElement) {
                window.copiedTexts.push(field.value.slice(field.selectionStart, field.selectionEnd));
            }
            return true;
        };
    });
}

test('without a share sheet or a clipboard the story is copied the old way, from inside the window of every story', async ({ newPlayer }) => {
    const { anna, story } = await storiesToShare(newPlayer, 'unsupported', closeClipboard);

    await story.locator('.story-send').click();

    // The window keeps the focus inside itself: a field outside it would lose
    // the focus before the copy, and nothing would be copied
    await expect(story.locator('.story-send')).toHaveText(text('copiedSuccess'));
    const answers = await answersOf(story).allTextContents();
    const site = new URL(anna.page.url()).host;
    expect(await anna.page.evaluate(() => window.copiedTexts)).toEqual([
        `${await sharedTitle(anna.page)}\n\n${answers.join('\n')}\n\n${text('shareStoryInvitation', 'en', { site })}`,
    ]);
    // The field made for the copy is gone
    await expect(anna.page.locator('#storiesModal textarea')).toHaveCount(0);
});

test('Another round on the reading sheet asks first: while a player is still reading, a No changes nothing', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(countingSent(newPlayer, 'new-round'), ['Anna', 'Boris']);
    await writeToReading([anna, boris]);
    for (const player of [anna, boris]) await ownSheet(player.page).locator('.closed-sheet').click();

    // It takes the place of New round under the sheet
    await expect(anna.page.locator('#newRound')).toBeHidden();
    await expect(anna.page.locator('#anotherRound')).toHaveClass(/\bbtn-outline-primary\b/);
    await anna.page.click('#anotherRound');

    // The stories stay in every story, and the kit's red is only for what cannot be undone
    const window = anna.page.locator('#newRoundModal');
    await expect(window).toHaveClass(/\bshow\b/);
    await expect(anna.page.locator('#newRoundKeeps')).toHaveText(text('newRoundKeepsStories'));
    await expect(anna.page.locator('#newRoundLoses')).toBeHidden();
    await expect(anna.page.locator('#confirmNewRound')).toHaveClass(/\bbtn-primary\b/);
    await expect(anna.page.locator('#confirmNewRound')).not.toHaveClass(/\bbtn-danger\b/);
    await window.locator('[data-bs-dismiss="modal"]').first().click();
    await expect(window).not.toHaveClass(/\bshow\b/);
    await expect(answersOf(ownSheet(anna.page))).toHaveCount(8);

    // Asked again, the yes is the only Another round that reached the room
    await confirmAnotherRound(anna);
    for (const player of [anna, boris]) await waitForPlayers(player.page, 2);
    expect(anna.sent()).toBe(1);
});

test('the question of Another round stays open through what happens in the room', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await writeToReading([anna, boris]);
    for (const player of [anna, boris]) await ownSheet(player.page).locator('.closed-sheet').click();
    await anna.page.click('#anotherRound');
    await expect(anna.page.locator('#newRoundModal')).toHaveClass(/\bshow\b/);

    await boris.page.goto('about:blank');
    await expect(anna.page.locator('#readingCard')).toBeVisible();
    await expect.poll(() => anna.page.evaluate(() => currentGame.round.seats[1].absent)).toBe('offline');

    await expect(anna.page.locator('#newRoundModal')).toHaveClass(/\bshow\b/);
});

// That the next round draws another set is game-logic.test.js's
test('Another round asked in the window of every story: Cancel goes back to the stories, yes closes that window on the lobby while another reader\'s stays open', async ({ newPlayer }) => {
    const { players } = await startedRound(countingSent(newPlayer, 'new-round'), ['Anna', 'Boris']);
    await writeToReading(players);
    for (const player of players) await ownSheet(player.page).locator('.closed-sheet').click();
    await showStories(players[0]);
    await showStories(players[1]);
    const { page } = players[1];

    // Its question comes inside the window, in the stories' place; Cancel brings them back
    await page.click('#windowAnotherRound');
    await expect(page.locator('#storiesTitle')).toHaveText(text('newRound'));
    await expect(page.locator('#windowNewRoundText')).toHaveText(text('newRoundKeepsStories'));
    await expect(page.locator('#storyList')).toBeHidden();
    await expect(page.locator('#storiesEnd')).toBeHidden();
    await expect(page.locator('#confirmWindowNewRound')).toHaveClass(/\bbtn-primary\b/);
    await expect(page.locator('#cancelWindowNewRound')).toBeFocused();
    await page.click('#cancelWindowNewRound');
    await expect(page.locator('#storiesTitle')).toHaveText(await setText(page, 'AllStories'));
    await expect(page.locator('#storyList .sheet')).toHaveCount(2);
    await expect(page.locator('#windowNewRoundButtons')).toBeHidden();
    await expect(page.locator('#windowAnotherRound')).toBeFocused();

    // Yes: Boris's window closes by itself on the lobby, as the reading
    // sheet's question does; Anna, reading in hers, keeps it on the round
    await page.click('#windowAnotherRound');
    await page.click('#confirmWindowNewRound');
    await expect(page.locator('#storiesModal')).toBeHidden();
    await expect(page.locator('#playersCard')).toBeVisible();
    await expect.poll(() => roundStep(players[0].page)).toBeNull();
    await expect(players[0].page.locator('#storiesModal')).toBeVisible();
    await expect(players[0].page.locator('#storyList .sheet')).toHaveCount(2);
    await closeStories(players[0]);

    for (const player of players) {
        await expect(player.page.locator('#playersCard')).toBeVisible();
        await expect(player.page.locator('#storiesModal')).toBeHidden();
        await waitForPlayers(player.page, 2);
    }
    await expect(players[1].page.locator('#newRoundModal')).toBeHidden();
    // The room's answer to the yes is back: the Cancel had sent nothing
    expect(players[1].sent()).toBe(1);
    await startRound(players);
    await expect(players[0].page.locator('#questionText')).toHaveText(await questionOf(players[0].page, 1));
});

test('New round in the middle of the reading asks with the reading\'s words, never red, and the round goes into the rounds played', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const set = await setOf(anna.page);
    await writeToReading([anna, boris]);
    await ownSheet(anna.page).locator('.closed-sheet').click();
    await expect(answersOf(ownSheet(anna.page))).toHaveCount(8);

    // Boris has not opened his sheet: New round is still there, in ink
    await expect(anna.page.locator('#newRound')).toHaveClass(/\bbtn-outline-primary\b/);
    await expect(anna.page.locator('#newRound')).not.toHaveClass(/\bbtn-outline-danger\b/);
    await anna.page.click('#newRound');
    await expect(anna.page.locator('#newRoundModal')).toHaveClass(/\bshow\b/);
    await expect(anna.page.locator('#newRoundKeeps')).toHaveText(text('newRoundKeepsStories'));
    await expect(anna.page.locator('#newRoundLoses')).toBeHidden();
    await expect(anna.page.locator('#confirmNewRound')).not.toHaveClass(/\bbtn-danger\b/);
    await anna.page.click('#confirmNewRound');

    for (const player of [anna, boris]) {
        await expect(player.page.locator('#playersCard')).toBeVisible();
        await expect(player.page.locator('#roundsList .rounds-list__set')).toHaveText([text(`${set}Name`)]);
    }
});

// The set names the reading's stories («The tales are ready», «Every tale»,
// «Tale one»): the set, read off the sheet while writing, has no title of its own here
test("the reading and every story are titled by the round's set's stories, with no second title for its name", async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const set = await setOf(anna.page);
    await writeToReading([anna, boris]);

    await expect(anna.page.locator('#readingCard .sheet-title')).toHaveText([text(`${set}StoriesReady`)]);
    await expect(anna.page.locator('#showStories')).toHaveText(text(`${set}AllStories`));
    await ownSheet(anna.page).locator('.closed-sheet').click();
    await expect(answersOf(ownSheet(anna.page))).toHaveCount(8);
    await expect(anna.page.locator('#readingCard .sheet-title')).toHaveText([text(`${set}StoriesReady`)]);

    await ownSheet(boris.page).locator('.closed-sheet').click();
    await showStories(anna);
    await expect(anna.page.locator('#storiesModal .modal-title')).toHaveText([text(`${set}AllStories`)]);
    await expect(anna.page.locator('#storyList .story-head').nth(0)).toContainText(text(`${set}StoryTitle1`));
    await expect(anna.page.locator('#storyList .story-head').nth(1)).toContainText(text(`${set}StoryTitle2`));
});
