// The room page of a game with rooms: what every game's room page does with
// the room, whatever the game. The page joins the room over HTTP, then its
// socket joins the room (the kit's room with players, worker/game-room.js);
// moves wait for that (sendMove). A newcomer to a started round waits on the
// waiting screen. The player leaves through a window that asks first. The
// game draws its own field and listens to its own events: it gives them to
// startRoomPage(). The page's markup is the game's (game.html); this script
// finds its parts by their ids and classes - the list is in the kit's
// CLAUDE.md (The room page).
/* exported socket, currentGame, currentPlayer, sendMove, renderAvatar, startRoomPage */
/* global debugLog, getText, serverErrorText, showNotification, handleApiError, AppStorage, PLAYER_ID, PLAYER_SECRET,
   isCustomAvatar, keepScreenAwake, RoomSocket, setUpInvitation */

// The room's socket (the kit's RoomSocket), the game as the page knows it
// (the server's picture: the players list and the game's own fields), and the
// player of this page
let socket;
let currentGame = null;
let currentPlayer = null;

// The game's part of the page (startRoomPage)
let roomGame = null;

let leaveModal = null;
let leaveFallbackTimer = null;
let leavingGame = false;

// The room takes a move only from a socket that has joined it (join-room,
// answered with game-state). After a reconnect - a phone waking up, a room
// restarted - the new socket joins only once the HTTP join is back, so a move
// made meanwhile waits here instead of being refused. A socket that is
// closing sends nothing: its move waits too
let roomJoined = false;
const pendingMoves = [];

function sendMove(eventName, data) {
    if (roomJoined && socket.connected) {
        socket.emit(eventName, data);
    } else {
        debugLog('⏳ Waiting to rejoin the room before sending', eventName);
        pendingMoves.push([eventName, data]);
    }
}

// The game's script calls this as it loads, with its part of the page:
// - render(): draw the game from currentGame (it changed);
// - events: the game's own socket events, { name: handler };
// - setUp(roomCode): the game's own buttons and windows, once;
// - onGameState(game): what the game takes from a joining socket's game-state
//   besides the picture (whoami: the newcomers waiting to be let in);
// - cancelEdits(): drop what the player is in the middle of before the page
//   is drawn anew (whoami: an open character field);
// - afterError(): put the page right after the server refused something;
// - ignoreError(error): true for an error that is no failure for this game
function startRoomPage(game) {
    roomGame = game;
    document.addEventListener('DOMContentLoaded', openRoomPage);
}

// Clean up and go to the landing page after leaving. Idempotent: both the
// server's confirmation and the fallback timer call it. When the room still
// exists, the landing page opens with the room code prefilled (?join=CODE),
// so the player can come back if they change their mind
function finishLeavingGame(roomStillExists = true) {
    if (leavingGame) return;
    leavingGame = true;

    if (leaveFallbackTimer) {
        clearTimeout(leaveFallbackTimer);
        leaveFallbackTimer = null;
    }

    const roomCode = currentGame ? currentGame.id : null;
    AppStorage.session.remove('playerData');

    window.location.href = (roomStillExists && roomCode) ? `/?join=${roomCode}` : '/';
}

function openRoomPage() {
    // The room code from the address. Codes are upper case; a link typed or
    // passed on in lower case still opens the room (the server reads it the same way)
    const roomCode = window.location.pathname.split('/').pop().toUpperCase();

    if (!roomCode || roomCode.length !== 6) {
        alert(getText('invalidRoomCode', 'Invalid room code'));
        window.location.href = '/';
        return;
    }

    // The name and avatar the landing page left in this tab. A tab that never
    // joined this room goes to the landing page with the room code ready
    const playerData = AppStorage.session.get('playerData');
    if (!playerData) {
        window.location.href = `/?join=${roomCode}`;
        return;
    }

    // The player is this browser (PLAYER_ID), never an ID from the tab's data
    currentPlayer = {
        id: PLAYER_ID,
        name: playerData.name,
        avatar: playerData.avatar,
        roomCode: playerData.roomCode
    };
    debugLog('Using global player ID:', PLAYER_ID);

    setUpInvitation(roomCode);
    connectToRoom(roomCode);
    setUpRoomControls(roomCode);
    if (roomGame.setUp) roomGame.setUp(roomCode);

    // Text a script draws does not follow data-i18n: draw again in the new language
    document.addEventListener('languagechanged', () => {
        if (currentGame) roomGame.render();
    });
}

