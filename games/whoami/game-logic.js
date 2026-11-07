// Who am I? Game - Core Logic Functions
// These functions are extracted for testing

const crypto = require('crypto');
// A room's code, a player's ID and the hash of their secret are the kit's,
// the same in every game (packages/room-kit/shared/identity.js)
const { isValidPlayerId, hashSecret, generateRoomCode, isValidRoomCode } = require('@parlour-games/room-kit/shared/identity');

// Color palette for character stickers (must match frontend)
const stickerColors = ['red', 'blue', 'purple', 'orange', 'green', 'pink', 'indigo'];

const MAX_PLAYERS = 12;

// Input limits. The frontend copy lives in public/js/utils.js (a browser
// script cannot require() this file); tests/input-limits.test.js fails if
// the two ever drift apart.
const MAX_NAME_LENGTH = 128;
const MAX_AVATAR_LENGTH = 10; // emoji can be several UTF-16 code units
const MAX_CHARACTER_LENGTH = 128;

// A custom avatar is a small photo the player uploaded, carried as a base64
// data URL in the same player.avatar field the emoji uses. The frontend copy
// of these two values lives in public/js/utils.js; tests/input-limits.test.js
// fails if they drift apart. Keep each on a single line for the sync tests.
const MAX_CUSTOM_AVATAR_LENGTH = 32768; // ~24 KB of image data as base64
const CUSTOM_AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// Count characters the way a person would: an emoji is one character,
// not the two UTF-16 code units JavaScript's .length reports.
function countCharacters(text) {
    return [...text].length;
}

// Validate and clean a player name. Returns the cleaned name or null if invalid.
function sanitizePlayerName(name) {
    if (typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (trimmed.length === 0 || countCharacters(trimmed) > MAX_NAME_LENGTH) return null;
    return trimmed;
}

// True if the value is a strictly valid custom-avatar data URL: only the three
// safe raster image MIME types, only base64 characters, and small enough.
// Anything else (javascript:, data:text/html, embedded whitespace) fails.
function isCustomAvatar(value) {
    return typeof value === 'string'
        && value.length <= MAX_CUSTOM_AVATAR_LENGTH
        && CUSTOM_AVATAR_PATTERN.test(value);
}

// Validate and clean an avatar. Returns the cleaned avatar or null if invalid.
// Accepts either an emoji (short string) or an uploaded image (data URL).
function sanitizeAvatar(avatar) {
    if (typeof avatar !== 'string') return null;
    const trimmed = avatar.trim();
    if (trimmed.length === 0) return null;
    if (isCustomAvatar(trimmed)) return trimmed;
    if (trimmed.length > MAX_AVATAR_LENGTH) return null;
    return trimmed;
}

// Validate and clean a character name. Empty means "remove assignment".
// Returns the cleaned string, or null if the value is not a string at all.
function sanitizeCharacter(character) {
    if (character === null || character === undefined) return '';
    if (typeof character !== 'string') return null;
    // Truncate by character, not by code unit, so an emoji at the limit
    // is never cut in half into an invalid string
    return [...character.trim()].slice(0, MAX_CHARACTER_LENGTH).join('');
}

// Record that something happened in a game (used for inactive-game cleanup)
function touchGame(game) {
    game.lastActivityAt = Date.now();
}

// Assign unique color to new player
function assignUniqueColor(existingPlayers) {
    // Get colors already used by existing players
    const usedColors = new Set(existingPlayers.map(player => player.stickerColor).filter(Boolean));

    // Find first available color
    for (const color of stickerColors) {
        if (!usedColors.has(color)) {
            return color;
        }
    }

    // If all colors are used (more than 7 players), cycle through colors
    // Use modulo to ensure we don't go out of bounds
    return stickerColors[existingPlayers.length % stickerColors.length];
}

// Keep the players list in first-join order, so every client shows the same
// stable order (easy to follow whose turn it is). joinedAt can be a Date or
// an ISO string (after a JSON round trip).
// The sort is stable (ES2019), so same-millisecond joins keep their order.
function sortPlayersByJoinTime(players) {
    players.sort((a, b) => new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0));
}

