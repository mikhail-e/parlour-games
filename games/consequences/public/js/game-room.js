// The game's part of the room page, on the kit's room-page.js: entering the
// room, the newcomer's waiting screen, leaving and the invitation are the
// kit's. This file draws the room from currentGame - the lobby, the writing,
// the reading, every story - and sends the game's moves.
//
// Every story is a window (#storiesModal) over the room: the round being read
// once its last sheet is open («Every story»), or a round of the room's
// history (the lobby's rounds played). Whether it is open and which round it
// shows is this page's own, as the room knows nothing of it; it stays open
// while the room's round changes. The room sends the sets of its history with
// the game (historySets), and a round of it when the page asks (history-round).
//
// The screen is drawn anew from the round (round-state: game-logic.js's
// roundView) on every change, as the players list is: never one seat patched.
// One part stays: the answer form is in the page from the start and is only
// shown, hidden and relabelled, so an answer being typed survives the others'
// moves and a language change. It is emptied when its sheet changes - the next
// step, another seat's sheet.
/* global createIcon, shareOrCopy, AppStorage, getText, keepScreenAwake, MAX_ANSWER_LENGTH, MIN_PLAYERS */
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
// This player has opened every story of the round being read: each comes to
// them in their own time, so the last sheet to open changes nobody's screen -
// or its reader would never see it. The screen may sleep after it
let storiesSeen = false;
// The window of every story: open or not, the round it shows (1 to the last
// of windowRoundCount()), and whether it asks «Another round»'s question
const storiesWindow = { open: false, number: 0, asking: false, drawn: null };
// The rounds of the room's history this page has got, by number: a round of
// the history never changes. And the ones asked for, not answered yet
const historyRounds = new Map();
const historyAsked = new Set();
// The player's own answer as this tab sent it ({ room, step, text }), kept in
// the tab (a reload keeps it): shown while they wait, and «Change the answer»
// puts it back into the field. The room never sends an answer's text back
// before the stories
let sentAnswer = AppStorage.session.get('sentAnswer');
// The step whose answer the player asked to take back: the field opening on
// it gets the answer back
let takingBack = null;

let newRoundModal = null;
let storiesModal = null;

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
    'There is no answer to change',
    // A round of the history the room does not have: the window shows none
    'No such round'
];

// The page's texts (i18n.js is loaded before this script)
function say(key, placeholders = {}) {
    return getText(key, key, placeholders);
}

// A text of the round's set of questions (translations.js): its name, a
// question, a heading in its words. A round an earlier version started has no
// set and goes on with the classic one, as the room says too (game-logic.js)
function sayOfSet(round, key, placeholders = {}) {
    return say(`${(round && round.questionSet) || 'classic'}${key}`, placeholders);
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
        // What the last socket asked may never come: the window asks again
        historyAsked.clear();
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
            keepEndedRound(currentGame.round, data.historySets || []);
            currentGame.state = data.state;
            currentGame.round = data.round;
            currentGame.historySets = data.historySets || [];
            // Back in the lobby: the newcomers who waited are joining
            if (!data.round) waitingNewcomers.clear();
            renderRoom();
        },
        // A round of the room's history this page asked for
        'history-round': (data) => {
            if (!data || !data.round) return;
            historyAsked.delete(data.number);
            historyRounds.set(data.number, data.round);
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
    // Every sheet open: «Another round» on the reading sheet takes the place of «New round»
    const allRead = reading && Boolean(round.stories);

    showCard('inviteCard', !round);
    showCard('playersCard', !round);
    showCard('roundsCard', !round && historySets().length > 0);
    showCard('writingCard', Boolean(round) && !reading);
    showCard('readingCard', reading);
    showCard('seatsCard', Boolean(round));
    showCard('newRound', Boolean(round) && !allRead);
    if (!round && newRoundModal) newRoundModal.hide();
    renderNewRoundQuestion(reading);

    if (!round) {
        openSheets.clear();
        storiesSeen = false;
        // A round's answer is no answer of the next one
        if (sentAnswer) {
            sentAnswer = null;
            AppStorage.session.remove('sentAnswer');
        }
    }
    renderLobby();
    if (round && !reading) renderWriting(round);
    if (reading) renderReading(round);
    if (round) renderSeats(round, reading);
    renderStoriesWindow();

    // A phone that sleeps loses the room: awake while the round is on, until
    // this page has opened every story
    keepScreenAwake(Boolean(round) && !storiesSeen);
}

