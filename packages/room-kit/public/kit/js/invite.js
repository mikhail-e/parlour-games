// The room's invitation on its page: the room code, the link to the room,
// "Copy Link" and "Share". The page's markup is the game's (game.html); this
// script finds its parts by their ids - the list is in the kit's CLAUDE.md
// (The room page).
/* exported setUpInvitation, copyRoomLink, shareRoomLink, shareOrCopy */
/* global getText, createIcon */

// The buttons showing "Copied!" right now
const flashing = new WeakSet();

// The room code in #roomCode, the link in #shareLink, and the buttons of the
// lobby's invitation (#copyLink, #shareButton) and of a started round's
// (#gameCopyLink, #gameShareButton), whichever the page has
function setUpInvitation(roomCode) {
    const codeElement = document.getElementById('roomCode');
    if (codeElement) codeElement.textContent = roomCode;
    const shareLink = document.getElementById('shareLink');
    if (shareLink) shareLink.value = `${window.location.origin}/game/${roomCode}`;

    for (const id of ['copyLink', 'gameCopyLink']) {
        const button = document.getElementById(id);
        if (button) button.addEventListener('click', () => copyRoomLink(button));
    }
    for (const id of ['shareButton', 'gameShareButton']) {
        const button = document.getElementById(id);
        if (button) button.addEventListener('click', () => shareRoomLink(button));
    }
}

// Copy a text and flash "Copied!" on the button that was pressed. A page the
// clipboard is closed to (plain http, as a phone on the home network) copies
// the old way, from a field made for it
async function copyAndSay(button, text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const field = document.createElement('textarea');
        field.value = text;
        field.style.position = 'fixed'; // selecting it must not scroll the page
        document.body.append(field);
        field.select();
        document.execCommand('copy');
        field.remove();
    }

    // A second press during the flash must not take "Copied!" for the label.
    // The button's own elements come back, so its label still follows the language
    if (flashing.has(button)) return;
    flashing.add(button);
    const label = [...button.childNodes];
    const copied = document.createElement('span');
    copied.textContent = getText('copiedSuccess', 'Copied!');
    button.replaceChildren(createIcon('check'), copied);
    setTimeout(() => {
        button.replaceChildren(...label);
        flashing.delete(button);
    }, 2000);
}

function copyRoomLink(button) {
    return copyAndSay(button, document.getElementById('shareLink').value);
}

// Open the system's share sheet with this data; a browser without one, or a
// sheet that fails, copies `copied` instead. No await before navigator.share:
// iOS refuses a share sheet that is not opened right in the click
async function shareOrCopy(button, data, copied) {
    if (navigator.share) {
        try {
            await navigator.share(data);
            return;
        } catch (error) {
            // AbortError = the player closed the share sheet - not a failure
            if (error.name === 'AbortError') return;
        }
    }
    copyAndSay(button, copied);
}

// The room link to the share sheet. The sheet's title and text are the
// game's (its texts `title` and `shareText`)
function shareRoomLink(button) {
    const url = document.getElementById('shareLink').value;
    return shareOrCopy(button, { title: getText('title', document.title), text: getText('shareText', ''), url }, url);
}
