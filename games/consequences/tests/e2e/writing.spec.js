// The writing of a round (the consequences/writing spec): Start, the question
// of each step in the player's language, the answer and its limit, the sheets
// moving on when everyone has answered, who is still writing, answering for
// an absent player, a leaver's seat, a new round in the middle of one, and the
// screen kept awake. That no page gets an answer's text is secret.spec.js's
const {
    test, expect, text, roomWith, waitForPlayers, createRoom, joinRoom, leaveGame, countSentEvents,
    startedRound, startRound, answer, answerStep, waitForStep, returnToRound, seatRow, roundStep,
} = require('./helpers');

/* global sendMove -- the room page's move (the kit's room-page.js), inside page.evaluate() */

const answerFor = (page, name) => seatRow(page, name).getByRole('button', { name: text('answerFor', 'en', { name }) });

test('Start waits for a second player and says so', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    const code = await createRoom(anna);

    await expect(anna.page.locator('#startRound')).toBeDisabled();
    await expect(anna.page.locator('#startHint')).toHaveText(text('needAnotherPlayer'));

    const boris = await newPlayer('Boris');
    await joinRoom(boris, code);
    await expect(anna.page.locator('#startRound')).toBeEnabled();
    await expect(anna.page.locator('#startHint')).toBeHidden();
});

test('Start gives every player the first question, "Who?"', async ({ newPlayer }) => {
    const { players } = await roomWith(newPlayer, ['Anna', 'Boris', 'Vera']);

    await players[1].page.click('#startRound');

    for (const player of players) {
        await expect(player.page.locator('#questionText')).toHaveText(text('question1'));
        await expect(player.page.locator('#questionNumber')).toHaveText(text('questionOf', 'en', { number: 1, count: 8 }));
        await expect(player.page.locator('#stepLabel')).toHaveText(text('stepOf', 'en', { step: 1, count: 8 }));
        // No lobby in a round: the invitation and the list give way to the sheet and the table
        await expect(player.page.locator('#playersCard')).toBeHidden();
        await expect(player.page.locator('#shareCard')).toBeHidden();
        await expect(player.page.locator('#seatsCard')).toBeVisible();
    }
});

test("each player sees the question in their page's language", async ({ newPlayer }) => {
    const anna = await newPlayer('Anna', { locale: 'ru-RU' });
    const boris = await newPlayer('Boris', { locale: 'en-GB' });
    const code = await createRoom(anna);
    await joinRoom(boris, code);
    await waitForPlayers(anna.page, 2);
    const players = [anna, boris];
    await startRound(players);

    for (let step = 0; step < 3; step++) await answerStep(players, step);

    await expect(anna.page.locator('#questionText')).toHaveText(text('question4', 'ru'));
    await expect(anna.page.locator('#questionNumber')).toHaveText(text('questionOf', 'ru', { number: 4, count: 8 }));
    await expect(boris.page.locator('#questionText')).toHaveText(text('question4', 'en'));
    // The answered questions are folded, a pleat each: its number and question
    // only - never its answer, nor a mark on it
    await expect(anna.page.locator('#folds .fold')).toHaveCount(3);
    await expect(anna.page.locator('#folds .fold').nth(2)).toHaveText(`3. ${text('question3', 'ru')}`);
    await expect(anna.page.locator('#writingCard')).not.toContainText('Anna 3');
    await expect(anna.page.locator('#writingCard')).not.toContainText('Boris 3');
});

test('the sheet is whole until the first pleat; the pleats zigzag, and the last one always ends level with the open part', async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const { page } = players[0];
    const widths = () => page.evaluate(() => ({
        sheet: document.querySelector('#writingCard .sheet').getBoundingClientRect().width,
        open: document.querySelector('#writingCard .sheet__open').getBoundingClientRect().width,
    }));
    const pleats = page.locator('#folds .fold');
    const edgeOf = index => pleats.nth(index).evaluate(pleat => getComputedStyle(pleat).clipPath);

    const whole = await widths();
    expect(whole.open).toBe(whole.sheet);

    await answerStep(players, 0);
    await expect(pleats).toHaveCount(1);
    const stepped = await widths();
    expect(stepped.open).toBeLessThan(stepped.sheet);
    const lastEdge = await edgeOf(0);
    expect(lastEdge).toContain('polygon');

    await answerStep(players, 1);
    await expect(pleats).toHaveCount(2);
    expect(await edgeOf(1)).toBe(lastEdge);
    expect(await edgeOf(0)).not.toBe(lastEdge);
});