// The fields of a message that are the players list and the game's part of it
function takeGameFields(data, notTheGame) {
    for (const [key, value] of Object.entries(data)) {
        if (!notTheGame.includes(key)) currentGame[key] = value;
    }
}

function connectToRoom(roomCode) {
    socket = new RoomSocket(`/ws/${roomCode}`, { log: debugLog });

    socket.on('connect', () => {
        debugLog('Connected to server');
        enterRoom(roomCode);
    });

    // A newcomer's request is over: declined - home, with the room code ready
    // to ask again; anything else (let in, the round over, the room gone)
    // - join again and follow the answer
    socket.on('join-request-ended', (data) => {
        if (data && data.outcome === 'declined') {
            window.location.href = `/?join=${roomCode}&error=join-declined`;
            return;
        }
        enterRoom(roomCode);
    });

    socket.on('game-state', (game) => {
        debugLog('Received game state:', game);
        currentGame = game;
        roomGame.render();
        if (roomGame.onGameState) roomGame.onGameState(game);

        // The socket is in the room: the moves made while it was not go now
        roomJoined = true;
        for (const [eventName, data] of pendingMoves.splice(0)) {
            socket.emit(eventName, data);
        }
    });

    // A player joined or came back: the players list and the game's part of
    // it (a returning leaver comes back with what the game kept of them)
    for (const event of ['player-joined', 'player-reconnected']) {
        socket.on(event, (data) => {
            debugLog(`${event}:`, data);
            if (!currentGame || !data) return;
            takeGameFields(data, ['player']);
            roomGame.render();
        });
    }

    socket.on('player-disconnected', (data) => {
        debugLog('Player disconnected:', data);
        if (currentGame && data && data.playerId) {
            const player = currentGame.players.find(p => p.id === data.playerId);
            if (player) {
                player.isConnected = false;
            }
        }
    });

    socket.on('player-left', (data) => {
        debugLog('Player left:', data);
        if (!currentGame || !data) return;

        if (data.playerId === currentPlayer.id) {
            // The server confirmed OUR leave - go home. If the room was
            // deleted (we were the last player), there is nothing to come
            // back to, so no ?join=CODE
            finishLeavingGame(!data.gameDeleted);
            return;
        }

        // Another player left: the server's state is the one to draw
        takeGameFields(data, ['playerId', 'playerName', 'gameDeleted']);
        // What the player was in the middle of might even be about the one who left
        if (roomGame.cancelEdits) roomGame.cancelEdits();
        roomGame.render();

        showNotification(
            getText('playerLeftNotification', `👋 ${data.playerName} left the game`, { playerName: data.playerName }),
            'info'
        );
    });

    for (const [event, handler] of Object.entries(roomGame.events || {})) {
        socket.on(event, handler);
    }

    socket.on('error', (error) => {
        if (roomGame.ignoreError && roomGame.ignoreError(error)) return;
        // A newcomer's request was refused (the room is full, say): nothing
        // to wait for
        if (isWaitingForAdmission()) {
            alert(serverErrorText(error));
            window.location.href = '/';
            return;
        }
        console.error('Socket error:', error);
        // The server refused something. If it was our Leave, we are still in
        // the game: the fallback must not take us home after all
        if (leaveFallbackTimer) {
            clearTimeout(leaveFallbackTimer);
            leaveFallbackTimer = null;
        }
        if (roomGame.afterError) roomGame.afterError();
        alert(serverErrorText(error));
    });

    socket.on('disconnect', () => {
        debugLog('Disconnected from server');
        roomJoined = false;
    });
}

// Enter the room: the HTTP join first, then the socket. The secret proves the
// socket is this player's: from now on the server takes everything this
// socket sends as this player's move, so the moves carry no player ID. A
// newcomer to a started round waits instead and asks to join
function enterRoom(roomCode) {
    joinGameRoom(roomCode).then((status) => {
        if (status === 'joined') {
            hideWaitingScreen();
            socket.emit('join-room', {
                gameId: roomCode,
                playerId: currentPlayer.id,
                playerSecret: PLAYER_SECRET
            });
        } else if (status === 'waiting') {
            socket.emit('ask-to-join', {
                gameId: roomCode,
                playerId: currentPlayer.id,
                playerSecret: PLAYER_SECRET,
                playerName: currentPlayer.name,
                avatar: currentPlayer.avatar
            });
        }
    }).catch((error) => {
        console.error('Failed to join game via API:', error);
    });
}

