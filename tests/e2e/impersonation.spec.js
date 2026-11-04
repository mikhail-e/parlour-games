// A player who opens the browser's console cannot act for anybody: player IDs
// are on every page (the cards' data-player-id), but the server takes a move
// only from a socket that proved with the player's secret who it is
const { test, expect, playerCard, startedGame, waitForPlayers } = require('./helpers');

/* global RoomSocket -- the room page's socket class (room-socket.js), inside page.evaluate() */

test('a socket without a secret can neither act for players nor watch the room', async ({ newPlayer }) => {
    const { players: { Alice: alice, Bob: bob, Mallory: mallory } } =
        await startedGame(newPlayer, ['Alice', 'Bob', 'Mallory']);

    // Mallory types this into her console: a socket of her own, every player's
    // ID from the cards, and every move that could hurt them
    const { errors, gameStates } = await mallory.page.evaluate(async () => {
        const ids = [...document.querySelectorAll('.player-card[data-player-id]')].map(card => card.dataset.playerId);
        const gameId = location.pathname.split('/').pop();
        const socket = new RoomSocket(`/ws/${gameId}`);
        const errors = [];
        let gameStates = 0;
        socket.on('error', error => errors.push(error));
        socket.on('game-state', () => { gameStates += 1; });
        await new Promise(resolve => {
            socket.on('connect', resolve);
        });

        for (const playerId of ids) {
            socket.emit('join-room', { gameId, playerId });
            socket.emit('reveal-character', { gameId, playerId });
            socket.emit('restart-game', { gameId, playerId });
            socket.emit('leave-game', { gameId, playerId });
        }
        // The server answers each move with an error; once all are in, the
        // join-room messages before them have been handled too
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (errors.length >= ids.length * 3) {
                    clearInterval(check);
                    resolve();
                }
            }, 50);
        });
        socket.disconnect();
        return { errors, gameStates };
    });

    expect(new Set(errors)).toEqual(new Set(['You are not in this game']));
    expect(gameStates).toBe(0);
    // Nobody left, nothing was revealed, the round goes on
    await waitForPlayers(alice.page, 3);
    await expect(playerCard(alice.page, 'Alice').locator('.character-sticker.mystery')).toBeVisible();
    await expect(playerCard(bob.page, 'Bob').locator('.character-sticker.mystery')).toBeVisible();
    await expect(alice.page.locator('#restartGame')).toBeVisible();
});
