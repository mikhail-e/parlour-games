// Shared Utilities - Common patterns used across the game
//
// The pages load their scripts as plain <script> files, so a top-level name here
// is visible to the scripts loaded after it. ESLint checks each file on its own:
// "exported" lists what other files use from here, "global" what this file uses
// from translations.js.
/* exported debugLog, MAX_NAME_LENGTH, MAX_CHARACTER_LENGTH, isCustomAvatar, getText, serverErrorText, showError, showInfo,
   showNotification, AppStorage, handleApiError, PLAYER_ID, PLAYER_SECRET */
/* global i18n */

// Debug output: printed only while debugging is on, so players' consoles stay
// quiet. Turn it on in the browser console, then reload the page:
//   localStorage.setItem('whoami-debug', 'on')
// console.warn and console.error are for real problems and always print.
let DEBUG_LOG_ENABLED = false;
try {
    DEBUG_LOG_ENABLED = localStorage.getItem('whoami-debug') === 'on';
} catch {
    // The browser blocks site data: no debugging, and the page script goes on
}

function debugLog(...args) {
    if (DEBUG_LOG_ENABLED) {
        // eslint-disable-next-line no-console -- the one place the pages print debug output
        console.log(...args);
    }
}

// Input limits. Must stay in sync with game-logic.js on the server
// (a browser script cannot require() it) - tests/input-limits.test.js checks this.
const MAX_NAME_LENGTH = 128;
const MAX_CHARACTER_LENGTH = 128;

// Custom avatar validation. Mirrors game-logic.js exactly (same constant, same
// pattern, same function) - tests/input-limits.test.js checks the sync.
const MAX_CUSTOM_AVATAR_LENGTH = 32768;
const CUSTOM_AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// True if the value is a strictly valid custom-avatar data URL: only the three
// safe raster image MIME types, only base64 characters, and small enough.
function isCustomAvatar(value) {
    return typeof value === 'string'
        && value.length <= MAX_CUSTOM_AVATAR_LENGTH
        && CUSTOM_AVATAR_PATTERN.test(value);
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

// Build a dismissible Bootstrap alert. The message is inserted as plain text
// (never as HTML) so user-controlled content like player names cannot inject markup.
function createAlertElement(message, className) {
    const alertDiv = document.createElement('div');
    alertDiv.className = className;

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn-close';
    closeButton.setAttribute('data-bs-dismiss', 'alert');
    closeButton.setAttribute('data-i18n-aria-label', 'close');
    closeButton.setAttribute('aria-label', getText('close', 'Close'));

    alertDiv.appendChild(messageSpan);
    alertDiv.appendChild(closeButton);
    return alertDiv;
}

// Insert an alert at the top of the page content
function insertAlert(alertDiv) {
    const container = document.querySelector('.container');
    if (!container) return;

    const firstCard = document.querySelector('.game-card');
    if (firstCard && firstCard.parentNode === container) {
        container.insertBefore(alertDiv, firstCard);
    } else {
        container.insertBefore(alertDiv, container.firstChild);
    }
}

// Show error message with Bootstrap alert
function showError(message) {
    insertAlert(createAlertElement(message, 'alert alert-danger alert-dismissible fade show'));
}

// Show info message with Bootstrap alert
function showInfo(message) {
    insertAlert(createAlertElement(message, 'alert alert-info alert-dismissible fade show'));
}

// Show notification (used in game room)
function showNotification(message, type = 'info', duration = 4000) {
    const notification = createAlertElement(
        message,
        `alert alert-${type === 'success' ? 'success' : 'info'} alert-dismissible fade show position-fixed notification`
    );

    document.body.appendChild(notification);

    // Auto-dismiss after duration
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, duration);
}

// localStorage and sessionStorage with JSON. Not named Storage: that name is the
// browser's own (the type of localStorage), and other scripts on the page may use it
const AppStorage = {
    // Get item with JSON parsing and error handling
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn(`Failed to parse localStorage item "${key}":`, error);
            return defaultValue;
        }
    },

    // Set item with JSON stringification
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Failed to save to localStorage "${key}":`, error);
            return false;
        }
    },

    // Remove item
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn(`Failed to remove localStorage item "${key}":`, error);
        }
    },

    // Session storage helpers
    session: {
        get(key, defaultValue = null) {
            try {
                const item = sessionStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.warn(`Failed to parse sessionStorage item "${key}":`, error);
                return defaultValue;
            }
        },

        set(key, value) {
            try {
                sessionStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error(`Failed to save to sessionStorage "${key}":`, error);
                return false;
            }
        },

        remove(key) {
            try {
                sessionStorage.removeItem(key);
            } catch (error) {
                console.warn(`Failed to remove sessionStorage item "${key}":`, error);
            }
        }
    }
};

// Common error handling
function handleApiError(error, context = '') {
    console.error(`API Error ${context}:`, error);
    const message = getText('connectionError', `Connection error: ${error.message}. Please check your internet connection.`);
    alert(message);
}

// Player ID System - Shared unique player ID generation. The random digits
// come from the cryptographic generator, like the server's: Math.random's
// numbers can be predicted. (crypto.randomUUID() would be shorter, but a
// browser offers it only on https and localhost, not on a phone that opens
// the game at the computer's plain-http address)
function generatePlayerId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// The server accepts a player ID only in UUID format (same pattern as
// game-logic.js, tests/input-limits.test.js keeps them equal) and silently
// generates a fresh one otherwise - so a stored ID in any other format (e.g.
// the pre-2025 "player_..." format) would make the server create a NEW player
// on every page load: instant duplicates. A player's secret has the same shape.
const PLAYER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Get or create unique player ID for this browser (ONE per browser).
// A stored ID that the server would reject is replaced with a valid one.
function getUniquePlayerId() {
    let playerId = localStorage.getItem('playerId');
    if (!playerId || !PLAYER_ID_PATTERN.test(playerId)) {
        playerId = generatePlayerId();
        localStorage.setItem('playerId', playerId);
        debugLog(`🆔 Generated new unique player ID:`, playerId);
    } else {
        debugLog(`🆔 Using existing player ID:`, playerId);
    }
    return playerId;
}

// Initialize player ID immediately when this script loads
const PLAYER_ID = getUniquePlayerId();

// The player's secret, one per browser like the ID. The ID is public - every
// page in a room sees the players list - while the secret goes only to the
// server, which never sends it to anybody: it proves that this browser IS
// the player with PLAYER_ID, so nobody else can act in their name
function getPlayerSecret() {
    let secret = localStorage.getItem('whoami-player-secret');
    if (!secret || !PLAYER_ID_PATTERN.test(secret)) {
        secret = generatePlayerId();
        localStorage.setItem('whoami-player-secret', secret);
    }
    return secret;
}

const PLAYER_SECRET = getPlayerSecret();

// Show the running version (package.json on the server) in every
// [data-app-version] element, so anyone can see which release is live
async function showAppVersion() {
    const elements = document.querySelectorAll('[data-app-version]');
    if (elements.length === 0) return;

    try {
        const response = await fetch('/api/version');
        if (!response.ok) return;
        const { version } = await response.json();
        elements.forEach(element => {
            element.textContent = `v${version}`;
        });
    } catch (error) {
        console.warn('Could not load the app version:', error);
    }
}

document.addEventListener('DOMContentLoaded', showAppVersion);