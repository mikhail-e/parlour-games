// The kit's translations: the page's language (the browser's, or the one the
// player chose - kept in localStorage under '<the game's prefix>-language'),
// texts with {placeholders}, the markup's data-i18n* attributes, the language
// button, and the server's errors in the page's language. The texts are the
// game's (its translations.js: `translations` and `serverErrors`, loaded before
// this file) on top of the kit's own below - the texts the kit's code shows
// and the errors its server code sends.
// i18n, getText and serverErrorText are used by the scripts loaded after this
// one (see the note at the top of app.js).
/* exported i18n, getText, serverErrorText */
/* global APP_STORAGE_PREFIX, translations, serverErrors */

// The texts of the shared parts: what the kit's scripts show, and the words of
// the markup they work with (the landing form, the leave window, the waiting
// screen, the invitation, the 404 page: the markup is each game's, its words
// are the kit's).
// A game's dictionary may give its own text under the same key instead
const KIT_TEXTS = {
    en: {
        // The landing page: the name, the avatar, creating and joining (landing.js)
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
        roomCodeJoining: "Room Code (joining game)",
        clearRoomCodeToCreate: "Clear room code to create a new game",
        readyToJoin: "Ready to join room",
        enterNameAvatar: "Just enter your name and avatar!",
        pleaseEnterName: "Please enter your name first",
        roomCodeLength: "Room code must be exactly 6 characters",
        creating: "Creating...",
        roomNotFound: "Room not found",
        failedCreateGame: "Failed to create game. Please try again.",
        failedJoinGame: "Failed to join game",
        joinDeclined: "The players did not let you into the game",

        // The room page: entering, leaving, the newcomer's waiting screen (room-page.js)
        invalidRoomCode: "Invalid room code",
        gameAlreadyOn: "The game is already on",
        leaveGame: "Leave Game",
        leaveModalTitle: "Leave Game",
        leaveConfirmText: "Are you sure you want to leave this game?",
        confirmLeave: "Yes, Leave Game",
        cancel: "Cancel",
        playerLeftNotification: "{playerName} left the game",

        // The invitation (invite.js)
        inviteFriends: "Invite Friends",
        shareLinkLabel: "Room link",
        copyLink: "Copy Link",
        copyRoomLink: "Copy Link",
        share: "Share",
        copiedSuccess: "Copied!",

        // Notifications (notify.js) and the update banner (pwa.js)
        connectionError: "Connection error. Please try again.",
        close: "Close",
        updateAvailable: "Update Available!",
        updateDescription: "A new version of the app is ready. Reload to get the latest features.",
        updateNow: "Update Now",

        // The 404 page: the frame answers every address nothing else does with
        // a game's 404.html (worker/http.js)
        notFoundTitle: "Page not found",
        notFoundText: "There is nothing at this address. The game is on the main page.",
        openGame: "Open the game"
    },
    ru: {
        // The landing page: the name, the avatar, creating and joining (landing.js)
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
        roomCodeJoining: "Код комнаты (присоединение к игре)",
        clearRoomCodeToCreate: "Очистите код комнаты для создания новой игры",
        readyToJoin: "Готов присоединиться к комнате",
        enterNameAvatar: "Просто введите ваше имя и выберите аватар!",
        pleaseEnterName: "Пожалуйста, введите ваше имя",
        roomCodeLength: "Код комнаты должен содержать ровно 6 символов",
        creating: "Создание...",
        roomNotFound: "Комната не найдена",
        failedCreateGame: "Не удалось создать игру. Попробуйте ещё раз.",
        failedJoinGame: "Не удалось присоединиться к игре",
        joinDeclined: "Игроки не впустили вас в игру",

        // The room page: entering, leaving, the newcomer's waiting screen (room-page.js)
        invalidRoomCode: "Неверный код комнаты",
        gameAlreadyOn: "Игра уже идёт",
        leaveGame: "Покинуть игру",
        leaveModalTitle: "Покинуть игру",
        leaveConfirmText: "Вы уверены, что хотите покинуть игру?",
        confirmLeave: "Да, покинуть игру",
        cancel: "Отмена",
        playerLeftNotification: "{playerName} покинул(а) игру",

        // The invitation (invite.js)
        inviteFriends: "Пригласить друзей",
        shareLinkLabel: "Ссылка на комнату",
        copyLink: "Скопировать",
        copyRoomLink: "Скопировать ссылку",
        share: "Поделиться",
        copiedSuccess: "Скопировано!",

        // Notifications (notify.js) and the update banner (pwa.js)
        connectionError: "Ошибка соединения. Попробуйте ещё раз.",
        close: "Закрыть",
        updateAvailable: "Доступно обновление!",
        updateDescription: "Новая версия приложения готова. Перезагрузите, чтобы получить последние функции.",
        updateNow: "Обновить сейчас",

        // The 404 page: the frame answers every address nothing else does with
        // a game's 404.html (worker/http.js)
        notFoundTitle: "Страница не найдена",
        notFoundText: "По этому адресу ничего нет. Игра — на главной странице.",
        openGame: "Открыть игру"
    }
};

