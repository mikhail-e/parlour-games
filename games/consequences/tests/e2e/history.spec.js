// The room's history (openspec consequences/history): a round that reached
// the reading is kept when it ends, every story whole with who read it, and a
// player's page gets a round of it when it asks (history-round); the window of
// every story pages through the rounds, the lobby lists them. What the room
// sends is read off the pages' sockets; the rounds are played by moves, sent
// through the room page's own sendMove (the kit's room-page.js), and the
// window and the lobby are used as a player does.
const {
    test, expect, text, joinRoom, waitForPlayers, waitForStep, writeToReading, showStories, closeStories, questionOf, questionsOfSet, storyLines,
    listeningRoom, messagesOf, latestMessage: latest, sendRoomMove: move,
} = require('./helpers');

// Three rounds of eight steps: against production every step ends with its
// real pause (game-logic.js's STEP_PAUSE_MS), and the pauses alone fill the
// usual time of a test
const ROUNDS_TAKE_TIME = 'three rounds, each step with its pause';

// The answers of a round tagged so: "<tag>-<name>-<step>"
const tagged = tag => (player, step) => `${tag}-${player.name}-${step}`;

// The answers of sheet j of a tagged round: at step s the sheet lies in front
// of seat (j + s) mod N
const sheetAnswers = (players, tag, sheet) => Array.from({ length: 8 },
    (unused, step) => `${tag}-${players[(sheet + step) % players.length].name}-${step}`);

// The round just started: its set of questions, as the room sent it
async function startedSet(players) {
    await move(players[0], 'start-round');
    await waitForStep(players, 0);
    return latest(players[0], 'round-state').round.questionSet;
}

// A round started and written to the reading: its set
async function writtenRound(players, tag) {
    const set = await startedSet(players);
    await writeToReading(players, tagged(tag));
    return set;
}

// A round to its last story, every sheet opened by its reader: its set
async function readRound(players, tag) {
    const set = await writtenRound(players, tag);
    for (const player of players) await move(player, 'open-sheet');
    for (const player of players) await expect(player.page.locator('#showStories')).toBeEnabled();
    return set;
}

// Back to the lobby, by a move of the first player
async function endRound(players) {
    await move(players[0], 'new-round');
    await waitForStep(players, null);
}

// The stories of a round in the window: two players, so sheet j was read at
// seat j; `readers` false where a sheet was never opened. Each answer is under
// its question of the round's own set
async function expectStories(page, players, set, tag, readers = [true, true], lang = 'en') {
    const stories = page.locator('#storyList .sheet');
    await expect(stories).toHaveCount(players.length);
    for (const [sheet, read] of readers.entries()) {
        const head = stories.nth(sheet).locator('.story-head');
        await expect(head).toContainText(text(`${set}StoryTitle${sheet + 1}`, lang));
        if (read) await expect(head).toContainText(text('storyReadBy', lang, { name: players[sheet].name }));
        else await expect(head.locator('small')).toHaveCount(0);
        await expect(stories.nth(sheet).locator('.story__answer')).toHaveText(sheetAnswers(players, tag, sheet));
        await expect(stories.nth(sheet).locator('.story__question')).toHaveText(questionsOfSet(set, lang));
    }
}

// The window on round `number` of `count`: its title is the round's set's
async function expectWindowRound(page, set, number, count, lang = 'en') {
    await expect(page.locator('#storiesModal')).toHaveClass(/\bshow\b/);
    await expect(page.locator('#storiesTitle')).toHaveText(text(`${set}AllStories`, lang));
    await expect(page.locator('#storiesRound')).toHaveText(text('roundOf', lang, { n: number, count }));
}

// Which rounds the history keeps, and which numbers are a round of it, are
// game-logic.test.js's; that a round ended while writing and the round on are
// given to nobody, secret.spec.js's
test('the room keeps a round that reached the reading, and a page gets it when it asks, alone', async ({ newPlayer }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'what the room sends: the device adds nothing');
    const { players } = await listeningRoom(newPlayer, ['Anna', 'Boris']);
    const [anna, boris] = players;
    const set = await readRound(players, 'r1');

    // "Another round": the round goes into the history, every page sees its set
    await move(boris, 'new-round');
    for (const player of players) await expect.poll(() => latest(player, 'round-state')?.historySets).toEqual([set]);

    // Boris asks for it: two players, so sheet j was read at seat j
    await move(boris, 'history-round', { number: 1 });
    await expect.poll(() => latest(boris, 'history-round')?.number).toBe(1);
    expect(latest(boris, 'history-round').round).toEqual({
        questionSet: set,
        stories: [0, 1].map(sheet => ({ answers: sheetAnswers(players, 'r1', sheet), readBy: players[sheet].name })),
    });

    // Only the asker's page gets it. Anna asks for a number outside the
    // history: no round, and the room's answer comes after anything it sent her
    // before (the page logs the room's error)
    anna.allowConsoleError(/Socket error: No such round/);
    await move(anna, 'history-round', { number: 2 });
    await expect.poll(() => latest(anna, 'error')).toBe('No such round');
    expect(messagesOf(anna, 'history-round')).toEqual([]);
});

