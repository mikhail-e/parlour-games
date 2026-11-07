// The game's rules, in Node: the lobby, starting a round, the answers, the
// steps and how the sheets move round the circle
const gameLogic = require('../game-logic');
// The players list is the kit's: a page going offline is its business
const {
    markPlayerConnected, markPlayerDisconnected, requestToJoin, gameToStorage, gameFromStorage
} = require('@parlour-games/room-kit/shared/players');

const CODE = 'ABC123';
const NAMES = ['Anna', 'Boris', 'Vera', 'Gleb', 'Dina', 'Egor', 'Zoya', 'Ilya', 'Kira', 'Lev', 'Masha', 'Nikita'];

// A player's ID and secret: UUIDs, as the browser makes them
const idOf = index => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
const secretOf = index => `99999999-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;

// The list's order is the order of first joins: the players come in a
// second apart, as people do, not all in one millisecond
beforeEach(() => jest.useFakeTimers({ now: new Date('2026-01-01T12:00:00Z') }));
afterEach(() => jest.useRealTimers());

// A lobby of `count` players, in the list's order, every one with a page open
function lobbyOf(count) {
    const games = new Map();
    gameLogic.createGame(games, CODE);
    for (let index = 0; index < count; index++) {
        jest.advanceTimersByTime(1000);
        const result = gameLogic.addPlayerToGame(games, CODE, NAMES[index], '🐱', idOf(index), secretOf(index));
        expect(result.success).toBe(true);
        markPlayerConnected(games.get(CODE), idOf(index));
    }
    return { games, game: games.get(CODE), ids: Array.from({ length: count }, (unused, index) => idOf(index)) };
}

// A started round of `count` players
function roundOf(count) {
    const lobby = lobbyOf(count);
    expect(gameLogic.startRound(lobby.games, CODE, lobby.ids[0])).toEqual({ success: true });
    return lobby;
}

// Every seat answers this step's question with "<who> <step>"
function answerStep(games, ids, step) {
    return ids.map(id => gameLogic.writeAnswer(games, CODE, id, `${id} ${step}`));
}

describe('the lobby', () => {
    test('a new game is a lobby without a round, and its pages never get a secret', () => {
        const { games } = lobbyOf(1);
        const game = games.get(CODE);
        expect(game.state).toBe('waiting');
        expect(game.round).toBeNull();

        const seen = gameLogic.serializeGame(game);
        expect(seen.players.map(player => player.name)).toEqual(['Anna']);
        expect(JSON.stringify(seen)).not.toContain('secret');
    });
});

describe('starting a round', () => {
    test('one player cannot start a round', () => {
        const { games, game, ids } = lobbyOf(1);
        expect(gameLogic.startRound(games, CODE, ids[0])).toEqual({ success: false, error: 'Need at least 2 players to start' });
        expect(game.state).toBe('waiting');
        expect(game.round).toBeNull();
    });

    test('every player of the list takes a seat in its order, offline ones too, with a blank sheet', () => {
        const { games, game, ids } = lobbyOf(3);
        markPlayerDisconnected(game, ids[1]);
        expect(gameLogic.startRound(games, CODE, ids[2])).toEqual({ success: true });

        expect(game.state).toBe('started');
        expect(game.round.seats).toEqual(ids);
        expect(game.round.step).toBe(0);
        expect(game.round.sheets).toEqual(ids.map(() => Array(gameLogic.QUESTION_COUNT).fill(null)));
    });

    test('a started round is not started again, and a stranger starts nothing', () => {
        const { games, ids } = roundOf(2);
        expect(gameLogic.startRound(games, CODE, ids[0])).toEqual({ success: false, error: 'The round has already started' });

        const lobby = lobbyOf(2);
        expect(gameLogic.startRound(lobby.games, CODE, idOf(11))).toEqual({ success: false, error: 'Player not found in game' });
        expect(gameLogic.startRound(new Map(), CODE, ids[0])).toEqual({ success: false, error: 'Game not found' });
    });
});

describe('the answers', () => {
    test('an answer goes on the sheet in front of the player, trimmed, with who wrote it', () => {
        const { games, game, ids } = roundOf(3);
        expect(gameLogic.writeAnswer(games, CODE, ids[1], '  the cat  ')).toEqual({ success: true, stepEnded: false, step: 0 });
        expect(game.round.sheets[1][0]).toEqual({ text: 'the cat', by: ids[1] });
    });

    test.each([
        ['empty', '', 'Answer cannot be empty'],
        ['only spaces', '   \n ', 'Answer cannot be empty'],
        ['not a text', 42, 'Invalid answer'],
        ['nothing at all', undefined, 'Invalid answer'],
        ['one character over the limit', 'a'.repeat(gameLogic.MAX_ANSWER_LENGTH + 1), 'Answer is too long'],
    ])('an answer that is %s is refused, and the sheet stays blank', (what, text, error) => {
        const { games, game, ids } = roundOf(2);
        expect(gameLogic.writeAnswer(games, CODE, ids[0], text)).toEqual({ success: false, error });
        expect(game.round.sheets[0][0]).toBeNull();
    });

    test('the limit counts characters as a person does: an emoji is one', () => {
        const { games, game, ids } = roundOf(2);
        const longest = '🐱'.repeat(gameLogic.MAX_ANSWER_LENGTH);
        expect(gameLogic.writeAnswer(games, CODE, ids[0], longest).success).toBe(true);
        expect(game.round.sheets[0][0].text).toBe(longest);
        expect(gameLogic.writeAnswer(games, CODE, ids[1], `${longest}🐱`)).toEqual({ success: false, error: 'Answer is too long' });
    });

    test('a sent answer is final', () => {
        const { games, game, ids } = roundOf(3);
        gameLogic.writeAnswer(games, CODE, ids[0], 'first');
        expect(gameLogic.writeAnswer(games, CODE, ids[0], 'second')).toEqual({ success: false, error: 'This answer has already been written' });
        expect(game.round.sheets[0][0].text).toBe('first');
    });

    test('nobody writes outside a round, on a sheet they do not hold, or in a room they are not in', () => {
        const lobby = lobbyOf(2);
        expect(gameLogic.writeAnswer(lobby.games, CODE, lobby.ids[0], 'early')).toEqual({ success: false, error: 'No round is on' });

        const { games, ids } = roundOf(3);
        expect(gameLogic.writeAnswer(games, CODE, ids[0], 'for Boris', ids[1])).toEqual({ success: false, error: 'You are not holding this sheet' });
        expect(gameLogic.writeAnswer(games, CODE, idOf(11), 'a stranger')).toEqual({ success: false, error: 'Player not found in game' });
        expect(gameLogic.writeAnswer(new Map(), CODE, ids[0], 'no room')).toEqual({ success: false, error: 'Game not found' });
    });
});

describe('the steps', () => {
    test('a step waits for every sheet, then all the sheets move on at once', () => {
        const { games, game, ids } = roundOf(3);
        expect(gameLogic.writeAnswer(games, CODE, ids[0], 'a').stepEnded).toBe(false);
        expect(gameLogic.writeAnswer(games, CODE, ids[2], 'c').stepEnded).toBe(false);
        expect(game.round.step).toBe(0);

        expect(gameLogic.writeAnswer(games, CODE, ids[1], 'b')).toEqual({ success: true, stepEnded: true, step: 1 });
        expect(game.round.step).toBe(1);
        // Question 2 is written on the sheet the seat before had at question 1
        gameLogic.writeAnswer(games, CODE, ids[0], 'second');
        expect(game.round.sheets[2][1]).toEqual({ text: 'second', by: ids[0] });
    });

    test('after the eighth question the round is at the reading, and no more answers are taken', () => {
        const { games, game, ids } = roundOf(2);
        for (let step = 0; step < gameLogic.QUESTION_COUNT; step++) {
            expect(answerStep(games, ids, step).every(result => result.success)).toBe(true);
        }
        expect(game.round.step).toBe(gameLogic.READING_STEP);
        expect(gameLogic.writeAnswer(games, CODE, ids[0], 'late')).toEqual({ success: false, error: 'The questions are over' });
    });

    // Every sheet gets one answer from each seat in turn, one question after
    // another, and reaches for reading the seat after its last answer's
    test.each([2, 3, 12])('with %i seats every sheet goes round the circle, and is read by the seat after its last answer', count => {
        const { games, game, ids } = roundOf(count);
        for (let step = 0; step < gameLogic.QUESTION_COUNT; step++) answerStep(games, ids, step);

        for (const [sheetNumber, sheet] of game.round.sheets.entries()) {
            // Sheet j starts at seat j and moves one seat on at every step
            expect(sheet).toEqual(sheet.map((answer, step) => {
                const writer = ids[(sheetNumber + step) % count];
                return { text: `${writer} ${step}`, by: writer };
            }));
        }
        for (const [seat, id] of ids.entries()) {
            const sheet = game.round.sheets[gameLogic.sheetAt(game.round, seat)];
            expect(sheet[gameLogic.QUESTION_COUNT - 1].by).not.toBe(id);
            // The reader gets the sheet of the seat before them
            expect(sheet[gameLogic.QUESTION_COUNT - 1].by).toBe(ids[(seat - 1 + count) % count]);
        }
    });
});

describe('the absent: offline players and leavers', () => {
    test('a player who has answered takes an offline player\'s sheet and answers for them', () => {
        const { games, game, ids } = roundOf(3);
        const [anna, boris, vera] = ids;
        markPlayerDisconnected(game, boris);
        gameLogic.writeAnswer(games, CODE, anna, 'a');

        expect(gameLogic.takeSheet(games, CODE, anna, boris)).toEqual({ success: true });
        expect(game.round.takenBy).toEqual({ [boris]: anna });
        expect(gameLogic.writeAnswer(games, CODE, anna, 'for Boris', boris).success).toBe(true);
        expect(game.round.sheets[1][0]).toEqual({ text: 'for Boris', by: anna });
        // The answered sheet goes back on the table: Anna holds nothing
        expect(game.round.takenBy).toEqual({});

        expect(gameLogic.writeAnswer(games, CODE, vera, 'c')).toEqual({ success: true, stepEnded: true, step: 1 });
    });

    test('a sheet is taken only from an absent seat, by a player who has answered and holds nothing', () => {
        const { games, game, ids } = roundOf(4);
        const [anna, boris, vera, gleb] = ids;
        markPlayerDisconnected(game, boris);
        markPlayerDisconnected(game, gleb);

        expect(gameLogic.takeSheet(games, CODE, anna, boris)).toEqual({ success: false, error: 'Answer your own question first' });
        gameLogic.writeAnswer(games, CODE, anna, 'a');
        expect(gameLogic.takeSheet(games, CODE, anna, vera)).toEqual({ success: false, error: 'This player is here' });
        expect(gameLogic.takeSheet(games, CODE, anna, anna)).toEqual({ success: false, error: 'This player is here' });
        expect(gameLogic.takeSheet(games, CODE, anna, idOf(11))).toEqual({ success: false, error: 'This seat is not in the round' });
        expect(gameLogic.takeSheet(games, CODE, idOf(11), boris)).toEqual({ success: false, error: 'You are not in this round' });

        expect(gameLogic.takeSheet(games, CODE, anna, boris).success).toBe(true);
        expect(gameLogic.takeSheet(games, CODE, anna, gleb)).toEqual({ success: false, error: 'You are already holding a sheet' });
        expect(gameLogic.writeAnswer(games, CODE, anna, 'for Gleb', gleb)).toEqual({ success: false, error: 'You are not holding this sheet' });

        gameLogic.writeAnswer(games, CODE, anna, 'for Boris', boris);
        expect(gameLogic.takeSheet(games, CODE, anna, boris)).toEqual({ success: false, error: 'This answer has already been written' });
        expect(gameLogic.takeSheet(games, CODE, anna, gleb)).toEqual({ success: true });
    });

    test('two players asking for one sheet: the first gets it, the second is told it is taken', () => {
        const { games, game, ids } = roundOf(3);
        const [anna, boris, vera] = ids;
        markPlayerDisconnected(game, boris);
        gameLogic.writeAnswer(games, CODE, anna, 'a');
        gameLogic.writeAnswer(games, CODE, vera, 'c');

        // The room takes its messages one at a time: "almost at once" is one after the other
        expect(gameLogic.takeSheet(games, CODE, vera, boris)).toEqual({ success: true });
        expect(gameLogic.takeSheet(games, CODE, anna, boris)).toEqual({ success: false, error: 'Another player has already taken this sheet' });
        expect(game.round.takenBy).toEqual({ [boris]: vera });
    });

    test('a taker puts the sheet back, and another may take it', () => {
        const { games, game, ids } = roundOf(3);
        const [anna, boris, vera] = ids;
        markPlayerDisconnected(game, boris);
        gameLogic.writeAnswer(games, CODE, anna, 'a');
        gameLogic.writeAnswer(games, CODE, vera, 'c');
        gameLogic.takeSheet(games, CODE, anna, boris);

        expect(gameLogic.returnSheet(games, CODE, vera, boris)).toEqual({ success: false, error: 'You are not holding this sheet' });
        expect(gameLogic.returnSheet(games, CODE, anna, boris)).toEqual({ success: true });
        expect(game.round.takenBy).toEqual({});
        expect(gameLogic.takeSheet(games, CODE, vera, boris)).toEqual({ success: true });
    });

    test('the sheets a taker held go back on the table when their page goes', () => {
        const { games, game, ids } = roundOf(3);
        const [anna, boris, vera] = ids;
        markPlayerDisconnected(game, boris);
        gameLogic.writeAnswer(games, CODE, anna, 'a');
        gameLogic.writeAnswer(games, CODE, vera, 'c');
        gameLogic.takeSheet(games, CODE, anna, boris);

        markPlayerDisconnected(game, anna);
        expect(gameLogic.releaseSheetsOf(game, anna)).toEqual([boris]);
        expect(game.round.takenBy).toEqual({});
        expect(gameLogic.releaseSheetsOf(game, anna)).toEqual([]);
        expect(gameLogic.takeSheet(games, CODE, vera, boris)).toEqual({ success: true });
    });

    test('a player back while another writes for them waits for the next step, then answers themselves', () => {
        const { games, game, ids } = roundOf(3);
        const [anna, boris, vera] = ids;
        markPlayerDisconnected(game, boris);
        gameLogic.writeAnswer(games, CODE, anna, 'a');
        gameLogic.takeSheet(games, CODE, anna, boris);

        markPlayerConnected(game, boris);
        expect(gameLogic.writeAnswer(games, CODE, boris, 'mine')).toEqual({ success: false, error: 'Another player is writing on your sheet' });
        gameLogic.writeAnswer(games, CODE, anna, 'for Boris', boris);
        gameLogic.writeAnswer(games, CODE, vera, 'c');

        expect(game.round.step).toBe(1);
        expect(gameLogic.writeAnswer(games, CODE, boris, 'mine').success).toBe(true);
    });

    test('a player back before anybody took their sheet answers it, and it can no longer be taken', () => {
        const { games, game, ids } = roundOf(3);
        const [anna, boris] = ids;
        markPlayerDisconnected(game, boris);
        gameLogic.writeAnswer(games, CODE, anna, 'a');
        markPlayerConnected(game, boris);

        expect(gameLogic.takeSheet(games, CODE, anna, boris)).toEqual({ success: false, error: 'This player is here' });
        expect(gameLogic.writeAnswer(games, CODE, boris, 'b').success).toBe(true);
    });

    test('a leaver keeps their seat; the same browser comes back to it and answers the current question', () => {
        const { games, game, ids } = roundOf(3);
        const [anna, boris, vera] = ids;
        expect(gameLogic.removePlayerFromGame(games, CODE, boris).success).toBe(true);
        expect(game.players.map(player => player.id)).toEqual([anna, vera]);
        expect(game.round.seats).toEqual(ids);
        expect(game.recentlyLeft.get(boris)).toMatchObject({ name: 'Boris', avatar: '🐱' });

        // Two steps without him: the others answer for him
        for (let step = 0; step < 2; step++) {
            gameLogic.writeAnswer(games, CODE, anna, `a ${step}`);
            gameLogic.writeAnswer(games, CODE, vera, `c ${step}`);
            expect(gameLogic.takeSheet(games, CODE, anna, boris).success).toBe(true);
            gameLogic.writeAnswer(games, CODE, anna, `for Boris ${step}`, boris);
        }
        expect(game.round.step).toBe(2);

        const back = gameLogic.addPlayerToGame(games, CODE, 'Boris', '🐱', boris, secretOf(1));
        expect(back.success).toBe(true);
        expect(game.players.map(player => player.id)).toEqual([anna, boris, vera]);
        expect(gameLogic.writeAnswer(games, CODE, boris, 'mine').success).toBe(true);
        expect(game.round.sheets[gameLogic.sheetAt(game.round, 1)][2]).toEqual({ text: 'mine', by: boris });
    });

    test('a leaver puts down the sheet they held', () => {
        const { games, game, ids } = roundOf(3);
        const [anna, boris, vera] = ids;
        markPlayerDisconnected(game, boris);
        gameLogic.writeAnswer(games, CODE, anna, 'a');
        gameLogic.takeSheet(games, CODE, anna, boris);

        gameLogic.removePlayerFromGame(games, CODE, anna);
        expect(game.round.takenBy).toEqual({});
        gameLogic.writeAnswer(games, CODE, vera, 'c');
        expect(gameLogic.takeSheet(games, CODE, vera, boris)).toEqual({ success: true });
    });

    test('a leaver who never comes back: the round reaches its end with the others answering for them', () => {
        const { games, game, ids } = roundOf(3);
        const [anna, boris, vera] = ids;
        gameLogic.removePlayerFromGame(games, CODE, boris);

        for (let step = 0; step < gameLogic.QUESTION_COUNT; step++) {
            gameLogic.writeAnswer(games, CODE, anna, `a ${step}`);
            gameLogic.writeAnswer(games, CODE, vera, `c ${step}`);
            const helper = step % 2 === 0 ? anna : vera;
            expect(gameLogic.takeSheet(games, CODE, helper, boris).success).toBe(true);
            gameLogic.writeAnswer(games, CODE, helper, `for Boris ${step}`, boris);
        }
        expect(game.round.step).toBe(gameLogic.READING_STEP);
    });
});

// Every seat answers all eight questions: the round is at the reading
function readingOf(count) {
    const round = roundOf(count);
    for (let step = 0; step < gameLogic.QUESTION_COUNT; step++) answerStep(round.games, round.ids, step);
    expect(round.game.round.step).toBe(gameLogic.READING_STEP);
    return round;
}

describe('the reading', () => {
    test.each([2, 3, 12])('with %i seats every player opens the sheet whose last answer is not theirs', count => {
        const { games, ids } = readingOf(count);
        for (const id of ids) {
            const opened = gameLogic.openSheet(games, CODE, id);
            expect(opened.success).toBe(true);
            const [sheet] = gameLogic.sheetsOpenedBy(games.get(CODE), id);
            expect(sheet.sheet).toBe(opened.sheet);
            expect(sheet.answers).toHaveLength(gameLogic.QUESTION_COUNT);
            expect(sheet.answers[gameLogic.QUESTION_COUNT - 1]).not.toBe(`${id} ${gameLogic.QUESTION_COUNT - 1}`);
        }
    });

    test('three players: Boris reads the sheet Anna finished, Vera Boris\'s, Anna Vera\'s', () => {
        const { games, ids } = readingOf(3);
        const [anna, boris, vera] = ids;
        const lastAnswerOf = id => {
            gameLogic.openSheet(games, CODE, id);
            return gameLogic.sheetsOpenedBy(games.get(CODE), id)[0].answers[gameLogic.QUESTION_COUNT - 1];
        };
        expect(lastAnswerOf(boris)).toBe(`${anna} 7`);
        expect(lastAnswerOf(vera)).toBe(`${boris} 7`);
        expect(lastAnswerOf(anna)).toBe(`${vera} 7`);
    });

    test('a sheet opens once, and nothing opens before the reading', () => {
        const round = roundOf(2);
        expect(gameLogic.openSheet(round.games, CODE, round.ids[0])).toEqual({ success: false, error: 'The stories are not ready yet' });

        const { games, ids } = readingOf(2);
        expect(gameLogic.openSheet(games, CODE, ids[0]).allOpen).toBe(false);
        expect(gameLogic.openSheet(games, CODE, ids[0])).toEqual({ success: false, error: 'This sheet is already open' });
        expect(gameLogic.openSheet(games, CODE, idOf(11))).toEqual({ success: false, error: 'Player not found in game' });
    });

    test('the stories are nobody\'s until the last sheet is open, then everybody\'s with who read them', () => {
        const { games, game, ids } = readingOf(3);
        gameLogic.openSheet(games, CODE, ids[0]);
        gameLogic.openSheet(games, CODE, ids[1]);
        expect(gameLogic.allStories(game)).toBeNull();
        // Each sees only what they opened
        expect(gameLogic.sheetsOpenedBy(game, ids[2])).toEqual([]);

        expect(gameLogic.openSheet(games, CODE, ids[2]).allOpen).toBe(true);
        const stories = gameLogic.allStories(game);
        expect(stories).toHaveLength(3);
        for (const [seat, id] of ids.entries()) {
            const story = stories[gameLogic.sheetAt(game.round, seat)];
            expect(story.readBy).toBe(id);
            expect(story.answers).toEqual(game.round.sheets[story.sheet].map(answer => answer.text));
        }
    });

    test('any player reads for an absent one: the first to ask takes the sheet, then opens it', () => {
        const { games, game, ids } = readingOf(3);
        const [anna, boris, vera] = ids;
        markPlayerDisconnected(game, boris);

        expect(gameLogic.openSheet(games, CODE, anna, boris)).toEqual({ success: false, error: 'You are not holding this sheet' });
        expect(gameLogic.takeSheet(games, CODE, vera, boris)).toEqual({ success: true });
        expect(gameLogic.takeSheet(games, CODE, anna, boris)).toEqual({ success: false, error: 'Another player has already taken this sheet' });

        const opened = gameLogic.openSheet(games, CODE, vera, boris);
        expect(opened.success).toBe(true);
        expect(opened.sheet).toBe(gameLogic.sheetAt(game.round, 1));
        expect(game.round.takenBy).toEqual({});
        // Vera's own sheet is still hers to open
        expect(gameLogic.openSheet(games, CODE, vera).success).toBe(true);
        expect(gameLogic.sheetsOpenedBy(game, vera).map(sheet => sheet.sheet).sort()).toEqual(
            [gameLogic.sheetAt(game.round, 1), gameLogic.sheetAt(game.round, 2)].sort());
        expect(gameLogic.takeSheet(games, CODE, anna, boris)).toEqual({ success: false, error: 'This sheet is already open' });
    });

    test('an absent player back before anybody took their sheet opens it themselves', () => {
        const { games, game, ids } = readingOf(3);
        const [anna, boris] = ids;
        markPlayerDisconnected(game, boris);
        markPlayerConnected(game, boris);
        expect(gameLogic.takeSheet(games, CODE, anna, boris)).toEqual({ success: false, error: 'This player is here' });
        expect(gameLogic.openSheet(games, CODE, boris).success).toBe(true);
    });

    test('a player whose sheet another is reading does not open it', () => {
        const { games, game, ids } = readingOf(3);
        const [anna, boris] = ids;
        markPlayerDisconnected(game, boris);
        gameLogic.takeSheet(games, CODE, anna, boris);
        markPlayerConnected(game, boris);
        expect(gameLogic.openSheet(games, CODE, boris)).toEqual({ success: false, error: 'Another player is reading your sheet' });
    });
});

describe('a new round', () => {
    test.each([
        ['in the middle of the writing', roundOf],
        ['in the middle of the reading', readingOf],
    ])('%s it takes the room back to the lobby with the same players, the round and its leavers gone', (when, start) => {
        const { games, game, ids } = start(3);
        gameLogic.removePlayerFromGame(games, CODE, ids[1]);
        expect(game.recentlyLeft.size).toBe(1);

        expect(gameLogic.newRound(games, CODE, ids[0])).toEqual({ success: true, endedJoinRequests: [] });
        expect(game.state).toBe('waiting');
        expect(game.round).toBeNull();
        expect(game.players.map(player => player.id)).toEqual([ids[0], ids[2]]);
        // The leaver's seat went with the round
        expect(game.recentlyLeft.size).toBe(0);
    });

    test('after every story, another round starts as a new one', () => {
        const { games, game, ids } = readingOf(2);
        for (const id of ids) gameLogic.openSheet(games, CODE, id);
        expect(gameLogic.newRound(games, CODE, ids[1]).success).toBe(true);
        expect(gameLogic.startRound(games, CODE, ids[0])).toEqual({ success: true });
        expect(game.round.step).toBe(0);
        expect(game.round.sheets.flat().every(answer => answer === null)).toBe(true);
    });

    test('the newcomers waiting for the lobby are told to join again', () => {
        const { games, game, ids } = roundOf(2);
        const newcomer = idOf(5);
        expect(requestToJoin(games, CODE, 'Dina', '🐶', newcomer, secretOf(5)).success).toBe(true);

        expect(gameLogic.newRound(games, CODE, ids[0])).toEqual({ success: true, endedJoinRequests: [newcomer] });
        expect(game.joinRequests.size).toBe(0);
        expect(gameLogic.addPlayerToGame(games, CODE, 'Dina', '🐶', newcomer, secretOf(5)).success).toBe(true);
    });

    test('no new round without a round, from a stranger, or in a room that is gone', () => {
        const lobby = lobbyOf(2);
        expect(gameLogic.newRound(lobby.games, CODE, lobby.ids[0])).toEqual({ success: false, error: 'No round is on' });
        const { games, ids } = roundOf(2);
        expect(gameLogic.newRound(games, CODE, idOf(11))).toEqual({ success: false, error: 'Player not found in game' });
        expect(gameLogic.newRound(new Map(), CODE, ids[0])).toEqual({ success: false, error: 'Game not found' });
    });
});

describe('the room\'s storage', () => {
    test('a round in the middle of the reading comes back from the storage as it was', () => {
        const { games, game, ids } = readingOf(3);
        markPlayerDisconnected(game, ids[1]);
        gameLogic.takeSheet(games, CODE, ids[0], ids[1]);
        gameLogic.openSheet(games, CODE, ids[2]);
        gameLogic.removePlayerFromGame(games, CODE, ids[1]);

        // The storage keeps JSON-like values, as the room's storage does
        const stored = JSON.parse(JSON.stringify(gameToStorage(game)));
        const loaded = gameFromStorage(stored);
        expect(loaded).toEqual(game);

        // And the round goes on from there
        const reloaded = new Map([[CODE, loaded]]);
        expect(gameLogic.openSheet(reloaded, CODE, ids[0]).success).toBe(true);
        expect(gameLogic.sheetsOpenedBy(loaded, ids[2])).toEqual(gameLogic.sheetsOpenedBy(game, ids[2]));
    });
});

describe('the round as the pages see it', () => {
    // Every text written in the round so far
    const textsOf = game => game.round.sheets.flat().filter(Boolean).map(answer => answer.text);

    test('while writing: who has answered, who holds which sheet, who is away - and not one answer', () => {
        const { games, game, ids } = roundOf(4);
        const [anna, boris, vera, gleb] = ids;
        gameLogic.writeAnswer(games, CODE, anna, 'secret of Anna');
        markPlayerDisconnected(game, boris);
        gameLogic.takeSheet(games, CODE, anna, boris);
        gameLogic.removePlayerFromGame(games, CODE, gleb);

        const view = gameLogic.roundView(game);
        expect(view).toMatchObject({ step: 0, questionCount: 8, opened: 0, stories: null });
        expect(view.seats).toEqual([
            { playerId: anna, name: 'Anna', avatar: '🐱', absent: null, answered: true, heldBy: null, sheet: null, openedBy: null },
            { playerId: boris, name: 'Boris', avatar: '🐱', absent: 'offline', answered: false, heldBy: anna, sheet: null, openedBy: null },
            { playerId: vera, name: 'Vera', avatar: '🐱', absent: null, answered: false, heldBy: null, sheet: null, openedBy: null },
            { playerId: gleb, name: 'Gleb', avatar: '🐱', absent: 'left', answered: false, heldBy: null, sheet: null, openedBy: null },
        ]);
        const seen = JSON.stringify(gameLogic.serializeGame(game));
        expect(seen).not.toContain('secret of Anna');
        expect(JSON.parse(seen).round).toEqual(view);
    });

    test('while reading: which sheet each seat reads and who opened it - still not one answer, even of an open sheet', () => {
        const { games, game, ids } = readingOf(3);
        gameLogic.openSheet(games, CODE, ids[0]);

        const view = gameLogic.roundView(game);
        expect(view.step).toBe(gameLogic.READING_STEP);
        expect(view.opened).toBe(1);
        expect(view.seats.map(seat => seat.sheet)).toEqual(ids.map((id, seat) => gameLogic.sheetAt(game.round, seat)));
        expect(view.seats.map(seat => seat.openedBy)).toEqual([ids[0], null, null]);
        expect(view.seats.every(seat => seat.answered === false)).toBe(true);
        const seen = JSON.stringify(view);
        for (const text of textsOf(game)) expect(seen).not.toContain(text);
    });

    test('once the last sheet is open, every story is in it', () => {
        const { games, game, ids } = readingOf(2);
        for (const id of ids) gameLogic.openSheet(games, CODE, id);
        const view = gameLogic.roundView(game);
        expect(view.opened).toBe(2);
        expect(view.stories).toEqual(gameLogic.allStories(game));
        expect(view.stories.flatMap(story => story.answers).sort()).toEqual(textsOf(game).sort());
    });

    test('the lobby has no round, and the players list carries the round with it', () => {
        const lobby = lobbyOf(2);
        expect(gameLogic.roundView(lobby.game)).toBeNull();
        expect(gameLogic.playersView(lobby.game)).toEqual({ players: lobby.game.players, round: null });

        const { game } = roundOf(2);
        expect(gameLogic.playersView(game).round).toEqual(gameLogic.roundView(game));
    });
});
