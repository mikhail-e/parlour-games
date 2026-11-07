// The texts of Consequences, English and Russian: the kit's i18n.js (loaded
// after this file) shows them in the page's language. The texts of the shared
// parts (the landing form, entering and leaving a room, the invitation,
// notifications) are the kit's, in its i18n.js.
/* exported translations, serverErrors */

const translations = {
    en: {
        // The landing page
        title: "Consequences",
        subtitle: "The folded-paper story game, for friends and family",
        howToPlay: "How to Play",
        rule1: "Everyone answers the same question on their own sheet, folds the answer away and passes the sheet on",
        rule2: "Eight questions: who, with whom, when, where, what they were doing, how it ended, what people said, the moral",
        rule3: "At the end everyone reads out the story that came to them",

        // The room
        players: "Players",
        waitingForPlayers: "Waiting for players to join...",
        shareText: "Join my game of Consequences!",
        you: "You",
    },
    ru: {
        // The landing page
        title: "Чепуха",
        subtitle: "Игра на сложенных листах — для друзей и семьи",
        howToPlay: "Как играть",
        rule1: "Все отвечают на один вопрос каждый на своём листе, загибают ответ и передают лист дальше",
        rule2: "Восемь вопросов: кто, с кем, когда, где, что делали, чем всё закончилось, что сказали люди, какая мораль",
        rule3: "В конце каждый читает вслух историю, которая к нему пришла",

        // The room
        players: "Игроки",
        waitingForPlayers: "Ждём игроков...",
        shareText: "Заходи играть в «Чепуху»!",
        you: "Вы",
    }
};

// The Russian copies of the game's own server errors, keyed by the English
// text the server sends (the kit's errors have their copies in the kit)
const serverErrors = {
    ru: {}
};

// Jest loads this file with require(), and so do the browser tests' helpers;
// in the browser there is no `module`
/* global module */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { translations, serverErrors };
}