test('after sending an answer the field closes, and the player sees who is still writing', async ({ newPlayer }) => {
    const { players: [anna, boris, vera] } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);

    await answer(anna, 'A pirate grandmother');

    await expect(anna.page.locator('#answerForm')).toBeHidden();
    await expect(anna.page.locator('#sheetHint')).toHaveText(text('answerSaved', 'en', { name: 'Boris' }));
    await expect(anna.page.locator('#folds .fold')).toHaveCount(1);
    await expect(seatRow(anna.page, 'Anna')).toContainText(text('statusDone'));
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusWriting'));
    await expect(seatRow(anna.page, 'Vera')).toContainText(text('statusWriting'));
    // The others see that she is done, and still have their own question
    await expect(seatRow(boris.page, 'Anna')).toContainText(text('statusDone'));
    await expect(vera.page.locator('#answerForm')).toBeVisible();
    expect(await roundStep(anna.page)).toBe(0);
});

test('Change the answer: the field opens again with the answer, the step waits for it, and the new one is in the story', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await answer(anna, 'Anna first');
    const edit = anna.page.getByRole('button', { name: text('editAnswer') });
    await expect(edit).toBeVisible();

    await edit.click();

    await expect(anna.page.locator('#answerText')).toHaveValue('Anna first');
    await expect(anna.page.locator('#answerText')).toBeFocused();
    await expect(edit).toBeHidden();
    await expect(seatRow(boris.page, 'Anna')).toContainText(text('statusWriting'));
    // Boris's answer does not end the step: it waits for Anna's again
    await answer(boris, 'Boris 1');
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusDone'));
    expect(await roundStep(anna.page)).toBe(0);
    expect(await roundStep(boris.page)).toBe(0);
    await anna.page.fill('#answerText', 'Anna changed');
    await anna.page.click('#saveAndPass');
    await waitForStep([anna, boris], 1);
    // With two players Anna's own sheet comes back to her to read
    for (let step = 1; step < 8; step++) await answerStep([anna, boris], step);
    await anna.page.locator('#readingCard .closed-sheet').first().click();
    await expect(anna.page.locator('#readingCard .story__answer').first()).toHaveText('Anna changed');
});

test('while they wait a player sees the answer they sent, as they wrote it, and only they do; a reload keeps it, the next question takes it away', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await expect(anna.page.locator('#sentBlock')).toBeHidden();

    await answer(anna, 'A <b>pirate</b>\ngrandmother');

    const sent = anna.page.locator('#sentText');
    await expect(sent).toBeVisible();
    expect(await sent.innerText()).toBe('A <b>pirate</b>\ngrandmother');
    await expect(anna.page.locator('#sentBlock')).toContainText(text('yourAnswer'), { ignoreCase: true });
    await expect(boris.page.locator('#sentBlock')).toBeHidden();
    await expect(boris.page.locator('#writingCard')).not.toContainText('pirate');

    await anna.page.reload();
    await expect(sent).toBeVisible();
    expect(await sent.innerText()).toBe('A <b>pirate</b>\ngrandmother');

    await answer(boris, 'Boris 1');
    await waitForStep([anna, boris], 1);
    await expect(anna.page.locator('#sentBlock')).toBeHidden();
    await expect(anna.page.locator('#writingCard')).not.toContainText('pirate');
});

