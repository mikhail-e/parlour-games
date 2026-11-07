// English and Russian in the room: the round's screens are drawn by the
// script, so the language button draws them again (the kit's room-page.js
// calls render on languagechanged) - without losing an answer being typed.
// The browser's language, the saved choice and the landing page's texts are
// the kit's (landing.spec.js checks the game's title and subtitle)
const {
    test, expect, text, createRoom, joinRoom, waitForPlayers, startRound, answer, answerStep, writeToReading, seatRow,
} = require('./helpers');

// Anna plays in Russian, Boris in English
async function russianAndEnglish(newPlayer) {
    const anna = await newPlayer('Anna', { locale: 'ru-RU' });
    const boris = await newPlayer('Boris', { locale: 'en-GB' });
    await joinRoom(boris, await createRoom(anna));
    await waitForPlayers(anna.page, 2);
    return [anna, boris];
}

test('the switch draws the writing again in the other language, and the answer being typed stays', async ({ newPlayer }) => {
    const [anna, boris] = await russianAndEnglish(newPlayer);
    await startRound([anna, boris]);
    await answerStep([anna, boris], 0);
    await answer(boris, 'Boris 2');
    await anna.page.fill('#answerText', 'Полответа');
    await expect(anna.page.locator('#questionText')).toHaveText(text('question2', 'ru'));

    await anna.page.locator('.lang-toggle-btn').click();

    await expect(anna.page.locator('#stepLabel')).toHaveText(text('stepOf', 'en', { step: 2, count: 8 }));
    await expect(anna.page.locator('#questionNumber')).toHaveText(text('questionOf', 'en', { number: 2, count: 8 }));
    await expect(anna.page.locator('#questionText')).toHaveText(text('question2', 'en'));
    await expect(anna.page.locator('#folds .fold')).toContainText(`1. ${text('question1', 'en')}`);
    await expect(anna.page.locator('#folds .fold')).toContainText(text('folded', 'en'));
    await expect(anna.page.locator('#seatsTitle')).toHaveText(text('atTheTable', 'en'));
    await expect(seatRow(anna.page, 'Anna')).toContainText(`Anna (${text('you', 'en')})`);
    await expect(seatRow(anna.page, 'Anna')).toContainText(text('statusWriting', 'en'));
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusDone', 'en'));
    await expect(anna.page.locator('#answerText')).toHaveAttribute('placeholder', text('yourAnswer', 'en'));
    await expect(anna.page.locator('#answerText')).toHaveValue('Полответа');

    // The choice is remembered
    await anna.page.reload();
    await expect(anna.page.locator('#questionText')).toHaveText(text('question2', 'en'));
});

test('the switch draws the reading and every story again in the other language', async ({ newPlayer }) => {
    const [anna, boris] = await russianAndEnglish(newPlayer);
    await startRound([anna, boris]);
    await writeToReading([anna, boris]);
    await expect(anna.page.locator('#readingCard')).toContainText(text('tapToUnfold', 'ru'));

    await anna.page.locator('.lang-toggle-btn').click();

    await expect(anna.page.locator('#readingCard .sheet-title')).toHaveText(text('storiesReady', 'en'));
    await expect(anna.page.locator('#readingCard .closed-sheet')).toContainText(text('tapToUnfold', 'en'));
    await expect(anna.page.locator('#readingCard .opened-count')).toHaveText(text('openedCount', 'en', { opened: 0, count: 2 }));
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusClosed', 'en'));
    await anna.page.locator('#readingCard .closed-sheet').click();
    await expect(anna.page.locator('#readingCard .story__question').first()).toHaveText(text('question1', 'en'));

    await boris.page.locator('#readingCard .closed-sheet').click();
    await expect(anna.page.locator('#storiesCard')).toBeVisible();
    await anna.page.locator('.lang-toggle-btn').click();
    await expect(anna.page.locator('#storyList .story-head').first()).toContainText(text('sheetNumber', 'ru', { number: 1 }));
    await expect(anna.page.locator('#storyList .story__question').first()).toHaveText(text('question1', 'ru'));
});