async function joinGameRoom(roomCode) {
    // Only the request is the connection's: no answer, or one the page cannot
    // read, is "Connection error" and the way home
    let result;
    try {
        debugLog('Joining game:', roomCode, 'as player', currentPlayer.id);

        const response = await fetch('/api/join-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gameId: roomCode,
                playerName: currentPlayer.name,
                avatar: currentPlayer.avatar,
                playerId: currentPlayer.id,
                playerSecret: PLAYER_SECRET
            })
        });

        debugLog('Response status:', response.status);
        result = await response.json();
        debugLog('Join game result:', result);
    } catch (error) {
        console.error('Error joining game:', error);
        handleApiError(error, 'joining game room');
        window.location.href = '/';
        return undefined;
    }

    // A newcomer to a started round waits
    if (result.waitingForApproval) {
        showWaitingScreen();
        return 'waiting';
    }

    if (!result.success) {
        console.error('Join game failed:', result.error);
        alert(serverErrorText(result.error) || getText('failedJoinGame', 'Failed to join game'));
        window.location.href = '/';
        return undefined;
    }

    debugLog('Successfully joined game');
    currentGame = result.game;
    // The player as the server keeps them
    currentPlayer = result.player;

    AppStorage.session.set('playerData', {
        name: currentPlayer.name,
        avatar: currentPlayer.avatar,
        roomCode: currentGame.id,
        id: currentPlayer.id
    });

    // Drawing is the page's own work: a failure in it is the page's error,
    // logged as one, and the page still enters the room - never sent home as
    // if the connection had failed. The room's game-state draws it again
    try {
        roomGame.render();
    } catch (error) {
        console.error('Drawing the room failed:', error);
    }
    return 'joined';
}

// A player's avatar into an element: a photo (a validated data:image URL,
// set as a property - never innerHTML) or an emoji as text
function renderAvatar(element, avatar) {
    element.textContent = '';
    if (isCustomAvatar(avatar)) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = avatar;
        element.appendChild(img);
    } else {
        element.textContent = avatar;
    }
}

// The newcomer's waiting screen (#waitingSheet, with #waitingAvatar and
// #waitingName): the room stays hidden (body.waiting-for-admission, the
// game's style) until the round lets them in
function showWaitingScreen() {
    renderAvatar(document.getElementById('waitingAvatar'), currentPlayer.avatar);
    document.getElementById('waitingName').textContent = currentPlayer.name;
    document.getElementById('waitingSheet').hidden = false;
    document.body.classList.add('waiting-for-admission');
    // The request lives as long as this page's socket: a phone gone to sleep
    // would drop it. Once in, the game decides (wake-lock.js)
    keepScreenAwake(true);
}

function hideWaitingScreen() {
    document.getElementById('waitingSheet').hidden = true;
    document.body.classList.remove('waiting-for-admission');
}

function isWaitingForAdmission() {
    return document.body.classList.contains('waiting-for-admission');
}

// The page's own controls: giving up waiting (#cancelJoinRequest), leaving
// (#leaveGame opens #leaveModal, #confirmLeave leaves)
function setUpRoomControls(roomCode) {
    // A waiting newcomer gives up: home, with the room code ready. The socket
    // goes first, and that withdraws the request at once - the page's own
    // socket would close only once the next page has loaded, which on a slow
    // network leaves the players a request nobody waits for
    document.getElementById('cancelJoinRequest').addEventListener('click', () => {
        socket.disconnect();
        window.location.href = `/?join=${roomCode}`;
    });

    const leaveModalElement = document.getElementById('leaveModal');
    if (leaveModalElement) {
        leaveModal = new bootstrap.Modal(leaveModalElement);
    }

    const leaveButton = document.getElementById('leaveGame');
    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            if (leaveModal) leaveModal.show();
        });
    }

    const confirmLeaveButton = document.getElementById('confirmLeave');
    if (confirmLeaveButton) {
        confirmLeaveButton.addEventListener('click', () => {
            if (!currentGame || !currentPlayer) return;

            sendMove('leave-game');
            leaveModal.hide();

            // Fallback: if the server's confirmation never arrives, leave anyway
            leaveFallbackTimer = setTimeout(finishLeavingGame, 2000);
        });
    }
}
