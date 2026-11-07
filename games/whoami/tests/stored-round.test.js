// A room keeps its game in its storage and wakes on whatever code is deployed
// (the kit's Gotchas: a deploy keeps the sockets open). This is a round as
// whoami 2.2.0 saved it - taken with that version's game-logic.js, kept here
// as data: Ann online with a character, Bob left the round after revealing
// theirs, Cat offline, Dan waiting to be let in. The code of today loads it, and
// the round goes on as it would have
const {
    gameFromStorage,
    gameToStorage,
    addPlayerToGame,
    admitPlayer,
    checkPlayerSecret,
    listJoinRequests
} = require('../game-logic');

const ID = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SECRET = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;

const STORED_2_2_0 = {
    "id": "OLD220",
    "players": [
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "name": "Ann",
            "avatar": "🦊",
            "isConnected": true,
            "joinedAt": {
                "$date": "2026-11-07T12:00:01.000Z"
            },
            "stickerColor": "red"
        },
        {
            "id": "00000000-0000-4000-8000-000000000003",
            "name": "Cat",
            "avatar": "🐱",
            "isConnected": false,
            "joinedAt": {
                "$date": "2026-11-07T12:00:03.000Z"
            },
            "stickerColor": "purple",
            "disconnectedAt": 1794052813000
        }
    ],
    "characters": {
        "$map": [
            [
                "00000000-0000-4000-8000-000000000001",
                {
                    "character": "Napoleon",
                    "assignedBy": "00000000-0000-4000-8000-000000000002",
                    "assignedAt": {
                        "$date": "2026-11-07T12:00:07.000Z"
                    }
                }
            ],
            [
                "00000000-0000-4000-8000-000000000003",
                {
                    "character": "Gandalf",
                    "assignedBy": "00000000-0000-4000-8000-000000000001",
                    "assignedAt": {
                        "$date": "2026-11-07T12:00:09.000Z"
                    }
                }
            ]
        ]
    },
    "state": "started",
    "revealedPlayers": {
        "$set": []
    },
    "recentlyLeft": {
        "$map": [
            [
                "00000000-0000-4000-8000-000000000002",
                {
                    "secretHash": "3cce0de600ce76151237b4c68716fdd71fde91ca0141d2430ee18536e6b4311f",
                    "stickerColor": "blue",
                    "character": {
                        "character": "Cleopatra",
                        "assignedBy": "00000000-0000-4000-8000-000000000003",
                        "assignedAt": {
                            "$date": "2026-11-07T12:00:08.000Z"
                        }
                    },
                    "revealed": true,
                    "joinedAt": {
                        "$date": "2026-11-07T12:00:02.000Z"
                    },
                    "leftAt": 1794052812000
                }
            ]
        ]
    },
    "secrets": {
        "$map": [
            [
                "00000000-0000-4000-8000-000000000001",
                "114077ddc78bc2354b70aa2b1fee99bac8fd9768a0f669f69bbb9b00af30276e"
            ],
            [
                "00000000-0000-4000-8000-000000000003",
                "910acd4dde2599bf5e58659ed7baf3fcb693ab84b3c6e10c658b510515bc901b"
            ]
        ]
    },
    "joinRequests": {
        "$map": [
            [
                "00000000-0000-4000-8000-000000000004",
                {
                    "name": "Dan",
                    "avatar": "🐸",
                    "secretHash": "9cfd753feca43fe0ef79bf2dd0c487e15e60adf050d7686bfd840dca723102f4",
                    "requestedAt": 1794052814000
                }
            ]
        ]
    },
    "created": {
        "$date": "2026-11-07T12:00:00.000Z"
    },
    "lastActivityAt": 1794052814000,
    "startedAt": {
        "$date": "2026-11-07T12:00:10.000Z"
    }
};

let games;
let game;

beforeEach(() => {
    game = gameFromStorage(structuredClone(STORED_2_2_0));
    games = new Map([[game.id, game]]);
});

test('the stored round loads as it was', () => {
    expect(game.state).toBe('started');
    expect(game.players.map(p => p.name)).toEqual(['Ann', 'Cat']);
    expect(game.characters.get(ID(1)).character).toBe('Napoleon');
    expect(game.recentlyLeft.get(ID(2)).character.character).toBe('Cleopatra');
    expect(listJoinRequests(game)).toEqual([{ playerId: ID(4), name: 'Dan', avatar: '🐸' }]);
    expect(checkPlayerSecret(game, ID(1), SECRET(1))).toBe(true);
});

test('it goes back to storage in the same form', () => {
    expect(gameToStorage(game)).toEqual(STORED_2_2_0);
});

test('the leaver comes back with their character, reveal, color and place', () => {
    expect(addPlayerToGame(games, game.id, 'Bob', '🐻', ID(2), SECRET(99)))
        .toEqual({ success: false, error: 'This player is playing in another browser' });

    const result = addPlayerToGame(games, game.id, 'Bob', '🐻', ID(2), SECRET(2));
    expect(result).toMatchObject({ success: true, isNewPlayer: true });
    expect(result.game.characters[ID(2)].character).toBe('Cleopatra');
    expect(result.game.revealedPlayers).toEqual([ID(2)]);
    expect(game.players.map(p => p.name)).toEqual(['Ann', 'Bob', 'Cat']);
    expect(game.players[1].stickerColor).toBe('blue');
});

test('the offline player reloads as themselves', () => {
    expect(addPlayerToGame(games, game.id, 'Cat', '🐱', ID(3), SECRET(3))).toMatchObject({ success: true, isNewPlayer: false });
});

test('the waiting newcomer can be let in', () => {
    const result = admitPlayer(games, game.id, ID(4), ID(1));
    expect(result.success).toBe(true);
    expect(game.players.map(p => p.name)).toEqual(['Ann', 'Cat', 'Dan']);
    expect(checkPlayerSecret(game, ID(4), SECRET(4))).toBe(true);
    expect(listJoinRequests(game)).toEqual([]);
});
