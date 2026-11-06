// Who am I? Game - Frontend JavaScript
// Names from utils.js (loaded before this file; see the note at the top of utils.js)
/* global debugLog, MAX_NAME_LENGTH, isCustomAvatar, getText, serverErrorText, showError, showInfo, AppStorage, handleApiError, PLAYER_ID, PLAYER_SECRET */

// Avatar pool: the landing page deals 12 of them at a time (the server does
// not need the list - it checks only that an avatar is short)
const avatarPool = [
    '🐌', '🐧', '🤖', '🐱', '🐣', '🐝', '🐺', '🐴', '🍕', '🦄', '🐢', '🦋',
    '🐰', '🐮', '🐽', '🐷', '🐻', '🐦‍⬛', '🦖', '🦕', '🐳', '🦧', '🦣', '🐉',
    '👻', '🎃', '🤡', '👾', '🐲', '🥷', '👸', '🧙', '🧚', '🦸', '🧛', '👑',
    '🐶', '🐭', '🐹', '🐗', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🦉',
    '🌈', '🔥', '🍈', '🎯', '🎪', '🧜‍♀️', '🎺', '🎸', '🎲', '🎳', '⚽', '🏀'
];

// Function to select 12 random avatars from the pool
function selectRandomAvatars() {
    const shuffled = [...avatarPool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 12);
}

// Custom avatar upload: the photo is shrunk in the browser to a small square
// JPEG data URL so it fits in player.avatar the same way an emoji does.
// 192px = 2x the 96px card display size, so photos stay sharp on retina screens
const CUSTOM_AVATAR_SIZE = 192;                  // output is 192x192 pixels
const CUSTOM_AVATAR_QUALITIES = [0.8, 0.6, 0.4]; // JPEG quality fallbacks

// Wrap the classic Image-element decode in a promise. Decoding through an
// <img> means the browser applies EXIF rotation for us (phone photos).
function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            const error = new Error('Could not decode the image');
            error.code = 'avatarReadFailed';
            reject(error);
        };
        image.src = objectUrl;
    });
}

// File -> small square JPEG data URL that passes isCustomAvatar().
// Throws Error with .code set to a translation key:
//   'avatarNotImage'   - the file is not an image
//   'avatarReadFailed' - the browser could not decode it
//   'avatarTooLarge'   - still over the limit after all quality fallbacks
async function processAvatarFile(file) {
    if (!file.type || !file.type.startsWith('image/')) {
        const error = new Error('Not an image file');
        error.code = 'avatarNotImage';
        throw error;
    }

    const image = await loadImageFromFile(file);
    if (Math.min(image.naturalWidth, image.naturalHeight) === 0) {
        // e.g. an SVG without an intrinsic size reports 0x0
        const error = new Error('Image has no size');
        error.code = 'avatarReadFailed';
        throw error;
    }

    const canvas = document.createElement('canvas');
    canvas.width = CUSTOM_AVATAR_SIZE;
    canvas.height = CUSTOM_AVATAR_SIZE;
    const ctx = canvas.getContext('2d');

    // JPEG has no transparency - without this, transparent PNG areas turn black
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, CUSTOM_AVATAR_SIZE, CUSTOM_AVATAR_SIZE);

    // Center-crop the largest square out of the photo, then shrink it
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = (image.naturalWidth - side) / 2;
    const sy = (image.naturalHeight - side) / 2;
    ctx.drawImage(image, sx, sy, side, side, 0, 0, CUSTOM_AVATAR_SIZE, CUSTOM_AVATAR_SIZE);

    for (const quality of CUSTOM_AVATAR_QUALITIES) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (isCustomAvatar(dataUrl)) return dataUrl;
    }

    const error = new Error('Image is too large even after compression');
    error.code = 'avatarTooLarge';
    throw error;
}

