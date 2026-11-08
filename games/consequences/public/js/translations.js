// The texts of Consequences, English and Russian: the kit's i18n.js (loaded
// after this file) shows them in the page's language. The texts of the shared
// parts (the landing form, entering and leaving a room, the invitation,
// notifications) are the kit's, in its i18n.js.
/* exported translations, serverErrors */

const translations = {
    en: {
        // The landing page
        title: "Consequences",
        subtitle: "The classic parlour story game, for friends and family",
        howToPlay: "How to Play",
        rule1: "Everyone answers the same question on their own sheet and passes the sheet on: nobody sees what was written before",
        rule2: "Eight questions: who, with whom, when, where, what they were doing, how it ended, what people said, the moral",
        rule3: "At the end everyone reads out the story that came to them",

        // The lobby
        players: "Players",
        shareText: "Join my game of Consequences!",
        you: "You",
        startRound: "Start",
        needAnotherPlayer: "One more player is needed: send them the link",
        waitForNextRound: "A round is on. You will join the room when the next one begins.",

        // Writing: the questions, the sheet, the table
        stepOf: "Step {step} of {count}",
        questionOf: "Question {number} of {count}",
        question1: "Who?",
        question2: "With whom?",
        question3: "When?",
        question4: "Where?",
        question5: "What were they doing?",
        question6: "How did it all end?",
        question7: "What did people say?",
        question8: "What is the moral?",
        yourAnswer: "Your answer",
        saveAndPass: "Save and pass on →",
        answerKeys: "Enter to send · Shift + Enter for a new line",
        editAnswer: "Change the answer",
        answerSaved: "Your answer is saved. The sheet goes on to your neighbour, {name}, when everyone has answered.",
        answeredForYou: "{name} is answering for you on this step: you answer from the next one.",
        sheetOfPlayer: "{name}'s sheet",
        giveSheetBack: "Give the sheet back",
        tellingTheStory: "Telling the story",
        statusWriting: "writing…",
        statusDone: "done",
        statusOffline: "offline",
        statusLeft: "left the game",
        statusAnsweringFor: "{name} is answering",
        answerFor: "Answer for {name}",
        waitingNewcomers: "Waiting for the next round: {names}",

        // Reading: the sheets, every story
        storiesReady: "The stories are ready",
        readAloud: "Read out the sheet that came to you",
        tapToOpen: "Tap to open",
        yourSheet: "Your sheet",
        readThisAloud: "Read this sheet aloud",
        openedCount: "{opened} of {count} sheets open",
        yourSheetReadBy: "{name} is reading your sheet",
        sheets: "Sheets",
        statusClosed: "closed",
        statusOpen: "open",
        statusReadBy: "{name} is reading",
        readFor: "Read for {name}",
        allStories: "Every story",
        storyTitle1: "Story one",
        storyTitle2: "Story two",
        storyTitle3: "Story three",
        storyTitle4: "Story four",
        storyTitle5: "Story five",
        storyTitle6: "Story six",
        storyTitle7: "Story seven",
        storyTitle8: "Story eight",
        storyTitle9: "Story nine",
        storyTitle10: "Story ten",
        storyTitle11: "Story eleven",
        storyTitle12: "Story twelve",
        storyReadBy: "read out by {name}",
        anotherRound: "Another round",

        // A new round in the middle of one
        newRound: "New round",
        newRoundText: "The sheets of this round will be lost. Start a new round?",
        confirmNewRound: "Yes, a new round",
    },
    ru: {
        // The landing page
        title: "Чепуха",
        subtitle: "«Чепуха» — классическая салонная игра в истории, для друзей и семьи",
        howToPlay: "Как играть",
        rule1: "Все отвечают на один вопрос — каждый на своём листе — и передают лист дальше: прежних ответов никто не видит",
        rule2: "Восемь вопросов: кто, с кем, когда, где, что делали, чем всё закончилось, что сказали люди, какая мораль",
        rule3: "В конце каждый читает вслух историю, которая к нему пришла",

        // The lobby
        players: "Игроки",
        shareText: "Заходи играть в «Чепуху»!",
        you: "Вы",
        startRound: "Начать",
        needAnotherPlayer: "Нужен ещё хотя бы один игрок — отправьте ему ссылку",
        waitForNextRound: "Идёт раунд. Вы войдёте в комнату, когда начнётся следующий.",

        // Writing: the questions, the sheet, the table
        stepOf: "Шаг {step} из {count}",
        questionOf: "Вопрос {number} из {count}",
        question1: "Кто?",
        question2: "С кем?",
        question3: "Когда?",
        question4: "Где?",
        question5: "Что делали?",
        question6: "Чем всё закончилось?",
        question7: "Что сказали люди?",
        question8: "Какая из этого следует мораль?",
        yourAnswer: "Ваш ответ",
        saveAndPass: "Сохранить и передать →",
        answerKeys: "Enter — отправить · Shift + Enter — новая строка",
        editAnswer: "Изменить ответ",
        answerSaved: "Ответ сохранён. Лист уйдёт к соседу ({name}), когда ответят все.",
        answeredForYou: "На этом шаге за вас отвечает {name}, вы ответите со следующего.",
        sheetOfPlayer: "Лист игрока {name}",
        giveSheetBack: "Вернуть лист",
        tellingTheStory: "Историю рассказывают",
        statusWriting: "пишет…",
        statusDone: "готово",
        statusOffline: "не в сети",
        statusLeft: "покинул(а) игру",
        statusAnsweringFor: "отвечает {name}",
        answerFor: "Ответить за игрока {name}",
        waitingNewcomers: "Ждут следующего раунда: {names}",

        // Reading: the sheets, every story
        storiesReady: "Истории готовы",
        readAloud: "Прочитайте вслух лист, который пришёл к вам",
        tapToOpen: "Нажмите, чтобы открыть",
        yourSheet: "Ваш лист",
        readThisAloud: "Прочитайте этот лист вслух",
        openedCount: "Открыто листов: {opened} из {count}",
        yourSheetReadBy: "Ваш лист читает {name}",
        sheets: "Листы",
        statusClosed: "лист закрыт",
        statusOpen: "лист открыт",
        statusReadBy: "читает {name}",
        readFor: "Прочитать за игрока {name}",
        allStories: "Все истории",
        storyTitle1: "История первая",
        storyTitle2: "История вторая",
        storyTitle3: "История третья",
        storyTitle4: "История четвёртая",
        storyTitle5: "История пятая",
        storyTitle6: "История шестая",
        storyTitle7: "История седьмая",
        storyTitle8: "История восьмая",
        storyTitle9: "История девятая",
        storyTitle10: "История десятая",
        storyTitle11: "История одиннадцатая",
        storyTitle12: "История двенадцатая",
        storyReadBy: "читал(а): {name}",
        anotherRound: "Ещё раунд",

        // A new round in the middle of one
        newRound: "Новый раунд",
        newRoundText: "Листы этого раунда пропадут. Начать новый раунд?",
        confirmNewRound: "Да, новый раунд",
    }
};

