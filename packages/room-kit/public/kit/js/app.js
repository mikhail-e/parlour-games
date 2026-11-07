// The kit's base of a game's pages: debug output, storage with JSON, the
// player's ID and secret, the version at the bottom of the page. A classic
// <script>: a top-level name here is visible to the scripts loaded after it
// ("exported" lists what they use). The game's config.js comes first and names
// the game's keys in localStorage (APP_STORAGE_PREFIX).
/* exported debugLog, AppStorage, PLAYER_ID, PLAYER_SECRET */
/* global APP_STORAGE_PREFIX */

// Debug output: printed only while debugging is on, so players' consoles stay
// quiet. Turn it on in the browser console, then reload the page:
//   localStorage.setItem('<the game's prefix>-debug', 'on')   (whoami: 'whoami-debug')
// console.warn and console.error are for real problems and always print.
let DEBUG_LOG_ENABLED = false;
try {
    DEBUG_LOG_ENABLED = localStorage.getItem(`${APP_STORAGE_PREFIX}-debug`) === 'on';
} catch {
    // The browser blocks site data: no debugging, and the page script goes on
}

function debugLog(...args) {
    if (DEBUG_LOG_ENABLED) {
        // eslint-disable-next-line no-console -- the one place the pages print debug output
        console.log(...args);
    }
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

// The server accepts a player ID only in UUID format (same pattern as the
// kit's shared/identity.js, the kit's tests keep them equal) and silently
// generates a fresh one otherwise - so a stored ID in any other format (e.g.
// the pre-2025 "player_..." format) would make the server create a NEW player
// on every page load: instant duplicates. A player's secret has the same shape.
const PLAYER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Get or create unique player ID for this browser (ONE per browser).
// A stored ID that the server would reject is replaced with a valid one. The
// key is `playerId` in every game: each game has an address of its own, and
// so its own localStorage
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
    const key = `${APP_STORAGE_PREFIX}-player-secret`;
    let secret = localStorage.getItem(key);
    if (!secret || !PLAYER_ID_PATTERN.test(secret)) {
        secret = generatePlayerId();
        localStorage.setItem(key, secret);
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