// Function to populate avatar selector
function populateAvatars(avatars) {
    const avatarSelector = document.getElementById('avatarSelector');
    const selectedAvatarInput = document.getElementById('selectedAvatar');

    if (!avatarSelector) return;

    // Clear existing avatars
    avatarSelector.innerHTML = '';

    // Create avatar options - a value is either an emoji or an uploaded
    // image (a validated data URL)
    avatars.forEach((value, index) => {
        const avatarOption = document.createElement('div');
        avatarOption.className = 'avatar-option';
        avatarOption.setAttribute('data-avatar', value);
        if (isCustomAvatar(value)) {
            // Validated data:image/... URL assigned as a property - never innerHTML
            const img = document.createElement('img');
            img.alt = ''; // decorative; the tile itself carries the meaning
            img.src = value;
            avatarOption.appendChild(img);
        } else {
            avatarOption.textContent = value;
        }

        // Select first avatar by default
        if (index === 0) {
            avatarOption.classList.add('selected');
            selectedAvatarInput.value = value;
        }

        avatarSelector.appendChild(avatarOption);
    });
}

// Avatar selection handling
document.addEventListener('DOMContentLoaded', function() {
    const avatarSelector = document.getElementById('avatarSelector');
    const selectedAvatarInput = document.getElementById('selectedAvatar');
    const playerForm = document.getElementById('playerForm');
    const createNewGameBtn = document.getElementById('createNewGame');
    const roomCodeInput = document.getElementById('roomCode');

    // The player ID comes from utils.js (PLAYER_ID)

    // Enforce the shared name limit (kept in utils.js, not in the HTML)
    const playerNameInput = document.getElementById('playerName');
    if (playerNameInput) playerNameInput.maxLength = MAX_NAME_LENGTH;

    // Prefill the last used name so returning players (e.g. after leaving
    // a game) don't have to retype it
    const savedName = AppStorage.get('whoami-player-name');
    if (savedName && playerNameInput && !playerNameInput.value) {
        playerNameInput.value = savedName;
    }

    // The player's uploaded custom avatar (a data URL), if any. It is pinned
    // as the FIRST grid tile so populateAvatars() auto-selects it, and it
    // survives shuffle clicks (shuffle re-deals only the emoji)
    let customAvatar = null;

    // Pin the custom avatar first and keep the grid at 12 tiles
    function withCustomAvatarFirst(avatars) {
        if (!customAvatar) return avatars;
        return [customAvatar, ...avatars].slice(0, 12);
    }

    // Initialize with random avatars - each player gets their own unique set.
    // Prefill the last used avatar the same way we prefill the name: putting it
    // first makes populateAvatars() auto-select it. An uploaded image is restored
    // through the same validation the server applies; emoji values that are not
    // in the pool (stale or tampered localStorage) are ignored
    const savedAvatar = AppStorage.get('whoami-player-avatar');
    let initialAvatars = selectRandomAvatars();
    if (savedAvatar && isCustomAvatar(savedAvatar)) {
        customAvatar = savedAvatar;
    } else if (savedAvatar && avatarPool.includes(savedAvatar)) {
        initialAvatars = [savedAvatar, ...initialAvatars.filter(a => a !== savedAvatar)].slice(0, 12);
    }
    populateAvatars(withCustomAvatarFirst(initialAvatars));

    // The shuffle button lives outside the grid, so it survives populateAvatars()
    // rebuilds - one listener is enough and keyboard focus is never lost
    const shuffleButton = document.getElementById('shuffleAvatars');
    if (shuffleButton) {
        shuffleButton.addEventListener('click', () => {
            populateAvatars(withCustomAvatarFirst(selectRandomAvatars()));
        });
    }

    // Upload button: opens the hidden file picker; a chosen photo is shrunk
    // to a small data URL, pinned as the first tile and auto-selected.
    // Deliberately NOT saved to localStorage here - like the emoji, the avatar
    // is remembered only when the player actually creates or joins a game
    const uploadButton = document.getElementById('uploadAvatar');
    const avatarFileInput = document.getElementById('avatarFileInput');
    if (uploadButton && avatarFileInput) {
        uploadButton.addEventListener('click', () => avatarFileInput.click());

        avatarFileInput.addEventListener('change', async () => {
            const file = avatarFileInput.files && avatarFileInput.files[0];
            avatarFileInput.value = ''; // re-selecting the same file must fire change again
            if (!file) return;          // dialog cancelled
            try {
                customAvatar = await processAvatarFile(file);
                populateAvatars(withCustomAvatarFirst(selectRandomAvatars()));
            } catch (error) {
                showError(getText(error.code || 'avatarReadFailed', 'Could not read this image. Try a different photo.'));
            }
        });
    }

    // Check if there's a room code in URL parameters (for direct links)
    const urlParams = new URLSearchParams(window.location.search);
    const joinRoomCode = urlParams.get('join');
    const errorParam = urlParams.get('error');
    
    // Handle errors
    if (errorParam === 'room-not-found') {
        showError(getText('roomNotFound', 'Room not found. Please check the room code and try again.'));
    } else if (errorParam === 'join-declined') {
        showError(getText('joinDeclined', 'The players did not let you into the game'));
    }
    
    if (joinRoomCode && roomCodeInput) {
        roomCodeInput.value = joinRoomCode.toUpperCase();
        roomCodeInput.classList.add('prefilled');
        document.getElementById('playerName').focus();

        // Update the form text to indicate joining
        const formLabel = document.querySelector('label[for="roomCode"]');
        if (formLabel) {
            formLabel.textContent = getText('roomCodeJoining', 'Room Code (joining game)');
        }

        // The Join button follows the pre-filled code: updateJoinButtonState() below

        // translations.js set up i18n on this same DOMContentLoaded, before this
        // script (it loads first), so the message is already in the page's language
        showInfo(`${getText('readyToJoin', 'Ready to join')} ${joinRoomCode.toUpperCase()}. ${getText('enterNameAvatar', 'Enter your name and choose an avatar.')}`);
    }

    // Avatar selection
    if (avatarSelector) {
        avatarSelector.addEventListener('click', function(e) {
            if (e.target.classList.contains('avatar-option')) {
                // Remove selection from all avatars
                document.querySelectorAll('.avatar-option').forEach(avatar => {
                    avatar.classList.remove('selected');
                });

                // Add selection to clicked avatar
                e.target.classList.add('selected');
                selectedAvatarInput.value = e.target.dataset.avatar;
            }
        });
    }

    // Join and Create New Game button states follow the room code. Declared here,
    // not inside the `if` below: the Create New Game handler calls them too
    const joinBtn = document.getElementById('joinBtn');

    // Function to update Join button state based on room code
    function updateJoinButtonState() {
        if (joinBtn) {
            const roomCode = roomCodeInput.value.trim();
            const isValidLength = roomCode.length === 6;
            joinBtn.disabled = !isValidLength;

            if (isValidLength) {
                joinBtn.classList.remove('btn-secondary');
                joinBtn.classList.add('btn-primary');
            } else {
                joinBtn.classList.remove('btn-primary');
                joinBtn.classList.add('btn-secondary');
            }
        }

        // Update Create New Game button state
        updateCreateButtonState();
    }

    // Function to update Create New Game button state based on room code
    function updateCreateButtonState() {
        if (createNewGameBtn) {
            const roomCode = roomCodeInput.value.trim();
            const hasValidRoomCode = roomCode.length === 6;

            if (hasValidRoomCode) {
                createNewGameBtn.disabled = true;
                createNewGameBtn.classList.add('btn-secondary');
                createNewGameBtn.classList.remove('btn-primary');
                createNewGameBtn.title = getText('clearRoomCodeToCreate', 'Clear room code to create a new game');
            } else {
                createNewGameBtn.disabled = false;
                createNewGameBtn.classList.remove('btn-secondary');
                createNewGameBtn.classList.add('btn-primary');
                createNewGameBtn.title = '';
            }
        }
    }

    // Auto-uppercase room code input and manage Join button state
    if (roomCodeInput) {
        // Initially update both button states
        if (joinBtn) {
            updateJoinButtonState();
        }

        roomCodeInput.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase();
            updateJoinButtonState();
        });
    }

    // Create new game button
    if (createNewGameBtn) {
        createNewGameBtn.addEventListener('click', function() {
            const playerName = document.getElementById('playerName').value.trim();
            const selectedAvatar = selectedAvatarInput.value;
            
            if (!playerName) {
                alert(getText('pleaseEnterName', 'Please enter your name first'));
                document.getElementById('playerName').focus();
                return;
            }

            // Clear room code first (this will re-enable the button visually)
            roomCodeInput.value = '';
            updateJoinButtonState(); // This will also update the create button state
            
            // Visual feedback
            createNewGameBtn.disabled = true;
            createNewGameBtn.textContent = getText('creating', 'Creating...');
            
            // Store player data (ID will be set by game-room.js using global PLAYER_ID)
            const playerData = {
                name: playerName,
                avatar: selectedAvatar,
                roomCode: null
            };
            
            createGame(playerData);
        });
    }

    // Form submission
    if (playerForm) {
        playerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const playerName = document.getElementById('playerName').value.trim();
            const selectedAvatar = selectedAvatarInput.value;
            const roomCode = roomCodeInput.value.trim();
            
            if (!playerName) {
                alert(getText('pleaseEnterName', 'Please enter your name'));
                return;
            }

            // If room code provided, validate it
            if (roomCode && roomCode.length !== 6) {
                alert(getText('roomCodeLength', 'Room code must be exactly 6 characters'));
                return;
            }

            // Store player data (ID will be set by game-room.js using global PLAYER_ID)
            const playerData = {
                name: playerName,
                avatar: selectedAvatar,
                roomCode: roomCode || null
            };

            if (roomCode) {
                // Join existing game
                joinGame(playerData);
            } else {
                // Create new game
                createGame(playerData);
            }
        });
    }

    // Function to create new game
    async function createGame(playerData) {
        try {
            debugLog('Creating game with player data:', playerData);
            AppStorage.set('whoami-player-name', playerData.name);
            AppStorage.set('whoami-player-avatar', playerData.avatar);

            const response = await fetch('/api/create-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            
            debugLog('Create game response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            debugLog('Create game result:', result);
            
            if (result.success) {
                // Update player data with the new room code
                playerData.roomCode = result.gameId;

                debugLog('Updated player data:', playerData);
                AppStorage.session.set('playerData', playerData);
                window.location.href = `/game/${result.gameId}`;
            } else {
                console.error('Create game failed:', result);
                alert(getText('failedCreateGame', 'Failed to create game. Please try again.'));
                resetCreateButton();
            }
        } catch (error) {
            console.error('Error creating game:', error);
            handleApiError(error, 'creating game');
            resetCreateButton();
        }
    }
    
    // After a failed create: the button's own text back, its state from the room code
    function resetCreateButton() {
        createNewGameBtn.textContent = getText('createNewGame', 'Create New Game');
        updateCreateButtonState();
    }

    // Function to join existing game
    async function joinGame(playerData) {
        try {
            AppStorage.set('whoami-player-name', playerData.name);
            AppStorage.set('whoami-player-avatar', playerData.avatar);
            const response = await fetch('/api/join-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: playerData.roomCode,
                    playerName: playerData.name,
                    avatar: playerData.avatar,
                    playerId: PLAYER_ID,
                    playerSecret: PLAYER_SECRET
                })
            });
            
            const result = await response.json();
            
            // A started game lets a newcomer in only when a player agrees: the
            // room page waits for that (game-room.js)
            if (result.success || result.waitingForApproval) {
                // Store player data and redirect to game room
                AppStorage.session.set('playerData', playerData);
                window.location.href = `/game/${playerData.roomCode}`;
            } else {
                alert(serverErrorText(result.error) || getText('failedJoinGame', 'Failed to join game'));
            }
        } catch (error) {
            handleApiError(error, 'joining game');
        }
    }
});