test('the window of every story opens on the round being read and pages back through the rounds of the room, each from its first story', async ({ newPlayer }, testInfo) => {
    test.slow(true, ROUNDS_TAKE_TIME);
    const { players } = await listeningRoom(newPlayer, ['Anna', 'Boris']);
    const [anna, boris] = players;
    const sets = [];
    for (const tag of ['r1', 'r2']) {
        sets.push(await readRound(players, tag));
        await endRound(players);
    }
    sets.push(await readRound(players, 'r3'));
    const { page } = anna;

    await showStories(anna);
    await expectWindowRound(page, sets[2], 3, 3);
    await expectStories(page, players, sets[2], 'r3');
    // Boris still has his sheet: the window is Anna's own
    await expect(boris.page.locator('#storiesModal')).toBeHidden();
    await expect(boris.page.locator('#readingCard .story__answer')).toHaveText(sheetAnswers(players, 'r3', 1));

    // The buttons are under the last story, in the window's body that
    // scrolls, not pinned to its foot: on a phone, where two stories are
    // taller than the screen, out of sight until the window is read to its end
    await expect(page.locator('#storiesBody #storiesEnd')).toHaveCount(1);
    const lastStory = await page.locator('#storyList .sheet').last().boundingBox();
    expect((await page.locator('#storiesEnd').boundingBox()).y).toBeGreaterThanOrEqual(lastStory.y + lastStory.height);
    if (testInfo.project.name === 'mobile') {
        await expect(page.locator('#previousRound')).not.toBeInViewport();
        await page.locator('#storiesEnd').scrollIntoViewIfNeeded();
    }
    await expect(page.locator('#previousRound')).toBeInViewport();
    await expect(page.locator('#nextRound')).toBeDisabled();
    await expect(page.locator('#windowAnotherRound')).toBeVisible();

    await page.click('#previousRound');
    await expectWindowRound(page, sets[1], 2, 3);
    await expectStories(page, players, sets[1], 'r2');
    // From its first story, the window's head focused; Another round is the round being read's
    expect(await page.locator('#storiesBody').evaluate(body => body.scrollTop)).toBe(0);
    await expect(page.locator('#storiesTitle')).toBeFocused();
    await expect(page.locator('#windowAnotherRound')).toBeHidden();

    await page.click('#previousRound');
    await expectWindowRound(page, sets[0], 1, 3);
    await expectStories(page, players, sets[0], 'r1');
    await expect(page.locator('#previousRound')).toBeDisabled();
    await expect(page.locator('#nextRound')).toBeEnabled();

    await page.click('#nextRound');
    await page.click('#nextRound');
    await expectWindowRound(page, sets[2], 3, 3);
    await expectStories(page, players, sets[2], 'r3');

    // The cross: back to Anna's sheet, open as she left it
    await closeStories(anna);
    await expect(page.locator('#readingCard .story__answer')).toHaveText(sheetAnswers(players, 'r3', 0));
});

test("a story of a past round is shared under its own round's set, and the window speaks the page's language", async ({ newPlayer }) => {
    const { players } = await listeningRoom(newPlayer, ['Anna', 'Boris']);
    const [anna] = players;
    const sets = [await readRound(players, 'r1')];
    await endRound(players);
    sets.push(await readRound(players, 'r2'));
    const { page } = anna;
    // The share sheet records what it is given
    await page.evaluate(() => {
        window.shareCalls = [];
        Object.defineProperty(Navigator.prototype, 'share', {
            value: async data => { window.shareCalls.push(data); }, configurable: true, writable: true,
        });
    });

    await showStories(anna);
    await page.click('#previousRound');
    await expectWindowRound(page, sets[0], 1, 2);
    await page.locator('#storyList .story-send').first().click();
    await expect.poll(() => page.evaluate(() => window.shareCalls.length)).toBe(1);
    const [shared] = await page.evaluate(() => window.shareCalls);
    const lines = storyLines(sets[0], sheetAnswers(players, 'r1', 0));
    expect(shared.text.startsWith(`★ ${text(`${sets[0]}Name`).toUpperCase()} ★\n\n${lines.join('\n')}\n\n`)).toBe(true);

    // In Russian: the language button is the room's, under the window
    await closeStories(anna);
    await page.locator('.lang-toggle-btn').click();
    await showStories(anna);
    await expectWindowRound(page, sets[1], 2, 2, 'ru');
    await expect(page.locator('#previousRound')).toHaveText(text('previousRound', 'ru'));
    await expect(page.locator('#nextRound')).toHaveText(text('nextRound', 'ru'));
    await expect(page.locator('#windowAnotherRound')).toHaveText(text('anotherRound', 'ru'));
    await page.click('#previousRound');
    await expectWindowRound(page, sets[0], 1, 2, 'ru');
    await expectStories(page, players, sets[0], 'r1', [true, true], 'ru');
});

