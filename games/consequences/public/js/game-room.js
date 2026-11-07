// The game's part of the room page, on the kit's room-page.js: entering the
// room, the waiting screen, leaving and the invitation are the kit's; the game
// draws its field from currentGame. A draft: the players of the lobby.
/* global startRoomPage, currentGame, currentPlayer, renderAvatar, getText */

// The whole list again on every change: the server's list, in its order
function renderPlayers() {
    const list = document.getElementById('playerList');
    list.replaceChildren();
    document.getElementById('playerCount').textContent = currentGame.players.length;

    for (const player of currentGame.players) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.playerId = player.id;

        // Names and avatars are the players' own: text only, never HTML
        const avatar = document.createElement('div');
        avatar.className = 'player-avatar';
        renderAvatar(avatar, player.avatar);
        card.appendChild(avatar);

        const name = document.createElement('div');
        name.className = 'player-name';
        name.textContent = player.name;
        if (currentPlayer && player.id === currentPlayer.id) {
            name.appendChild(document.createTextNode(` (${getText('you', 'You')})`));
        }
        card.appendChild(name);

        list.appendChild(card);
    }
}

startRoomPage({ render: renderPlayers });
