// Who am I? Game - the game's own rules and its hooks on the kit's players
// list (characters, reveals). Joining, the secret, leavers, ghosts and room
// codes are the kit's: packages/room-kit/tests/players.test.js
const {
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    revealCharacter,
    restartGame
} = require('../game-logic');

describe('Game Creation', () => {
    test("a new game has the game's own fields: no characters, nobody revealed", () => {
        const games = new Map();
        const result = createGame(games);
        const game = games.get(result.gameId);

        expect(result.success).toBe(true);
        expect(game).toMatchObject({ id: result.gameId, players: [], state: 'waiting' });
        expect(game.characters).toBeInstanceOf(Map);
        expect(game.characters.size).toBe(0);
        expect(game.revealedPlayers).toBeInstanceOf(Set);
        expect(game.revealedPlayers.size).toBe(0);
    });
});

describe('Player Joining', () => {
    let games;
    let gameId;

    beforeEach(() => {
        games = new Map();
        gameId = createGame(games).gameId;
    });

    test("a join's answer carries the game's part: the characters and who is revealed", () => {
        const result = addPlayerToGame(games, gameId, 'Alice', '😀');

        expect(result.success).toBe(true);
        expect(result.isNewPlayer).toBe(true);
        expect(result.player).toMatchObject({ name: 'Alice', avatar: '😀' });
        expect(result.game.players).toHaveLength(1);
        expect(result.game.characters).toEqual({});
        expect(result.game.revealedPlayers).toEqual([]);
    });

    test("a reload keeps the player's character", () => {
        const alice = addPlayerToGame(games, gameId, 'Alice', '😀').player;
        const bob = addPlayerToGame(games, gameId, 'Bob', '😎').player;
        assignCharacter(games, gameId, alice.id, 'Secret Agent', bob.id);

        const reload = addPlayerToGame(games, gameId, 'Alice', '😀', alice.id);

        expect(reload).toMatchObject({ success: true, isNewPlayer: false });
        expect(reload.game.characters[alice.id].character).toBe('Secret Agent');
    });
});

describe('Character Assignment', () => {
    let games;
    let gameId;
    let playerId1;
    let playerId2;

    beforeEach(() => {
        games = new Map();
        const createResult = createGame(games);
        gameId = createResult.gameId;
        
        // Add two players
        const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
        const player2Result = addPlayerToGame(games, gameId, 'Bob', '😎');
        
        playerId1 = player1Result.player.id;
        playerId2 = player2Result.player.id;
    });

    test('assigns a character: the game keeps it, the answer carries every character', () => {
        assignCharacter(games, gameId, playerId2, 'Superman', playerId1);

        const result = assignCharacter(games, gameId, playerId1, 'Albert Einstein', playerId2);

        expect(result).toMatchObject({ success: true, playerId: playerId1, character: 'Albert Einstein' });
        expect(Object.keys(result.characters).sort()).toEqual([playerId1, playerId2].sort());
        expect(result.characters[playerId2].character).toBe('Superman');
        expect(games.get(gameId).characters.get(playerId1).character).toBe('Albert Einstein');
    });

    test('allows character reassignment (editing)', () => {
        assignCharacter(games, gameId, playerId1, 'Batman', playerId2);

        const result = assignCharacter(games, gameId, playerId1, 'Wonder Woman', playerId2);

        expect(result.character).toBe('Wonder Woman');
        expect(games.get(gameId).characters.get(playerId1).character).toBe('Wonder Woman');
    });

    test('an empty or blank character takes the assignment away', () => {
        for (const blank of ['', '   ']) {
            assignCharacter(games, gameId, playerId1, 'Batman', playerId2);

            const result = assignCharacter(games, gameId, playerId1, blank, playerId2);

            expect(result).toMatchObject({ success: true, character: '' });
            expect(games.get(gameId).characters.has(playerId1)).toBe(false);
        }
    });

    test('quotes, ampersands and emoji stay as typed', () => {
        const name = 'Albert "The Genius" Einstein & Newton 🧠';

        expect(assignCharacter(games, gameId, playerId1, name, playerId2).character).toBe(name);
        expect(games.get(gameId).characters.get(playerId1).character).toBe(name);
    });

    test('allows player to assign characters to multiple other players', () => {
        const playerId3 = addPlayerToGame(games, gameId, 'Charlie', '🤖').player.id;

        expect(assignCharacter(games, gameId, playerId2, 'Batman', playerId1).success).toBe(true);
        expect(assignCharacter(games, gameId, playerId3, 'Superman', playerId1).success).toBe(true);

        const game = games.get(gameId);
        expect(game.characters.get(playerId2).character).toBe('Batman');
        expect(game.characters.get(playerId3).character).toBe('Superman');
    });

    test('two players of one name get their characters by their IDs', () => {
        const secondAlice = addPlayerToGame(games, gameId, 'Alice', '😎').player.id;

        assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
        assignCharacter(games, gameId, secondAlice, 'Superman', playerId2);

        const game = games.get(gameId);
        expect(game.characters.get(playerId1).character).toBe('Batman');
        expect(game.characters.get(secondAlice).character).toBe('Superman');
    });

    test('returns error for non-existent game', () => {
        const result = assignCharacter(games, 'INVALID', playerId1, 'Batman', playerId2);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game not found');
    });

    test('returns error for non-existent player', () => {
        const result = assignCharacter(games, gameId, 'invalid-player-id', 'Batman', playerId2);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Player not found in game');
    });

    test('prevents players from assigning characters to themselves', () => {
        const result = assignCharacter(games, gameId, playerId1, 'Batman', playerId1);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Cannot assign character to yourself');
    });

    test('validates that assigner exists in game', () => {
        const result = assignCharacter(games, gameId, playerId1, 'Batman', 'invalid-assigner-id');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Assigner not found in game');
    });
});