// Create a new game. A room code given is taken as it is: the caller has
// checked it is valid and free (a room of its own creates its game with its code)
function createGame(games, roomCode = null) {
    let gameId = roomCode;
    // Ensure unique code
    while (!gameId || games.has(gameId)) {
        gameId = generateRoomCode();
    }

    const game = {
        id: gameId,
        players: [],
        characters: new Map(),
        state: 'waiting', // waiting, started, ended
        revealedPlayers: new Set(), // Track who has revealed their character
        recentlyLeft: new Map(), // playerId -> snapshot, lets leavers return to a started game
        secrets: new Map(), // playerId -> hash of the player's secret (checkPlayerSecret); never sent to a page
        // playerId -> { name, avatar, secretHash, requestedAt }: newcomers asking
        // to join the started round (requestToJoin). Kept in the room's storage
        // like the rest, yet a request lives only as long as the newcomer's
        // waiting page (worker/room.js)
        joinRequests: new Map(),
        created: new Date()
    };
    touchGame(game);

    games.set(gameId, game);
    return { gameId, success: true };
}

// Add or reconnect a player to a game.
//
// A player ID is public: every page sees the players list. What proves that a
// browser IS a player is the secret it sends along (PLAYER_SECRET, the kit's app.js),
// which the server never gives to anybody. The first join with a secret
// records it; after that, joining as this player needs the same secret. The
// room sends one with every join; a call without one checks nothing that is
// not recorded
function addPlayerToGame(games, gameId, playerName, avatar, playerId = null, playerSecret = null) {
    if (!games.has(gameId)) {
        return { success: false, error: 'Game not found' };
    }

    // Validate inputs before touching game state
    const cleanName = sanitizePlayerName(playerName);
    if (!cleanName) {
        return { success: false, error: 'Invalid player name' };
    }
    const cleanAvatar = sanitizeAvatar(avatar);
    if (!cleanAvatar) {
        return { success: false, error: 'Invalid avatar' };
    }

    const game = games.get(gameId);

    // Check if player is already in the game (reconnection)
    // Only match by ID - never by name to support duplicate names
    const existingPlayer = playerId
        ? game.players.find(p => p.id === playerId)
        : null;

    // A player who left THIS started round may come back (their character,
    // reveal status and color were snapshotted on the way out)
    const returningSnapshot = playerId ? game.recentlyLeft.get(playerId) : undefined;

    // A started round takes back its players and its leavers. A newcomer has
    // to ask (requestToJoin) and wait for a player to let them in
    if (game.state === 'started' && !existingPlayer && !returningSnapshot) {
        if (!isValidPlayerId(playerId)) {
            return { success: false, error: 'Game has already started' };
        }
        if (isRoomFull(game, playerId)) {
            return { success: false, error: 'Game is full' };
        }
        return { success: false, waitingForApproval: true };
    }

    // Somebody else's browser cannot take this player's place
    const secretHash = playerSecret ? hashSecret(playerSecret) : null;
    const recordedHash = existingPlayer ? game.secrets.get(playerId) : returningSnapshot?.secretHash;
    if (recordedHash && secretHash !== recordedHash) {
        return { success: false, error: 'This player is playing in another browser' };
    }

    // Check if game is full (allow existing players)
    if (game.players.length >= MAX_PLAYERS && !existingPlayer) {
        return { success: false, error: 'Game is full' };
    }

    let player;
    let isNewPlayer = false;

    if (existingPlayer) {
        // Player coming back (a reload, a reconnect): their page is about
        // to connect. One who is offline gets a fresh ghost clock meanwhile
        existingPlayer.avatar = cleanAvatar; // Allow avatar update
        if (!existingPlayer.isConnected) existingPlayer.disconnectedAt = Date.now();
        player = existingPlayer;
    } else {
        // New player joining - use provided playerId if valid, otherwise generate one
        const id = isValidPlayerId(playerId) ? playerId : crypto.randomUUID();
        player = addNewPlayer(game, id, cleanName, cleanAvatar, returningSnapshot);
        isNewPlayer = true;
    }
    if (secretHash) game.secrets.set(player.id, secretHash);
    touchGame(game);

    return {
        success: true,
        player,
        game: {
            id: game.id,
            players: game.players,
            characters: Object.fromEntries(game.characters),
            state: game.state,
            revealedPlayers: Array.from(game.revealedPlayers)
        },
        isNewPlayer
    };
}

