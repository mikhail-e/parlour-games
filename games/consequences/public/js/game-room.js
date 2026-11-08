// The game's part of the room page, on the kit's room-page.js: entering the
// room, the newcomer's waiting screen, leaving and the invitation are the
// kit's. This file draws the room from currentGame - the lobby, the writing,
// the reading, every story - and sends the game's moves.
//
// The screen is drawn anew from the round (round-state: game-logic.js's
// roundView) on every change, as the players list is: never one seat patched.
// One part stays: the answer form is in the page from the start and is only
// shown, hidden and relabelled, so an answer being typed survives the others'
// moves and a language change. It is emptied when its sheet changes - the next
// step, another seat's sheet.
/* global AppStorage, getText, keepScreenAwake, MAX_ANSWER_LENGTH, MIN_PLAYERS */
// From the kit's room-page.js
/* global currentGame, currentPlayer, sendMove, renderAvatar, startRoomPage */

// The answers of the sheets this player opened, by sheet number (`sheet`):
// the only answers a page has until every sheet is open
const openSheets = new Map();

// The newcomers waiting for the next round, by player ID: the kit's
// join-requested and join-request-closed, and game-state's joinRequests
const waitingNewcomers = new Map();

// The sheet the answer form writes on: `${step}:${seat's player ID}`, and the
// absent player's ID when it is not the player's own (write-answer's `for`)
let formSheet = null;
let formFor = null;
// An answer sent and not yet in the round: the button waits for it
let answerSending = false;
// Who answered for this player at this step while they were away: { step, name }
let answeredForMe = null;
// The player's own answer as this tab sent it ({ room, step, text }), kept in
// the tab (a reload keeps it): «Change the answer» puts it back into the
// field. The room never sends an answer's text back before the stories
let sentAnswer = AppStorage.session.get('sentAnswer');
// The step whose answer the player asked to take back: the field opening on
// it gets the focus
let takingBack = null;

let newRoundModal = null;

// Races another player won, or a double tap: the round-state that follows
// shows how things are, nothing went wrong
const LOST_RACES = [
    'The round has already started',
    'No round is on',
    'Another player has already taken this sheet',
    'This player is here',
    'This answer has already been written',
    'This sheet is already open',
    'You are already holding a sheet',
    'This step is over',
    'There is no answer to change'
];

// The page's texts (i18n.js is loaded before this script)
function say(key, placeholders = {}) {
    return getText(key, key, placeholders);
}

function isMe(playerId) {
    return Boolean(currentPlayer) && playerId === currentPlayer.id;
}

function seatOf(round, playerId) {
    return round.seats.find(seat => seat.playerId === playerId) || null;
}

// Whoever holds or opened a sheet sits in the round: their name is a seat's
function nameOf(round, playerId) {
    const seat = seatOf(round, playerId);
    return seat ? seat.name : '';
}

