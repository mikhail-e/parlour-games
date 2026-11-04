/**
 * Game backups on disk (game-backups.js and the routes that use them)
 * The keep-alive loop saves every room with players online to games/CODE.json,
 * and a room missing from memory after a server restart comes back from that
 * file: through its link and through Join on the landing page. When the last
 * player leaves a room, its
 * backup must go too - or the old link would bring the room back
 * (tests/e2e/leave-and-return.spec.js checks that through the pages). The
 * code in a room link becomes part of a file path, so only a real room code
 * may reach the disk.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

// A folder of our own: the server reads GAMES_DIR once, as it loads. The
// canary sits next to it, where a path that escaped the folder would land
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'whoami-backup-test-'));
process.env.GAMES_DIR = path.join(sandbox, 'games');
const { app } = require('../server');
const { createGameBackups } = require('../game-backups');
const {
    createGame, addPlayerToGame, assignCharacter, startGame, revealCharacter, restoreGame,
} = require('../game-logic');

const backups = createGameBackups(process.env.GAMES_DIR);
const backupOf = code => path.join(process.env.GAMES_DIR, `${code}.json`);
const canary = path.join(sandbox, 'CANARY.json');
const HOUR = 60 * 60 * 1000;
// The secret Alice's browser sends with a join
const SECRET = '00000000-0000-4000-8000-0000000000a1';

// A started game of Alice and Bob, Alice's character revealed
function startedGame() {
    const games = new Map();
    const { gameId } = createGame(games);
    const alice = addPlayerToGame(games, gameId, 'Alice', '😀').player;
    const bob = addPlayerToGame(games, gameId, 'Bob', '😎').player;
    assignCharacter(games, gameId, alice.id, 'Batman', bob.id);
    assignCharacter(games, gameId, bob.id, 'Superman', alice.id);
    startGame(games, gameId, alice.id);
    revealCharacter(games, gameId, alice.id);
    return { game: games.get(gameId), alice, bob };
}

// A backup file that has not been written for this long
function backupAged(code, ageMs) {
    fs.writeFileSync(backupOf(code), JSON.stringify({ id: code, players: [] }));
    const time = new Date(Date.now() - ageMs);
    fs.utimesSync(backupOf(code), time, time);
}

// The routes log restores and joins; keep the test output readable
beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => {
    console.log.mockRestore();
    fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('save() and load()', () => {
    test('a saved game comes back with its players, characters, state and reveals', () => {
        const { game, alice, bob } = startedGame();

        backups.save(game);
        const restored = restoreGame(game.id, backups.load(game.id));

        expect(restored.players.map(p => p.name)).toEqual(['Alice', 'Bob']);
        expect(restored.players.map(p => p.stickerColor)).toEqual(game.players.map(p => p.stickerColor));
        expect(restored.characters.get(alice.id).character).toBe('Batman');
        expect(restored.characters.get(bob.id).character).toBe('Superman');
        expect(restored.state).toBe('started');
        expect([...restored.revealedPlayers]).toEqual([alice.id]);
    });

    test('a room without a backup, or with a broken one, loads as nothing', () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        fs.writeFileSync(backupOf('BROKEN'), '{ not json');

        expect(backups.load('NOFILE')).toBeNull();
        expect(backups.load('BROKEN')).toBeNull();

        console.error.mockRestore();
    });

    test('an ID that is not a room code reads no file', () => {
        fs.writeFileSync(canary, JSON.stringify({ id: 'CANARY', players: [] }));

        expect(backups.load('../CANARY')).toBeNull();
    });
});

describe('remove()', () => {
    test("removes a game's backup file", () => {
        fs.writeFileSync(backupOf('TESTBK'), JSON.stringify({ id: 'TESTBK' }));

        backups.remove('TESTBK');

        expect(fs.existsSync(backupOf('TESTBK'))).toBe(false);
    });

    test('a game without a backup is not an error', () => {
        expect(() => backups.remove('NOFILE')).not.toThrow();
    });

    test('an ID that is not a room code touches no file', () => {
        fs.writeFileSync(canary, '{}');

        expect(() => backups.remove('../CANARY')).not.toThrow();

        expect(fs.existsSync(canary)).toBe(true);
    });
});

describe('removeOld()', () => {
    test('removes backups older than the limit and keeps newer ones', () => {
        backupAged('OLD001', 5 * HOUR);
        backupAged('NEW001', 2 * HOUR);

        const removed = backups.removeOld(new Map(), 4 * HOUR);

        expect(removed).toContain('OLD001');
        expect(fs.existsSync(backupOf('OLD001'))).toBe(false);
        expect(fs.existsSync(backupOf('NEW001'))).toBe(true);
    });

    test('keeps the backup of a room still in memory', () => {
        backupAged('ACTIVE', 5 * HOUR);

        backups.removeOld(new Map([['ACTIVE', {}]]), 4 * HOUR);

        expect(fs.existsSync(backupOf('ACTIVE'))).toBe(true);
    });

    test('leaves files that are not backups alone', () => {
        const notes = path.join(process.env.GAMES_DIR, 'readme.txt');
        fs.writeFileSync(notes, 'not a game');
        const time = new Date(Date.now() - 5 * HOUR);
        fs.utimesSync(notes, time, time);

        backups.removeOld(new Map(), 4 * HOUR);

        expect(fs.existsSync(notes)).toBe(true);
    });
});

describe('a room that is only on disk', () => {
    // The server lost the room (a restart); its backup is still there
    function roomOnDisk(code) {
        const { game, alice, bob } = startedGame();
        game.id = code;
        backups.save(game);
        return { alice, bob };
    }

    test('comes back through its link', async () => {
        roomOnDisk('DISK01');

        const response = await request(app).get('/game/DISK01');

        expect(response.status).toBe(200);
        expect(response.text).toContain('<title');
    });

    test('comes back when a player presses Join on the landing page', async () => {
        const { alice } = roomOnDisk('DISK02');

        const response = await request(app).post('/api/join-game').send({
            gameId: 'DISK02', playerName: 'Alice', avatar: '😀', playerId: alice.id, playerSecret: SECRET,
        });

        expect(response.status).toBe(200);
        expect(response.body.isNewPlayer).toBe(false);
        expect(response.body.game.state).toBe('started');
    });

});

describe('GET /game/:roomCode', () => {
    test('a room link that is not a room code opens no file', async () => {
        // A file in the shape of a saved room, one folder above the backups
        fs.writeFileSync(canary, JSON.stringify({
            id: 'CANARY', players: [], characters: {}, state: 'waiting',
            revealedPlayers: [], created: new Date().toISOString(),
        }));

        const response = await request(app).get('/game/..%2FCANARY');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/?error=room-not-found');
    });
});
