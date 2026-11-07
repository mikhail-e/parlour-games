// The players of a room, the same in every game: joining and coming back with
// the browser's secret, a leaver's place in a round, newcomers waiting for a
// round to let them in, online and offline, ghosts, the room's timers, the
// limits of a name and an avatar, and the game as data for the room's storage.
//
// CommonJS, like identity.js: a game's rules require it (Jest tests them in
// Node), and so does its Worker. It works on the game object a room keeps,
// on these fields of it: players, secrets, recentlyLeft, joinRequests, state
// ('waiting' - the lobby, 'started' - a round is on), the players' clocks,
// created. A game keeps its own fields next to them, and says what happens to
// them through the hooks it gives roomPlayers() (below).

const crypto = require('crypto');
const { isValidPlayerId, hashSecret, generateRoomCode } = require('./identity');

const MAX_PLAYERS = 12;

// Input limits. The browser copy lives in the game's page code (a browser
// script cannot require() this file); a test fails if the two ever drift
// apart. Keep each on a single line for that test.
const MAX_NAME_LENGTH = 128;
const MAX_AVATAR_LENGTH = 10; // emoji can be several UTF-16 code units

// A custom avatar is a small photo the player uploaded, carried as a base64
// data URL in the same player.avatar field the emoji uses
const MAX_CUSTOM_AVATAR_LENGTH = 32768; // ~24 KB of image data as base64
const CUSTOM_AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// How long a disconnected player stays in the room before being removed: an
// hour (the owner's decision). A player whose phone sleeps through a break
// stays on everyone's list, their place in the game kept. The price is paid in
// the lobby: a "ghost" - the same person who came back under a NEW player ID
// (cleared localStorage, messenger in-app browser, installed PWA) - stays on
// the list for up to that hour.
const MAX_DISCONNECTED_MS = 60 * 60 * 1000;

// A room no page of a player has open goes this long after the last one
// closed (the owner's decision): a group that took a long break comes back
// to its room
const ROOM_EMPTY_MS = 2 * 60 * 60 * 1000;

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

// Record that something happened in a game
function touchGame(game) {
    game.lastActivityAt = Date.now();
}

// Keep the players list in first-join order, so every page shows the same
// stable order. joinedAt can be a Date or an ISO string (after a JSON round
// trip). The sort is stable (ES2019), so same-millisecond joins keep their order.
function sortPlayersByJoinTime(players) {
    players.sort((a, b) => new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0));
}

// No room for one more: the players and the newcomers waiting to join count
// together. A newcomer's own request does not count against them. A leaver
// returning to the round does not wait in line, so letting a newcomer in
// checks the seats once more
function isRoomFull(game, playerId) {
    const othersWaiting = [...game.joinRequests.keys()].filter(id => id !== playerId).length;
    return game.players.length + othersWaiting >= MAX_PLAYERS;
}

// A newcomer asks to join the started round: their waiting page sends this
// once its socket is up. The request lives until the game ends it, the
// newcomer goes away (withdrawJoinRequest) or the round ends. Whoever may
// simply join - a player of the room, a leaver of this round, anybody when
// the game is in the lobby - is told to join again instead
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

// The newcomer went away (their last waiting page closed). True if there was a request
function withdrawJoinRequest(game, playerId) {
    return game.joinRequests.delete(playerId);
}

// The waiting newcomers, in the order they asked, as the players' pages show
// them - the secret's hash stays on the server
function listJoinRequests(game) {
    return [...game.joinRequests].map(([playerId, request]) => ({ playerId, name: request.name, avatar: request.avatar }));
}

// Is this the secret of a player of this game? join-room asks before a
// socket may act for the player
function checkPlayerSecret(game, playerId, playerSecret) {
    return isValidPlayerId(playerSecret)
        && game.players.some(p => p.id === playerId)
        && game.secrets.get(playerId) === hashSecret(playerSecret);
}

// The room's own game as plain data for its storage, and back. It is the
// room's own data, not data from outside: everything is kept as it is,
// unchecked - recentlyLeft, the hashes of the secrets, the join requests,
// every clock, the game's own fields. Maps, Sets and Dates are tagged, so a
// field added to the game later is kept without a change here
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

// The first page of a player to come back to a room nobody had open: every
// player still offline gets a fresh hour from now. Otherwise the first one
// back after a gap of over an hour would see everybody else removed as
// ghosts - their places in the game gone
function restartGhostClocks(game, now = Date.now()) {
    for (const player of game.players) {
        if (player.isConnected !== true) player.disconnectedAt = now;
    }
}

// When the room's timer is due, or null for none. With no page of a player
// open, nobody is removed: the room itself goes emptyRoomMs after its last
// page closed (emptySince). With a page open, the earliest ghost is due; one
// millisecond after its hour, as removeStaleDisconnectedPlayers removes only
// those offline for MORE than the hour
function roomAlarmTime(game, { playerPagesOpen, emptySince }, { emptyRoomMs = ROOM_EMPTY_MS, ghostMs = MAX_DISCONNECTED_MS } = {}) {
    if (!game) return null;
    if (!playerPagesOpen) return emptySince === null || emptySince === undefined ? null : emptySince + emptyRoomMs;

    const ghostTimes = game.players
        .filter(player => player.isConnected !== true && player.disconnectedAt)
        .map(player => player.disconnectedAt + ghostMs + 1);
    return ghostTimes.length ? Math.min(...ghostTimes) : null;
}