// Put a new player into the list: a color of their own, their place by join
// time. A leaver returning to the round (their recentlyLeft snapshot) gets
// back their color if nobody took it, their place, character and reveal
function addNewPlayer(game, id, name, avatar, returningSnapshot) {
    const usedColors = new Set(game.players.map(p => p.stickerColor));
    const stickerColor = (returningSnapshot && !usedColors.has(returningSnapshot.stickerColor))
        ? returningSnapshot.stickerColor
        : assignUniqueColor(game.players);

    const player = {
        id,
        name,
        avatar,
        // Online only once their page connects (markPlayerConnected). A
        // player whose page never opens the room - a closed tab, a lost
        // network - is removed as a ghost instead of staying forever
        isConnected: false,
        disconnectedAt: Date.now(),
        // A returning leaver keeps their original join time, which puts
        // them back at their old position in the list (see sort below)
        joinedAt: (returningSnapshot && returningSnapshot.joinedAt) || new Date(),
        stickerColor
    };

    game.players.push(player);
    sortPlayersByJoinTime(game.players);

    // A returning leaver gets their character and reveal status back,
    // so they can continue the round as if they never left
    if (returningSnapshot) {
        if (returningSnapshot.character) {
            game.characters.set(player.id, returningSnapshot.character);
        }
        if (returningSnapshot.revealed) {
            game.revealedPlayers.add(player.id);
        }
        game.recentlyLeft.delete(player.id);
    }
    return player;
}

// No room for one more: the players and the newcomers waiting to join count
// together. A newcomer's own request does not count against them. A leaver
// returning to the round does not wait in line, so admitPlayer checks the
// seats once more
function isRoomFull(game, playerId) {
    const othersWaiting = [...game.joinRequests.keys()].filter(id => id !== playerId).length;
    return game.players.length + othersWaiting >= MAX_PLAYERS;
}

// A newcomer asks to join the started round: their waiting page sends this
// once its socket is up. The request lives until a player answers it, the
// newcomer goes away (withdrawJoinRequest) or the round ends (restartGame).
// Whoever may simply join - a player of the room, a leaver of this round,
// anybody when the game is in the lobby - is told to join again instead
function requestToJoin(games, gameId, playerName, avatar, playerId, playerSecret) {
    const game = games.get(gameId);
    if (!game) {
        return { success: false, error: 'Game not found' };
    }
    if (!isValidPlayerId(playerId) || !isValidPlayerId(playerSecret)) {
        return { success: false, error: 'Missing required fields' };
    }
    const name = sanitizePlayerName(playerName);
    if (!name) {
        return { success: false, error: 'Invalid player name' };
    }
    const cleanAvatar = sanitizeAvatar(avatar);
    if (!cleanAvatar) {
        return { success: false, error: 'Invalid avatar' };
    }

    if (game.state !== 'started' || game.players.some(p => p.id === playerId) || game.recentlyLeft.has(playerId)) {
        return { success: false, retryJoin: true };
    }

    // One request per browser: a second tab of it waits on the same one
    const secretHash = hashSecret(playerSecret);
    const existing = game.joinRequests.get(playerId);
    if (existing && existing.secretHash !== secretHash) {
        return { success: false, error: 'This player is playing in another browser' };
    }
    if (!existing) {
        if (isRoomFull(game, playerId)) {
            return { success: false, error: 'Game is full' };
        }
        game.joinRequests.set(playerId, { name, avatar: cleanAvatar, secretHash, requestedAt: Date.now() });
        touchGame(game);
    }

    const request = game.joinRequests.get(playerId);
    return { success: true, request: { playerId, name: request.name, avatar: request.avatar } };
}

