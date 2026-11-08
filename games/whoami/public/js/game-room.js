// Who am I? Game Room - Frontend JavaScript. The room page itself - joining
// the room, the socket, moves (sendMove), the waiting screen, leaving, the
// invitation - is the kit's (room-page.js, invite.js); this file draws the
// players with their characters, sends the game's moves and answers the
// newcomers who ask to join a started round.
/* global debugLog, MAX_CHARACTER_LENGTH, getText, showNotification, keepScreenAwake */
// From the kit's room-page.js
/* global currentGame, currentPlayer, sendMove, renderAvatar, startRoomPage */

let revealModal = null;
let restartModal = null;
let joinRequestModal = null;

// Newcomers asking to join the started game, in the order they asked; the
// request window shows the first of them (shownJoinRequest)
const joinRequestQueue = [];
let shownJoinRequest = null;

// Sticker colors are chosen by the server (stickerColors in game-logic.js):
// a player arrives with player.stickerColor, rendered as the color-<name> class

// The game's part of the room page (the kit's room-page.js)
startRoomPage({
    render: updateGameDisplay,
    setUp: setupEventListeners,
    // The newcomers waiting now: requests answered while this page was away
    // are gone, the ones still waiting show
    onGameState: game => syncJoinRequests(game.joinRequests || []),
    cancelEdits: cancelActiveEdits,
    // Clean up any stuck editing inputs so the UI can keep updating, then
    // rebuild the players list from the last known state
    afterError() {
        cancelActiveEdits();
        updatePlayersList();
    },
    // Another player answered this request first: the window has closed or
    // is closing by itself, nothing went wrong
    ignoreError: error => error === 'This request has already been answered',
    events: {
        // A newcomer asks to join the started game: any player may answer
        'join-requested': (request) => {
            queueJoinRequest(request);
        },

        // A request is answered (here or by another player) or withdrawn
        'join-request-closed': (data) => {
            if (!data) return;
            closeJoinRequest(data.playerId);
            if (data.outcome === 'admitted') {
                showNotification(
                    getText('playerAdmittedNotification', `${data.playerName} is in the game now`, { playerName: data.playerName }),
                    'info',
                    { icon: 'arrived' }
                );
            }
        },

        // A character is saved: every page draws it
        'character-finalized': (data) => {
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
        },

        'game-started': (data) => {
            debugLog('Game started:', data);
            if (currentGame) {
                currentGame.state = 'started';
                // Close any character input that is still open - editing is no
                // longer allowed and an open input would block UI updates
                cancelActiveEdits();
                updateGameDisplay();
            }
        },

        'character-revealed': (data) => {
            debugLog('Character revealed:', data);
            if (currentGame) {
                currentGame.revealedPlayers = data.revealedPlayers;
                updateGameDisplay();
            }
        },

        'game-restarted': (data) => {
            debugLog('Game restarted! Returning to setup phase.');
            if (currentGame) {
                currentGame.state = 'waiting';
                // The lobby is open: the waiting newcomers join by themselves
                syncJoinRequests([]);
                currentGame.revealedPlayers = data.revealedPlayers || [];
                currentGame.characters = data.characters || {}; // Clear all character assignments
                updateGameDisplay();

                // Show a success message
                showNotification(getText('gameRestarted', 'Game restarted! Character assignments cleared.'), 'success', { icon: 'restart' });
            }
        },

        // Everybody hears who revealed what
        'player-revealed-notification': (data) => {
            debugLog('Player revealed notification:', data);

            // Show notification to all players
            const playerName = data.playerName;
            const character = data.character;

            const message = getText('playerRevealedNotification', `${playerName} revealed their character: "${character}"!`, { playerName, character });

            showNotification(message, 'warning', { icon: 'mask' });
        }
    }
});

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

// The game's buttons and windows
function setupEventListeners() {
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
}

// Function to show the reveal modal
function showRevealModal() {
    if (revealModal) {
        revealModal.show();
    }
}
