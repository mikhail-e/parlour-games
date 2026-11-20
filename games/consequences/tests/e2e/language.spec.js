// English and Russian in the room: the round's screens are drawn by the
// script, so the language button draws them again (the kit's room-page.js
// calls render on languagechanged) - without losing an answer being typed.
// The browser's language, the saved choice and the landing page's texts are
// the kit's (landing.spec.js checks the game's title and subtitle)
const {
    test, expect, text, createRoom, joinRoom, waitForPlayers, startRound, answer, answerStep, writeToReading, showStories, seatRow,
    setOf, questionOf, questionsOfSet, QUESTION_COUNT,
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
    await expect(anna.page.locator('#questionText')).toHaveText(await questionOf(anna.page, 2, 'ru'));
    // The round's set, read in Russian: the English below is the same set's
    const set = await setOf(anna.page, 'ru');

    await anna.page.locator('.lang-toggle-btn').click();

    await expect(anna.page.locator('#setTitle')).toHaveText(text(`${set}Name`, 'en'));
    await expect(anna.page.locator('#stepLabel')).toHaveText(text('stepOf', 'en', { step: 2, count: QUESTION_COUNT }));
    await expect(anna.page.locator('#questionNumber')).toHaveText(text('questionOf', 'en', { number: 2, count: QUESTION_COUNT }));
    await expect(anna.page.locator('#questionText')).toHaveText(text(`${set}Question2`, 'en'));
    await expect(anna.page.locator('#questionHint')).toHaveText(text(`${set}Hint2`, 'en'));
    await expect(anna.page.locator('#folds .fold')).toContainText(`1. ${text(`${set}Question1`, 'en')}`);
    await expect(anna.page.locator('#seatsTitle')).toHaveText(text(`${set}TellingTheStory`, 'en'));
    await expect(seatRow(anna.page, 'Anna')).toContainText(`Anna (${text('you', 'en')})`);
    await expect(seatRow(anna.page, 'Anna')).toContainText(text('statusWriting', 'en'));
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusDone', 'en'));
    await expect(anna.page.locator('#answerText')).toHaveAttribute('placeholder', text('yourAnswer', 'en'));
    await expect(anna.page.locator('#answerText')).toHaveValue('Полответа');

    // The choice is remembered
    await anna.page.reload();
    await expect(anna.page.locator('#questionText')).toHaveText(text(`${set}Question2`, 'en'));
});

// The window of every story switched while closed, and opened again in the
// other language: history.spec.js
test('the switch draws the reading and every story again in the other language', async ({ newPlayer }) => {
    const [anna, boris] = await russianAndEnglish(newPlayer);
    await startRound([anna, boris]);
    await writeToReading([anna, boris]);
    await expect(anna.page.locator('#readingCard')).toContainText(text('tapToOpen', 'ru'));
    const set = await setOf(anna.page, 'ru');

    await anna.page.locator('.lang-toggle-btn').click();

    await expect(anna.page.locator('#readingCard .sheet-title')).toHaveText(text(`${set}StoriesReady`, 'en'));
    await expect(anna.page.locator('#readingCard .closed-sheet')).toContainText(text('tapToOpen', 'en'));
    await expect(anna.page.locator('#readingCard .opened-count')).toHaveText(text('openedCount', 'en', { opened: 0, count: 2 }));
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusClosed', 'en'));
    await anna.page.locator('#readingCard .closed-sheet').click();
    const questions = anna.page.locator('#readingCard .story__question');
    await expect(questions).toHaveText(questionsOfSet(set, 'en'));

    // The open sheet switched back: its questions in Russian, its answers the same
    const answers = anna.page.locator('#readingCard .story__answer');
    const written = await answers.allTextContents();
    await anna.page.locator('.lang-toggle-btn').click();
    await expect(questions).toHaveText(questionsOfSet(set, 'ru'));
    await expect(answers).toHaveText(written);
    await anna.page.locator('.lang-toggle-btn').click();

    await boris.page.locator('#readingCard .closed-sheet').click();
    await showStories(anna);
    await expect(anna.page.locator('#storiesTitle')).toHaveText(text(`${set}AllStories`, 'en'));
});