test('the shown answer follows a change: gone while the field is open, then the new one', async ({ newPlayer }) => {
    const { players: [anna] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await answer(anna, 'Anna first');
    await expect(anna.page.locator('#sentText')).toHaveText('Anna first');

    await anna.page.locator('#editAnswer').click();
    await expect(anna.page.locator('#answerForm')).toBeVisible();
    await expect(anna.page.locator('#sentBlock')).toBeHidden();

    await answer(anna, 'Anna changed');
    await expect(anna.page.locator('#sentBlock')).toBeVisible();
    await expect(anna.page.locator('#sentText')).toHaveText('Anna changed');
});

test('only the tab that sent an answer shows it, and never the answer of an earlier step', async ({ newPlayer }) => {
    const { players: [anna, boris], code } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await answer(anna, 'Anna 1');
    await expect(anna.page.locator('#sentText')).toHaveText('Anna 1');

    const secondTab = { name: 'Anna', page: await anna.context.newPage() };
    await returnToRound(secondTab, code);
    await expect(secondTab.page.locator('#sheetHint')).toBeVisible();
    await expect(secondTab.page.locator('#sentBlock')).toBeHidden();

    await answer(boris, 'Boris 1');
    await waitForStep([anna, secondTab, boris], 1);
    await answer(secondTab, 'Anna 2 from the second tab');
    await expect(secondTab.page.locator('#sentText')).toHaveText('Anna 2 from the second tab');

    await expect(anna.page.locator('#sheetHint')).toBeVisible();
    await expect(anna.page.locator('#sentBlock')).toBeHidden();
});

test("an answer another player wrote for the seat is not shown as the player's own, nor does one written for another replace it", async ({ newPlayer }) => {
    const { players: [katya, masha, petya], code } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);
    // What Petya sent, and took back, stays in his tab
    await answer(petya, 'Petya mine');
    await expect(petya.page.locator('#editAnswer')).toBeVisible();
    await petya.page.locator('#editAnswer').click();
    await expect(petya.page.locator('#answerForm')).toBeVisible();
    await petya.page.goto('about:blank');

    await answer(katya, 'Katya 1');
    await answerFor(katya.page, 'Petya').click();
    await expect(katya.page.locator('#writingTitle')).toBeVisible();
    await expect(katya.page.locator('#sentBlock')).toBeHidden();
    await answer(katya, 'for Petya 1');

    await expect(katya.page.locator('#sentText')).toHaveText('Katya 1');
    await petya.page.goto(`/game/${code}`);
    await expect(petya.page.locator('#sheetHint')).toHaveText(text('answeredForYou', 'en', { name: 'Katya' }));
    await expect(petya.page.locator('#sentBlock')).toBeHidden();
    await expect(masha.page.locator('#sentBlock')).toBeHidden();
});

test('Change the answer pressed as the step ends changes nothing, and is no error', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await answer(anna, 'Anna 1');
    await expect(anna.page.locator('#editAnswer')).toBeVisible();
    await answer(boris, 'Boris 1');
    await waitForStep([anna, boris], 1);

    // Her press reaches the room after Boris's answer moved the sheets on
    await anna.page.evaluate(() => sendMove('take-back-answer', { step: 0 }));

    await expect(anna.page.locator('#questionText')).toHaveText(text('question2'));
    await answerStep([anna, boris], 1);
});

test('an empty answer or one of spaces is not sent, and the field stays open', async ({ newPlayer }) => {
    const anna = await newPlayer('Anna');
    const sentAnswers = countSentEvents(anna.page, 'write-answer');
    const boris = await newPlayer('Boris');
    const code = await createRoom(anna);
    await joinRoom(boris, code);
    await waitForPlayers(anna.page, 2);
    await startRound([anna, boris]);

    await anna.page.click('#saveAndPass');
    await answer(anna, '   ');

    await expect(anna.page.locator('#answerForm')).toBeVisible();
    await expect(anna.page.locator('#answerText')).toBeFocused();
    expect(sentAnswers()).toBe(0);
    await expect(seatRow(boris.page, 'Anna')).toContainText(text('statusWriting'));
});

