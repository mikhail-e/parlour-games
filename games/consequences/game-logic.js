// Consequences - the game's rules, with no Cloudflare in them: Jest tests them
// in Node, the Worker bundles them (worker/room.js).
//
// A round: every player of the list takes a seat in the circle, in the list's
// order, with a blank sheet of eight questions. At step s (0-7) every seat
// answers question s on the sheet in front of it; when every sheet has its
// answer, and a short pause has passed, the sheets move on to the next seat,
// all at once. After the eighth
// question they move once more, and each seat reads the sheet that came to it
// (step 8). Every sheet of a round asks the questions of one set, drawn at the
// start (QUESTION_SETS). The round in the game:
//
//   game.round = {
//     questionSet: name,           // the round's set of questions; a round an earlier version saved has none: 'classic'
//     seats:    [playerId, ...],    // the circle: the list's players at the start, in its order
//     sheets:   [[answer|null] x 8], // sheets[j][q] = { text, by }: by - who wrote it (themselves or for another)
//     step:     0-7 the questions, 8 the reading
//     takenBy:  { [the seat's playerId]: playerId }, // who writes for an absent seat at this step, or reads its sheet
//     openedBy: { [sheet number]: playerId },         // which sheets are open, and who opened them
//     stepEndsAt: time | null,  // every sheet has this step's answer: when they move on
//   }
//   game.lastQuestionSet = name | null  // the set of the room's last round: the next one draws another
//   game.historySets = [name, ...]      // the room's history: the set of every round that reached the reading, in order
//
// The room's history: a round that reached the reading goes into it when it
// ends ("Another round", "New round"), every sheet whole, even one nobody
// opened; a round ended while writing does not. The room keeps history round
// N (from 1) under its own key, `history:N` (worker/room.js); the game keeps
// only their sets:
//
//   { questionSet: name, stories: [{ answers: [text x 8], readBy: name | null }] }

// The players of the room - joining with the browser's secret, a leaver's
// return to the round, newcomers waiting, online and offline, ghosts, the
// room's timers, the limits of a name and an avatar, the room's storage - are
// the kit's, the same in every game (packages/room-kit/shared/players.js).
// This file gives the kit what is the game's (the hooks below)
const players = require('@parlour-games/room-kit/shared/players');
const { touchGame } = players;

// The questions of a sheet (their texts are the pages', in either language)
const QUESTION_COUNT = 8;
// The sets of questions a round draws from, by their names in the pages'
// texts (<set>Name, <set>Question1-8 in translations.js; a test keeps the two
// lists together). 'classic' is the one list the game had before the sets
const QUESTION_SETS = ['classic', 'incident', 'heAndShe', 'fairyTale', 'detective', 'news', 'journey'];
const CLASSIC = 'classic';
// The step of the reading, after the last question
const READING_STEP = QUESTION_COUNT;
const MIN_PLAYERS = 2;
// The answer's limit, counted as a person counts characters (an emoji is one).
// The browser's copy is in public/js/utils.js; a test keeps the two equal
const MAX_ANSWER_LENGTH = 200;
// The pause after a step's last answer, before the sheets move on: time for
// whoever wrote it to press "Change the answer". The room's tests shorten it
const STEP_PAUSE_MS = 5000;

const {
    createGame,
    addPlayerToGame,
    removePlayerFromGame,
    removeStaleDisconnectedPlayers,
    playersView
} = players.roomPlayers({
    // The round: none in the lobby; the set of the last one, which the next
    // round does not draw; the sets of the room's history
    fields: () => ({ round: null, lastQuestionSet: null, historySets: [] }),
    // A leaver of the round keeps their seat: the others see whose it is
    snapshot: (game, player) => ({ name: player.name, avatar: player.avatar }),
    // A leaver puts down the absent players' sheets they held
    forget: (game, playerId) => releaseSheetsOf(game, playerId),
    // The round goes with the players list (a join, a return, a leaver): a
    // seat's presence is part of it
    view: game => ({ round: roundView(game), historySets: historySetsOf(game) }),
});