// «New round» and its question by the round's phase: while writing the
// round's sheets are lost (red: it cannot be undone), while reading its
// stories go into the history (the kit's red is only for what cannot be undone)
function renderNewRoundQuestion(reading) {
    const newRound = document.getElementById('newRound');
    newRound.classList.toggle('btn-outline-danger', !reading);
    newRound.classList.toggle('btn-outline-primary', reading);
    document.getElementById('newRoundLoses').hidden = reading;
    document.getElementById('newRoundKeeps').hidden = !reading;
    const confirm = document.getElementById('confirmNewRound');
    confirm.classList.toggle('btn-danger', !reading);
    confirm.classList.toggle('btn-primary', reading);
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
    renderRoundsPlayed();
}

// The rounds played, in order: each row opens the window of every story on
// its round. Their sets' names in the page's language
function renderRoundsPlayed() {
    document.getElementById('roundsList').replaceChildren(...historySets().map((questionSet, index) => {
        const row = button('rounds-list__row', undefined, () => openStoriesWindow(index + 1));
        const icon = createIcon('caret-right');
        row.append(element('span', 'rounds-list__number', say('roundNumber', { n: index + 1 })),
            element('span', 'rounds-list__set', sayOfSet({ questionSet }, 'Name')), icon);
        const item = element('li');
        item.append(row);
        return item;
    }));
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

// The writing: the step, the sheet in front of the player with its answered
// questions as pleats, and the question - or, once answered, what happens next
function renderWriting(round) {
    const { step, questionCount } = round;
    document.getElementById('stepLabel').textContent = say('stepOf', { step: step + 1, count: questionCount });
    document.getElementById('stepMarks').replaceChildren(...Array.from({ length: questionCount }, (_, index) => {
        return element('i', index < step ? 'done' : (index === step ? 'now' : ''));
    }));

    const mine = seatOf(round, currentPlayer.id);
    const held = heldSeat(round);
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
        field.value = (takenBack && sentAnswerAt(step)) || '';
        answerSending = false;
        if (takenBack) takingBack = null;
        // A sheet that comes to the player opens with the focus in its field
        if (target) setTimeout(focusAnswerField);
    }

    // The sheet's title is the round's set; an absent player's sheet the player
    // took says whose it is under it, never as a second title
    document.getElementById('setTitle').textContent = sayOfSet(round, 'Name');
    const owner = document.getElementById('writingTitle');
    owner.hidden = !held;
    owner.textContent = held ? say('sheetOfPlayer', { name: held.name }) : '';
    document.getElementById('giveSheetBack').hidden = !held;

    renderFolds(round, target ? step : step + 1);
    document.getElementById('answerForm').hidden = !target;
    const hint = document.getElementById('sheetHint');
    hint.hidden = Boolean(target);
    hint.textContent = target ? '' : waitingHint(round, mine);
    // Their own answer while they wait, so a slip can be seen and changed
    const sent = !target && mine && mine.answeredBy === currentPlayer.id ? sentAnswerAt(step) : null;
    document.getElementById('sentBlock').hidden = sent === null;
    document.getElementById('sentText').textContent = sent || '';
    // Only an answer the player wrote themselves, while they wait for the others
    const edit = document.getElementById('editAnswer');
    edit.hidden = Boolean(target) || !mine || mine.answeredBy !== currentPlayer.id;
    edit.disabled = takingBack === step;
    if (target) {
        document.getElementById('questionNumber').textContent = say('questionOf', { number: step + 1, count: questionCount });
        document.getElementById('questionText').textContent = sayOfSet(round, `Question${step + 1}`);
        updateAnswerField();
    }
}