test('on a computer Enter sends the answer, Shift + Enter breaks a line in it, and the story keeps the line', async ({ newPlayer, isMobile }) => {
    test.skip(isMobile, "a phone's keys: the next test");
    const anna = await newPlayer('Anna');
    const sentAnswers = countSentEvents(anna.page, 'write-answer');
    const boris = await newPlayer('Boris');
    const code = await createRoom(anna);
    await joinRoom(boris, code);
    await waitForPlayers(anna.page, 2);
    await startRound([anna, boris]);

    const field = anna.page.locator('#answerText');
    await field.focus();
    await anna.page.keyboard.type('Anna');
    await anna.page.keyboard.press('Shift+Enter');
    await anna.page.keyboard.type('and her cat');
    await expect(field).toHaveValue('Anna\nand her cat');
    expect(sentAnswers()).toBe(0);
    // The send button is the main one, under the field and as wide
    const [fieldBox, sendBox] = [await field.boundingBox(), await anna.page.locator('#saveAndPass').boundingBox()];
    expect(sendBox.y).toBeGreaterThan(fieldBox.y + fieldBox.height);
    expect(Math.abs(sendBox.width - fieldBox.width)).toBeLessThan(2);

    await anna.page.keyboard.press('Enter');

    await expect(anna.page.locator('#answerForm')).toBeHidden();
    await expect(seatRow(boris.page, 'Anna')).toContainText(text('statusDone'));
    expect(sentAnswers()).toBe(1);
    // The rest of the round: with two players Anna's own sheet comes back to her
    await answer(boris, 'Boris 1');
    await waitForStep([anna, boris], 1);
    for (let step = 1; step < 8; step++) await answerStep([anna, boris], step);
    await anna.page.locator('#readingCard .closed-sheet').first().click();
    await expect(anna.page.locator('#readingCard .story__answer').first()).toHaveJSProperty('innerText', 'Anna\nand her cat');
});

test("on a phone Enter breaks a line, and the square at the field's right sends the answer", async ({ newPlayer, isMobile }) => {
    test.skip(!isMobile, "a computer's keys: the test before");
    const anna = await newPlayer('Anna');
    const sentAnswers = countSentEvents(anna.page, 'write-answer');
    const boris = await newPlayer('Boris');
    const code = await createRoom(anna);
    await joinRoom(boris, code);
    await waitForPlayers(anna.page, 2);
    await startRound([anna, boris]);

    const field = anna.page.locator('#answerText');
    await field.focus();
    await anna.page.keyboard.type('Anna');
    await anna.page.keyboard.press('Enter');
    await anna.page.keyboard.type('and her cat');
    await expect(field).toHaveValue('Anna\nand her cat');
    expect(sentAnswers()).toBe(0);
    // The button stays in sight above the keyboard: at the field's right,
    // level with its bottom, and named for a screen reader
    const send = anna.page.getByRole('button', { name: text('saveAndPass') });
    const [fieldBox, sendBox] = [await field.boundingBox(), await send.boundingBox()];
    expect(sendBox.x).toBeGreaterThanOrEqual(fieldBox.x + fieldBox.width);
    expect(Math.abs(sendBox.y + sendBox.height - (fieldBox.y + fieldBox.height))).toBeLessThan(2);

    await send.click();

    await expect(anna.page.locator('#answerForm')).toBeHidden();
    await expect(seatRow(boris.page, 'Anna')).toContainText(text('statusDone'));
    expect(sentAnswers()).toBe(1);
});

test('under the field a computer shows the keys - Enter sends, Shift + Enter breaks a line; a phone does not', async ({ newPlayer, isMobile }) => {
    const { players: [anna] } = await startedRound(newPlayer, ['Anna', 'Boris']);

    const keys = anna.page.locator('#answerForm .sheet__keys');
    if (isMobile) {
        await expect(keys).toBeHidden();
    } else {
        await expect(keys).toBeVisible();
        await expect(keys).toHaveText(text('answerKeys'));
    }
});

test('the answer stops at 200 characters, counted as a person counts them', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const field = anna.page.locator('#answerText');

    // 199 letters and an emoji: 200 characters, though 201 UTF-16 units
    await field.fill(`${'a'.repeat(199)}🦜`);
    await expect(anna.page.locator('#answerCount')).toHaveText('200/200');
    await expect(anna.page.locator('#saveAndPass')).toBeEnabled();

    await field.fill('a'.repeat(201));
    await expect(anna.page.locator('#answerCount')).toHaveText('201/200');
    await expect(anna.page.locator('#saveAndPass')).toBeDisabled();

    await field.fill(`${'a'.repeat(199)}🦜`);
    await anna.page.click('#saveAndPass');
    await expect(seatRow(boris.page, 'Anna')).toContainText(text('statusDone'));
});