// What a game gives roomPlayers() - each hook may be left out:
// - fields(): the game's own fields of a new game
// - newPlayer(game, snapshot): the game's own fields of a player who comes
//   into the list (snapshot: a leaver's, when they return to the round),
//   asked before the player is in game.players
// - snapshot(game, player): what the game keeps of a player who leaves a
//   started round, for their return; it goes into game.recentlyLeft, saved
//   with the rest
// - restore(game, player, snapshot): the leaver is back in the round
// - forget(game, playerId): the player has left; the game drops what it
//   kept of them (a leaver of a round has their snapshot)
// - view(game): the game's own part of what the pages get with the players
//   list (a join's answer, a removal, playersView)
const NO_HOOKS = {
    fields: () => ({}),
    newPlayer: () => ({}),
    snapshot: () => ({}),
    restore: () => {},
    forget: () => {},
    view: () => ({})
};

// The functions of the players list that need the game's hooks
function roomPlayers(gameHooks = {}) {
    const hooks = { ...NO_HOOKS, ...gameHooks };

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
            ...hooks.fields(),
            state: 'waiting', // waiting (the lobby), started (a round is on)
            recentlyLeft: new Map(), // playerId -> snapshot, lets leavers return to a started round
            secrets: new Map(), // playerId -> hash of the player's secret (checkPlayerSecret); never sent to a page
            // playerId -> { name, avatar, secretHash, requestedAt }: newcomers asking
            // to join the started round (requestToJoin). Kept in the room's storage
            // like the rest, yet a request lives only as long as the newcomer's
            // waiting page
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

        // A player who left THIS started round may come back (the game's part
        // of them was snapshotted on the way out)
        const returningSnapshot = playerId ? game.recentlyLeft.get(playerId) : undefined;

        // A started round takes back its players and its leavers. A newcomer has
        // to ask (requestToJoin) and wait
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
                state: game.state,
                ...hooks.view(game)
            },
            isNewPlayer
        };
    }

    // Put a new player into the list, at their place by join time. A leaver
    // returning to the round (their recentlyLeft snapshot) gets back their
    // place and what the game kept of them
    function addNewPlayer(game, id, name, avatar, returningSnapshot) {
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
            ...hooks.newPlayer(game, returningSnapshot)
        };

        game.players.push(player);
        sortPlayersByJoinTime(game.players);

        // A returning leaver gets back what the game kept of them, so they
        // can continue the round as if they never left
        if (returningSnapshot) {
            hooks.restore(game, player, returningSnapshot);
            game.recentlyLeft.delete(player.id);
        }
        return player;
    }

    // Remove a player from a game voluntarily ("leave game"): their card and
    // whatever the game kept of them go. When the last player leaves, the
    // game itself is deleted.
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
        // they can return to the SAME round as they were.
        // (Waiting-lobby leaves need no snapshot - anyone can join a lobby.)
        if (game.state === 'started') {
            game.recentlyLeft.set(playerId, {
                secretHash: game.secrets.get(playerId), // only the same browser may come back
                ...hooks.snapshot(game, removedPlayer),
                joinedAt: removedPlayer.joinedAt, // restores their list position
                leftAt: Date.now()
            });
        }

        game.players.splice(playerIndex, 1);
        hooks.forget(game, playerId);
        game.secrets.delete(playerId);
        touchGame(game);

        // A game with zero players ceases to exist (the room's storage goes too,
        // so the old link leads home)
        const gameDeleted = game.players.length === 0;
        // Nobody is left in the room for the newcomers waiting to join: their
        // requests end with the room
        const endedJoinRequests = gameDeleted ? [...game.joinRequests.keys()] : [];
        if (gameDeleted) {
            games.delete(gameId);
        }

        return {
            success: true,
            gameId,
            removedPlayer: { id: removedPlayer.id, name: removedPlayer.name },
            players: game.players,
            ...hooks.view(game),
            gameDeleted,
            endedJoinRequests
        };
    }

    // Remove players who have been disconnected for longer than maxDisconnectedMs.
    // Runs from the room's timer. A removed player is not locked out: if they
    // come back with the same ID they simply rejoin (in a started round they are
    // restored from the recentlyLeft snapshot that removePlayerFromGame creates).
    // Returns one removePlayerFromGame result per removed player (plus
    // playerName) so the room can tell the pages of each removal.
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
                const result = removePlayerFromGame(games, gameId, playerId);
                if (result.success) {
                    removals.push({ ...result, playerName: result.removedPlayer.name });
                }
            }
        }

        return removals;
    }

    // The players list as the pages get it with every change of it, with the
    // game's own part
    function playersView(game) {
        return { players: game.players, ...hooks.view(game) };
    }

    return { createGame, addPlayerToGame, addNewPlayer, removePlayerFromGame, removeStaleDisconnectedPlayers, playersView };
}

module.exports = {
    roomPlayers,
    countCharacters,
    sanitizePlayerName,
    sanitizeAvatar,
    isCustomAvatar,
    touchGame,
    sortPlayersByJoinTime,
    isRoomFull,
    requestToJoin,
    withdrawJoinRequest,
    listJoinRequests,
    checkPlayerSecret,
    gameToStorage,
    gameFromStorage,
    markPlayerConnected,
    markPlayerDisconnected,
    restartGhostClocks,
    roomAlarmTime,
    MAX_PLAYERS,
    MAX_NAME_LENGTH,
    MAX_AVATAR_LENGTH,
    MAX_CUSTOM_AVATAR_LENGTH,
    ROOM_EMPTY_MS,
    MAX_DISCONNECTED_MS
};
