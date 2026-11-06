// Who am I? Game Room - Frontend JavaScript
// Names from utils.js (loaded before this file; see the note at the top of utils.js)
/* global debugLog, MAX_CHARACTER_LENGTH, isCustomAvatar, getText, serverErrorText, showNotification, AppStorage, handleApiError, PLAYER_ID, PLAYER_SECRET */
// From wake-lock.js
/* global keepScreenAwake */
// From room-socket.js
/* global RoomSocket */

let socket;
let currentGame = null;
let currentPlayer = null;
let revealModal = null;
let restartModal = null;
let leaveModal = null;
let leaveFallbackTimer = null;
let leavingGame = false;
let joinRequestModal = null;

// Newcomers asking to join the started game, in the order they asked; the
// request window shows the first of them (shownJoinRequest)
const joinRequestQueue = [];
let shownJoinRequest = null;

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

// Sticker colors are chosen by the server (stickerColors in game-logic.js):
// a player arrives with player.stickerColor, rendered as the color-<name> class

// Clean up local state and return to the landing page after leaving.
// Idempotent: both the server confirmation and the fallback timer call it.
// When the room still exists, the landing page opens with the room code
// prefilled (?join=CODE) so the player can rejoin if they change their mind.
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

document.addEventListener('DOMContentLoaded', function() {
    // Get room code from URL. Codes are upper case; a link typed or passed on
    // in lower case still opens the room (the server reads it the same way)
    const urlPath = window.location.pathname;
    const roomCode = urlPath.split('/').pop().toUpperCase();
    
    if (!roomCode || roomCode.length !== 6) {
        alert(getText('invalidRoomCode', 'Invalid room code'));
        window.location.href = '/';
        return;
    }

    // Get player data from session storage
    const playerData = AppStorage.session.get('playerData');
    if (!playerData) {
        // If no player data, redirect to landing page with room code pre-filled
        window.location.href = `/?join=${roomCode}`;
        return;
    }

    // Always use the global player ID - ignore any ID from sessionStorage
    currentPlayer = {
        id: PLAYER_ID,
        name: playerData.name,
        avatar: playerData.avatar,
        roomCode: playerData.roomCode
    };

    debugLog('Using global player ID:', PLAYER_ID);
    
    // Initialize the game room
    initializeGameRoom(roomCode);
    
    // The room's socket
    initializeSocket(roomCode);
    
    // Set up event listeners
    setupEventListeners(roomCode);

    // Re-render dynamic text (game status, player cards) when the language changes
    document.addEventListener('languagechanged', () => {
        if (currentGame) updateGameDisplay();
    });
});

function initializeGameRoom(roomCode) {
    // Set room code in header
    document.getElementById('roomCode').textContent = roomCode;
    
    // Set share link
    const shareLink = `${window.location.origin}/game/${roomCode}`;
    document.getElementById('shareLink').value = shareLink;
}

