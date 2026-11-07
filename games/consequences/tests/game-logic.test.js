// The game's rules, in Node: the game a room keeps and what its pages get
const gameLogic = require('../game-logic');

const ID = '11111111-1111-4111-8111-111111111111';
const SECRET = '22222222-2222-4222-8222-222222222222';

test('a new game is a lobby without a round, and its pages never get a secret', () => {
    const games = new Map();
    gameLogic.createGame(games, 'ABC123');
    const game = games.get('ABC123');
    expect(game.state).toBe('waiting');
    expect(game.round).toBeNull();

    const result = gameLogic.addPlayerToGame(games, 'ABC123', 'Alice', '🐱', ID, SECRET);
    expect(result.success).toBe(true);
    const seen = gameLogic.serializeGame(games.get('ABC123'));
    expect(seen.players.map(player => player.name)).toEqual(['Alice']);
    expect(JSON.stringify(seen)).not.toContain('secret');
});
