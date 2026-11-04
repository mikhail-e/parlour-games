// Localization system for Who am I? game
// i18n is used by the scripts loaded after this one (see the note at the top of utils.js)
/* exported i18n */

const translations = {
    en: {
        // Main page
        title: "Who am I?",
        subtitle: "Play the classic guessing game with friends and family!",
        joinCreateGame: "Join or Create a Game",
        yourName: "Your Name",
        enterName: "Enter your name",
        chooseAvatar: "Choose Your Avatar",
        shuffleAvatars: "Show a different set of avatars",
        uploadAvatar: "Upload your own avatar photo",
        avatarNotImage: "Please choose an image file.",
        avatarReadFailed: "Could not read this image. Try a different photo.",
        avatarTooLarge: "This image could not be compressed enough. Try a different photo.",
        roomCode: "Room Code",
        roomCodePlaceholder: "ABC123",
        roomCodeHelp: "Enter 6-character room code to join existing game",
        joinGame: "Join Game",
        createNewGame: "Create New Game",
        
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
        shareLinkLabel: "Room link",
        copyLink: "Copy Link",
        copyRoomLink: "Copy Link",
        copied: "✅ Copied!",
        share: "Share",
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
        cancel: "Cancel",
        revealCharacter: "Reveal Character",
        
        restartTitle: "Restart Game?",
        restartMessage: "This will clear all character assignments and return to setup phase. Are you sure?",
        confirmRestart: "Yes, Restart",
        
        // Notifications
        gameRestarted: "⏮️ Game restarted! Character assignments cleared.",
        
        // Errors
        invalidRoom: "Invalid room code",
        connectionError: "Connection error. Please try again.",
        roomNotFound: "Room not found",
        pleaseEnterName: "Please enter your name first",
        roomCodeLength: "Room code must be exactly 6 characters",
        failedCreateGame: "Failed to create game. Please try again.",
        failedJoinGame: "Failed to join game",
        readyToJoin: "Ready to join room",
        enterNameAvatar: "Just enter your name and avatar!",
        clickToEdit: "click to edit",
        
        // Game room additional
        inviteFriends: "Invite Friends",
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
        leaveGame: "Leave Game",
        leaveModalTitle: "🚪 Leave Game",
        leaveConfirmText: "Are you sure you want to leave this game?",
        leaveNote: "Your card and character will disappear for everyone. The other players can keep playing.",
        confirmLeave: "Yes, Leave Game",
        playerLeftNotification: "👋 {playerName} left the game",
        // Joining a started game (game-room.js, game.js)
        gameAlreadyOn: "The game is already on",
        waitingForAdmission: "Waiting for the players to let you in. They have your request.",
        joinRequestTitle: "🚪 Asking to join",
        joinRequestText: "wants to join the game",
        joinRequestQuestion: "Let them into the started game?",
        admitPlayer: "Let in",
        declinePlayer: "Decline",
        playerAdmittedNotification: "👋 {playerName} is in the game now",
        joinDeclined: "The players did not let you into the game",
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
        copiedSuccess: "✅ Copied!",
        close: "Close",

        // Error messages
        invalidRoomCode: "Invalid room code",
        connectionErrorTryAgain: "Please try again.",

        // Language switcher
        language: "Language",
        english: "English",
        russian: "Русский",

        // Dynamic UI updates
        roomCodeJoining: "Room Code (joining game)",
        clearRoomCodeToCreate: "Clear room code to create a new game",
        creating: "Creating...",

        // PWA messages
        updateAvailable: "🆕 Update Available!",
        updateDescription: "A new version of the app is ready. Reload to get the latest features.",
        updateNow: "Update Now",

        // Footer of the landing page

        // Page for an address with nothing on it (404.html)
        notFoundTitle: "Page not found",
        notFoundText: "There is nothing at this address. The game is on the main page.",
        openGame: "Open the game"
    },
    
    ru: {
        // Main page
        title: "Кто я?",
        subtitle: "Играйте в классическую игру-угадайку с друзьями и семьёй!",
        joinCreateGame: "Присоединиться или создать игру",
        yourName: "Ваше имя",
        enterName: "Введите ваше имя",
        chooseAvatar: "Выберите аватар",
        shuffleAvatars: "Показать другие аватары",
        uploadAvatar: "Загрузить свою фотографию для аватара",
        avatarNotImage: "Пожалуйста, выберите файл с изображением.",
        avatarReadFailed: "Не удалось открыть это изображение. Попробуйте другое фото.",
        avatarTooLarge: "Не удалось сжать это изображение. Попробуйте другое фото.",
        roomCode: "Код комнаты",
        roomCodePlaceholder: "ABC123",
        roomCodeHelp: "Введите 6-символьный код комнаты для присоединения к существующей игре",
        joinGame: "Войти в игру",
        createNewGame: "Создать новую игру",
        
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
        shareLinkLabel: "Ссылка на комнату",
        copyLink: "Скопировать",
        copyRoomLink: "Скопировать ссылку",
        copied: "✅ Скопировано!",
        share: "Поделиться",
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
        cancel: "Отмена",
        revealCharacter: "Раскрыть персонажа",
        
        restartTitle: "Начать новую игру?",
        restartMessage: "Это очистит всех персонажей и завершит текущую игру. Вы уверены?",
        confirmRestart: "Да, перезапустить",
        
        // Notifications
        gameRestarted: "⏮️ Игра перезапущена! Персонажи очищены.",
        
        // Errors
        invalidRoom: "Неверный код комнаты",
        connectionError: "Ошибка соединения. Попробуйте ещё раз.",
        roomNotFound: "Комната не найдена",
        pleaseEnterName: "Пожалуйста, введите ваше имя",
        roomCodeLength: "Код комнаты должен содержать ровно 6 символов",
        failedCreateGame: "Не удалось создать игру. Попробуйте ещё раз.",
        failedJoinGame: "Не удалось присоединиться к игре",
        readyToJoin: "Готов присоединиться к комнате",
        enterNameAvatar: "Просто введите ваше имя и выберите аватар!",
        clickToEdit: "нажмите для редактирования",
        
        // Game room additional
        inviteFriends: "Пригласить друзей",
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
        leaveGame: "Покинуть игру",
        leaveModalTitle: "🚪 Покинуть игру",
        leaveConfirmText: "Вы уверены, что хотите покинуть игру?",
        leaveNote: "Ваша карточка и персонаж исчезнут у всех игроков. Остальные смогут продолжить игру.",
        confirmLeave: "Да, покинуть игру",
        playerLeftNotification: "👋 {playerName} покинул(а) игру",
        // Joining a started game (game-room.js, game.js)
        gameAlreadyOn: "Игра уже идёт",
        waitingForAdmission: "Ждём, пока игроки вас впустят. Им уже пришёл ваш запрос.",
        joinRequestTitle: "🚪 Просится в игру",
        joinRequestText: "хочет войти в игру",
        joinRequestQuestion: "Впустить в начатую игру?",
        admitPlayer: "Впустить",
        declinePlayer: "Отказать",
        playerAdmittedNotification: "👋 {playerName} теперь в игре",
        joinDeclined: "Игроки не впустили вас в игру",
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
        copiedSuccess: "✅ Скопировано!",
        close: "Закрыть",

        // Error messages
        invalidRoomCode: "Неверный код комнаты",
        connectionErrorTryAgain: "Попробуйте еще раз.",

        // Language switcher
        language: "Язык",
        english: "English",
        russian: "Русский",

        // Dynamic UI updates
        roomCodeJoining: "Код комнаты (присоединение к игре)",
        clearRoomCodeToCreate: "Очистите код комнаты для создания новой игры",
        creating: "Создание...",

        // PWA messages
        updateAvailable: "🆕 Доступно обновление!",
        updateDescription: "Новая версия приложения готова. Перезагрузите, чтобы получить последние функции.",
        updateNow: "Обновить сейчас",

        // Footer of the landing page

        // Page for an address with nothing on it (404.html)
        notFoundTitle: "Страница не найдена",
        notFoundText: "По этому адресу ничего нет. Игра — на главной странице.",
        openGame: "Открыть игру"
    }
};

