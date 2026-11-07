// The kit's translations: the page's language (the browser's, or the one the
// player chose - kept in localStorage under '<the game's prefix>-language'),
// texts with {placeholders}, the markup's data-i18n* attributes, the language
// button, and the server's errors in the page's language. The texts are the
// game's (its translations.js: `translations` and `serverErrors`, loaded before
// this file) on top of the kit's own below - the texts the kit's code shows.
// i18n, getText and serverErrorText are used by the scripts loaded after this
// one (see the note at the top of app.js).
/* exported i18n, getText, serverErrorText */
/* global APP_STORAGE_PREFIX, translations, serverErrors */

// The texts the kit's own code shows (pwa.js's update banner, the close button
// of an alert); a game's dictionary may give its own instead
const KIT_TEXTS = {
    en: {
        close: "Close",
        updateAvailable: "🆕 Update Available!",
        updateDescription: "A new version of the app is ready. Reload to get the latest features.",
        updateNow: "Update Now"
    },
    ru: {
        close: "Закрыть",
        updateAvailable: "🆕 Доступно обновление!",
        updateDescription: "Новая версия приложения готова. Перезагрузите, чтобы получить последние функции.",
        updateNow: "Обновить сейчас"
    }
};

// The game's texts on top of the kit's, language by language
function withKitTexts(gameTexts) {
    const texts = {};
    for (const lang of new Set([...Object.keys(KIT_TEXTS), ...Object.keys(gameTexts)])) {
        texts[lang] = { ...KIT_TEXTS[lang], ...gameTexts[lang] };
    }
    return texts;
}

// The page's language and its texts. Built on DOMContentLoaded below, as `i18n`;
// tests build it with the dictionaries they give
class Localization {
    constructor(gameTexts = translations, gameErrors = serverErrors) {
        this.texts = withKitTexts(gameTexts);
        this.errors = gameErrors;
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

    // A server error in the current language (the game's serverErrors); a text
    // the list does not know, like a network error, is shown as it came
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
    module.exports = { KIT_TEXTS, withKitTexts, Localization };
}
