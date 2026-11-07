// The texts of Who am I?, English and Russian: the kit's i18n.js (loaded after
// this file) shows them in the page's language. The texts of the shared parts
// (the landing form, entering and leaving a room, the invitation, notifications)
// are the kit's, in its i18n.js.
/* exported translations, serverErrors */

const translations = {
    en: {
        // Main page
        title: "Who am I?",
        subtitle: "Play the classic guessing game with friends and family!",
        
        // Game rules
        howToPlay: "How to Play",
        rule1: "Each player gets a character assigned by other player",
        rule2: "Ask yes/no questions to guess your character",
        rule3: "Other players answer your questions",
        rule4: "First to guess their character wins!",
        
        // Game room page
        gameRoom: "Game Room",
        players: "Players",
        playerCount: "Player Count",
        shareRoom: "Share Room",
        shareLink: "Share Link",
        copied: "✅ Copied!",
        shareText: "Join my \"Who am I?\" game!",
        
        // Game states
        needPlayers: "Need at least 2 players to start",
        assignCharacters: "Assign characters to all players before starting!",
        readyToPlay: "Ready to play!",
        gameInProgress: "Game in progress - Click your envelope to reveal your character!",
        
        // Buttons
        gameControls: "Game Controls",
        startGame: "Start Game",
        restartGame: "Start New Game",
        refresh: "Refresh Page",
        
        // Character assignment
        assignCharacter: "Assign character",
        characterName: "Character name...",
        you: "You",
        readOnlyDuringGame: "read-only during game",
        assignedByAnother: "assigned by another player",
        yourCharacter: "Your character - click to reveal!",
        yourCharacterHidden: "Your character is hidden from you!",
        yourRevealed: "Your revealed character",
        
        // Modals
        revealTitle: "Reveal Your Character?",
        revealMessage: "Are you sure you want to see who you are? This will end the game for you!",
        revealCharacter: "Reveal Character",
        
        restartTitle: "Restart Game?",
        restartMessage: "This will clear all character assignments and return to setup phase. Are you sure?",
        confirmRestart: "Yes, Restart",
        
        // Notifications
        gameRestarted: "⏮️ Game restarted! Character assignments cleared.",
        
        // Errors
        invalidRoom: "Invalid room code",
        clickToEdit: "click to edit",
        
        // Game room additional
        inviteDuringGame: "The game is on: a newcomer will ask to join, and any of you can let them in.",
        characterAssignment: "Character Assignment",
        clickPlus: "Press “Assign character”",
        clickStickers: "Click character tags",
        assignInstructions: "on other players' cards to give them characters.",
        editInstructions: "to edit them.",
        gameInstructions: "Game Instructions",
        step1: "Wait for at least 2 players to join",
        step2: "Each player assigns characters to other players",
        step3: "Click \"Start Game\" when ready",
        step4: "Click your envelope to reveal your character",
        step5: "Try to guess who you are!",
        
        // Modal content
        revealModalTitle: "🎭 Reveal Your Character",
        revealConfirmText: "Are you sure you want to reveal your character?",
        revealWarning: "⚠️ This action cannot be undone!",
        revealNote: "Once revealed, your character will be visible to all players for the rest of the game.",
        revealButton: "Yes, Reveal My Character",
        
        restartModalTitle: "⏮️ Start New Game",
        restartConfirmText: "Are you sure you want to restart the game?",
        restartWarning: "⚠️ This will:",
        restartAction1: "Reset all revealed characters",
        restartAction2: "Allow players to reassign characters",
        restartAction3: "New players can join without asking",
        restartAction4: "Return everyone to the setup phase",
        restartNote: "All players will be able to see this action.",

        // Leave game
        leaveNote: "Your card and character will disappear for everyone. The other players can keep playing.",
        // Joining a started game (game-room.js)
        waitingForAdmission: "Waiting for the players to let you in. They have your request.",
        joinRequestTitle: "🚪 Asking to join",
        joinRequestText: "wants to join the game",
        joinRequestQuestion: "Let them into the started game?",
        admitPlayer: "Let in",
        declinePlayer: "Decline",
        playerAdmittedNotification: "👋 {playerName} is in the game now",
        envelopeEmpty: "empty for now",
        noCharacterYet: "No character yet - another player will give you one",
        waitingForCharacter: "Game in progress - waiting for someone to give you a character",

        waiting: "Waiting for players to join...",

        // Reveal notifications
        playerRevealedNotification: "🎭 {playerName} revealed their character: \"{character}\"",

        // UI messages
        noPlayersYet: "No players yet",
        yourCharacterClickReveal: "Your character - click to reveal!",
        yourRevealedCharacter: "Your revealed character",
        characterRevealedByPlayer: "Character revealed by player",
        characterReadOnly: "Character: {character} (read-only during game)",
        characterClickToEdit: "Character: {character} (click to edit)",
        someoneNeedsToAssign: "Someone needs to assign you a character!",

        // Error messages
        connectionErrorTryAgain: "Please try again.",

        // Language switcher
        language: "Language",
        english: "English",
        russian: "Русский",

        // Page for an address with nothing on it (404.html)
        notFoundTitle: "Page not found",
        notFoundText: "There is nothing at this address. The game is on the main page.",
        openGame: "Open the game"
    },
    
    ru: {
        // Main page
        title: "Кто я?",
        subtitle: "Играйте в классическую игру-угадайку с друзьями и семьёй!",
        
        // Game rules
        howToPlay: "Как играть",
        rule1: "Каждому игроку другие игроки назначают персонажа",
        rule2: "Задавайте вопросы да/нет, чтобы угадать своего персонажа",
        rule3: "Другие игроки отвечают на ваши вопросы",
        rule4: "Первый, кто угадает своего персонажа, побеждает!",
        
        // Game room page
        gameRoom: "Игровая комната",
        players: "Игроки",
        playerCount: "Количество игроков",
        shareRoom: "Поделиться комнатой",
        shareLink: "Ссылка для друзей",
        copied: "✅ Скопировано!",
        shareText: "Присоединяйся к моей игре «Кто я?»!",
        
        // Game states
        needPlayers: "Нужно минимум 2 игрока для начала",
        assignCharacters: "Назначьте персонажей всем игрокам перед началом!",
        readyToPlay: "Готово к игре!",
        gameInProgress: "Игра идёт — нажмите на свой конверт, чтобы раскрыть персонажа!",
        
        // Buttons
        gameControls: "Управление игрой",
        startGame: "Начать игру",
        restartGame: "Начать новую игру",
        refresh: "Обновить страницу",
        
        // Character assignment
        assignCharacter: "Задать персонажа",
        characterName: "Имя персонажа...",
        you: "Вы",
        readOnlyDuringGame: "только чтение во время игры",
        assignedByAnother: "назначен другим игроком",
        yourCharacter: "Ваш персонаж - нажмите для раскрытия!",
        yourCharacterHidden: "Ваш персонаж скрыт от вас!",
        yourRevealed: "Ваш раскрытый персонаж",
        
        // Modals
        revealTitle: "Раскрыть вашего персонажа?",
        revealMessage: "Вы уверены, что хотите узнать, кто вы? Это завершит игру для вас!",
        revealCharacter: "Раскрыть персонажа",
        
        restartTitle: "Начать новую игру?",
        restartMessage: "Это очистит всех персонажей и завершит текущую игру. Вы уверены?",
        confirmRestart: "Да, перезапустить",
        
        // Notifications
        gameRestarted: "⏮️ Игра перезапущена! Персонажи очищены.",
        
        // Errors
        invalidRoom: "Неверный код комнаты",
        clickToEdit: "нажмите для редактирования",
        
        // Game room additional
        inviteDuringGame: "Игра уже идёт: новичок попросится войти, и впустить его сможет любой из вас.",
        characterAssignment: "Назначение персонажей",
        clickPlus: "Нажмите «Задать персонажа»",
        clickStickers: "Нажмите на бирки персонажей",
        assignInstructions: "на карточках других игроков, чтобы задать им персонажей.",
        editInstructions: "чтобы их редактировать.",
        gameInstructions: "Инструкции к игре",
        step1: "Дождитесь присоединения минимум 2 игроков",
        step2: "Каждый игрок назначает персонажа другому игроку",
        step3: "Нажмите \"Начать игру\" когда готовы",
        step4: "Нажмите на свой конверт, чтобы раскрыть персонажа",
        step5: "Попробуйте угадать, кто вы!",
        
        // Modal content
        revealModalTitle: "🎭 Раскрыть вашего персонажа",
        revealConfirmText: "Вы уверены, что хотите раскрыть своего персонажа?",
        revealWarning: "⚠️ Это действие нельзя отменить!",
        revealNote: "После раскрытия ваш персонаж будет виден вам до конца игры.",
        revealButton: "Да, раскрыть моего персонажа",
        
        restartModalTitle: "⏮️ Перезапустить игру",
        restartConfirmText: "Вы уверены, что хотите перезапустить игру?",
        restartWarning: "⚠️ После перезапуска:",
        restartAction1: "Все персонажи будут удалены",
        restartAction2: "Игроки снова смогут назначать персонажей",
        restartAction3: "Новые игроки смогут входить без спроса",
        restartAction4: " ",
        restartNote: "Это действие повлияет на всех игроков",

        // Leave game
        leaveNote: "Ваша карточка и персонаж исчезнут у всех игроков. Остальные смогут продолжить игру.",
        // Joining a started game (game-room.js)
        waitingForAdmission: "Ждём, пока игроки вас впустят. Им уже пришёл ваш запрос.",
        joinRequestTitle: "🚪 Просится в игру",
        joinRequestText: "хочет войти в игру",
        joinRequestQuestion: "Впустить в начатую игру?",
        admitPlayer: "Впустить",
        declinePlayer: "Отказать",
        playerAdmittedNotification: "👋 {playerName} теперь в игре",
        envelopeEmpty: "пока пусто",
        noCharacterYet: "Персонажа пока нет — его даст другой игрок",
        waitingForCharacter: "Игра идёт — ждём, пока вам дадут персонажа",

        waiting: "Ожидание присоединения игроков...",

        // Reveal notifications
        playerRevealedNotification: "🎭 {playerName} раскрыл своего персонажа: \"{character}\"",

        // UI messages
        noPlayersYet: "Игроков пока нет",
        yourCharacterClickReveal: "Ваш персонаж - нажмите, чтобы раскрыть!",
        yourRevealedCharacter: "Ваш раскрытый персонаж",
        characterRevealedByPlayer: "Персонаж раскрыт игроком",
        characterReadOnly: "Персонаж: {character} (нельзя изменить во время игры)",
        characterClickToEdit: "Персонаж: {character} (нажмите, чтобы изменить)",
        someoneNeedsToAssign: "Кто-то должен назначить вам персонажа!",

        // Error messages
        connectionErrorTryAgain: "Попробуйте еще раз.",

        // Language switcher
        language: "Язык",
        english: "English",
        russian: "Русский",

        // Page for an address with nothing on it (404.html)
        notFoundTitle: "Страница не найдена",
        notFoundText: "По этому адресу ничего нет. Игра — на главной странице.",
        openGame: "Открыть игру"
    }
};

// The server answers in English (game-logic.js, worker/), and its error texts
// are the keys here: the page shows a server error in its own language. The
// errors of the kit's server code have their copies in the kit (its i18n.js).
// tests/translations-real.test.js fails if a text the server sends is missing
const serverErrors = {
    ru: {
        'This request has already been answered': "На этот запрос уже ответили",
        'Assigner not found in game': "Игрок, назначающий персонажа, не найден в комнате",
        'Cannot assign character to yourself': "Нельзя назначить персонажа самому себе",
        'Cannot change characters after the game has started': "После начала игры персонажей менять нельзя",
        'Invalid character': "Недопустимый персонаж",
        'Need at least 2 players to start': "Нужно минимум 2 игрока для начала",
        'Every player needs a character to start': "Чтобы начать, назначьте персонажей всем игрокам",
        'Game has not started yet': "Игра ещё не началась",
        'No character assigned to this player': "Этому игроку не назначен персонаж"
    }
};

// Jest loads this file with require() (tests/translations-real.test.js), and so
// do the browser tests' helpers; in the browser there is no `module`
/* global module */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { translations, serverErrors };
}