// The focus in the answer field, after the end of its text: the form is shown
// further down. Not under the window of every story, which keeps the focus
// inside itself: the field gets it when the window closes
function focusAnswerField() {
    if (storiesWindow.open || document.getElementById('writingCard').hidden || document.getElementById('answerForm').hidden) return;
    const field = document.getElementById('answerText');
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
}

// The player's own answer at this step, as this tab sent it, or null: the
// room never sends an answer back before the stories
function sentAnswerAt(step) {
    return sentAnswer && sentAnswer.room === currentGame.id && sentAnswer.step === step ? sentAnswer.text : null;
}

// The answered questions of the sheet, a pleat each: the question, never the answer
function renderFolds(round, count) {
    document.getElementById('folds').replaceChildren(...Array.from({ length: count },
        (_, index) => element('div', 'fold', `${index + 1}. ${sayOfSet(round, `Question${index + 1}`)}`)));
}

// Under the sent answer: who answers (or answered) for this player at this
// step, or who gets the sheet next
function waitingHint(round, mine) {
    if (!mine) return '';
    const writer = mine.heldBy || (mine.answeredBy !== currentPlayer.id ? mine.answeredBy : null);
    if (writer) return say('answeredForYou', { name: nameOf(round, writer) });
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
    const parts = [element('h6', 'sheet-title', sayOfSet(round, 'StoriesReady'))];
    const mine = seatOf(round, currentPlayer.id);
    if (mine) parts.push(ownSheet(round, mine));
    for (const seat of round.seats) {
        if (seat === mine) continue;
        if (isMe(seat.heldBy)) parts.push(takenSheet(seat));
        else if (isMe(seat.openedBy)) parts.push(sheetSection(say('sheetOfPlayer', { name: seat.name }), openSheet(seat.sheet)));
    }
    parts.push(element('p', 'opened-count', say('openedCount', { opened: round.opened, count: round.seats.length })));
    parts.push(storiesButton(round));
    if (round.stories) parts.push(anotherRoundButton());
    document.getElementById('readingCard').replaceChildren(...parts);
}

// «Every story»: there from the start of the reading, off until the last sheet
// is open; it opens the window on the round being read, the last of the window
function storiesButton(round) {
    const show = button('btn btn-primary btn-lg', sayOfSet(round, 'AllStories'), () => {
        storiesSeen = true;
        openStoriesWindow(windowRoundCount());
    });
    show.id = 'showStories';
    show.disabled = !round.stories;
    const row = element('div', 'd-grid mt-3');
    row.append(show);
    return row;
}

// «Another round» on the reading sheet, once every sheet is open: it asks first
function anotherRoundButton() {
    const another = button('btn btn-outline-primary btn-lg', say('anotherRound'), () => newRoundModal.show());
    another.id = 'anotherRound';
    const row = element('div', 'd-grid mt-2');
    row.append(another);
    return row;
}

function sheetSection(title, ...content) {
    const section = element('section', 'reading-sheet');
    section.append(element('h3', 'reading-sheet__title', title), ...content.filter(Boolean));
    return section;
}