test('the window stays on its round when another player ends it, and says so when they start the next', async ({ newPlayer }) => {
    const { players } = await listeningRoom(newPlayer, ['Anna', 'Boris']);
    const [anna, boris] = players;
    const set = await readRound(players, 'r1');
    const { page } = anna;
    await showStories(anna);

    // Boris: another round. Anna's window goes on showing hers, the history's first now
    await move(boris, 'new-round');
    await waitForStep(players, null);
    await expectWindowRound(page, set, 1, 1);
    await expectStories(page, players, set, 'r1');
    await expect(page.locator('#windowAnotherRound')).toBeHidden();
    await expect(page.locator('#newRoundStarted')).toBeHidden();

    // Boris starts the next round: a line says so, the stories stay
    await move(boris, 'start-round');
    await waitForStep(players, 0);
    await expect(page.locator('#newRoundStarted')).toHaveText(text('newRoundStarted'));
    await expectStories(page, players, set, 'r1');
    // The page had the round the window shows: it asked the room for nothing
    expect(messagesOf(anna, 'history-round')).toEqual([]);
    // The sheet that came to Anna does not take the focus from the window. The
    // redraw gives the field the focus by a timer (game-room.js), so the test
    // waits for a timer of its own, queued after that one; a focus taken
    // outside the window is sent back by Bootstrap's window to its cross
    await page.evaluate(() => new Promise(resolve => { setTimeout(resolve); }));
    await expect(page.locator('#storiesModal .btn-close')).not.toBeFocused();

    // The cross: the new round's first question, the focus in its field
    await closeStories(anna);
    await expect(page.locator('#questionText')).toHaveText(await questionOf(page, 1));
    await expect(page.locator('#answerText')).toBeFocused();
});

test("the lobby lists the rounds played, each opening the window on its round, a newcomer's too; the writing hides it", async ({ newPlayer }) => {
    test.slow(true, ROUNDS_TAKE_TIME);
    const { players, code } = await listeningRoom(newPlayer, ['Anna', 'Boris']);
    const [anna] = players;
    const rows = page => page.locator('#roundsList .rounds-list__row');
    await expect(anna.page.locator('#roundsCard')).toBeHidden();

    const sets = [];
    for (const tag of ['r1', 'r2']) {
        sets.push(await readRound(players, tag));
        await endRound(players);
    }
    // Round 3 is ended in the middle of the reading: Boris's sheet never opened
    sets.push(await writtenRound(players, 'r3'));
    await move(anna, 'open-sheet');
    await expect.poll(() => latest(anna, 'round-state')?.round?.opened).toBe(1);
    await endRound(players);

    for (const player of players) {
        await expect(player.page.locator('#roundsCard .sheet-title')).toHaveText(text('roundsPlayed'));
        await expect(rows(player.page)).toHaveCount(3);
        for (const [index, set] of sets.entries()) {
            await expect(rows(player.page).nth(index).locator('.rounds-list__number')).toHaveText(text('roundNumber', 'en', { n: index + 1 }));
            await expect(rows(player.page).nth(index).locator('.rounds-list__set')).toHaveText(text(`${set}Name`));
        }
    }

    // A row opens the window on its round; a round of the history has no Another round
    await rows(anna.page).nth(2).click();
    await expectWindowRound(anna.page, sets[2], 3, 3);
    await expectStories(anna.page, players, sets[2], 'r3', [true, false]);
    await expect(anna.page.locator('#windowAnotherRound')).toBeHidden();
    await expect(anna.page.locator('#nextRound')).toBeDisabled();
    await closeStories(anna);
    await rows(anna.page).nth(1).click();
    await expectWindowRound(anna.page, sets[1], 2, 3);
    await expectStories(anna.page, players, sets[1], 'r2');
    await closeStories(anna);

    // A newcomer to the room sees every round played in it, and opens them
    const vera = await newPlayer('Vera');
    await joinRoom(vera, code);
    await waitForPlayers(vera.page, 3);
    await expect(rows(vera.page)).toHaveCount(3);
    await rows(vera.page).first().click();
    await expectWindowRound(vera.page, sets[0], 1, 3);
    await expectStories(vera.page, players, sets[0], 'r1');
    await closeStories(vera);

    // While writing there is no list
    await move(anna, 'start-round');
    await waitForStep([...players, vera], 0);
    for (const player of [...players, vera]) await expect(player.page.locator('#roundsCard')).toBeHidden();
});
