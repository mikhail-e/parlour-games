// Consequences - the game's rules, with no Cloudflare in them: Jest tests them
// in Node, the Worker bundles them (worker/room.js).

// The players of the room - joining with the browser's secret, a leaver's
// return to the round, newcomers waiting, online and offline, ghosts, the
// room's timers, the limits of a name and an avatar, the room's storage - are
// the kit's, the same in every game (packages/room-kit/shared/players.js).
// This file gives the kit what is the game's (the hooks below)
const players = require('@parlour-games/room-kit/shared/players');

const {
    createGame,
    addPlayerToGame,
    removePlayerFromGame,
    removeStaleDisconnectedPlayers,
    playersView
} = players.roomPlayers({
    // The round: none in the lobby
    fields: () => ({ round: null }),
});

// The game as a player's page gets it (game-state): never a secret's hash
function serializeGame(game) {
    return {
        id: game.id,
        players: game.players,
        state: game.state,
        created: game.created
    };
}

module.exports = {
    createGame,
    addPlayerToGame,
    removePlayerFromGame,
    removeStaleDisconnectedPlayers,
    playersView,
    serializeGame
};