// The sheet in front of seat i at the round's step: sheet j starts at seat j
// and moves one seat on with every step, so seat i holds sheet (i - step) mod N.
// The last answer on sheet j is written at seat (j + 7) mod N and the sheet is
// read at seat (j + 8) mod N: never the seat of its last answer, for any N >= 2
function sheetAt(round, seatIndex) {
    const count = round.seats.length;
    return ((seatIndex - round.step) % count + count) % count;
}

// The game and the round of a move, or the error to answer with
function roundOf(games, gameId) {
    const game = games.get(gameId);
    if (!game) return { error: 'Game not found' };
    if (game.state !== 'started' || !game.round) return { error: 'No round is on' };
    return { game, round: game.round };
}

// An answer as it is kept: trimmed, never empty, at most MAX_ANSWER_LENGTH
// characters. Returns { text } or { error }
function checkAnswer(text) {
    if (typeof text !== 'string') return { error: 'Invalid answer' };
    const trimmed = text.trim();
    if (trimmed === '') return { error: 'Answer cannot be empty' };
    if ([...trimmed].length > MAX_ANSWER_LENGTH) return { error: 'Answer is too long' };
    return { text: trimmed };
}

// Any player of the lobby starts a round with at least two players. Every
// player of the list takes a seat, offline ones too: a phone that slept in the
// lobby must not leave its owner out of the round. The round draws its set of
// questions from the sets but the last round's (`random` gives a number in
// [0, 1), as Math.random does: a set is no secret)
function startRound(games, gameId, playerId, random = Math.random) {
    const game = games.get(gameId);
    if (!game) return { success: false, error: 'Game not found' };
    if (!game.players.some(player => player.id === playerId)) {
        return { success: false, error: 'Player not found in game' };
    }
    if (game.state !== 'waiting') return { success: false, error: 'The round has already started' };
    if (game.players.length < MIN_PLAYERS) return { success: false, error: 'Need at least 2 players to start' };

    const seats = game.players.map(player => player.id);
    const sets = QUESTION_SETS.filter(set => set !== game.lastQuestionSet);
    const questionSet = sets[Math.floor(random() * sets.length)];
    game.lastQuestionSet = questionSet;
    game.round = {
        questionSet,
        seats,
        sheets: seats.map(() => Array(QUESTION_COUNT).fill(null)),
        step: 0,
        takenBy: {},
        openedBy: {},
        stepEndsAt: null
    };
    game.state = 'started';
    touchGame(game);
    return { success: true };
}

// A player writes the answer to this step's question on the sheet in front of
// them - their own seat's, or, with `forPlayerId`, the sheet of an absent
// player they have taken. While the step is on, a player may take their own
// answer back and write it anew (takeBackAnswer). When every sheet has its
// answer (`allAnswered`), the pause before the sheets move on begins
// (moveSheetsIfDue)
function writeAnswer(games, gameId, playerId, text, forPlayerId = null, pauseMs = STEP_PAUSE_MS) {
    const { game, round, error } = roundOf(games, gameId);
    if (error) return { success: false, error };
    if (round.step >= READING_STEP) return { success: false, error: 'The questions are over' };
    if (!game.players.some(player => player.id === playerId)) {
        return { success: false, error: 'Player not found in game' };
    }

    const seatPlayerId = forPlayerId || playerId;
    const seatIndex = round.seats.indexOf(seatPlayerId);
    if (seatIndex === -1) return { success: false, error: 'You are not in this round' };
    const holder = round.takenBy[seatPlayerId];
    if (seatPlayerId !== playerId && holder !== playerId) {
        return { success: false, error: 'You are not holding this sheet' };
    }
    if (seatPlayerId === playerId && holder) {
        return { success: false, error: 'Another player is writing on your sheet' };
    }

    const sheet = round.sheets[sheetAt(round, seatIndex)];
    if (sheet[round.step]) return { success: false, error: 'This answer has already been written' };
    const answer = checkAnswer(text);
    if (answer.error) return { success: false, error: answer.error };

    sheet[round.step] = { text: answer.text, by: playerId };
    // The sheet of an absent player goes back on the table, answered
    delete round.takenBy[seatPlayerId];

    const allAnswered = round.sheets.every(eachSheet => eachSheet[round.step]);
    if (allAnswered) round.stepEndsAt = Date.now() + pauseMs;
    touchGame(game);
    return { success: true, allAnswered };
}

