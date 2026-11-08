// Messages to the player: an alert at the top of the page (showError,
// showInfo), a notification that goes by itself (showNotification), a window
// that waits for the player (showMessage), and what a failed request to the
// server shows (handleApiError). A message is always
// put in as plain text, never as HTML: names a player typed cannot inject
// markup.
/* exported showError, showInfo, showNotification, showMessage, handleApiError */
/* global getText, createIcon */

// A dismissible Bootstrap alert with the message as text
function createAlertElement(message, className, icon) {
    const alertDiv = document.createElement('div');
    alertDiv.className = className;

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    if (icon) messageSpan.prepend(createIcon(icon));

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

// An alert goes at the top of the page's .container, before its first .game-card
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

function showError(message) {
    insertAlert(createAlertElement(message, 'alert alert-danger alert-dismissible fade show'));
}

function showInfo(message) {
    insertAlert(createAlertElement(message, 'alert alert-info alert-dismissible fade show'));
}

// A notification pinned to the screen (.notification), gone after `duration`,
// its `icon` (a name, as createIcon takes) before the text
function showNotification(message, type = 'info', { duration = 4000, icon } = {}) {
    const notification = createAlertElement(
        message,
        `alert alert-${type === 'success' ? 'success' : 'info'} alert-dismissible fade show position-fixed notification`,
        icon
    );

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, duration);
}

// The windows waiting for the player: their text → the promise of their closing
const openMessages = new Map();
let lastMessage = Promise.resolve();

// A window with a text and one button, in place of the browser's alert. The
// page goes on behind it, so what must wait for the player waits for the
// promise (going home, say). One at a time, in order; a text already waiting
// is not shown twice
function showMessage(message) {
    if (openMessages.has(message)) return openMessages.get(message);
    const closed = lastMessage.then(() => openMessageWindow(message));
    lastMessage = closed;
    openMessages.set(message, closed);
    closed.then(() => openMessages.delete(message));
    return closed;
}

// A <dialog>: above any window that is open, the page behind it out of reach,
// Escape closes it and the focus goes back where it was, all by the browser
function openMessageWindow(message) {
    const dialog = document.createElement('dialog');
    dialog.className = 'message-window';
    dialog.setAttribute('aria-labelledby', 'messageWindowText');
    dialog.innerHTML = `
        <div class="modal">
            <div class="modal-dialog mobile-friendly-modal">
                <div class="modal-content">
                    <div class="modal-body"><p class="mb-0" id="messageWindowText"></p></div>
                    <div class="modal-footer mobile-modal-footer">
                        <button type="button" class="btn btn-primary mobile-modal-btn"></button>
                    </div>
                </div>
            </div>
        </div>`;
    dialog.querySelector('p').textContent = message;
    const button = dialog.querySelector('button');
    button.textContent = getText('messageOk', 'OK');
    button.addEventListener('click', () => dialog.close());
    document.body.appendChild(dialog);
    dialog.showModal();
    return new Promise(resolve => {
        dialog.addEventListener('close', () => {
            dialog.remove();
            resolve();
        }, { once: true });
    });
}

// A request to the server that failed on the way (no answer at all)
function handleApiError(error, context = '') {
    console.error(`API Error ${context}:`, error);
    const message = getText('connectionError', `Connection error: ${error.message}. Please check your internet connection.`);
    return showMessage(message);
}