describe('Game Starting', () => {
    let games;
    let gameId;
    let playerId1;
    let playerId2;

    beforeEach(() => {
        games = new Map();
        const createResult = createGame(games);
        gameId = createResult.gameId;
        
        // Add two players
        const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
        const player2Result = addPlayerToGame(games, gameId, 'Bob', '😎');
        
        playerId1 = player1Result.player.id;
        playerId2 = player2Result.player.id;

        // The game starts only when every player has a character
        assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
        assignCharacter(games, gameId, playerId2, 'Superman', playerId1);
    });

    test('starts game successfully with enough players', () => {
        const result = startGame(games, gameId, playerId1);
        
        expect(result.success).toBe(true);
        expect(result.gameId).toBe(gameId);
        expect(result.state).toBe('started');
        expect(result.startedBy).toBe(playerId1);
        expect(games.get(gameId).state).toBe('started');
    });

    test('prevents starting game with insufficient players', () => {
        // Create new game with only one player
        const newGameResult = createGame(games);
        const newGameId = newGameResult.gameId;
        const onePlayerResult = addPlayerToGame(games, newGameId, 'Solo', '😀');
        
        const result = startGame(games, newGameId, onePlayerResult.player.id);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Need at least 2 players to start');
    });

    test('refuses to start while a player has no character', () => {
        // Charlie joins at the moment Start is pressed: nobody gave him a character yet
        addPlayerToGame(games, gameId, 'Charlie', '🤖');

        const result = startGame(games, gameId, playerId1);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Every player needs a character to start');
        expect(games.get(gameId).state).toBe('waiting');
    });

    test('prevents starting already started game', () => {
        // Start game first time
        startGame(games, gameId, playerId1);
        
        // Try to start again
        const result = startGame(games, gameId, playerId2);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game has already started');
    });

    test('returns error for non-existent game', () => {
        const result = startGame(games, 'INVALID', playerId1);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game not found');
    });

    test('returns error for non-existent player', () => {
        const result = startGame(games, gameId, 'invalid-player-id');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Player not found in game');
    });

    test('allows any player to start the game', () => {
        // Player 2 starts the game
        const result = startGame(games, gameId, playerId2);
        
        expect(result.success).toBe(true);
        expect(result.startedBy).toBe(playerId2);
    });
});

describe('Character Revealing', () => {
    let games;
    let gameId;
    let playerId1;
    let playerId2;

    beforeEach(() => {
        games = new Map();
        const createResult = createGame(games);
        gameId = createResult.gameId;
        
        // Add two players
        const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
        const player2Result = addPlayerToGame(games, gameId, 'Bob', '😎');
        
        playerId1 = player1Result.player.id;
        playerId2 = player2Result.player.id;
        
        // Assign characters
        assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
        assignCharacter(games, gameId, playerId2, 'Superman', playerId1);
        
        // Start the game
        startGame(games, gameId, playerId1);
    });

    test('reveals character successfully', () => {
        const result = revealCharacter(games, gameId, playerId1);

        expect(result.success).toBe(true);
        expect(result.playerId).toBe(playerId1);
        expect(result.character).toBe('Batman');
        expect(result.revealedPlayers).toContain(playerId1);

        // Check new revealedPlayer object for notifications
        expect(result.revealedPlayer).toBeDefined();
        expect(result.revealedPlayer.id).toBe(playerId1);
        expect(result.revealedPlayer.name).toBe('Alice');
        expect(result.revealedPlayer.character).toBe('Batman');
    });

    test('updates revealed players in game state', () => {
        revealCharacter(games, gameId, playerId1);
        
        const game = games.get(gameId);
        expect(game.revealedPlayers.has(playerId1)).toBe(true);
        expect(game.revealedPlayers.size).toBe(1);
    });

    test('allows multiple players to reveal', () => {
        revealCharacter(games, gameId, playerId1);
        revealCharacter(games, gameId, playerId2);
        
        const game = games.get(gameId);
        expect(game.revealedPlayers.has(playerId1)).toBe(true);
        expect(game.revealedPlayers.has(playerId2)).toBe(true);
        expect(game.revealedPlayers.size).toBe(2);
    });

    test('allows same player to reveal multiple times (idempotent)', () => {
        const result1 = revealCharacter(games, gameId, playerId1);
        const result2 = revealCharacter(games, gameId, playerId1);
        
        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        expect(result2.character).toBe('Batman');
        
        const game = games.get(gameId);
        expect(game.revealedPlayers.size).toBe(1);
    });

    test('prevents revealing before game starts', () => {
        // Create new game that hasn't started
        const newGameResult = createGame(games);
        const newGameId = newGameResult.gameId;
        const newPlayerResult = addPlayerToGame(games, newGameId, 'Charlie', '🤖');
        assignCharacter(games, newGameId, newPlayerResult.player.id, 'Wonder Woman', playerId1);
        
        const result = revealCharacter(games, newGameId, newPlayerResult.player.id);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game has not started yet');
    });

    test('prevents revealing without assigned character', () => {
        // Create a new game and add a player without character assignment before starting
        const newGameResult = createGame(games);
        const newGameId = newGameResult.gameId;
        const player3Result = addPlayerToGame(games, newGameId, 'Charlie', '🤖');
        addPlayerToGame(games, newGameId, 'David', '🚀');
        
        // startGame refuses such a game, but a backup restored from disk or
        // from a browser can still hold one: a started game, Charlie without a character
        games.get(newGameId).state = 'started';
        
        const result = revealCharacter(games, newGameId, player3Result.player.id);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('No character assigned to this player');
    });

    test('returns error for non-existent game', () => {
        const result = revealCharacter(games, 'INVALID', playerId1);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game not found');
    });

    test('returns error for non-existent player', () => {
        const result = revealCharacter(games, gameId, 'invalid-player-id');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Player not found in game');
    });
});

