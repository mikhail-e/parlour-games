// Keep the screen awake while a round is on. Players look at the others' tags
// to answer their questions, often for minutes without a touch, and the phone
// would go dark at its own idle limit. game-room.js says when: from Start
// until every envelope is open, or until Restart; leaving the page lets go
// by itself.
//
// Silent, as in the owner's other apps: no control, no setting, no line on the
// screen. A browser without the Screen Wake Lock API (Safari before 16.4,
// Firefox before 126) or one that refuses the lock (battery saver) shows
// nothing. The Permissions-Policy (public/_headers) must not forbid screen-wake-lock.
/* exported keepScreenAwake */
/* global debugLog */

let screenAwakeWanted = false;
// The lock the browser gave, and a request in flight: request() answers later,
// and two taps in a row would otherwise ask for a second lock
let screenWakeLock = null;
let screenWakeLockPending = false;

function keepScreenAwake(on) {
    screenAwakeWanted = on;
    if (on) {
        requestScreenWakeLock();
    } else if (screenWakeLock) {
        const lock = screenWakeLock;
        screenWakeLock = null;
        lock.release().catch(() => {});
    }
}

async function requestScreenWakeLock() {
    if (!screenAwakeWanted || screenWakeLock || screenWakeLockPending) return;
    // A hidden page is refused anyway; it asks again on coming back
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;

    screenWakeLockPending = true;
    try {
        const lock = await navigator.wakeLock.request('screen');
        // The browser drops the lock itself when the page leaves the screen or
        // battery saver turns on: forget it then, or coming back would think
        // the lock is still there
        lock.addEventListener('release', () => {
            if (screenWakeLock === lock) screenWakeLock = null;
        });
        // The round may have ended while the request was on its way
        if (screenAwakeWanted) {
            screenWakeLock = lock;
        } else {
            lock.release().catch(() => {});
        }
    } catch (error) {
        // A refusal is normal: battery saver, the page hidden while asking, or a
        // browser that wants a tap first. The next tap asks again
        debugLog('Screen wake lock refused:', error.name, error.message);
    } finally {
        screenWakeLockPending = false;
    }
}

// Coming back to the page and a tap go through the same function. The first
// takes back the lock the browser dropped; the second covers a browser that
// refuses a lock asked for without a tap - for everyone but the player who
// pressed Start, the round begins with the server's message
document.addEventListener('visibilitychange', requestScreenWakeLock);
window.addEventListener('pointerdown', requestScreenWakeLock, { capture: true, passive: true });
window.addEventListener('keydown', requestScreenWakeLock, { capture: true, passive: true });