function initializeSocket(roomCode) {
    socket = new RoomSocket(`/ws/${roomCode}`, { log: debugLog });
    
    socket.on('connect', () => {
        debugLog('Connected to server');
        enterRoom(roomCode);
    });

    // A newcomer's request is over: declined - home, with the room code ready
    // to ask again; anything else (let in, the game restarted, the room gone)
    // - join again and follow the answer
    socket.on('join-request-ended', (data) => {
        if (data && data.outcome === 'declined') {
            window.location.href = `/?join=${roomCode}&error=join-declined`;
            return;
        }
        enterRoom(roomCode);
    });

    // A newcomer asks to join the started game: any player may answer
    socket.on('join-requested', (request) => {
        queueJoinRequest(request);
    });

    // A request is answered (here or by another player) or withdrawn
    socket.on('join-request-closed', (data) => {
        if (!data) return;
        closeJoinRequest(data.playerId);
        if (data.outcome === 'admitted') {
            showNotification(
                getText('playerAdmittedNotification', `👋 ${data.playerName} is in the game now`, { playerName: data.playerName }),
                'info'
            );
        }
    });
    
    socket.on('game-state', (game) => {
        debugLog('Received game state:', game);
        currentGame = game;
        updateGameDisplay();
        // The newcomers waiting now: requests answered while this page was
        // away are gone, the ones still waiting show
        syncJoinRequests(game.joinRequests || []);

        // The socket is in the room: the moves made while it was not go now
        roomJoined = true;
        for (const [eventName, data] of pendingMoves.splice(0)) {
            socket.emit(eventName, data);
        }
    });
    
    socket.on('player-joined', (data) => {
        debugLog('Player joined:', data);
        if (currentGame) {
            currentGame.players = data.players;
            // A returning leaver comes back with their character restored -
            // take the characters/reveals the server sent along
            if (data.characters) currentGame.characters = data.characters;
            if (data.revealedPlayers) currentGame.revealedPlayers = data.revealedPlayers;
            updateGameDisplay();
        }
    });

    socket.on('player-reconnected', (data) => {
        debugLog('Player reconnected:', data);
        if (currentGame) {
            currentGame.players = data.players;
            if (data.characters) currentGame.characters = data.characters;
            if (data.revealedPlayers) currentGame.revealedPlayers = data.revealedPlayers;
            updateGameDisplay();
        }
    });
    
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
            // deleted (we were the last player), there is nothing to rejoin,
            // so skip the ?join=CODE prefill
            finishLeavingGame(!data.gameDeleted);
            return;
        }

        // Another player left: take the server's authoritative state
        currentGame.players = data.players;
        if (data.characters) currentGame.characters = data.characters;
        if (data.revealedPlayers) currentGame.revealedPlayers = data.revealedPlayers;

        // An open character input would block the rebuild below - and it might
        // even belong to the player who just left
        cancelActiveEdits();
        updateGameDisplay();

        showNotification(
            getText('playerLeftNotification', `👋 ${data.playerName} left the game`, { playerName: data.playerName }),
            'info'
        );
    });
    
    // Handle final character confirmation
    socket.on('character-finalized', (data) => {
        debugLog('📨 RECEIVED character-finalized event:', data);
        const { playerId, allCharacters } = data;

        // Update local game state with complete character data
        if (currentGame && allCharacters) {
            currentGame.characters = allCharacters;
            debugLog('✅ Updated all character data from server');

            // Close only the input of the player whose character was saved:
            // an input still open for another player keeps blocking the rebuild
            const playerListEl = document.getElementById('playerList');
            const specificPlayerCard = playerListEl.querySelector(`[data-player-id="${playerId}"]`);
            if (specificPlayerCard) {
                const specificInput = specificPlayerCard.querySelector('.character-input');
                if (specificInput) {
                    debugLog(`🧹 Cleaning up input for finalized character (playerId: ${playerId})`);
                    const stickerWrapper = specificInput.closest('.character-sticker');
                    if (stickerWrapper) {
                        stickerWrapper.remove();
                    }
                }
            }

            // Full display update: rebuilds the players list (safely) and
            // refreshes the status text and Start Game button state
            updateGameDisplay();
        }
    });
    
    socket.on('game-started', (data) => {
        debugLog('Game started:', data);
        if (currentGame) {
            currentGame.state = 'started';
            // Close any character input that is still open - editing is no
            // longer allowed and an open input would block UI updates
            cancelActiveEdits();
            updateGameDisplay();
        }
    });
    
    socket.on('character-revealed', (data) => {
        debugLog('Character revealed:', data);
        if (currentGame) {
            currentGame.revealedPlayers = data.revealedPlayers;
            updateGameDisplay();
        }
    });
    
    socket.on('game-restarted', (data) => {
        debugLog('Game restarted! Returning to setup phase.');
        if (currentGame) {
            currentGame.state = 'waiting';
            // The lobby is open: the waiting newcomers join by themselves
            syncJoinRequests([]);
            currentGame.revealedPlayers = data.revealedPlayers || [];
            currentGame.characters = data.characters || {}; // Clear all character assignments
            updateGameDisplay();

            // Show a success message
            showNotification(getText('gameRestarted', '⏮️ Game restarted! Character assignments cleared.'), 'success');
        }
    });

    // Handle reveal notification
    socket.on('player-revealed-notification', (data) => {
        debugLog('Player revealed notification:', data);

        // Show notification to all players
        const playerName = data.playerName;
        const character = data.character;

        const message = getText('playerRevealedNotification', `🎭 ${playerName} revealed their character: "${character}"!`, { playerName, character });

        showNotification(message, 'warning');
    });

    socket.on('error', (error) => {
        // Another player answered this request first: the window has closed
        // or is closing by itself, nothing went wrong
        if (error === 'This request has already been answered') return;
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
        // Clean up any stuck editing inputs so the UI can keep updating,
        // then rebuild the players list from the last known state
        cancelActiveEdits();
        updatePlayersList();
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
// newcomer to a started game waits instead and asks for a player to let them in
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

// The newcomer's waiting screen: the room stays hidden (style.css) until a
// player lets them in
function showWaitingScreen() {
    renderAvatar(document.getElementById('waitingAvatar'), currentPlayer.avatar);
    document.getElementById('waitingName').textContent = currentPlayer.name;
    document.getElementById('waitingSheet').hidden = false;
    document.body.classList.add('waiting-for-admission');
    // The request lives as long as this page's socket: a phone gone to sleep
    // would drop it. Once in, updateGameDisplay decides (wake-lock.js)
    keepScreenAwake(true);
}

function hideWaitingScreen() {
    document.getElementById('waitingSheet').hidden = true;
    document.body.classList.remove('waiting-for-admission');
}

function isWaitingForAdmission() {
    return document.body.classList.contains('waiting-for-admission');
}

function queueJoinRequest(request) {
    if (!request || joinRequestQueue.some(waiting => waiting.playerId === request.playerId)) return;
    joinRequestQueue.push(request);
    showNextJoinRequest();
}

// Show the first request, unless a window is open or still closing (Bootstrap
// keeps aria-modal until it has gone): the request waits for hidden.bs.modal.
// It waits for a character being typed too: the window would take the focus,
// and the blur would send a half-typed character - for good after the start
// (updatePlayersList shows the request once the field has gone)
function showNextJoinRequest() {
    if (shownJoinRequest || joinRequestQueue.length === 0) return;
    if (document.querySelector('.modal[aria-modal="true"]')) return;
    if (document.querySelector('#playerList .character-input')) return;
    shownJoinRequest = joinRequestQueue[0];
    renderAvatar(document.getElementById('joinRequestAvatar'), shownJoinRequest.avatar);
    document.getElementById('joinRequestName').textContent = shownJoinRequest.name;
    joinRequestModal.show();
}

// Make the queue the server's list of waiting newcomers
function syncJoinRequests(requests) {
    const waitingIds = new Set(requests.map(request => request.playerId));
    joinRequestQueue
        .filter(request => !waitingIds.has(request.playerId))
        .forEach(request => closeJoinRequest(request.playerId));
    requests.forEach(queueJoinRequest);
}

function closeJoinRequest(playerId) {
    const index = joinRequestQueue.findIndex(waiting => waiting.playerId === playerId);
    if (index !== -1) joinRequestQueue.splice(index, 1);
    if (shownJoinRequest && shownJoinRequest.playerId === playerId) {
        joinRequestModal.hide();
    }
}

// Let in or decline the shown newcomer. The window closes at once; the
// server's join-request-closed closes it for everybody else
function answerJoinRequest(eventName) {
    if (!shownJoinRequest) return;
    const { playerId } = shownJoinRequest;
    closeJoinRequest(playerId);
    sendMove(eventName, { playerId });
}

async function joinGameRoom(roomCode) {
    try {
        debugLog('Attempting to join game:', roomCode, 'with player:', currentPlayer);
        
        const requestBody = {
            gameId: roomCode,
            playerName: currentPlayer.name,
            avatar: currentPlayer.avatar,
            playerId: currentPlayer.id,
            playerSecret: PLAYER_SECRET
        };
        debugLog('Joining game:', roomCode, 'as player', currentPlayer.id);
        
        const response = await fetch('/api/join-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        debugLog('Response status:', response.status);

        const result = await response.json();
        debugLog('Join game result:', result);

        // A newcomer to a started game: wait for a player to let them in
        if (result.waitingForApproval) {
            showWaitingScreen();
            return 'waiting';
        }

        if (result.success) {
            debugLog('Successfully joined game');
            currentGame = result.game;
            // Update currentPlayer with the server-assigned player data
            currentPlayer = result.player;

            // Save updated player data (with ID) to session storage
            const playerData = {
                name: currentPlayer.name,
                avatar: currentPlayer.avatar,
                roomCode: currentGame.id,
                id: currentPlayer.id
            };
            AppStorage.session.set('playerData', playerData);

            updateGameDisplay();
            return 'joined';
        } else {
            console.error('Join game failed:', result.error);

            alert(serverErrorText(result.error) || getText('failedJoinGame', 'Failed to join game'));
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Error joining game:', error);
        handleApiError(error, 'joining game room');
        window.location.href = '/';
    }
}

function updateGameDisplay() {
    if (!currentGame) return;
    
    // Update player count
    const playerCountEl = document.getElementById('playerCount');
    if (playerCountEl) playerCountEl.textContent = currentGame.players.length;
    
    // Show/hide elements based on game state
    const shareCard = document.getElementById('shareCard');
    const gameInviteCard = document.getElementById('gameInviteCard');
    const assignmentInstructions = document.getElementById('assignmentInstructions');
    const statusEl = document.getElementById('gameStatus');
    const startButton = document.getElementById('startGame');
    const restartButton = document.getElementById('restartGame');
    const gameState = currentGame.state || 'waiting';

    // The round is on from Start until every envelope is open: the screen
    // stays awake meanwhile (wake-lock.js)
    const revealedPlayers = currentGame.revealedPlayers || [];
    keepScreenAwake(gameState === 'started' && !currentGame.players.every(player => revealedPlayers.includes(player.id)));

    // The lobby invites at the top, with the link field; a started game below
    // the controls, shorter (a latecomer asks to join then)
    if (shareCard) shareCard.hidden = gameState === 'started';
    if (gameInviteCard) gameInviteCard.hidden = gameState !== 'started';

    if (gameState === 'started') {
        // Hide assignment instructions when game has started
        if (assignmentInstructions) assignmentInstructions.style.display = 'none';

        // A newcomer let into the round has no envelope to open yet
        const hasOwnCharacter = Boolean(currentGame.characters && currentGame.characters[currentPlayer.id]);
        if (statusEl) {
            statusEl.textContent = hasOwnCharacter
                ? getText('gameInProgress', 'Game in progress - Click your envelope to reveal your character!')
                : getText('waitingForCharacter', 'Game in progress - waiting for someone to give you a character');
        }
        if (startButton) startButton.style.display = 'none';
        if (restartButton) restartButton.style.display = 'inline-block';
    } else {
        // Show assignment instructions when waiting
        if (assignmentInstructions) assignmentInstructions.style.display = 'block';

        // Check if all players have characters assigned
        const allPlayersHaveCharacters = currentGame.players.length >= 2 && 
            currentGame.players.every(player => {
                const characterData = currentGame.characters && currentGame.characters[player.id];
                return characterData && characterData.character && characterData.character.trim() !== '';
            });
        
        let statusText;
        if (currentGame.players.length < 2) {
            statusText = getText('needPlayers', 'Need at least 2 players to start');
        } else if (!allPlayersHaveCharacters) {
            statusText = getText('assignCharacters', 'Assign characters to all players before starting!');
        } else {
            statusText = getText('readyToPlay', 'Ready to play!');
        }
        
        if (statusEl) statusEl.textContent = statusText;

        if (startButton) {
            startButton.disabled = !allPlayersHaveCharacters;
            startButton.style.display = 'inline-block';
        }
        
        if (restartButton) restartButton.style.display = 'none';
    }
    
    // Update players list
    updatePlayersList();
}

// Characters can be up to MAX_CHARACTER_LENGTH long. Show long ones in a
// smaller font so the sticker does not tower over the player card.
const LONG_CHARACTER_THRESHOLD = 40;

function setStickerText(stickerElement, character) {
    stickerElement.textContent = character;
    stickerElement.classList.toggle('long-text', [...character].length > LONG_CHARACTER_THRESHOLD);
}

// Remove any character inputs that are still open. Needed when the game
// starts or an error occurs while someone is editing - otherwise the open
// input would block updatePlayersList() from ever rebuilding the UI.
function cancelActiveEdits() {
    const playerListEl = document.getElementById('playerList');
    if (!playerListEl) return;

    playerListEl.querySelectorAll('.character-input').forEach(input => {
        const sticker = input.closest('.character-sticker');
        if (sticker) {
            sticker.remove();
        } else {
            input.remove();
        }
    });
}

function updatePlayersList() {
    debugLog('🎨 Simple updatePlayersList called');
    const playerListEl = document.getElementById('playerList');

    if (!currentGame || !currentGame.players) {
        playerListEl.innerHTML = `<p class="text-muted">${getText('noPlayersYet', 'No players yet')}</p>`;
        return;
    }

    // CRITICAL: Check for active editing - prevent rebuilds that lose user input
    const activeInputs = playerListEl.querySelectorAll('.character-input');
    if (activeInputs.length > 0) {
        debugLog('🚫 Skipping rebuild - user is actively editing');
        debugLog('🔍 Active inputs found:', activeInputs.length, 'inputs detected');
        activeInputs.forEach((input, index) => {
            const playerId = input.closest('[data-player-id]')?.dataset.playerId;
            debugLog(`   Input ${index + 1}: playerId=${playerId}, value="${input.value}"`);
        });
        return;
    }

    // Simple approach: complete rebuild only when safe
    playerListEl.innerHTML = '';

    // Simple player rendering
    currentGame.players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        playerCard.dataset.playerId = player.id;

        const characterData = currentGame.characters && currentGame.characters[player.id];
        const isCurrentPlayer = player.id === currentPlayer.id;
        const isRevealed = currentGame.revealedPlayers && currentGame.revealedPlayers.includes(player.id);
        const gameState = currentGame.state || 'waiting';

        // Add visual classes
        if (isCurrentPlayer) playerCard.classList.add('cannot-assign');
        if (isRevealed) playerCard.classList.add('revealed');

        // Basic player info - built with textContent so player-controlled
        // values (name, avatar) can never inject HTML (XSS protection)
        const avatarEl = document.createElement('div');
        avatarEl.className = 'player-avatar';
        renderAvatar(avatarEl, player.avatar);
        playerCard.appendChild(avatarEl);

        const nameEl = document.createElement('div');
        nameEl.className = 'player-name';
        nameEl.textContent = player.name;
        if (isCurrentPlayer) {
            const youText = getText('you', 'You');
            nameEl.appendChild(document.createTextNode(' ('));
            const youEl = document.createElement('strong');
            youEl.textContent = youText;
            nameEl.appendChild(youEl);
            nameEl.appendChild(document.createTextNode(')'));
        }
        playerCard.appendChild(nameEl);

        // Add character sticker, mystery sticker, or add button
        if (characterData && isCurrentPlayer && !isRevealed) {
            // Current player with character - a sealed envelope with a wax seal "?"
            const mysterySticker = document.createElement('div');
            mysterySticker.className = 'character-sticker mystery';
            const seal = document.createElement('span');
            seal.className = 'seal';
            seal.setAttribute('aria-hidden', 'true');
            seal.textContent = '?';
            mysterySticker.appendChild(seal);
            if (gameState === 'started') {
                mysterySticker.title = getText('yourCharacterClickReveal', 'Your character - click to reveal!');
                mysterySticker.style.cursor = 'pointer';
                mysterySticker.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showRevealModal();
                });
            } else {
                mysterySticker.title = getText('yourCharacterHidden', 'Your character is hidden from you!');
            }
            playerCard.appendChild(mysterySticker);

        } else if (characterData && isRevealed) {
            // Revealed character - show actual character
            const revealedSticker = document.createElement('div');
            const stickerColor = player.stickerColor || 'red';
            revealedSticker.className = `character-sticker color-${stickerColor} revealed`;
            setStickerText(revealedSticker, characterData.character);
            revealedSticker.title = isCurrentPlayer ?
                getText('yourRevealedCharacter', 'Your revealed character') :
                getText('characterRevealedByPlayer', 'Character revealed by player');
            playerCard.appendChild(revealedSticker);

        } else if (characterData && !isCurrentPlayer) {
            // Other player with character - show editable sticker
            const characterSticker = document.createElement('div');
            const stickerColor = player.stickerColor || 'red';
            characterSticker.className = `character-sticker color-${stickerColor}`;
            characterSticker.dataset.playerId = player.id;
            setStickerText(characterSticker, characterData.character);
            characterSticker.title = gameState === 'started' ?
                getText('characterReadOnly', `Character: ${characterData.character} (read-only during game)`, { character: characterData.character }) :
                getText('characterClickToEdit', `Character: ${characterData.character} (click to edit)`, { character: characterData.character });

            if (gameState === 'waiting') {
                characterSticker.style.cursor = 'pointer';
                characterSticker.addEventListener('click', (e) => {
                    e.stopPropagation();
                    editCharacter(player.id, characterData.character, characterSticker);
                });
            }
            playerCard.appendChild(characterSticker);

        } else if (!isCurrentPlayer) {
            // No character for other player - a real button: Tab reaches it, Enter presses it.
            // After the start only a newcomer let into the round has none, and
            // any player gives them one (then it is locked like everybody's)
            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'btn btn-outline-primary add-character-btn';
            addButton.textContent = `+ ${getText('assignCharacter', 'Assign character')}`;
            addButton.addEventListener('click', (e) => {
                e.stopPropagation();
                addCharacter(player.id, addButton);
            });
            playerCard.appendChild(addButton);

        } else if (gameState === 'started') {
            // Current player let into the started round, no character yet: an
            // envelope still open - nothing in it, nothing to press
            const openEnvelope = document.createElement('div');
            openEnvelope.className = 'character-sticker mystery open-envelope';
            openEnvelope.textContent = getText('envelopeEmpty', 'empty for now');
            openEnvelope.title = getText('noCharacterYet', 'No character yet - another player will give you one');
            playerCard.appendChild(openEnvelope);
        }
        // Current player with no character in the lobby - show nothing (clean look)

        playerListEl.appendChild(playerCard);
    });

    // No character is being typed now: a request that waited for it may show
    showNextJoinRequest();
}