describe('Game Restarting', () => {
    let games;
    let gameId;
    let playerId1;
    let playerId2;

    beforeEach(() => {
        games = new Map();
        const createResult = createGame(games);
        gameId = createResult.gameId;
        
        // Add two players
        const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
        const player2Result = addPlayerToGame(games, gameId, 'Bob', '😎');
        
        playerId1 = player1Result.player.id;
        playerId2 = player2Result.player.id;
        
        // Assign characters
        assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
        assignCharacter(games, gameId, playerId2, 'Superman', playerId1);
        
        // Start the game and reveal some characters
        startGame(games, gameId, playerId1);
        revealCharacter(games, gameId, playerId1);
    });

    test('restarts game successfully', () => {
        const result = restartGame(games, gameId, playerId1);
        
        expect(result.success).toBe(true);
        expect(result.gameId).toBe(gameId);
        expect(result.state).toBe('waiting');
        expect(result.restartedBy).toBe(playerId1);
        expect(result.revealedPlayers).toEqual([]);
    });

    test('preserves players but clears character assignments', () => {
        const gameBefore = games.get(gameId);
        const playersBefore = gameBefore.players.length;
        
        restartGame(games, gameId, playerId1);
        
        const gameAfter = games.get(gameId);
        expect(gameAfter.players.length).toBe(playersBefore);
        expect(gameAfter.characters.size).toBe(0); // All characters cleared
        
        // Character assignments should be cleared
        expect(gameAfter.characters.has(playerId1)).toBe(false);
        expect(gameAfter.characters.has(playerId2)).toBe(false);
    });

    test('clears revealed players', () => {
        const game = games.get(gameId);
        expect(game.revealedPlayers.has(playerId1)).toBe(true); // Was revealed in beforeEach
        
        restartGame(games, gameId, playerId1);
        
        expect(game.revealedPlayers.has(playerId1)).toBe(false);
        expect(game.revealedPlayers.size).toBe(0);
    });

    test('allows any player to restart the game', () => {
        // Player 2 restarts the game
        const result = restartGame(games, gameId, playerId2);
        
        expect(result.success).toBe(true);
        expect(result.restartedBy).toBe(playerId2);
    });

    test('can restart from waiting state', () => {
        // First restart the game
        restartGame(games, gameId, playerId1);
        
        // Try to restart again while in waiting state
        const result = restartGame(games, gameId, playerId2);
        
        expect(result.success).toBe(true);
        expect(result.state).toBe('waiting');
    });

    test('returns error for non-existent game', () => {
        const result = restartGame(games, 'INVALID', playerId1);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game not found');
    });

    test('returns error for non-existent player', () => {
        const result = restartGame(games, gameId, 'invalid-player-id');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Player not found in game');
    });

    test('allows new players to join after restart', () => {
        // Restart the game
        restartGame(games, gameId, playerId1);
        
        // Try to add a new player (should succeed now)
        const newPlayerResult = addPlayerToGame(games, gameId, 'Charlie', '🤖');
        
        expect(newPlayerResult.success).toBe(true);
        expect(newPlayerResult.isNewPlayer).toBe(true);
        expect(newPlayerResult.game.players.length).toBe(3);
    });
});