test('the answer field grows with its text', async ({ newPlayer }) => {
    const { players: [anna] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const field = anna.page.locator('#answerText');
    const height = async () => (await field.boundingBox()).height;
    const empty = await height();

    // Six lines on any screen
    await field.fill('on the roof\nof a tram\nthat left its rails\nand drove along\nthe embankment\nto the opera');

    expect(await height()).toBeGreaterThan(empty);
    // Nothing hidden: the field is as tall as its text
    expect(await field.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
});

test("an answer being typed survives the others' moves", async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);

    await anna.page.fill('#answerText', 'Half an answ');
    await answer(boris, 'Boris 1');
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusDone'));

    await expect(anna.page.locator('#answerText')).toHaveValue('Half an answ');
});

test("the last answer of a step moves every sheet on to the next seat, and opens the next question", async ({ newPlayer }) => {
    const { players } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);
    await answerStep(players, 0);

    for (const player of players) await answer(player, `${player.name} 2`);

    await waitForStep(players, 2);
    for (const player of players) {
        await expect(player.page.locator('#questionText')).toHaveText(text('question3'));
        await expect(player.page.locator('#folds .fold')).toHaveCount(2);
    }
    // Which sheet went where is read in the stories: reading.spec.js
});

test('a slow player online is waited for, and nobody may answer for them', async ({ newPlayer }) => {
    const { players: [anna, boris, vera] } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);

    await answer(anna, 'Anna 1');
    await answer(boris, 'Boris 1');

    await expect(seatRow(anna.page, 'Vera')).toContainText(text('statusWriting'));
    await expect(seatRow(anna.page, 'Vera').getByRole('button')).toHaveCount(0);
    await expect(seatRow(boris.page, 'Vera').getByRole('button')).toHaveCount(0);
    expect(await roundStep(anna.page)).toBe(0);
    await answer(vera, 'Vera 1');
    await waitForStep([anna, boris, vera], 1);
});

test('after answering a player sees who is writing and who is offline', async ({ newPlayer }) => {
    const { players: [anna, , petya] } = await startedRound(newPlayer, ['Anna', 'Masha', 'Petya']);

    await petya.page.close();
    await answer(anna, 'Anna 1');

    await expect(seatRow(anna.page, 'Masha')).toContainText(text('statusWriting'));
    await expect(seatRow(anna.page, 'Petya')).toContainText(text('statusOffline'));
    await expect(seatRow(anna.page, 'Petya')).not.toContainText(text('statusWriting'));
});

test("Katya answers for Petya: she gets his sheet with this step's question, the others see who writes for him", async ({ newPlayer }) => {
    const { players: [katya, masha, petya] } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);
    await petya.page.close();

    // Only a player who has answered may answer for him
    await expect(seatRow(katya.page, 'Petya')).toContainText(text('statusOffline'));
    await expect(answerFor(katya.page, 'Petya')).toHaveCount(0);
    await answer(katya, 'Katya 1');
    await answerFor(katya.page, 'Petya').click();

    await expect(katya.page.locator('#writingTitle')).toBeVisible();
    await expect(katya.page.locator('#writingTitle')).toHaveText(text('sheetOfPlayer', 'en', { name: 'Petya' }));
    await expect(katya.page.locator('#questionText')).toHaveText(text('question1'));
    await expect(katya.page.locator('#answerText')).toHaveValue('');
    await expect(seatRow(masha.page, 'Petya')).toContainText(text('statusAnsweringFor', 'en', { name: 'Katya' }));

    await answer(katya, 'for Petya 1');
    await answer(masha, 'Masha 1');
    await waitForStep([katya, masha], 1);
    await expect(katya.page.locator('#writingTitle')).toBeHidden();
    await expect(katya.page.locator('#questionText')).toHaveText(text('question2'));
});