// The errors the kit's server code sends (shared/players.js, worker/), in
// Russian: the server answers in English, and a page shows them in its
// language. A game's serverErrors holds the copies of its own errors only;
// the kit's test keeps this list and the kit's server texts equal
const KIT_SERVER_ERRORS = {
    ru: {
        'Game not found': "Комната не найдена",
        'Invalid player name': "Недопустимое имя игрока",
        'Invalid avatar': "Недопустимый аватар",
        'Game has already started': "Игра уже началась",
        'Game is full': "В комнате нет свободных мест",
        'Player not found in game': "Игрок не найден в комнате",
        'Missing required fields': "Не заполнены обязательные поля",
        'Something went wrong, please try again': "Что-то пошло не так, попробуйте ещё раз",
        'You are not in this game': "Вы не участвуете в этой игре",
        'This player is playing in another browser': "Этот игрок играет в другом браузере"
    }
};

// A game's dictionary on top of the kit's, language by language
function withKit(kitDictionary, gameDictionary) {
    const merged = {};
    for (const lang of new Set([...Object.keys(kitDictionary), ...Object.keys(gameDictionary)])) {
        merged[lang] = { ...kitDictionary[lang], ...gameDictionary[lang] };
    }
    return merged;
}

// The game's texts on top of the kit's
function withKitTexts(gameTexts) {
    return withKit(KIT_TEXTS, gameTexts);
}

// The game's copies of the server's errors on top of the kit's
function withKitServerErrors(gameErrors) {
    return withKit(KIT_SERVER_ERRORS, gameErrors);
}

// The page's language and its texts. Built on DOMContentLoaded below, as `i18n`;
// tests build it with the dictionaries they give
class Localization {
    constructor(gameTexts = translations, gameErrors = serverErrors) {
        this.texts = withKitTexts(gameTexts);
        this.errors = withKitServerErrors(gameErrors);
        this.storageKey = `${APP_STORAGE_PREFIX}-language`;
        this.currentLanguage = this.detectLanguage();
        this.init();
    }
    
    detectLanguage() {
        // Check for saved language preference first
        const savedLang = localStorage.getItem(this.storageKey);
        if (savedLang && this.texts[savedLang]) {
            return savedLang;
        }
        
        // Auto-detect from browser locale
        const browserLang = navigator.language || navigator.userLanguage || 'en';
        const langCode = browserLang.toLowerCase().substring(0, 2);
        
        // Return supported language or default to English
        return this.texts[langCode] ? langCode : 'en';
    }
    
    init() {
        this.updateTexts();
        this.createLanguageSwitcher();
    }
    
    setLanguage(lang) {
        if (!this.texts[lang]) return;

        this.currentLanguage = lang;
        localStorage.setItem(this.storageKey, lang);
        this.updateTexts();
        this.updateLanguageSwitcher();

        // Notify pages that render text from JavaScript (game status, player
        // cards, ...) - updateTexts() only handles static data-i18n elements
        document.dispatchEvent(new CustomEvent('languagechanged', { detail: { language: lang } }));
    }
    
    getText(key, placeholders = {}) {
        let text = this.texts[this.currentLanguage][key] || this.texts['en'][key] || key;

        // Replace placeholders in the format {placeholder}.
        // split/join instead of a regex so user-provided values containing
        // special characters (like "$&") are inserted literally
        for (const [placeholder, value] of Object.entries(placeholders)) {
            text = text.split(`{${placeholder}}`).join(String(value));
        }

        return text;
    }

    // A server error in the current language (the game's serverErrors and the
    // kit's); a text the lists do not know, like a network error, is shown as it came
    serverErrorText(error) {
        const texts = this.errors[this.currentLanguage];
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
                    <span class="icon icon--language" aria-hidden="true"></span><span class="lang-toggle-text"></span>
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
        // The toggle button names the other language
        const toggleText = document.querySelector('.lang-toggle-text');
        if (toggleText) {
            if (this.currentLanguage === 'en') {
                toggleText.textContent = 'Русский';
            } else {
                toggleText.textContent = 'English';
            }
        }
    }
}

// Helper function for safe i18n text retrieval with fallback
function getText(key, fallback, placeholders = {}) {
    if (typeof i18n !== 'undefined' && i18n) {
        return i18n.getText(key, placeholders);
    }
    return fallback;
}

// An error the server sent (in English), in the page's language
function serverErrorText(error) {
    if (typeof i18n !== 'undefined' && i18n) {
        return i18n.serverErrorText(error);
    }
    return error;
}

// Initialize localization when page loads
let i18n;
document.addEventListener('DOMContentLoaded', () => {
    i18n = new Localization();
});

// Jest loads this file with require() (the kit's tests, a game's helpers); in
// the browser there is no `module`
/* global module */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { KIT_TEXTS, KIT_SERVER_ERRORS, withKitTexts, withKitServerErrors, Localization };
}