function ownSheet(round, mine) {
    if (isMe(mine.openedBy)) {
        return sheetSection(say('yourSheet'), element('p', 'lead-on-sheet', say('readThisAloud')), openSheet(mine.sheet));
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

// A closed sheet: a sealed envelope to tap
function closedSheet(onOpen) {
    const sheet = button('closed-sheet', undefined, onOpen);
    const envelope = element('span', 'envelope');
    envelope.setAttribute('aria-hidden', 'true');
    envelope.append(element('span', 'envelope__seal'));
    sheet.append(envelope, element('span', 'closed-sheet__label', say('tapToOpen')));
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

// The story: the answers in order, read as one text, without their questions
function storyList(answers) {
    const list = element('ol', 'story');
    for (const answer of answers) {
        const item = element('li');
        item.append(element('span', 'story__answer', answer || ''));
        list.append(item);
    }
    return list;
}

// The sets of the room's history; a room of an earlier version sends none
function historySets() {
    return (currentGame && currentGame.historySets) || [];
}

// The round being read, once every sheet is open: the window's last round.
// It is not in the history until it ends
function roundBeingRead() {
    const round = currentGame && currentGame.round;
    return round && round.step >= round.questionCount && round.stories ? round : null;
}

// The rounds the window pages through: the history, then the round being read
function windowRoundCount() {
    return historySets().length + (roundBeingRead() ? 1 : 0);
}

// Round `number` of the window as { questionSet, stories: [{ answers, readBy }] },
// readBy a name or null; stories null while the room has not sent them
function windowRound(number) {
    const sets = historySets();
    if (number <= sets.length) {
        const kept = historyRounds.get(number);
        return { questionSet: sets[number - 1], stories: kept ? kept.stories : null };
    }
    const round = roundBeingRead();
    if (!round) return null;
    return {
        questionSet: round.questionSet,
        stories: round.stories.map(story => ({ answers: story.answers, readBy: nameOf(round, story.readBy) || null }))
    };
}

// A round of the history the window needs and the page has not got: the room sends it
function askForHistoryRound(number) {
    if (number < 1 || number > historySets().length || historyRounds.has(number) || historyAsked.has(number)) return;
    historyAsked.add(number);
    sendMove('history-round', { number });
}

// The round being read has just ended with every story seen: it is the
// history's newest round now, and the page keeps what it had - the window open
// on it goes on showing it, with nothing to ask
function keepEndedRound(round, sets) {
    if (!round || round.step < round.questionCount || !round.stories || sets.length !== historySets().length + 1) return;
    historyRounds.set(sets.length, {
        questionSet: round.questionSet,
        stories: round.stories.map(story => ({ answers: story.answers, readBy: nameOf(round, story.readBy) || null }))
    });
}

function openStoriesWindow(number) {
    Object.assign(storiesWindow, { open: true, number, asking: false, drawn: null });
    renderStoriesWindow();
    storiesModal.show();
}

// The window as it is now: its round's title and number, its stories (drawn
// anew only when the round, its stories or the language change, so a reader's
// place and a «Copied!» stay), the buttons, the line of a new round started
function renderStoriesWindow() {
    if (!storiesWindow.open) return;
    const count = windowRoundCount();
    const { number } = storiesWindow;
    const shown = number >= 1 && number <= count ? windowRound(number) : null;
    // The round being read in the window has ended without its stories: its question is over
    if (storiesWindow.asking && (!roundBeingRead() || number !== count)) storiesWindow.asking = false;
    const { asking } = storiesWindow;

    const title = document.getElementById('storiesTitle');
    // The question's title is the one of New round's own window, with its icon
    if (asking) title.replaceChildren(createIcon('refresh'), element('span', '', say('newRound')));
    else title.textContent = shown ? sayOfSet(shown, 'AllStories') : '';
    const line = document.getElementById('storiesRound');
    line.hidden = asking;
    line.textContent = say('roundOf', { n: number, count });

    // Opened in the lobby or the reading, it shows the writing only if a round began meanwhile
    const round = currentGame.round;
    document.getElementById('newRoundStarted').hidden = asking || !round || round.step >= round.questionCount;

    const list = document.getElementById('storyList');
    list.hidden = asking;
    const drawn = shown && shown.stories ? `${number}:${shown.questionSet}:${document.documentElement.lang}` : null;
    if (drawn !== storiesWindow.drawn) {
        storiesWindow.drawn = drawn;
        list.replaceChildren(...(drawn ? storySheets(shown) : []));
    }
    list.setAttribute('aria-busy', String(Boolean(shown) && !drawn));
    askForHistoryRound(number);
    // The round before it is asked for at once: «Previous» need not wait
    askForHistoryRound(number - 1);

    document.getElementById('storiesEnd').hidden = asking;
    document.getElementById('previousRound').disabled = number <= 1;
    document.getElementById('nextRound').disabled = number >= count;
    document.getElementById('windowAnotherRound').hidden = !roundBeingRead() || number !== count;
    document.getElementById('windowNewRoundText').hidden = !asking;
    document.getElementById('windowNewRoundButtons').hidden = !asking;
}

// Another round of the window, from its first story: the window's head gets
// the focus, so a keyboard or a screen reader starts at the new round
function showWindowRound(step) {
    const count = windowRoundCount();
    const number = Math.min(Math.max(storiesWindow.number + step, 1), count);
    if (number === storiesWindow.number) return;
    storiesWindow.number = number;
    renderStoriesWindow();
    document.getElementById('storiesBody').scrollTop = 0;
    const list = document.getElementById('storyList');
    list.classList.remove('stories--from-left', 'stories--from-right');
    // A new animation for a list that had one: its class anew, after a reflow
    void list.offsetWidth;
    list.classList.add(step > 0 ? 'stories--from-right' : 'stories--from-left');
    document.getElementById('storiesTitle').focus();
}

// Every story of a round: each sheet whole, its title the number in words, who
// read it, and the strip to share it
function storySheets(shown) {
    return shown.stories.map((story, number) => {
        const sheet = element('div', 'sheet');
        sheet.dataset.sheet = number;
        const head = element('div', 'story-head');
        head.append(element('span', '', sayOfSet(shown, `StoryTitle${number + 1}`)));
        if (story.readBy) head.append(element('small', '', say('storyReadBy', { name: story.readBy })));
        const share = element('button', 'story-send');
        share.type = 'button';
        share.append(createIcon('export'), element('span', '', say('shareStory')));
        share.addEventListener('click', () => shareStory(share, shown, story.answers));
        sheet.append(head, storyList(story.answers), share);
        return sheet;
    });
}

// A story for friends: the round's set as its title - capitals between two
// stars, like the sheets' titles: a shared text is plain, and bold is every
// messenger's own markup -, its text, then an invitation with the game's name
// and its site. The address is inside the text, not in the share sheet's
// `url`: some apps keep only one of the two
function shareStory(button, round, answers) {
    const title = `★ ${sayOfSet(round, 'Name').toUpperCase()} ★`;
    const text = `${title}\n\n${answers.join('\n')}\n\n${say('shareStoryInvitation', { site: window.location.host })}`;
    shareOrCopy(button, { title: say('title'), text }, text);
}

// The table: every seat - here or away, its step done or not, who answers or
// reads for it - with "Answer for" / "Read for" an absent seat's sheet for a
// player free to take it, and the newcomers waiting for the next round
function renderSeats(round, reading) {
    document.getElementById('seatsTitle').textContent = reading ? say('sheets') : sayOfSet(round, 'TellingTheStory');
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

    // A new round asks first: while writing its sheets are lost, after every
    // story another player may still be reading their sheet («Another round»
    // on the reading sheet opens the same window)
    newRoundModal = new bootstrap.Modal(document.getElementById('newRoundModal'));
    document.getElementById('newRound').addEventListener('click', () => newRoundModal.show());
    document.getElementById('confirmNewRound').addEventListener('click', () => {
        newRoundModal.hide();
        sendMove('new-round');
    });

    // The window of every story: the rounds back and forth, and «Another
    // round» with its question inside it (Bootstrap's windows do not open one
    // over another). It stays open when the round ends: the stories it shows
    // are the history's now
    const windowElement = document.getElementById('storiesModal');
    storiesModal = new bootstrap.Modal(windowElement);
    windowElement.addEventListener('hidden.bs.modal', () => {
        storiesWindow.open = false;
        storiesWindow.asking = false;
        focusAnswerField();
    });
    document.getElementById('previousRound').addEventListener('click', () => showWindowRound(-1));
    document.getElementById('nextRound').addEventListener('click', () => showWindowRound(1));
    document.getElementById('windowAnotherRound').addEventListener('click', () => {
        storiesWindow.asking = true;
        renderStoriesWindow();
        document.getElementById('cancelWindowNewRound').focus();
    });
    document.getElementById('cancelWindowNewRound').addEventListener('click', () => {
        storiesWindow.asking = false;
        renderStoriesWindow();
        document.getElementById('windowAnotherRound').focus();
    });
    document.getElementById('confirmWindowNewRound').addEventListener('click', () => {
        storiesWindow.asking = false;
        sendMove('new-round');
        renderStoriesWindow();
    });
}
