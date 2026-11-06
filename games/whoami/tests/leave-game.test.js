// Tests for voluntarily leaving a game (removePlayerFromGame).
// A leaver's card, character and reveal status disappear; characters they
// assigned to OTHER players stay; the last player leaving deletes the game.

const {
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    revealCharacter,
    restartGame,
    removePlayerFromGame
} = require('../game-logic');

describe('Player Leaving', () => {
    let games, gameId, alice, bob;

    beforeEach(() => {
        games = new Map();
        gameId = createGame(games).gameId;
        alice = addPlayerToGame(games, gameId, 'Alice', '😀').player;
        bob = addPlayerToGame(games, gameId, 'Bob', '😎').player;
    });

    test('removes the player from the game', () => {
        const result = removePlayerFromGame(games, gameId, alice.id);

        expect(result.success).toBe(true);
        expect(result.removedPlayer).toEqual({ id: alice.id, name: 'Alice' });

        const game = games.get(gameId);
        expect(game.players).toHaveLength(1);
        expect(game.players[0].id).toBe(bob.id);
    });

    test('deletes the leaver\'s own character and reveal status', () => {
        assignCharacter(games, gameId, alice.id, 'Batman', bob.id);
        assignCharacter(games, gameId, bob.id, 'Superman', alice.id);
        startGame(games, gameId, alice.id);
        revealCharacter(games, gameId, alice.id);

        removePlayerFromGame(games, gameId, alice.id);

        const game = games.get(gameId);
        expect(game.characters.has(alice.id)).toBe(false);
        expect(game.revealedPlayers.has(alice.id)).toBe(false);
    });

    test('keeps characters the leaver assigned to other players', () => {
        // Alice assigned Bob's character; Alice leaves; Bob keeps playing
        assignCharacter(games, gameId, bob.id, 'Superman', alice.id);

        removePlayerFromGame(games, gameId, alice.id);

        const game = games.get(gameId);
        expect(game.characters.get(bob.id).character).toBe('Superman');
    });

    test('works in the waiting state', () => {
        const result = removePlayerFromGame(games, gameId, alice.id);
        expect(result.success).toBe(true);
        expect(games.get(gameId).state).toBe('waiting');
    });

    test('works mid-game: remaining players keep playing', () => {
        const charlie = addPlayerToGame(games, gameId, 'Charlie', '🐱').player;
        assignCharacter(games, gameId, alice.id, 'Batman', bob.id);
        assignCharacter(games, gameId, bob.id, 'Superman', alice.id);
        assignCharacter(games, gameId, charlie.id, 'Joker', alice.id);
        startGame(games, gameId, alice.id);

        const result = removePlayerFromGame(games, gameId, alice.id);

        expect(result.success).toBe(true);
        const game = games.get(gameId);
        expect(game.state).toBe('started');
        expect(game.players).toHaveLength(2);
        expect(game.characters.get(bob.id).character).toBe('Superman');
        expect(game.characters.get(charlie.id).character).toBe('Joker');
    });

    test('rejects an unknown game', () => {
        const result = removePlayerFromGame(games, 'NOSUCH', alice.id);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game not found');
    });

    test('rejects an unknown player', () => {
        const result = removePlayerFromGame(games, gameId, 'not-a-player');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Player not found in game');

        // Nobody was removed by mistake
        expect(games.get(gameId).players).toHaveLength(2);
    });

    test('frees the leaver\'s sticker color for the next player', () => {
        const aliceColor = alice.stickerColor; // first color from the palette

        removePlayerFromGame(games, gameId, alice.id);
        const charlie = addPlayerToGame(games, gameId, 'Charlie', '🐱').player;

        expect(charlie.stickerColor).toBe(aliceColor);
    });

    test('deletes the game when the last player leaves', () => {
        const first = removePlayerFromGame(games, gameId, alice.id);
        expect(first.gameDeleted).toBe(false);
        expect(games.has(gameId)).toBe(true);

        const last = removePlayerFromGame(games, gameId, bob.id);
        expect(last.gameDeleted).toBe(true);
        expect(games.has(gameId)).toBe(false);
    });

    test('a leaver can rejoin a waiting game as a brand-new player', () => {
        removePlayerFromGame(games, gameId, alice.id);

        const rejoin = addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);

        expect(rejoin.success).toBe(true);
        expect(rejoin.isNewPlayer).toBe(true);
    });

    test('a stranger has to ask to join a started game', () => {
        assignCharacter(games, gameId, alice.id, 'Batman', bob.id);
        assignCharacter(games, gameId, bob.id, 'Superman', alice.id);
        startGame(games, gameId, alice.id);

        const stranger = addPlayerToGame(games, gameId, 'Mallory', '🐍', 'cccccccc-3333-4333-9333-333333333333');

        // Not let in: a player of the room has to let them in (requestToJoin)
        expect(stranger).toEqual({ success: false, waitingForApproval: true });
        expect(games.get(gameId).players).toHaveLength(2);
    });

    describe('returning to a started game', () => {
        beforeEach(() => {
            assignCharacter(games, gameId, alice.id, 'Batman', bob.id);
            assignCharacter(games, gameId, bob.id, 'Superman', alice.id);
            startGame(games, gameId, alice.id);
        });

        test('a leaver can return to the same round', () => {
            removePlayerFromGame(games, gameId, alice.id);

            const rejoin = addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);

            expect(rejoin.success).toBe(true);
            expect(rejoin.isNewPlayer).toBe(true);
            expect(games.get(gameId).players).toHaveLength(2);
        });

        test('the returning player gets their character back', () => {
            removePlayerFromGame(games, gameId, alice.id);
            expect(games.get(gameId).characters.has(alice.id)).toBe(false);

            addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);

            const restored = games.get(gameId).characters.get(alice.id);
            expect(restored.character).toBe('Batman');
            expect(restored.assignedBy).toBe(bob.id);
        });

        test('the returning player gets their reveal status back', () => {
            revealCharacter(games, gameId, alice.id);
            removePlayerFromGame(games, gameId, alice.id);

            addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);

            expect(games.get(gameId).revealedPlayers.has(alice.id)).toBe(true);
        });

        test('the returning player keeps their sticker color', () => {
            const color = alice.stickerColor;
            removePlayerFromGame(games, gameId, alice.id);

            const rejoin = addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);

            expect(rejoin.player.stickerColor).toBe(color);
        });

        test('returning is one-shot: the snapshot is consumed', () => {
            removePlayerFromGame(games, gameId, alice.id);
            addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);

            expect(games.get(gameId).recentlyLeft.has(alice.id)).toBe(false);
        });

        test('leaving again after returning is snapshotted again', () => {
            removePlayerFromGame(games, gameId, alice.id);
            addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);
            removePlayerFromGame(games, gameId, alice.id);

            const again = addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);

            expect(again.success).toBe(true);
            expect(games.get(gameId).characters.get(alice.id).character).toBe('Batman');
        });

        test('restart clears the return rights of the old round', () => {
            removePlayerFromGame(games, gameId, alice.id);
            restartGame(games, gameId, bob.id);

            expect(games.get(gameId).recentlyLeft.size).toBe(0);
            // The game is back in waiting, so joining works the normal way
            const rejoin = addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);
            expect(rejoin.success).toBe(true);
            expect(games.get(gameId).characters.has(alice.id)).toBe(false);
        });

        test('a lobby leaver gets no started-game return rights', () => {
            // Charlie leaves BEFORE the next round starts
            restartGame(games, gameId, bob.id);
            const charlie = addPlayerToGame(games, gameId, 'Charlie', '🐱').player;
            removePlayerFromGame(games, gameId, charlie.id);

            assignCharacter(games, gameId, alice.id, 'Batman', bob.id);
            assignCharacter(games, gameId, bob.id, 'Superman', alice.id);
            startGame(games, gameId, alice.id);

            const rejoin = addPlayerToGame(games, gameId, 'Charlie', '🐱', charlie.id);

            // A lobby leaver is a newcomer to the round: they have to ask
            expect(rejoin).toEqual({ success: false, waitingForApproval: true });
        });
    });

    test('starting requires 2 players again after a leave', () => {
        removePlayerFromGame(games, gameId, alice.id);

        const result = startGame(games, gameId, bob.id);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Need at least 2 players to start');
    });

    test('returns the full serialized state for broadcasting', () => {
        assignCharacter(games, gameId, bob.id, 'Superman', alice.id);

        const result = removePlayerFromGame(games, gameId, alice.id);

        expect(result.gameId).toBe(gameId);
        expect(Array.isArray(result.players)).toBe(true);
        expect(result.characters).toEqual({
            [bob.id]: expect.objectContaining({ character: 'Superman' })
        });
        expect(Array.isArray(result.revealedPlayers)).toBe(true);
    });
});