// The server answers in English (game-logic.js, server.js), and its error texts
// are the keys here: the page shows a server error in its own language.
// tests/translations-real.test.js fails if a text the server sends is missing
const serverErrors = {
    ru: {
        'Game not found': "Комната не найдена",
        'Invalid player name': "Недопустимое имя игрока",
        'Invalid avatar': "Недопустимый аватар",
        'Game has already started': "Игра уже началась",
        'Game is full': "В комнате нет свободных мест",
        'This request has already been answered': "На этот запрос уже ответили",
        'Player not found in game': "Игрок не найден в комнате",
        'Assigner not found in game': "Игрок, назначающий персонажа, не найден в комнате",
        'Cannot assign character to yourself': "Нельзя назначить персонажа самому себе",
        'Cannot change characters after the game has started': "После начала игры персонажей менять нельзя",
        'Invalid character': "Недопустимый персонаж",
        'Need at least 2 players to start': "Нужно минимум 2 игрока для начала",
        'Every player needs a character to start': "Чтобы начать, назначьте персонажей всем игрокам",
        'Game has not started yet': "Игра ещё не началась",
        'No character assigned to this player': "Этому игроку не назначен персонаж",
        'Missing required fields': "Не заполнены обязательные поля",
        'Something went wrong, please try again': "Что-то пошло не так, попробуйте ещё раз",
        'You are not in this game': "Вы не участвуете в этой игре",
        'This player is playing in another browser': "Этот игрок играет в другом браузере"
    }
};

