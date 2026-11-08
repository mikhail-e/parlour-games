// The room's invitation on its page: the room code, the link to the room,
// "Copy Link" and "Share". The page's markup is the game's (game.html); this
// script finds its parts by their ids - the list is in the kit's CLAUDE.md
// (The room page).
/* exported setUpInvitation, copyRoomLink, shareRoomLink */
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

// Copy the room link and flash "Copied!" on the button that was pressed. The
// link goes straight to the clipboard: a started round's invitation has no link
// field to select. A page the clipboard is closed to (plain http, as a phone on
// the home network) copies the old way, selecting the lobby's link field -
// hidden in a started round, where not every browser copies from it
async function copyRoomLink(button) {
    const shareLink = document.getElementById('shareLink');
    try {
        await navigator.clipboard.writeText(shareLink.value);
    } catch {
        shareLink.select();
        document.execCommand('copy');
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

// Open the native share sheet with the room link, or copy the link as a
// fallback. The sheet's title and text are the game's (its texts `title` and
// `shareText`). No await before navigator.share: iOS refuses a share sheet
// that is not opened right in the click
async function shareRoomLink(button) {
    const url = document.getElementById('shareLink').value;

    if (navigator.share) {
        try {
            await navigator.share({
                title: getText('title', document.title),
                text: getText('shareText', ''),
                url: url
            });
        } catch (error) {
            // AbortError = the user closed the share sheet - not a failure
            if (error.name !== 'AbortError') {
                copyRoomLink(button);
            }
        }
    } else {
        copyRoomLink(button);
    }
}