// A player answers a newcomer's request. Any player of the room may, and the
// first answer decides: a request already answered - or withdrawn, or ended
// by a restart - is gone, and a second answer is refused
function findJoinRequest(games, gameId, playerId, answeredBy) {
    const game = games.get(gameId);
    if (!game) {
        return { error: 'Game not found' };
    }
    if (!game.players.some(p => p.id === answeredBy)) {
        return { error: 'Player not found in game' };
    }
    const request = game.joinRequests.get(playerId);
    if (!request) {
        return { error: 'This request has already been answered' };
    }
    return { game, request };
}

// Let the newcomer in: last in the list, offline until their page joins the
// room, with their browser's secret recorded. No character yet - a player
// gives one (assignCharacter lets a player without one get it after the start)
function admitPlayer(games, gameId, playerId, admittedBy) {
    const { game, request, error } = findJoinRequest(games, gameId, playerId, admittedBy);
    if (error) {
        return { success: false, error };
    }
    // A leaver returning to the round may have taken the last seat: the
    // request stays, and the newcomer gets in once somebody leaves
    if (game.players.length >= MAX_PLAYERS) {
        return { success: false, error: 'Game is full' };
    }

    const player = addNewPlayer(game, playerId, request.name, request.avatar, null);
    game.secrets.set(playerId, request.secretHash);
    game.joinRequests.delete(playerId);
    touchGame(game);

    return {
        success: true,
        player,
        players: game.players,
        characters: Object.fromEntries(game.characters),
        revealedPlayers: Array.from(game.revealedPlayers)
    };
}

// Turn the newcomer away. They may ask again
function declinePlayer(games, gameId, playerId, declinedBy) {
    const { game, request, error } = findJoinRequest(games, gameId, playerId, declinedBy);
    if (error) {
        return { success: false, error };
    }
    game.joinRequests.delete(playerId);
    touchGame(game);
    return { success: true, playerName: request.name };
}

// The newcomer went away (their last waiting page closed). True if there was a request
function withdrawJoinRequest(game, playerId) {
    return game.joinRequests.delete(playerId);
}

// The waiting newcomers, in the order they asked, as the players' pages show
// them - the secret's hash stays on the server
function listJoinRequests(game) {
    return [...game.joinRequests].map(([playerId, request]) => ({ playerId, name: request.name, avatar: request.avatar }));
}

// Assign a character to a player
function assignCharacter(games, gameId, playerId, character, assignedBy) {
    if (!games.has(gameId)) {
        return { success: false, error: 'Game not found' };
    }
    
    const game = games.get(gameId);
    
    // Validate that the player exists in the game
    const player = game.players.find(p => p.id === playerId);
    if (!player) {
        return { success: false, error: 'Player not found in game' };
    }
    
    // Validate that the assigner exists in the game
    const assigner = game.players.find(p => p.id === assignedBy);
    if (!assigner) {
        return { success: false, error: 'Assigner not found in game' };
    }
    
    // Restriction: Players cannot assign characters to themselves
    if (playerId === assignedBy) {
        return { success: false, error: 'Cannot assign character to yourself' };
    }

    // Validate and clean the character text (trim + length limit)
    const cleanCharacter = sanitizeCharacter(character);
    if (cleanCharacter === null) {
        return { success: false, error: 'Invalid character' };
    }

    // Characters are locked once the game has started (client hides editing,
    // but the server must enforce it too - e.g. a blur event can arrive late).
    // The one exception: a newcomer let into the round has none yet, and a
    // player gives them one - after that it is locked like everybody's
    if (game.state !== 'waiting' && (cleanCharacter === '' || game.characters.has(playerId))) {
        return { success: false, error: 'Cannot change characters after the game has started' };
    }

    // Assign the character or remove it if empty
    if (cleanCharacter !== '') {
        game.characters.set(playerId, {
            character: cleanCharacter,
            assignedBy: assignedBy,
            assignedAt: new Date()
        });
    } else {
        // Remove character assignment if empty or whitespace-only
        game.characters.delete(playerId);
    }
    touchGame(game);

    return {
        success: true,
        playerId,
        character: cleanCharacter, // Empty string for removed characters
        assignedBy,
        characters: Object.fromEntries(game.characters)
    };
}

