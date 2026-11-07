// Who and where, on the server: a room's code, a player's ID and the hash of a
// player's secret - the same for every game on the kit. CommonJS: a game's
// rules (Jest in Node) require it, and wrangler bundles it into the Worker
// (Node's crypto through the nodejs_compat flag).
const crypto = require('crypto');

// A player ID is a UUID, and so is a player's secret. The browser's copy lives
// in public/kit/js/app.js (a stored value in another format is replaced
// there); the kit's tests keep the two equal. Keep it on a single line for
// that test.
const PLAYER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidPlayerId(value) {
    return typeof value === 'string' && PLAYER_ID_PATTERN.test(value);
}

// The server keeps a hash of a player's secret, never the secret itself: a
// browser uses one secret in every room, and the room's storage holds the hash
function hashSecret(secret) {
    return crypto.createHash('sha256').update(secret).digest('hex');
}

// Generate short room code (6 characters). The code is all that lets a
// stranger into a room, so it comes from the cryptographic generator:
// Math.random's next numbers can be worked out from the ones it gave before
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[crypto.randomInt(chars.length)];
    }
    return code;
}

// Validate room code format
function isValidRoomCode(code) {
    if (!code || typeof code !== 'string') {
        return false;
    }

    // Must be exactly 6 characters, alphanumeric
    return /^[A-Z0-9]{6}$/.test(code);
}

module.exports = {
    PLAYER_ID_PATTERN,
    isValidPlayerId,
    hashSecret,
    generateRoomCode,
    isValidRoomCode,
};
