// Who am I? Game - Core Logic Functions
// These functions are extracted for testing

// The players of the room - joining with the browser's secret, a leaver's
// return to the round, newcomers waiting, online and offline, ghosts, the
// room's timers, the limits of a name and an avatar, the room's storage - are
// the kit's, the same in every game (packages/room-kit/shared/players.js);
// so are a room's code and a player's ID (identity.js). This file gives the
// kit what is whoami's (the hooks below) and exports it all on under the
// names it always had
const { generateRoomCode, isValidRoomCode, isValidPlayerId } = require('@parlour-games/room-kit/shared/identity');
const players = require('@parlour-games/room-kit/shared/players');
const { touchGame, MAX_PLAYERS } = players;

// Color palette for character stickers (must match frontend)
const stickerColors = ['red', 'blue', 'purple', 'orange', 'green', 'pink', 'indigo'];

// The character's input limit. The frontend copy lives in public/js/utils.js
// (a browser script cannot require() this file); tests/input-limits.test.js
// fails if the two ever drift apart.
const MAX_CHARACTER_LENGTH = 128;

// Validate and clean a character name. Empty means "remove assignment".
// Returns the cleaned string, or null if the value is not a string at all.
function sanitizeCharacter(character) {
    if (character === null || character === undefined) return '';
    if (typeof character !== 'string') return null;
    // Truncate by character, not by code unit, so an emoji at the limit
    // is never cut in half into an invalid string
    return [...character.trim()].slice(0, MAX_CHARACTER_LENGTH).join('');
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

// What whoami keeps of its players, for the kit's players list
const {
    createGame,
    addPlayerToGame,
    addNewPlayer,
    removePlayerFromGame,
    removeStaleDisconnectedPlayers,
    playersView
} = players.roomPlayers({
    // Who has which character, who has revealed theirs
    fields: () => ({ characters: new Map(), revealedPlayers: new Set() }),

    // A color of their own; a leaver returning to the round gets back theirs
    // if nobody took it
    newPlayer(game, returningSnapshot) {
        const usedColors = new Set(game.players.map(p => p.stickerColor));
        const stickerColor = (returningSnapshot && !usedColors.has(returningSnapshot.stickerColor))
            ? returningSnapshot.stickerColor
            : assignUniqueColor(game.players);
        return { stickerColor };
    },

    // A leaver of the round keeps their color, character and reveal status
    snapshot: (game, player) => ({
        stickerColor: player.stickerColor,
        character: game.characters.get(player.id) || null,
        revealed: game.revealedPlayers.has(player.id)
    }),

    // ...and gets them back on their return
    restore(game, player, snapshot) {
        if (snapshot.character) {
            game.characters.set(player.id, snapshot.character);
        }
        if (snapshot.revealed) {
            game.revealedPlayers.add(player.id);
        }
    },

    // The leaver's own character disappears; characters they assigned to
    // OTHER players stay in place
    forget(game, playerId) {
        game.characters.delete(playerId);
        game.revealedPlayers.delete(playerId);
    },

    view: game => ({
        characters: Object.fromEntries(game.characters),
        revealedPlayers: Array.from(game.revealedPlayers)
    })
});

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

module.exports = {
    generateRoomCode,
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    revealCharacter,
    restartGame,
    removePlayerFromGame,
    requestToJoin: players.requestToJoin,
    admitPlayer,
    declinePlayer,
    withdrawJoinRequest: players.withdrawJoinRequest,
    listJoinRequests: players.listJoinRequests,
    checkPlayerSecret: players.checkPlayerSecret,
    isValidRoomCode,
    assignUniqueColor,
    serializeGame,
    sanitizePlayerName: players.sanitizePlayerName,
    sanitizeAvatar: players.sanitizeAvatar,
    sanitizeCharacter,
    isCustomAvatar: players.isCustomAvatar,
    isValidPlayerId,
    touchGame,
    markPlayerConnected: players.markPlayerConnected,
    markPlayerDisconnected: players.markPlayerDisconnected,
    removeStaleDisconnectedPlayers,
    playersView,
    restartGhostClocks: players.restartGhostClocks,
    roomAlarmTime: players.roomAlarmTime,
    gameToStorage: players.gameToStorage,
    gameFromStorage: players.gameFromStorage,
    ROOM_EMPTY_MS: players.ROOM_EMPTY_MS,
    MAX_DISCONNECTED_MS: players.MAX_DISCONNECTED_MS,
    MAX_NAME_LENGTH: players.MAX_NAME_LENGTH,
    MAX_CHARACTER_LENGTH,
    MAX_CUSTOM_AVATAR_LENGTH: players.MAX_CUSTOM_AVATAR_LENGTH
};