// "+ Assign character" pressed: the button becomes an empty tag with an input
function addCharacter(playerId, buttonElement) {
    const player = currentGame.players.find(p => p.id === playerId);
    const stickerWrapper = document.createElement('div');
    stickerWrapper.className = `character-sticker color-${player?.stickerColor || 'red'}`;
    buttonElement.parentNode.replaceChild(stickerWrapper, buttonElement);
    openCharacterInput(playerId, stickerWrapper, '');
}

// A tag clicked: its text becomes an input with the same text
function editCharacter(playerId, currentCharacter, stickerElement) {
    openCharacterInput(playerId, stickerElement, currentCharacter);
}

// Put an input on a tag. Enter or leaving the field sends the text; Escape
// sends the original text back (nothing changes). The page itself changes
// only when the server's character-finalized answer rebuilds the list, so
// every player sees the update at the same time; an empty text removes the
// character there
function openCharacterInput(playerId, stickerElement, originalCharacter) {
    debugLog(`🎯 Editing the character of player ${playerId}: "${originalCharacter}"`);

    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.className = 'character-input';
    inputElement.maxLength = MAX_CHARACTER_LENGTH;
    inputElement.value = originalCharacter;

    stickerElement.textContent = '';
    stickerElement.appendChild(inputElement);
    stickerElement.classList.add('editing');

    // Right here, inside the click: a phone opens its keyboard only for a
    // focus that comes straight from the tap (no setTimeout)
    inputElement.focus();
    inputElement.select();

    // Enter and the blur that follows it must send one message, not two
    let sent = false;
    const sendCharacter = () => {
        if (sent) return;
        // Characters are locked once the game has started (e.g. a blur event
        // can fire after another player pressed Start Game) - except for a
        // newcomer let into the round who has none yet
        const started = currentGame.state !== 'waiting';
        if (started && currentGame.characters && currentGame.characters[playerId]) return;
        sent = true;

        // After the start a character is never empty: backing out of a
        // newcomer's first one (Escape, a tap elsewhere) just closes the field
        const character = inputElement.value.trim();
        if (started && character === '') {
            cancelActiveEdits();
            updatePlayersList();
            return;
        }

        // playerId is who gets the character; the server knows who gives it
        const assignData = {
            playerId: playerId,
            character
        };
        debugLog('🔧 Sending assign-character:', assignData);
        sendMove('assign-character', assignData);
    };

    inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            sendCharacter();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            inputElement.value = originalCharacter;
            sendCharacter();
        }
    });
    inputElement.addEventListener('blur', sendCharacter);
}