// Localization system
class Localization {
    constructor() {
        this.currentLanguage = this.detectLanguage();
        this.init();
    }
    
    detectLanguage() {
        // Check for saved language preference first
        const savedLang = localStorage.getItem('whoami-language');
        if (savedLang && translations[savedLang]) {
            return savedLang;
        }
        
        // Auto-detect from browser locale
        const browserLang = navigator.language || navigator.userLanguage || 'en';
        const langCode = browserLang.toLowerCase().substring(0, 2);
        
        // Return supported language or default to English
        return translations[langCode] ? langCode : 'en';
    }
    
    init() {
        this.updateTexts();
        this.createLanguageSwitcher();
    }
    
    setLanguage(lang) {
        if (!translations[lang]) return;

        this.currentLanguage = lang;
        localStorage.setItem('whoami-language', lang);
        this.updateTexts();
        this.updateLanguageSwitcher();

        // Notify pages that render text from JavaScript (game status, player
        // cards, ...) - updateTexts() only handles static data-i18n elements
        document.dispatchEvent(new CustomEvent('languagechanged', { detail: { language: lang } }));
    }
    
    getText(key, placeholders = {}) {
        let text = translations[this.currentLanguage][key] || translations['en'][key] || key;

        // Replace placeholders in the format {placeholder}.
        // split/join instead of a regex so user-provided values containing
        // special characters (like "$&") are inserted literally
        for (const [placeholder, value] of Object.entries(placeholders)) {
            text = text.split(`{${placeholder}}`).join(String(value));
        }

        return text;
    }

    // A server error in the current language (serverErrors above); a text the
    // list does not know, like a network error, is shown as it came
    serverErrorText(error) {
        const texts = serverErrors[this.currentLanguage];
        return texts && Object.prototype.hasOwnProperty.call(texts, error) ? texts[error] : error;
    }

    updateTexts() {
        // The page's language: a screen reader picks its voice by it, a browser
        // decides by it whether to offer a translation
        document.documentElement.lang = this.currentLanguage;

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.getText(key);
        });
        
        // Update placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.getText(key);
        });
        
        // Update titles
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.getText(key);
        });

        // Update aria-labels (icon-only buttons have no visible text, so this
        // is their only accessible name)
        document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
            const key = element.getAttribute('data-i18n-aria-label');
            element.setAttribute('aria-label', this.getText(key));
        });

        // Update page title
        const titleElement = document.querySelector('title');
        if (titleElement && titleElement.hasAttribute('data-i18n')) {
            const key = titleElement.getAttribute('data-i18n');
            titleElement.textContent = this.getText(key);
        }
    }
    
    createLanguageSwitcher() {
        // Create single toggle button HTML
        const switcherHTML = `
            <div class="language-switcher mt-3 text-center">
                <button class="btn btn-sm lang-toggle-btn">
                    <span class="lang-toggle-text"></span>
                </button>
            </div>
        `;
        
        // Find container and add switcher
        const container = document.querySelector('.container');
        if (container) {
            container.insertAdjacentHTML('beforeend', switcherHTML);
            
            // Add click handler to toggle button
            const toggleBtn = container.querySelector('.lang-toggle-btn');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    // Switch to opposite language
                    const newLang = this.currentLanguage === 'en' ? 'ru' : 'en';
                    this.setLanguage(newLang);
                });
            }
            
            this.updateLanguageSwitcher();
        }
    }
    
    updateLanguageSwitcher() {
        // Update toggle button text to show opposite language with flag
        const toggleText = document.querySelector('.lang-toggle-text');
        if (toggleText) {
            // If current language is English, show "🇷🇺 Русский" button
            // If current language is Russian, show "🇬🇧 English" button
            if (this.currentLanguage === 'en') {
                toggleText.textContent = '🇷🇺 Русский';
            } else {
                toggleText.textContent = '🇬🇧 English';
            }
        }
    }
}

// Initialize localization when page loads
let i18n;
document.addEventListener('DOMContentLoaded', () => {
    i18n = new Localization();
});

// Jest loads this file with require() (tests/translations-real.test.js); in the
// browser there is no `module`
/* global module */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { translations, serverErrors, Localization };
}