test('a sheet taken for an absent player goes back on the table with "Give the sheet back"', async ({ newPlayer }) => {
    const { players: [katya, masha, petya] } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);
    await petya.page.close();
    await answer(katya, 'Katya 1');
    await answerFor(katya.page, 'Petya').click();
    await expect(katya.page.locator('#writingTitle')).toBeVisible();

    await katya.page.click('#giveSheetBack');

    await expect(katya.page.locator('#answerForm')).toBeHidden();
    await expect(katya.page.locator('#giveSheetBack')).toBeHidden();
    await expect(answerFor(katya.page, 'Petya')).toBeVisible();
    await answer(masha, 'Masha 1');
    await expect(answerFor(masha.page, 'Petya')).toBeVisible();
});

test('two players press "Answer for" at once: one gets the sheet, the other sees who writes', async ({ newPlayer }) => {
    const { players: [katya, masha, petya] } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);
    await petya.page.close();
    await answer(katya, 'Katya 1');
    await answer(masha, 'Masha 1');
    await expect(answerFor(katya.page, 'Petya')).toBeVisible();
    await expect(answerFor(masha.page, 'Petya')).toBeVisible();

    // Both taps leave before either page hears the room's answer. A click by
    // Playwright would wait for the button the room's answer takes away
    const tap = player => player.page.evaluate(name => {
        [...document.querySelectorAll('#seatList button')].find(button => button.textContent === name).click();
    }, text('answerFor', 'en', { name: 'Petya' }));
    await Promise.all([tap(katya), tap(masha)]);

    const holding = async player => player.page.locator('#writingTitle').isVisible();
    await expect.poll(async () => (await holding(katya)) !== (await holding(masha))).toBe(true);
    const [winner, other] = (await holding(katya)) ? [katya, masha] : [masha, katya];
    await expect(seatRow(other.page, 'Petya')).toContainText(text('statusAnsweringFor', 'en', { name: winner.name }));
    await expect(answerFor(other.page, 'Petya')).toHaveCount(0);
});

test('the sheet of a taker whose page goes is free again', async ({ newPlayer }) => {
    const { players: [katya, masha, petya] } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);
    await petya.page.close();
    await answer(katya, 'Katya 1');
    await answer(masha, 'Masha 1');
    await answerFor(katya.page, 'Petya').click();
    await expect(seatRow(masha.page, 'Petya')).toContainText(text('statusAnsweringFor', 'en', { name: 'Katya' }));

    await katya.page.close();

    await expect(answerFor(masha.page, 'Petya')).toBeVisible();
    await expect(seatRow(masha.page, 'Petya')).not.toContainText(text('statusAnsweringFor', 'en', { name: 'Katya' }));
});

test('Petya back while Katya writes for him sees it, and answers himself from the next step', async ({ newPlayer }) => {
    const { players: [katya, masha, petya], code } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);
    await petya.page.close();
    await answer(katya, 'Katya 1');
    await answerFor(katya.page, 'Petya').click();
    await expect(katya.page.locator('#writingTitle')).toBeVisible();

    const back = { name: 'Petya', page: await petya.context.newPage() };
    await returnToRound(back, code);

    await expect(back.page.locator('#answerForm')).toBeHidden();
    await expect(back.page.locator('#sheetHint')).toBeVisible();
    await expect(back.page.locator('#sheetHint')).toHaveText(text('answeredForYou', 'en', { name: 'Katya' }));
    await answer(katya, 'for Petya 1');
    // The answer Katya wrote for him is not his to change
    await expect(seatRow(back.page, 'Petya')).toContainText(text('statusDone'));
    await expect(back.page.locator('#editAnswer')).toBeHidden();
    await expect(katya.page.locator('#editAnswer')).toBeVisible();
    await answer(masha, 'Masha 1');
    await waitForStep([katya, masha, back], 1);
    await expect(back.page.locator('#questionText')).toHaveText(text('question2'));
    await answerStep([katya, masha, back], 1);
});