// The players list is kept in first-join order (joinedAt), so every client
// shows the same stable order and "whose turn is it" survives leave/return:
// a returning player goes back to their old position, not to the end.
describe('Returning player keeps their place in the list', () => {
    let games, gameId, alice, bob, charlie;

    beforeEach(() => {
        games = new Map();
        gameId = createGame(games).gameId;
        alice = addPlayerToGame(games, gameId, 'Alice', '😀').player;
        bob = addPlayerToGame(games, gameId, 'Bob', '😎').player;
        charlie = addPlayerToGame(games, gameId, 'Charlie', '🐱').player;

        // In tests all three join within the same millisecond - spread the
        // join times into the recent past, the way they would be in a real
        // game (a later NEW join must still land at the end of the list)
        const base = Date.now();
        const players = games.get(gameId).players;
        players.forEach((player, index) => {
            player.joinedAt = new Date(base - (players.length - index) * 1000);
        });

        // The game starts only when every player has a character
        assignCharacter(games, gameId, alice.id, 'Batman', bob.id);
        assignCharacter(games, gameId, bob.id, 'Superman', charlie.id);
        assignCharacter(games, gameId, charlie.id, 'Joker', alice.id);
        startGame(games, gameId, alice.id);
    });

    function names() {
        return games.get(gameId).players.map(p => p.name);
    }

    test('a returning player is restored to their old position', () => {
        removePlayerFromGame(games, gameId, bob.id);
        expect(names()).toEqual(['Alice', 'Charlie']);

        addPlayerToGame(games, gameId, 'Bob', '😎', bob.id);

        expect(names()).toEqual(['Alice', 'Bob', 'Charlie']); // not [..., 'Bob']
    });

    test('two leavers returning in reverse order still restore the original order', () => {
        removePlayerFromGame(games, gameId, bob.id);
        removePlayerFromGame(games, gameId, charlie.id);

        addPlayerToGame(games, gameId, 'Charlie', '🐱', charlie.id);
        addPlayerToGame(games, gameId, 'Bob', '😎', bob.id);

        expect(names()).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    test('a brand-new player still joins at the end of the list', () => {
        // New joins are only possible in the lobby
        restartGame(games, gameId, alice.id);

        addPlayerToGame(games, gameId, 'David', '🐸');

        expect(names()).toEqual(['Alice', 'Bob', 'Charlie', 'David']);
    });

    test('position survives a joinedAt that became an ISO string (JSON round trip)', () => {
        removePlayerFromGame(games, gameId, bob.id);

        // Disk/localStorage backups turn Dates into strings
        const snapshot = games.get(gameId).recentlyLeft.get(bob.id);
        snapshot.joinedAt = new Date(snapshot.joinedAt).toISOString();

        addPlayerToGame(games, gameId, 'Bob', '😎', bob.id);

        expect(names()).toEqual(['Alice', 'Bob', 'Charlie']);
    });
});