// Start a game
function startGame(games, gameId, playerId) {
    if (!games.has(gameId)) {
        return { success: false, error: 'Game not found' };
    }
    
    const game = games.get(gameId);
    
    // Validate that the player exists in the game
    const player = game.players.find(p => p.id === playerId);
    if (!player) {
        return { success: false, error: 'Player not found in game' };
    }
    
    // Check if game is already started
    if (game.state === 'started') {
        return { success: false, error: 'Game has already started' };
    }
    
    // Check if we have at least 2 players
    if (game.players.length < 2) {
        return { success: false, error: 'Need at least 2 players to start' };
    }

    // Every player needs a character. The Start button waits for that too,
    // but a player can join at the very moment it is pressed
    if (game.players.some(p => !game.characters.has(p.id))) {
        return { success: false, error: 'Every player needs a character to start' };
    }

    // Start the game
    game.state = 'started';
    game.startedAt = new Date();
    touchGame(game);

    return { 
        success: true,
        gameId,
        state: game.state,
        startedBy: playerId
    };
}

// Reveal character for a player
function revealCharacter(games, gameId, playerId) {
    if (!games.has(gameId)) {
        return { success: false, error: 'Game not found' };
    }
    
    const game = games.get(gameId);
    
    // Validate that the player exists in the game
    const player = game.players.find(p => p.id === playerId);
    if (!player) {
        return { success: false, error: 'Player not found in game' };
    }
    
    // Check if game has started
    if (game.state !== 'started') {
        return { success: false, error: 'Game has not started yet' };
    }
    
    // Check if player has a character assigned
    if (!game.characters.has(playerId)) {
        return { success: false, error: 'No character assigned to this player' };
    }
    
    // Add player to revealed set
    game.revealedPlayers.add(playerId);
    touchGame(game);

    const characterData = game.characters.get(playerId);
    
    return {
        success: true,
        playerId,
        character: characterData.character,
        revealedPlayers: Array.from(game.revealedPlayers),
        revealedPlayer: {
            id: playerId,
            name: player.name,
            character: characterData.character
        }
    };
}

// Restart a game (reset to waiting state)
function restartGame(games, gameId, playerId) {
    if (!games.has(gameId)) {
        return { success: false, error: 'Game not found' };
    }
    
    const game = games.get(gameId);
    
    // Validate that the player exists in the game
    const player = game.players.find(p => p.id === playerId);
    if (!player) {
        return { success: false, error: 'Player not found in game' };
    }
    
    // Reset game state
    game.state = 'waiting';
    game.revealedPlayers.clear();
    game.characters.clear(); // Clear all character assignments
    game.recentlyLeft.clear(); // the old round's leavers get no special treatment
    // The lobby is open to everybody: the newcomers waiting to join the old
    // round just join (worker/room.js tells their pages to try again)
    const endedJoinRequests = [...game.joinRequests.keys()];
    game.joinRequests.clear();
    game.restartedAt = new Date();
    touchGame(game);

    // Clear all character assignments - players start fresh
    // This makes restart more visually obvious
    
    return {
        success: true,
        gameId,
        state: game.state,
        restartedBy: playerId,
        revealedPlayers: Array.from(game.revealedPlayers),
        characters: Object.fromEntries(game.characters), // Empty object now
        endedJoinRequests
    };
}