test('Petya leaves in the middle of a round and comes back two steps later to his seat', async ({ newPlayer }) => {
    const { players: [katya, masha, petya], code } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);

    await leaveGame(petya);
    await expect(seatRow(katya.page, 'Petya')).toContainText(text('statusLeft'));
    for (let step = 0; step < 2; step++) {
        await answer(katya, `Katya ${step + 1}`);
        await answer(masha, `Masha ${step + 1}`);
        await answerFor(katya.page, 'Petya').click();
        await answer(katya, `for Petya ${step + 1}`);
        await waitForStep([katya, masha], step + 1);
    }

    await returnToRound(petya, code);

    await expect(seatRow(katya.page, 'Petya')).not.toContainText(text('statusLeft'));
    await expect(petya.page.locator('#seatList .seat-name')).toHaveText(['Katya', 'Masha', /^Petya/]);
    await expect(petya.page.locator('#questionText')).toHaveText(text('question3'));
    await answerStep([katya, masha, petya], 2);
});

test('a player who left for good is answered for to the end of the round', async ({ newPlayer }) => {
    const { players: [katya, masha, petya] } = await startedRound(newPlayer, ['Katya', 'Masha', 'Petya']);

    await leaveGame(petya);
    for (let step = 0; step < 8; step++) {
        await answer(katya, `Katya ${step + 1}`);
        await answer(masha, `Masha ${step + 1}`);
        // Each step another player takes his sheet
        const taker = step % 2 === 0 ? katya : masha;
        await answerFor(taker.page, 'Petya').click();
        await answer(taker, `for Petya ${step + 1}`);
        await waitForStep([katya, masha], step + 1);
    }

    await expect(katya.page.locator('#readingCard')).toBeVisible();
});

test('New round in the middle of one asks first, then takes everyone back to the lobby', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    await answerStep([anna, boris], 0);
    await answerStep([anna, boris], 1);

    // Cancel keeps the round
    await anna.page.click('#newRound');
    await expect(anna.page.locator('#newRoundModal')).toHaveClass(/\bshow\b/);
    await expect(anna.page.locator('#newRoundModal .modal-body')).toHaveText(text('newRoundText'));
    await anna.page.locator('#newRoundModal').getByRole('button', { name: text('cancel') }).click();
    await expect(anna.page.locator('#newRoundModal')).toBeHidden();
    expect(await roundStep(anna.page)).toBe(2);

    await anna.page.click('#newRound');
    await anna.page.click('#confirmNewRound');

    for (const player of [anna, boris]) {
        await expect(player.page.locator('#playersCard')).toBeVisible();
        await waitForPlayers(player.page, 2);
        await expect(player.page.locator('#writingCard')).toBeHidden();
        await expect(player.page.locator('#newRound')).toBeHidden();
    }
    // The next round starts with blank sheets
    await startRound([boris, anna]);
    await expect(anna.page.locator('#folds .fold')).toHaveCount(0);
});

test('the screen stays awake while the round is on, and may sleep in the lobby', async ({ newPlayer }) => {
    // The real browser's lock, the permission granted; the request is wrapped,
    // so the test sees the very locks the browser handed out
    const withRealWakeLock = async name => {
        const player = await newPlayer(name);
        await player.context.grantPermissions(['screen-wake-lock']);
        await player.page.addInitScript(() => {
            const request = navigator.wakeLock.request.bind(navigator.wakeLock);
            window.realLocks = [];
            navigator.wakeLock.request = async type => {
                const lock = await request(type);
                window.realLocks.push(lock);
                return lock;
            };
        });
        return player;
    };
    const locksHeld = player => player.page.evaluate(() =>
        window.realLocks.filter(lock => lock.type === 'screen' && !lock.released).length);
    const { players: [anna, boris] } = await roomWith(withRealWakeLock, ['Anna', 'Boris']);
    expect(await locksHeld(anna)).toBe(0);

    await startRound([anna, boris]);
    await expect.poll(() => locksHeld(anna)).toBe(1);
    await expect.poll(() => locksHeld(boris)).toBe(1);

    await boris.page.click('#newRound');
    await boris.page.click('#confirmNewRound');
    await expect.poll(() => locksHeld(anna)).toBe(0);
    await expect.poll(() => locksHeld(boris)).toBe(0);
});