// The pause after a step's last answer has run out: the sheets move on, all
// at once (the room's timer calls this). False when nothing is due yet
function moveSheetsIfDue(game) {
    const round = game.round;
    if (!round || !round.stepEndsAt || Date.now() < round.stepEndsAt) return false;
    round.step += 1;
    round.takenBy = {};
    round.stepEndsAt = null;
    touchGame(game);
    return true;
}

// "Change the answer": a player takes back the answer they wrote on their own
// seat's sheet at this step (`step`, the one their page shows), while the
// step is on - the pause after its last answer included. The seat is blank
// again - the step waits for it, and the pause is off - and they write it
// anew (writeAnswer). Only an answer they wrote themselves: one another
// player wrote for their seat stays
function takeBackAnswer(games, gameId, playerId, step) {
    const { game, round, error } = roundOf(games, gameId);
    if (error) return { success: false, error };
    const seatIndex = round.seats.indexOf(playerId);
    if (!game.players.some(player => player.id === playerId) || seatIndex === -1) {
        return { success: false, error: 'You are not in this round' };
    }
    if (round.step !== step) return { success: false, error: 'This step is over' };
    const sheet = round.sheets[sheetAt(round, seatIndex)];
    const answer = sheet[round.step];
    if (!answer) return { success: false, error: 'There is no answer to change' };
    if (answer.by !== playerId) return { success: false, error: 'Another player wrote this answer' };

    sheet[round.step] = null;
    round.stepEndsAt = null;
    touchGame(game);
    return { success: true };
}

// A seat is absent when its player is offline or has left the room (a
// leaver keeps the seat: game.recentlyLeft holds what the kit keeps of them)
function isAbsent(game, seatPlayerId) {
    const player = game.players.find(each => each.id === seatPlayerId);
    return !player || !player.isConnected;
}

// "Answer for" / "Read for": a player takes the sheet of an absent seat. While
// writing, a player who has answered this step and holds no other sheet takes
// one still blank at this step; while reading, any player who holds no other
// takes one not yet open. The first to ask gets it, the others hear who has it
function takeSheet(games, gameId, playerId, seatPlayerId) {
    const { game, round, error } = roundOf(games, gameId);
    if (error) return { success: false, error };
    const ownSeat = round.seats.indexOf(playerId);
    if (!game.players.some(player => player.id === playerId) || ownSeat === -1) {
        return { success: false, error: 'You are not in this round' };
    }
    const seatIndex = round.seats.indexOf(seatPlayerId);
    if (seatIndex === -1) return { success: false, error: 'This seat is not in the round' };
    if (seatPlayerId === playerId || !isAbsent(game, seatPlayerId)) {
        return { success: false, error: 'This player is here' };
    }
    if (round.takenBy[seatPlayerId]) return { success: false, error: 'Another player has already taken this sheet' };
    if (Object.values(round.takenBy).includes(playerId)) return { success: false, error: 'You are already holding a sheet' };

    const sheetNumber = sheetAt(round, seatIndex);
    if (round.step < READING_STEP) {
        if (round.sheets[sheetNumber][round.step]) return { success: false, error: 'This answer has already been written' };
        if (!round.sheets[sheetAt(round, ownSeat)][round.step]) return { success: false, error: 'Answer your own question first' };
    } else if (round.openedBy[sheetNumber]) {
        return { success: false, error: 'This sheet is already open' };
    }

    round.takenBy[seatPlayerId] = playerId;
    touchGame(game);
    return { success: true };
}

// "Put it back": the taker leaves the sheet for another, or for its player
function returnSheet(games, gameId, playerId, seatPlayerId) {
    const { game, round, error } = roundOf(games, gameId);
    if (error) return { success: false, error };
    if (round.takenBy[seatPlayerId] !== playerId) return { success: false, error: 'You are not holding this sheet' };
    delete round.takenBy[seatPlayerId];
    touchGame(game);
    return { success: true };
}