// Remove a player from a game voluntarily ("leave game").
// Deletes the player's card, their character and their reveal status.
// Characters they assigned to OTHER players stay in place.
// When the last player leaves, the game itself is deleted.
function removePlayerFromGame(games, gameId, playerId) {
    if (!games.has(gameId)) {
        return { success: false, error: 'Game not found' };
    }

    const game = games.get(gameId);

    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
        return { success: false, error: 'Player not found in game' };
    }

    const removedPlayer = game.players[playerIndex];

    // Leaving a started round is undoable: snapshot what the player had so
    // they can return to the SAME round with their character and status.
    // (Waiting-lobby leaves need no snapshot - anyone can join a lobby.)
    if (game.state === 'started') {
        game.recentlyLeft.set(playerId, {
            secretHash: game.secrets.get(playerId), // only the same browser may come back
            stickerColor: removedPlayer.stickerColor,
            character: game.characters.get(playerId) || null,
            revealed: game.revealedPlayers.has(playerId),
            joinedAt: removedPlayer.joinedAt, // restores their list position
            leftAt: Date.now()
        });
    }

    game.players.splice(playerIndex, 1);
    game.characters.delete(playerId);      // the leaver's own character disappears
    game.revealedPlayers.delete(playerId);
    game.secrets.delete(playerId);
    touchGame(game);

    // A game with zero players ceases to exist (the room's storage goes too,
    // so the old link leads home)
    const gameDeleted = game.players.length === 0;
    // Nobody is left to answer the newcomers waiting to join: their requests
    // end with the room (worker/room.js tells their pages)
    const endedJoinRequests = gameDeleted ? [...game.joinRequests.keys()] : [];
    if (gameDeleted) {
        games.delete(gameId);
    }

    return {
        success: true,
        gameId,
        removedPlayer: { id: removedPlayer.id, name: removedPlayer.name },
        players: game.players,
        characters: Object.fromEntries(game.characters),
        revealedPlayers: Array.from(game.revealedPlayers),
        gameDeleted,
        endedJoinRequests
    };
}

// Is this the secret of a player of this game? join-room asks before a
// socket may act for the player
function checkPlayerSecret(game, playerId, playerSecret) {
    return isValidPlayerId(playerSecret)
        && game.players.some(p => p.id === playerId)
        && game.secrets.get(playerId) === hashSecret(playerSecret);
}

// A game as plain data, ready for JSON: what a player's page gets when its
// socket joins the room (Maps and Sets become objects and arrays). The hashes
// of the players' secrets never go to a page
function serializeGame(game) {
    return {
        id: game.id,
        players: game.players,
        characters: Object.fromEntries(game.characters),
        state: game.state,
        revealedPlayers: Array.from(game.revealedPlayers),
        created: game.created
    };
}

// The room's own game as plain data for its storage (worker/room.js), and
// back. It is the room's own data, not data from outside: everything is
// kept as it is, unchecked - recentlyLeft, the hashes of the secrets, the join
// requests, every clock. Maps, Sets and Dates are tagged, so a field added to
// the game later is kept without a change here
function gameToStorage(game) {
    return JSON.parse(JSON.stringify(game, function tag(key, value) {
        const original = this[key]; // a Date has already been turned into a string in value
        if (original instanceof Date) return { $date: original.toISOString() };
        if (value instanceof Map) return { $map: [...value] };
        if (value instanceof Set) return { $set: [...value] };
        return value;
    }));
}

function gameFromStorage(data) {
    if (Array.isArray(data)) return data.map(gameFromStorage);
    if (!data || typeof data !== 'object') return data;
    if ('$date' in data) return new Date(data.$date);
    if ('$map' in data) return new Map(gameFromStorage(data.$map));
    if ('$set' in data) return new Set(gameFromStorage(data.$set));
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, gameFromStorage(value)]));
}

// A page of this player has connected to the room: they are online.
// Returns the player, or null when they are not in the game
function markPlayerConnected(game, playerId) {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return null;
    player.isConnected = true;
    delete player.disconnectedAt;
    touchGame(game);
    return player;
}

// The player's last page went away: they stay in the room, offline, and may
// come back (removeStaleDisconnectedPlayers removes a ghost later).
// Returns the player, or null when they are not in the game
function markPlayerDisconnected(game, playerId) {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return null;
    player.isConnected = false;
    player.disconnectedAt = Date.now();
    touchGame(game);
    return player;
}

// How long a disconnected player stays in the room before being removed: an
// hour (the owner's decision). A player whose phone sleeps through a break
// stays on everyone's list, card and character in place. The price is paid in
// the lobby: a "ghost" - the same person who came back under a NEW player ID
// (cleared localStorage, messenger in-app browser, installed PWA) - keeps Start
// Game disabled for up to that hour, unless someone gives it a character.
const MAX_DISCONNECTED_MS = 60 * 60 * 1000;