// The absent player's seat whose sheet this player holds, if any
function heldSeat(round) {
    return round.seats.find(seat => isMe(seat.heldBy) && !isMe(seat.playerId)) || null;
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(className, text, onClick) {
    const node = element('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
}

startRoomPage({
    render: renderRoom,
    setUp: setUpRoomGame,
    // A joining socket gets the round anew, then the sheets this player
    // opened (`sheet`): the ones kept from before may be another round's
    onGameState(game) {
        openSheets.clear();
        waitingNewcomers.clear();
        for (const request of game.joinRequests || []) waitingNewcomers.set(request.playerId, request);
        renderRoom();
    },
    afterError() {
        answerSending = false;
        takingBack = null;
        renderRoom();
    },
    ignoreError: error => LOST_RACES.includes(error),
    events: {
        'round-state': (data) => {
            if (!currentGame || !data) return;
            currentGame.state = data.state;
            currentGame.round = data.round;
            // Back in the lobby: the newcomers who waited are joining
            if (!data.round) waitingNewcomers.clear();
            renderRoom();
        },
        // A sheet this player opened, with its answers
        sheet: (data) => {
            if (!data) return;
            openSheets.set(data.sheet, data.answers);
            renderRoom();
        },
        'join-requested': (request) => {
            if (!request) return;
            waitingNewcomers.set(request.playerId, request);
            renderRoom();
        },
        'join-request-closed': (data) => {
            if (!data) return;
            waitingNewcomers.delete(data.playerId);
            renderRoom();
        }
    }
});

// The whole room from currentGame: which cards show, and what is on them
function renderRoom() {
    if (!currentGame) return;
    const round = currentGame.round || null;
    const reading = Boolean(round) && round.step >= round.questionCount;
    const stories = round ? round.stories : null;

    showCard('shareCard', !round);
    showCard('playersCard', !round);
    showCard('writingCard', Boolean(round) && !reading);
    showCard('readingCard', reading && !stories);
    showCard('storiesCard', Boolean(stories));
    showCard('seatsCard', Boolean(round) && !stories);
    showCard('newRound', Boolean(round) && !stories);
    if ((!round || stories) && newRoundModal) newRoundModal.hide();

    if (!round) {
        openSheets.clear();
        // A round's answer is no answer of the next one
        if (sentAnswer) {
            sentAnswer = null;
            AppStorage.session.remove('sentAnswer');
        }
    }
    renderLobby();
    if (round && !reading) renderWriting(round);
    if (reading && !stories) renderReading(round);
    if (stories) renderStories(round);
    if (round && !stories) renderSeats(round, reading);

    // A phone that sleeps loses the room: awake while the round is on
    keepScreenAwake(Boolean(round) && !stories);
}

function showCard(id, shown) {
    document.getElementById(id).hidden = !shown;
}

// The lobby: the players in the list's order, Start from the room's fewest
function renderLobby() {
    const players = currentGame.players;
    document.getElementById('playerCount').textContent = players.length;
    document.getElementById('playerList').replaceChildren(...players.map(playerCard));
    const enough = players.length >= MIN_PLAYERS;
    document.getElementById('startRound').disabled = !enough;
    document.getElementById('startHint').hidden = enough;
}

// Names and avatars are the players' own: text only, never HTML
function playerCard(player) {
    const card = element('div', 'player-card');
    card.dataset.playerId = player.id;
    const avatar = element('div', 'player-avatar');
    renderAvatar(avatar, player.avatar);
    const name = element('div', 'player-name', player.name);
    if (isMe(player.id)) name.append(` (${say('you')})`);
    card.append(avatar, name);
    return card;
}

// The writing: the step, the sheet in front of the player with its answers
// folded away, and the question - or, once answered, what happens next
function renderWriting(round) {
    const { step, questionCount } = round;
    document.getElementById('stepLabel').textContent = say('stepOf', { step: step + 1, count: questionCount });
    document.getElementById('stepMarks').replaceChildren(...Array.from({ length: questionCount }, (_, index) => {
        return element('i', index < step ? 'done' : (index === step ? 'now' : ''));
    }));

    const mine = seatOf(round, currentPlayer.id);
    const held = heldSeat(round);
    if (mine && mine.heldBy) answeredForMe = { step, name: nameOf(round, mine.heldBy) };
    // The sheet the form writes on: the absent player's that this player
    // took, or their own while it waits for their answer and nobody holds it
    const target = held || (mine && !mine.answered && !mine.heldBy ? mine : null);
    const key = target ? `${step}:${target.playerId}` : null;
    const field = document.getElementById('answerText');
    if (key !== formSheet) {
        formSheet = key;
        formFor = held ? held.playerId : null;
        // Their own sheet again at the step whose answer they took back: its
        // text comes back into the field, as this tab sent it
        const takenBack = !held && target && takingBack === step;
        const kept = takenBack && sentAnswer && sentAnswer.room === currentGame.id && sentAnswer.step === step;
        field.value = kept ? sentAnswer.text : '';
        answerSending = false;
        if (takenBack) {
            takingBack = null;
            setTimeout(() => {
                field.focus();
                field.setSelectionRange(field.value.length, field.value.length);
            });
        }
    }

    const title = document.getElementById('writingTitle');
    title.hidden = !held;
    title.textContent = held ? say('sheetOfPlayer', { name: held.name }) : '';
    document.getElementById('giveSheetBack').hidden = !held;

    renderFolds(target ? step : step + 1);
    document.getElementById('answerForm').hidden = !target;
    const hint = document.getElementById('sheetHint');
    hint.hidden = Boolean(target);
    hint.textContent = target ? '' : waitingHint(round, mine);
    // Only an answer the player wrote themselves, while they wait for the others
    const edit = document.getElementById('editAnswer');
    edit.hidden = Boolean(target) || !mine || mine.answeredBy !== currentPlayer.id;
    edit.disabled = takingBack === step;
    if (target) {
        document.getElementById('questionNumber').textContent = say('questionOf', { number: step + 1, count: questionCount });
        document.getElementById('questionText').textContent = say(`question${step + 1}`);
        updateAnswerField();
    }
}

// The answered questions of the sheet, a pleat each: the question, never the answer
function renderFolds(count) {
    document.getElementById('folds').replaceChildren(...Array.from({ length: count },
        (_, index) => element('div', 'fold', `${index + 1}. ${say(`question${index + 1}`)}`)));
}

// Under the folded answer: who answers (or answered) for this player at this
// step, or who gets the sheet next
function waitingHint(round, mine) {
    if (!mine) return '';
    if (answeredForMe && answeredForMe.step === round.step) return say('answeredForYou', { name: answeredForMe.name });
    const index = round.seats.indexOf(mine);
    const next = round.seats[(index + 1) % round.seats.length];
    return say('answerSaved', { name: next.name });
}

// The answer's characters as a person counts them (an emoji is one)
function answerLength() {
    return [...document.getElementById('answerText').value.trim()].length;
}

// The counter, the button, and the field's height: it grows with its text
function updateAnswerField() {
    const field = document.getElementById('answerText');
    const length = answerLength();
    const count = document.getElementById('answerCount');
    count.textContent = `${length}/${MAX_ANSWER_LENGTH}`;
    count.classList.toggle('sheet__count--over', length > MAX_ANSWER_LENGTH);
    document.getElementById('saveAndPass').disabled = answerSending || length > MAX_ANSWER_LENGTH;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight + 2}px`;
}

// An empty answer is not sent: the field stays open
function sendAnswer(event) {
    event.preventDefault();
    const field = document.getElementById('answerText');
    const text = field.value.trim();
    if (!formSheet || answerSending || text === '' || answerLength() > MAX_ANSWER_LENGTH) {
        field.focus();
        return;
    }
    answerSending = true;
    updateAnswerField();
    if (!formFor) {
        sentAnswer = { room: currentGame.id, step: currentGame.round.step, text };
        AppStorage.session.set('sentAnswer', sentAnswer);
    }
    sendMove('write-answer', formFor ? { text, for: formFor } : { text });
}

// The reading: the player's sheet, closed until they tap it, the absent
// players' sheets they read, and how many sheets are open
function renderReading(round) {
    const parts = [element('h6', 'sheet-title', say('storiesReady'))];
    const mine = seatOf(round, currentPlayer.id);
    if (mine) parts.push(ownSheet(round, mine));
    for (const seat of round.seats) {
        if (seat === mine) continue;
        if (isMe(seat.heldBy)) parts.push(takenSheet(seat));
        else if (isMe(seat.openedBy)) parts.push(sheetSection(say('sheetOfPlayer', { name: seat.name }), openSheet(seat.sheet)));
    }
    parts.push(element('p', 'opened-count', say('openedCount', { opened: round.opened, count: round.seats.length })));
    document.getElementById('readingCard').replaceChildren(...parts);
}

function sheetSection(title, ...content) {
    const section = element('section', 'reading-sheet');
    section.append(element('h3', 'reading-sheet__title', title), ...content.filter(Boolean));
    return section;
}

function ownSheet(round, mine) {
    if (isMe(mine.openedBy)) {
        return sheetSection(say('yourSheet'), element('p', 'lead-on-sheet', say('othersWillSee')), openSheet(mine.sheet));
    }
    const reader = mine.openedBy || mine.heldBy;
    if (reader) return sheetSection(say('yourSheet'), element('p', 'lead-on-sheet', say('yourSheetReadBy', { name: nameOf(round, reader) })));
    return sheetSection(say('yourSheet'), element('p', 'lead-on-sheet', say('readAloud')), closedSheet(() => sendMove('open-sheet', {})));
}

// An absent player's sheet this player took: closed until tapped, or back on the table
function takenSheet(seat) {
    return sheetSection(say('sheetOfPlayer', { name: seat.name }),
        closedSheet(() => sendMove('open-sheet', { for: seat.playerId })),
        button('btn btn-outline-primary', say('giveSheetBack'), () => sendMove('return-sheet', { playerId: seat.playerId })));
}

// A closed sheet: a packet of pleats to tap
function closedSheet(onOpen) {
    const sheet = button('closed-sheet', undefined, onOpen);
    const packet = element('span', 'packet');
    packet.setAttribute('aria-hidden', 'true');
    for (let pleat = 0; pleat < 5; pleat++) packet.append(element('span'));
    sheet.append(packet, element('span', 'closed-sheet__label', say('tapToOpen')));
    return sheet;
}

// An open sheet: its answers come with `sheet`, right after it opens
function openSheet(sheetNumber) {
    const answers = openSheets.get(sheetNumber);
    if (!answers) return null;
    const sheet = element('div', 'sheet');
    sheet.append(storyList(answers));
    return sheet;
}

// The answers in order, each under its question in the reader's language
function storyList(answers) {
    const list = element('ol', 'story');
    answers.forEach((answer, index) => {
        const item = element('li');
        item.append(element('span', 'story__question', say(`question${index + 1}`)),
            element('span', 'story__answer', answer || ''));
        list.append(item);
    });
    return list;
}

// Every story, once the last sheet is open: each sheet whole, with who read it
function renderStories(round) {
    document.getElementById('storyList').replaceChildren(...round.stories.map((story) => {
        const sheet = element('div', 'sheet');
        sheet.dataset.sheet = story.sheet;
        const head = element('div', 'story-head');
        head.append(element('span', '', say('sheetNumber', { number: story.sheet + 1 })),
            element('small', '', say('storyReadBy', { name: nameOf(round, story.readBy) })));
        sheet.append(head, storyList(story.answers));
        return sheet;
    }));
}

// The table: every seat - here or away, its step done or not, who answers or
// reads for it - with "Answer for" / "Read for" an absent seat's sheet for a
// player free to take it, and the newcomers waiting for the next round
function renderSeats(round, reading) {
    document.getElementById('seatsTitle').textContent = say(reading ? 'sheets' : 'tellingTheStory');
    const mine = seatOf(round, currentPlayer.id);
    const free = Boolean(mine) && !heldSeat(round) && (reading || mine.answered);
    document.getElementById('seatList').replaceChildren(...round.seats.map(seat => seatRow(round, seat, reading, free)));

    const newcomers = document.getElementById('waitingNewcomers');
    const names = [...waitingNewcomers.values()].map(request => request.name);
    newcomers.hidden = names.length === 0;
    newcomers.textContent = names.length ? say('waitingNewcomers', { names: names.join(', ') }) : '';
}

function seatRow(round, seat, reading, free) {
    const row = element('li');
    row.dataset.playerId = seat.playerId;
    const avatar = element('span', 'seat-avatar');
    renderAvatar(avatar, seat.avatar);
    const name = element('span', 'seat-name', seat.name);
    if (isMe(seat.playerId)) name.append(` (${say('you')})`);

    const status = element('span', 'seat-status');
    if (seat.absent) status.append(element('span', 'away', say(seat.absent === 'left' ? 'statusLeft' : 'statusOffline')));
    const done = reading ? Boolean(seat.openedBy) : seat.answered;
    if (done && reading) {
        const text = seat.openedBy === seat.playerId ? say('statusOpen') : say('statusReadBy', { name: nameOf(round, seat.openedBy) });
        status.append(element('span', 'done', `✓ ${text}`));
    } else if (done) {
        status.append(element('span', 'done', `✓ ${say('statusDone')}`));
    } else if (seat.heldBy) {
        status.append(element('span', '', say(reading ? 'statusReadBy' : 'statusAnsweringFor', { name: nameOf(round, seat.heldBy) })));
    } else if (reading) {
        status.append(element('span', '', say('statusClosed')));
    } else if (!seat.absent) {
        status.append(element('span', '', say('statusWriting')));
    }
    row.append(avatar, name, status);

    if (seat.absent && !seat.heldBy && !done && free) {
        row.append(button('btn btn-sm btn-outline-primary', say(reading ? 'readFor' : 'answerFor', { name: seat.name }),
            () => sendMove('take-sheet', { playerId: seat.playerId })));
    }
    return row;
}

// The game's buttons and windows, once
function setUpRoomGame() {
    document.getElementById('startRound').addEventListener('click', () => sendMove('start-round'));

    document.getElementById('answerForm').addEventListener('submit', sendAnswer);
    document.getElementById('answerText').addEventListener('input', updateAnswerField);
    // A computer's Enter sends the answer as the button does, Shift + Enter
    // starts a new line in it. A phone's Enter is a new line (its keyboard has
    // no Shift + Enter): the button at the field's right sends (style.css).
    // An Enter that ends a word of an input method is not one (Safari reports
    // it as key code 229)
    const computerKeyboard = matchMedia('(hover: hover) and (pointer: fine)');
    document.getElementById('answerText').addEventListener('keydown', event => {
        if (!computerKeyboard.matches) return;
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
        sendAnswer(event);
    });
    document.getElementById('editAnswer').addEventListener('click', event => {
        if (!currentGame || !currentGame.round) return;
        takingBack = currentGame.round.step;
        event.currentTarget.disabled = true;
        sendMove('take-back-answer', { step: takingBack });
    });
    document.getElementById('giveSheetBack').addEventListener('click', () => {
        const held = currentGame && currentGame.round ? heldSeat(currentGame.round) : null;
        if (held) sendMove('return-sheet', { playerId: held.playerId });
    });

    // A new round in the middle of one asks first: its sheets are lost
    newRoundModal = new bootstrap.Modal(document.getElementById('newRoundModal'));
    document.getElementById('newRound').addEventListener('click', () => newRoundModal.show());
    document.getElementById('confirmNewRound').addEventListener('click', () => {
        newRoundModal.hide();
        sendMove('new-round');
    });
    // After every story there is nothing to lose
    document.getElementById('anotherRound').addEventListener('click', () => sendMove('new-round'));
}