// The sheets a player held go back on the table: their last page has gone,
// they left, or the room woke without their socket. Returns the seats freed
function releaseSheetsOf(game, playerId) {
    if (!game.round) return [];
    const freed = Object.keys(game.round.takenBy).filter(seat => game.round.takenBy[seat] === playerId);
    for (const seat of freed) delete game.round.takenBy[seat];
    if (freed.length > 0) touchGame(game);
    return freed;
}

// The reading: a player opens the sheet in front of their seat - or, with
// `forPlayerId`, the sheet of an absent seat they have taken. Until every
// sheet is open, a sheet's answers go to the one who opened it only
function openSheet(games, gameId, playerId, forPlayerId = null) {
    const { game, round, error } = roundOf(games, gameId);
    if (error) return { success: false, error };
    if (round.step < READING_STEP) return { success: false, error: 'The stories are not ready yet' };
    if (!game.players.some(player => player.id === playerId)) {
        return { success: false, error: 'Player not found in game' };
    }

    const seatPlayerId = forPlayerId || playerId;
    const seatIndex = round.seats.indexOf(seatPlayerId);
    if (seatIndex === -1) return { success: false, error: 'You are not in this round' };
    const holder = round.takenBy[seatPlayerId];
    if (seatPlayerId !== playerId && holder !== playerId) {
        return { success: false, error: 'You are not holding this sheet' };
    }
    if (seatPlayerId === playerId && holder) {
        return { success: false, error: 'Another player is reading your sheet' };
    }

    const sheetNumber = sheetAt(round, seatIndex);
    if (round.openedBy[sheetNumber]) return { success: false, error: 'This sheet is already open' };
    round.openedBy[sheetNumber] = playerId;
    delete round.takenBy[seatPlayerId];
    touchGame(game);
    return { success: true, sheet: sheetNumber, allOpen: allSheetsOpen(round) };
}

function allSheetsOpen(round) {
    return round.step === READING_STEP && Object.keys(round.openedBy).length === round.seats.length;
}

// A sheet's answers, in the questions' order
function answersOf(round, sheetNumber) {
    return round.sheets[sheetNumber].map(answer => answer.text);
}

// The sheets this player opened, with their answers: their page gets them
// again after a reload
function sheetsOpenedBy(game, playerId) {
    const round = game.round;
    if (!round) return [];
    return Object.entries(round.openedBy)
        .filter(([, openedBy]) => openedBy === playerId)
        .map(([sheetNumber]) => ({ sheet: Number(sheetNumber), answers: answersOf(round, Number(sheetNumber)) }));
}

// Every story with who read it, once the last sheet is open; nothing before
function allStories(game) {
    const round = game.round;
    if (!round || !allSheetsOpen(round)) return null;
    return round.sheets.map((sheet, sheetNumber) => ({
        sheet: sheetNumber,
        answers: answersOf(round, sheetNumber),
        readBy: round.openedBy[sheetNumber]
    }));
}

// A player of the list, or a leaver of the round as the kit keeps them
function playerOrLeaver(game, playerId) {
    return game.players.find(each => each.id === playerId) || game.recentlyLeft.get(playerId) || {};
}

// The sets of the room's history; a game an earlier version saved has none
function historySetsOf(game) {
    return game.historySets || [];
}

// The round as the room's history keeps it, once it has reached the reading:
// its set, and every story with the name of who read it (null: nobody opened
// it). A name, not an ID: the history outlives a leaver's snapshot. Before
// the reading, null: a round ended while writing is not kept
function historyRoundOf(game) {
    const round = game.round;
    if (!round || round.step !== READING_STEP) return null;
    return {
        questionSet: round.questionSet || CLASSIC,
        stories: round.sheets.map((sheet, sheetNumber) => {
            const readBy = round.openedBy[sheetNumber];
            return { answers: answersOf(round, sheetNumber), readBy: (readBy && playerOrLeaver(game, readBy).name) || null };
        }),
    };
}