// Copy the room link and flash "Copied!" on the button that was pressed. The
// link goes straight to the clipboard: a started game's invitation has no link
// field to select. A page the clipboard is closed to (plain http, as a phone on
// the home network) copies the old way, selecting the lobby's link field -
// hidden in a started game, where not every browser copies from it
async function copyRoomLink(button) {
    const shareLink = document.getElementById('shareLink');
    try {
        await navigator.clipboard.writeText(shareLink.value);
    } catch {
        shareLink.select();
        document.execCommand('copy');
    }

    const originalText = button.textContent;
    button.textContent = getText('copiedSuccess', '✅ Copied!');
    setTimeout(() => {
        button.textContent = originalText;
    }, 2000);
}

// Open the native share sheet with the room link, or copy the link as a fallback.
// No await before navigator.share: iOS refuses a share sheet that is not
// opened right in the click
async function shareRoomLink(button) {
    const url = document.getElementById('shareLink').value;

    if (navigator.share) {
        try {
            await navigator.share({
                title: getText('title', 'Who am I?'),
                text: getText('shareText', 'Join my "Who am I?" game!'),
                url: url
            });
        } catch (error) {
            // AbortError = the user closed the share sheet - not a failure
            if (error.name !== 'AbortError') {
                copyRoomLink(button);
            }
        }
    } else {
        copyRoomLink(button);
    }
}

