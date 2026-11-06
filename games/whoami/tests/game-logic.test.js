// Who am I? Game - Unit Tests for Core Logic
const {
    generateRoomCode,
    createGame,
    addPlayerToGame,
    assignCharacter,
    startGame,
    revealCharacter,
    restartGame,
    isValidRoomCode
} = require('../game-logic');

describe('Room Code Generation', () => {
    test('generates a 6-character room code', () => {
        const code = generateRoomCode();
        expect(code).toHaveLength(6);
    });

    test('generates room code with only uppercase letters and numbers', () => {
        const code = generateRoomCode();
        expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    test('generates unique room codes', () => {
        const code1 = generateRoomCode();
        const code2 = generateRoomCode();
        const code3 = generateRoomCode();
        
        expect(code1).not.toBe(code2);
        expect(code2).not.toBe(code3);
        expect(code1).not.toBe(code3);
    });

    test('generates codes 100 times without duplicates (statistical test)', () => {
        const codes = new Set();
        for (let i = 0; i < 100; i++) {
            codes.add(generateRoomCode());
        }
        // We should have close to 100 unique codes (allowing for small chance of collision)
        expect(codes.size).toBeGreaterThan(95);
    });
});

describe('Room Code Validation', () => {
    test('validates correct room codes', () => {
        expect(isValidRoomCode('ABC123')).toBe(true);
        expect(isValidRoomCode('XYZ789')).toBe(true);
        expect(isValidRoomCode('000000')).toBe(true);
        expect(isValidRoomCode('ZZZZZZ')).toBe(true);
    });

    test('rejects invalid room codes', () => {
        expect(isValidRoomCode('')).toBe(false);
        expect(isValidRoomCode('ABC12')).toBe(false); // Too short
        expect(isValidRoomCode('ABC1234')).toBe(false); // Too long
        expect(isValidRoomCode('abc123')).toBe(false); // Lowercase
        expect(isValidRoomCode('ABC12!')).toBe(false); // Special characters
        expect(isValidRoomCode(null)).toBe(false);
        expect(isValidRoomCode(undefined)).toBe(false);
        expect(isValidRoomCode(123456)).toBe(false); // Number instead of string
    });
});

describe('Game Creation', () => {
    let games;

    beforeEach(() => {
        games = new Map();
    });

    test('creates a new game successfully', () => {
        const result = createGame(games);
        
        expect(result.success).toBe(true);
        expect(result.gameId).toHaveLength(6);
        expect(games.has(result.gameId)).toBe(true);
    });

    test('creates game with correct initial structure', () => {
        const result = createGame(games);
        const game = games.get(result.gameId);
        
        expect(game).toMatchObject({
            id: result.gameId,
            players: [],
            state: 'waiting',
            created: expect.any(Date)
        });
        expect(game.characters).toBeInstanceOf(Map);
        expect(game.revealedPlayers).toBeInstanceOf(Set);
        expect(game.revealedPlayers.size).toBe(0);
    });

    test('creates unique game IDs', () => {
        const result1 = createGame(games);
        const result2 = createGame(games);
        const result3 = createGame(games);
        
        expect(result1.gameId).not.toBe(result2.gameId);
        expect(result2.gameId).not.toBe(result3.gameId);
        expect(games.size).toBe(3);
    });
});

describe('Player Joining', () => {
    let games;
    let gameId;

    beforeEach(() => {
        games = new Map();
        const createResult = createGame(games);
        gameId = createResult.gameId;
    });

    test('adds new player successfully', () => {
        const result = addPlayerToGame(games, gameId, 'Alice', '😀');
        
        expect(result.success).toBe(true);
        expect(result.isNewPlayer).toBe(true);
        expect(result.player).toMatchObject({
            name: 'Alice',
            avatar: '😀'
        });
        expect(result.player.id).toBeDefined();
        expect(result.game.players).toHaveLength(1);
        expect(result.game.state).toBe('waiting');
        expect(result.game.revealedPlayers).toEqual([]);
    });

    test('handles player reconnection', () => {
        // First join
        const firstResult = addPlayerToGame(games, gameId, 'Alice', '😀');
        const playerId = firstResult.player.id;

        // Reconnect with same name AND player ID
        const secondResult = addPlayerToGame(games, gameId, 'Alice', '😎', playerId);

        expect(secondResult.success).toBe(true);
        expect(secondResult.isNewPlayer).toBe(false);
        expect(secondResult.player.id).toBe(playerId); // Same player ID
        expect(secondResult.player.avatar).toBe('😎'); // Updated avatar
        expect(secondResult.game.players).toHaveLength(1); // Still only 1 player
    });

    test('allows multiple different players to join', () => {
        addPlayerToGame(games, gameId, 'Alice', '😀');
        addPlayerToGame(games, gameId, 'Bob', '😎');
        addPlayerToGame(games, gameId, 'Charlie', '🤖');
        
        const game = games.get(gameId);
        expect(game.players).toHaveLength(3);
        
        const playerNames = game.players.map(p => p.name);
        expect(playerNames).toContain('Alice');
        expect(playerNames).toContain('Bob');
        expect(playerNames).toContain('Charlie');
    });

    test('enforces maximum player limit (12 players)', () => {
        // Add 12 players
        for (let i = 1; i <= 12; i++) {
            const result = addPlayerToGame(games, gameId, `Player${i}`, '😀');
            expect(result.success).toBe(true);
        }
        
        // Try to add 13th player
        const result = addPlayerToGame(games, gameId, 'Player13', '😀');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game is full');
    });

    test('returns error for non-existent game', () => {
        const result = addPlayerToGame(games, 'INVALID', 'Alice', '😀');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game not found');
    });

    test('prevents NEW players from joining started games', () => {
        // Add players and start game
        const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
        const player2Result = addPlayerToGame(games, gameId, 'Bob', '😎');
        assignCharacter(games, gameId, player1Result.player.id, 'Batman', player2Result.player.id);
        assignCharacter(games, gameId, player2Result.player.id, 'Superman', player1Result.player.id);
        startGame(games, gameId, player1Result.player.id);
        
        // Try to add another NEW player after game started
        const result = addPlayerToGame(games, gameId, 'Charlie', '🤖');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Game has already started');
    });
    
    test('allows EXISTING players to reconnect to started games', () => {
        // Add players and start game
        const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
        const player2Result = addPlayerToGame(games, gameId, 'Bob', '😎');
        assignCharacter(games, gameId, player1Result.player.id, 'Batman', player2Result.player.id);
        assignCharacter(games, gameId, player2Result.player.id, 'Superman', player1Result.player.id);
        startGame(games, gameId, player1Result.player.id);
        
        // Existing player reconnects with their ID
        const result = addPlayerToGame(games, gameId, 'Alice', '😀', player1Result.player.id);
        
        expect(result.success).toBe(true);
        expect(result.isNewPlayer).toBe(false);
        expect(result.player.id).toBe(player1Result.player.id);
    });
    
    test('prevents new players from joining started games (no ID provided)', () => {
        // Add players and start game
        const player1Result = addPlayerToGame(games, gameId, 'Alice', '😀');
        const player2Result = addPlayerToGame(games, gameId, 'Bob', '😎');
        assignCharacter(games, gameId, player1Result.player.id, 'Batman', player2Result.player.id);
        assignCharacter(games, gameId, player2Result.player.id, 'Superman', player1Result.player.id);
        startGame(games, gameId, player1Result.player.id);

        // Try to join as "Alice" without providing player ID - should fail since game started
        const result = addPlayerToGame(games, gameId, 'Alice', '😎');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Game has already started');
    });

    test('validates player data', () => {
        const result = addPlayerToGame(games, gameId, 'Alice', '😀');

        expect(result.player).toMatchObject({
            id: expect.any(String),
            name: 'Alice',
            avatar: '😀',
            joinedAt: expect.any(Date)
        });
    });

    test('CRITICAL: backend must use provided player ID, not generate new UUID', () => {
        // This test prevents the duplicate player bug where backend ignored frontend player IDs
        const providedPlayerId = 'a1b2c3d4-5678-4abc-8def-123456789012';

        const result = addPlayerToGame(games, gameId, 'TestPlayer', '🎯', providedPlayerId);

        expect(result.success).toBe(true);
        expect(result.isNewPlayer).toBe(true);

        // CRITICAL: Backend MUST use the exact player ID provided by frontend
        expect(result.player.id).toBe(providedPlayerId);

        // Verify the player is stored with the correct ID in the game
        const game = games.get(gameId);
        const storedPlayer = game.players.find(p => p.id === providedPlayerId);
        expect(storedPlayer).toBeDefined();
        expect(storedPlayer.name).toBe('TestPlayer');
        expect(storedPlayer.avatar).toBe('🎯');
    });

    test('backend rejects invalid player ID and generates UUID fallback', () => {
        // Test with invalid player ID format
        const invalidPlayerId = 'invalid-player-id-format';

        const result = addPlayerToGame(games, gameId, 'TestPlayer2', '🎲', invalidPlayerId);

        expect(result.success).toBe(true);
        expect(result.isNewPlayer).toBe(true);

        // Backend should reject invalid ID and generate valid UUID instead
        expect(result.player.id).not.toBe(invalidPlayerId);
        expect(result.player.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
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

    test('assigns character successfully', () => {
        const result = assignCharacter(games, gameId, playerId1, 'Albert Einstein', playerId2);
        
        expect(result.success).toBe(true);
        expect(result.playerId).toBe(playerId1);
        expect(result.character).toBe('Albert Einstein');
        expect(result.assignedBy).toBe(playerId2);
        expect(result.characters).toHaveProperty(playerId1);
    });

    test('stores character assignment in game state', () => {
        assignCharacter(games, gameId, playerId1, 'Spider-Man', playerId2);
        
        const game = games.get(gameId);
        const characterData = game.characters.get(playerId1);
        
        expect(characterData).toMatchObject({
            character: 'Spider-Man',
            assignedBy: playerId2,
            assignedAt: expect.any(Date)
        });
    });

    test('allows multiple character assignments', () => {
        assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
        assignCharacter(games, gameId, playerId2, 'Superman', playerId1);
        
        const game = games.get(gameId);
        expect(game.characters.size).toBe(2);
        expect(game.characters.get(playerId1).character).toBe('Batman');
        expect(game.characters.get(playerId2).character).toBe('Superman');
    });

    test('allows character reassignment (editing)', () => {
        // Initial assignment
        assignCharacter(games, gameId, playerId1, 'Batman', playerId2);
        
        // Reassign
        assignCharacter(games, gameId, playerId1, 'Wonder Woman', playerId2);
        
        const game = games.get(gameId);
        const characterData = game.characters.get(playerId1);
        expect(characterData.character).toBe('Wonder Woman');
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

    test('handles various character names', () => {
        const characters = [
            'Albert Einstein',
            'Spider-Man',
            'Mickey Mouse',
            'Barack Obama',
            'Hermione Granger',
            'Tony Stark'
        ];
        
        characters.forEach((character) => {
            const result = assignCharacter(games, gameId, playerId1, character, playerId2);
            expect(result.success).toBe(true);
            expect(result.character).toBe(character);
        });
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

    test('allows player to assign characters to multiple other players', () => {
        // Player 1 assigns to Player 2
        const result1 = assignCharacter(games, gameId, playerId2, 'Batman', playerId1);
        expect(result1.success).toBe(true);
        
        // Add a third player
        const player3Result = addPlayerToGame(games, gameId, 'Charlie', '🤖');
        const playerId3 = player3Result.player.id;
        
        // Player 1 also assigns to Player 3
        const result2 = assignCharacter(games, gameId, playerId3, 'Superman', playerId1);
        expect(result2.success).toBe(true);
        
        // Verify both assignments exist
        const game = games.get(gameId);
        expect(game.characters.get(playerId2).character).toBe('Batman');
        expect(game.characters.get(playerId3).character).toBe('Superman');
        expect(game.characters.get(playerId2).assignedBy).toBe(playerId1);
        expect(game.characters.get(playerId3).assignedBy).toBe(playerId1);
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
    });

    test('updates game state in memory', () => {
        startGame(games, gameId, playerId1);
        
        const game = games.get(gameId);
        expect(game.state).toBe('started');
        expect(game.startedAt).toBeInstanceOf(Date);
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

    test('updates game state in memory', () => {
        restartGame(games, gameId, playerId1);
        
        const game = games.get(gameId);
        expect(game.state).toBe('waiting');
        expect(game.revealedPlayers.size).toBe(0);
        expect(game.restartedAt).toBeInstanceOf(Date);
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

    test('maintains game history with restart timestamp', () => {
        const beforeRestart = Date.now();
        
        restartGame(games, gameId, playerId1);
        
        const game = games.get(gameId);
        expect(game.restartedAt).toBeInstanceOf(Date);
        expect(game.restartedAt.getTime()).toBeGreaterThanOrEqual(beforeRestart);
    });
});