// Remove players who have been disconnected for longer than maxDisconnectedMs.
// Runs from the room's timer. A removed player is not locked out: if they
// come back with the same ID they simply rejoin (in a started round they are
// restored from the recentlyLeft snapshot that removePlayerFromGame creates).
// Returns one removePlayerFromGame result per removed player (plus gameId and
// playerName) so the server can broadcast each removal as 'player-left'.
function removeStaleDisconnectedPlayers(games, maxDisconnectedMs = MAX_DISCONNECTED_MS) {
    const now = Date.now();
    const removals = [];

    for (const [gameId, game] of games.entries()) {
        // Collect first, remove after - removing while looping over the
        // players array would skip entries
        const stalePlayerIds = [];
        for (const player of game.players) {
            if (player.isConnected) continue;

            if (!player.disconnectedAt) {
                // Every way of going offline sets the timestamp; should one be
                // missing anyway, start the clock now rather than remove the
                // player at once - they go on a LATER pass if nobody comes back
                player.disconnectedAt = now;
            } else if (now - player.disconnectedAt > maxDisconnectedMs) {
                stalePlayerIds.push(player.id);
            }
        }

        for (const playerId of stalePlayerIds) {
            // result already carries gameId, players, characters,
            // revealedPlayers and gameDeleted - everything a broadcast needs
            const result = removePlayerFromGame(games, gameId, playerId);
            if (result.success) {
                removals.push({ ...result, playerName: result.removedPlayer.name });
            }
        }
    }

    return removals;
}

// A room no page of a player has open goes this long after the last one
// closed (the owner's decision): a group that took a long break comes back
// to its room
const ROOM_EMPTY_MS = 2 * 60 * 60 * 1000;

// The first page of a player to come back to a room nobody had open: every
// player still offline gets a fresh hour from now. Otherwise the first one
// back after a gap of over an hour would see everybody else removed as
// ghosts - their characters and places in the list gone
function restartGhostClocks(game, now = Date.now()) {
    for (const player of game.players) {
        if (player.isConnected !== true) player.disconnectedAt = now;
    }
}

// When the room's timer is due (worker/room.js), or null for none. With no
// page of a player open, nobody is removed: the room itself goes emptyRoomMs
// after its last page closed (emptySince). With a page open, the earliest
// ghost is due; one millisecond after its hour, as removeStaleDisconnectedPlayers
// removes only those offline for MORE than the hour
function roomAlarmTime(game, { playerPagesOpen, emptySince }, { emptyRoomMs = ROOM_EMPTY_MS, ghostMs = MAX_DISCONNECTED_MS } = {}) {
    if (!game) return null;
    if (!playerPagesOpen) return emptySince === null || emptySince === undefined ? null : emptySince + emptyRoomMs;

    const ghostTimes = game.players
        .filter(player => player.isConnected !== true && player.disconnectedAt)
        .map(player => player.disconnectedAt + ghostMs + 1);
    return ghostTimes.length ? Math.min(...ghostTimes) : null;
}

module.exports = {
    generateRoomCode,
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    revealCharacter,
    restartGame,
    removePlayerFromGame,
    requestToJoin,
    admitPlayer,
    declinePlayer,
    withdrawJoinRequest,
    listJoinRequests,
    checkPlayerSecret,
    isValidRoomCode,
    assignUniqueColor,
    serializeGame,
    sanitizePlayerName,
    sanitizeAvatar,
    sanitizeCharacter,
    isCustomAvatar,
    isValidPlayerId,
    touchGame,
    markPlayerConnected,
    markPlayerDisconnected,
    removeStaleDisconnectedPlayers,
    restartGhostClocks,
    roomAlarmTime,
    gameToStorage,
    gameFromStorage,
    ROOM_EMPTY_MS,
    MAX_DISCONNECTED_MS,
    MAX_NAME_LENGTH,
    MAX_CHARACTER_LENGTH,
    MAX_CUSTOM_AVATAR_LENGTH
};