// What a page may ask of the history: a round's number, 1 to the last.
// Returns the error to answer with, or null
function historyNumberError(game, number) {
    return Number.isInteger(number) && number >= 1 && number <= historySetsOf(game).length ? null : 'No such round';
}

// "New round" in the middle of one, or "Another round" after every story:
// back to the lobby. The players of the list stay; the leavers' seats go with
// the round; the newcomers waiting just join (worker/room.js tells their
// pages to try again). A round that reached the reading goes into the room's
// history: `history` is its number and the round to keep (null: none)
function newRound(games, gameId, playerId) {
    const game = games.get(gameId);
    if (!game) return { success: false, error: 'Game not found' };
    if (!game.players.some(player => player.id === playerId)) {
        return { success: false, error: 'Player not found in game' };
    }
    if (game.state !== 'started') return { success: false, error: 'No round is on' };

    // Before the leavers' snapshots go: their names are in it
    const kept = historyRoundOf(game);
    let history = null;
    if (kept) {
        game.historySets = [...historySetsOf(game), kept.questionSet];
        history = { number: game.historySets.length, round: kept };
    }
    game.state = 'waiting';
    game.round = null;
    game.recentlyLeft.clear();
    const endedJoinRequests = [...game.joinRequests.keys()];
    game.joinRequests.clear();
    touchGame(game);
    return { success: true, endedJoinRequests, history };
}

// The round as every page gets it: its set of questions, the step, and for
// each seat whose it is, whether it is here, whether its sheet has this step's
// answer and who wrote
// it (the seat's player may change only their own: takeBackAnswer), who holds its
// sheet, which sheet it reads and who opened that. **No answer's text**: the
// answers are secrets until the last sheet is open, and then every story is
// in it. A leaver's name and avatar come from what the kit keeps of them
function roundView(game) {
    const round = game.round;
    if (!round) return null;
    const reading = round.step === READING_STEP;
    return {
        questionSet: round.questionSet || CLASSIC,
        step: round.step,
        questionCount: QUESTION_COUNT,
        seats: round.seats.map((playerId, seatIndex) => {
            const player = playerOrLeaver(game, playerId);
            const sheetNumber = sheetAt(round, seatIndex);
            const answer = reading ? null : round.sheets[sheetNumber][round.step];
            return {
                playerId,
                name: player.name || '',
                avatar: player.avatar || '',
                absent: !game.players.some(each => each.id === playerId) ? 'left'
                    : (isAbsent(game, playerId) ? 'offline' : null),
                answered: Boolean(answer),
                answeredBy: answer ? answer.by : null,
                heldBy: round.takenBy[playerId] || null,
                sheet: reading ? sheetNumber : null,
                openedBy: reading ? (round.openedBy[sheetNumber] || null) : null
            };
        }),
        opened: Object.keys(round.openedBy).length,
        stories: allStories(game)
    };
}

// The game as a player's page gets it (game-state): never a secret's hash,
// never an answer before the stories. The history goes as its sets only: a
// page asks for the round it shows (worker/room.js, history-round)
function serializeGame(game) {
    return {
        id: game.id,
        players: game.players,
        state: game.state,
        created: game.created,
        round: roundView(game),
        historySets: historySetsOf(game)
    };
}

module.exports = {
    createGame,
    addPlayerToGame,
    removePlayerFromGame,
    removeStaleDisconnectedPlayers,
    playersView,
    serializeGame,
    startRound,
    writeAnswer,
    moveSheetsIfDue,
    takeBackAnswer,
    takeSheet,
    returnSheet,
    releaseSheetsOf,
    isAbsent,
    openSheet,
    sheetsOpenedBy,
    allStories,
    newRound,
    historySetsOf,
    historyNumberError,
    roundView,
    sheetAt,
    checkAnswer,
    QUESTION_COUNT,
    QUESTION_SETS,
    MIN_PLAYERS,
    READING_STEP,
    MAX_ANSWER_LENGTH,
    STEP_PAUSE_MS
};