// The Russian copies of the game's own server errors, keyed by the English
// text the server sends (the kit's errors have their copies in the kit)
const serverErrors = {
    ru: {
        'No round is on': "Раунд сейчас не идёт",
        'The round has already started': "Раунд уже начался",
        'Need at least 2 players to start': "Чтобы начать, нужно хотя бы два игрока",
        'Invalid answer': "Ответ не принят",
        'Answer cannot be empty': "Ответ не может быть пустым",
        'Answer is too long': "Ответ слишком длинный",
        'The questions are over': "Вопросы закончились",
        'You are not in this round': "Вас нет в этом раунде",
        'You are not holding this sheet': "Этот лист не у вас",
        'Another player is writing on your sheet': "На вашем листе сейчас пишет другой игрок",
        'This answer has already been written': "На этот вопрос уже ответили",
        'This step is over': "Этот шаг уже закончился",
        'There is no answer to change': "Здесь нет ответа, который можно изменить",
        'Another player wrote this answer': "Этот ответ написал другой игрок",
        'This seat is not in the round': "Этого места нет в раунде",
        'This player is here': "Этот игрок сейчас в игре",
        'Another player has already taken this sheet': "Этот лист уже взял другой игрок",
        'You are already holding a sheet': "У вас уже есть чужой лист",
        'Answer your own question first': "Сначала ответьте на свой вопрос",
        'The stories are not ready yet': "Истории ещё не готовы",
        'Another player is reading your sheet': "Ваш лист читает другой игрок",
        'This sheet is already open': "Этот лист уже открыт",
    }
};

// Jest loads this file with require(), and so do the browser tests' helpers;
// in the browser there is no `module`
/* global module */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { translations, serverErrors };
}
