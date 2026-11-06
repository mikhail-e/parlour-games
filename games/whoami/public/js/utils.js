// The game's shared page code: input limits, the photo avatar's check, alerts
// and notifications. What every game shares (debugLog, AppStorage, the player's
// ID and secret, the version; texts: getText) is the kit's app.js and i18n.js,
// loaded before this.
//
// The pages load their scripts as plain <script> files, so a top-level name here
// is visible to the scripts loaded after it. ESLint checks each file on its own:
// "exported" lists what other files use from here, "global" what this file uses
// from the kit's i18n.js.
/* exported MAX_NAME_LENGTH, MAX_CHARACTER_LENGTH, isCustomAvatar, showError, showInfo,
   showNotification, handleApiError */
/* global getText */

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

// Common error handling
function handleApiError(error, context = '') {
    console.error(`API Error ${context}:`, error);
    const message = getText('connectionError', `Connection error: ${error.message}. Please check your internet connection.`);
    alert(message);
}