function setupEventListeners(roomCode) {
    // A waiting newcomer gives up: home, with the room code ready. The socket
    // goes first, and that withdraws the request at once - the page's own
    // socket would close only once the next page has loaded, which on a slow
    // network leaves the players a request nobody waits for
    document.getElementById('cancelJoinRequest').addEventListener('click', () => {
        socket.disconnect();
        window.location.href = `/?join=${roomCode}`;
    });

    // The request window: only its buttons answer (static backdrop, no Escape)
    joinRequestModal = new bootstrap.Modal(document.getElementById('joinRequestModal'));
    document.getElementById('admitPlayer').addEventListener('click', () => answerJoinRequest('admit-player'));
    document.getElementById('declinePlayer').addEventListener('click', () => answerJoinRequest('decline-player'));
    // A request closed while its window was still opening: close it now
    document.getElementById('joinRequestModal').addEventListener('shown.bs.modal', () => {
        if (shownJoinRequest && !joinRequestQueue.includes(shownJoinRequest)) joinRequestModal.hide();
    });
    // Any window gone: the next request may show
    document.addEventListener('hidden.bs.modal', (event) => {
        if (event.target.id === 'joinRequestModal') shownJoinRequest = null;
        showNextJoinRequest();
    });

    // Copy and Share: the lobby's invitation and the started game's
    for (const id of ['copyLink', 'gameCopyLink']) {
        const button = document.getElementById(id);
        button.addEventListener('click', () => copyRoomLink(button));
    }
    for (const id of ['shareButton', 'gameShareButton']) {
        const button = document.getElementById(id);
        button.addEventListener('click', () => shareRoomLink(button));
    }

    // Start game button
    document.getElementById('startGame').addEventListener('click', () => {
        if (!currentGame || !currentPlayer) return;
        
        sendMove('start-game');
    });

    // Refresh page button
    document.getElementById('refreshPage').addEventListener('click', () => {
        debugLog('Refresh button clicked');
        window.location.reload();
    });

    // Initialize reveal modal
    revealModal = new bootstrap.Modal(document.getElementById('revealModal'));
    
    // Confirm reveal button in modal
    document.getElementById('confirmReveal').addEventListener('click', () => {
        if (!currentGame || !currentPlayer) return;
        
        sendMove('reveal-character');
        
        revealModal.hide();
    });
    
    // Initialize restart modal first
    const restartModalElement = document.getElementById('restartModal');
    if (restartModalElement) {
        restartModal = new bootstrap.Modal(restartModalElement);
    }
    
    // Restart game button
    const restartButton = document.getElementById('restartGame');
    if (restartButton) {
        restartButton.addEventListener('click', () => {
            debugLog('Restart game button clicked');
            if (restartModal) {
                debugLog('Showing restart modal');
                restartModal.show();
            } else {
                console.error('Restart modal not initialized');
            }
        });
    }

    // Confirm restart button in modal
    const confirmRestartButton = document.getElementById('confirmRestart');
    if (confirmRestartButton) {
        confirmRestartButton.addEventListener('click', () => {
            debugLog('Confirm restart clicked');
            debugLog('Current game:', currentGame);
            debugLog('Current player:', currentPlayer);
            
            if (!currentGame || !currentPlayer) {
                console.error('Missing game or player data');
                return;
            }
            
            sendMove('restart-game');

            restartModal.hide();
        });
    }

    // Initialize leave modal
    const leaveModalElement = document.getElementById('leaveModal');
    if (leaveModalElement) {
        leaveModal = new bootstrap.Modal(leaveModalElement);
    }

    // Leave game button
    const leaveButton = document.getElementById('leaveGame');
    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            if (leaveModal) leaveModal.show();
        });
    }

    // Confirm leave button in modal
    const confirmLeaveButton = document.getElementById('confirmLeave');
    if (confirmLeaveButton) {
        confirmLeaveButton.addEventListener('click', () => {
            if (!currentGame || !currentPlayer) return;

            sendMove('leave-game');
            leaveModal.hide();

            // Fallback: if the server confirmation never arrives, leave anyway
            leaveFallbackTimer = setTimeout(finishLeavingGame, 2000);
        });
    }
}

// Function to show the reveal modal
function showRevealModal() {
    if (revealModal) {
        revealModal.show();
    }
}
