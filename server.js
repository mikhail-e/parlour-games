// Who am I? Game - Node.js Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const gameLogic = require('./game-logic');
const { createGameBackups } = require('./game-backups');

const app = express();
// Nobody needs to know what the server runs on
app.disable('x-powered-by');
const server = http.createServer(app);
// No `cors` option: the pages that use the socket come from this same
// server, and other sites have no business talking to it
const io = socketIo(server, {
    pingTimeout: 120000,      // 2 minutes - how long to wait for ping response
    pingInterval: 30000,      // 30 seconds - how often to send pings
    connectTimeout: 45000     // 45 seconds - initial connection timeout
});

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// The release version is written only in package.json (docs/release.md)
const { version: APP_VERSION } = require('./package.json');

// The rooms live in memory, keyed by room code; disk backups (below) bring
// them back after a restart
const games = new Map();

// Game backups live in games/; GAMES_DIR moves them (the browser tests keep
// theirs out of the project). Created if missing
const backups = createGameBackups(process.env.GAMES_DIR || path.join(__dirname, 'games'));

// A room that is not in memory comes back from its disk backup, if it has
// one. Returns whether the room is in memory now
function ensureGameLoaded(roomCode) {
    if (games.has(roomCode)) return true;

    const game = gameLogic.restoreGame(roomCode, backups.load(roomCode));
    if (!game) return false;

    games.set(roomCode, game);
    console.log(`🔄 Restored game ${roomCode} from disk`);
    return true;
}

// Track socket connections for better disconnect handling
// (handles the refresh race: new socket connects before old one disconnects)
const connections = gameLogic.createConnectionTracker();
// The sockets of newcomers waiting to be let into a started round (ask-to-join):
// the same bookkeeping as the players', kept apart - playerHandler looks only
// at `connections`, so a waiting socket can never act as a player
const waiting = gameLogic.createConnectionTracker();

// Security headers on every answer of Express: pages, files, API, 404 and
// redirects (Socket.IO answers its own /socket.io/ requests before Express).
// The list is Flying Solo's; Render adds the headers of render.yaml only to
// static sites, so a server sends them itself.
const SECURITY_HEADERS = {
    // The pages run only the game's own code: scripts and styles only from its
    // files - no inline scripts, styles or style attributes (a script may still
    // set element.style; tests/code-structure.test.js checks the files).
    // Images may be data: (Bootstrap draws its icons so; photo avatars are
    // data:image URLs) and blob: (an uploaded photo is opened at a blob:
    // address before it is shrunk). connect-src 'self' covers Socket.IO, its
    // requests and its WebSocket. No plugins, no <base>, and no other site
    // may show the game in a frame.
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    // A link to another site tells it only the game's address, never the page:
    // a room's address holds its code. The coffee link sends nothing at all
    // (rel="noreferrer"); this covers any link without it
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Browser features the game never uses (Web Share, the photo picker and
    // the screen wake lock of a started round are not among them)
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    // A file is what its Content-Type says, never guessed from its content
    'X-Content-Type-Options': 'nosniff',
};

app.use((req, res, next) => {
    res.set(SECURITY_HEADERS);
    next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle game room URLs - serve game page for /game/ROOMCODE
app.get('/game/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode.toUpperCase();

    // The code becomes part of a file path below: only a real room code goes on
    if (!gameLogic.isValidRoomCode(roomCode)) {
        return res.redirect('/?error=room-not-found');
    }

    if (ensureGameLoaded(roomCode)) {
        res.sendFile(path.join(__dirname, 'public', 'game.html'));
    } else {
        res.redirect('/?error=room-not-found');
    }
});

// A value from a request as the log gets it: short, whatever was sent (a
// request may carry up to 1 MB, and Render's log is the owner's to read)
function forLog(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return (text && text.length > 64) ? `${text.slice(0, 64)}…` : text;
}

// Custom image avatars ride inside JSON bodies (a join carries one)
const jsonBody = express.json({ limit: '1mb' });

// The running version: every page shows it at the bottom, and after a deploy
// it tells which release is live
app.get('/api/version', (req, res) => {
    res.json({ version: APP_VERSION });
});

// API endpoint to create a new game
app.post('/api/create-game', jsonBody, (req, res) => {
    const result = gameLogic.createGame(games);
    res.json(result);
});

// API endpoint to join a game
app.post('/api/join-game', jsonBody, (req, res) => {
    const { playerName, avatar, playerId, playerSecret } = req.body || {};
    // Codes are upper case; one typed in lower case is the same room
    const gameId = typeof req.body?.gameId === 'string' ? req.body.gameId.toUpperCase() : '';

    // A photo avatar is a data URL of up to 32 KB: the log gets a mark, not
    // the picture. The secret is never written anywhere but the backups
    console.log('Join game request:', {
        gameId: forLog(gameId), playerName: forLog(playerName), playerId: forLog(playerId),
        avatar: gameLogic.isCustomAvatar(avatar) ? '[photo]' : forLog(avatar)
    });

    if (!gameId || !playerName || !avatar) {
        console.log('Missing required fields:', { gameId: !!gameId, playerName: !!playerName, avatar: !!avatar });
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // After a restart the room may still be only on disk. A lost room is
    // reported before the secret is checked: a page that sends no secret (an
    // old page left open while a new version was deployed) learns that the
    // room is gone, not that something is missing
    ensureGameLoaded(gameId);
    if (!games.has(gameId)) {
        return res.status(400).json({ success: false, error: 'Game not found' });
    }

    // Every page sends the player's secret (PLAYER_SECRET in utils.js): it is
    // what lets only this browser act as this player (addPlayerToGame)
    if (!gameLogic.isValidPlayerId(playerSecret)) {
        console.log('Join without a player secret refused');
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = gameLogic.addPlayerToGame(games, gameId, playerName, avatar, playerId, playerSecret);

    // A newcomer to a started round: not an error - their room page waits and
    // asks over its socket (ask-to-join) for a player to let them in
    if (result.waitingForApproval) {
        console.log(`Player ${forLog(playerId)} has to ask to join started game ${gameId}`);
        return res.json(result);
    }

    if (!result.success) {
        console.log('Failed to add player to game:', result.error);
        return res.status(400).json(result);
    }

    console.log(`Player ${forLog(result.player.name)} ${result.isNewPlayer ? 'joined' : 'reconnected to'} game ${gameId}`);

    // Broadcast to all players in the room. Characters and reveals are
    // included because a returning leaver gets their character restored -
    // the other clients must see it reappear on the card
    const eventName = result.isNewPlayer ? 'player-joined' : 'player-reconnected';
    io.to(gameId).emit(eventName, {
        player: result.player,
        players: result.game.players,
        characters: result.game.characters,
        revealedPlayers: result.game.revealedPlayers
    });

    res.json(result);
});

// Any address nobody answered above: the game's own page, status 404
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Wrap a socket event handler so a bad payload can never crash the server:
// guarantees `data` is an object and catches unexpected errors.
function safeHandler(socket, eventName, handler) {
    socket.on(eventName, (data) => {
        try {
            handler((data && typeof data === 'object') ? data : {});
        } catch (error) {
            console.error(`❌ Error handling "${eventName}":`, error);
            socket.emit('error', 'Something went wrong, please try again');
        }
    });
}

// Like safeHandler, for what a player does in the room. The handler gets the
// player this socket speaks for (join-room registered it after checking the
// player's secret): who acts is never read from the message, so a page - or
// someone typing in the browser's console - cannot act for anybody else
function playerHandler(socket, eventName, handler) {
    safeHandler(socket, eventName, (data) => {
        const me = connections.getPlayer(socket.id);
        if (!me) {
            socket.emit('error', 'You are not in this game');
            return;
        }
        handler(data, me);
    });
}

// Tell the waiting pages of these newcomers that their request is over:
// 'declined' sends them home, 'retry' makes them join again and follow the
// answer (let in, the lobby, or a room that is gone)
function endJoinRequests(gameId, playerIds, outcome) {
    for (const playerId of playerIds) {
        const socketIds = waiting.unregisterPlayer(gameId, playerId);
        // io.to([]) would reach every socket of the server
        if (socketIds.length > 0) {
            io.to(socketIds).emit('join-request-ended', { outcome });
        }
    }
}

// A waiting socket goes away: when it was the newcomer's last waiting page,
// the request goes too, and the players' windows close
function withdrawWaitingSocket(socketId) {
    const lastOfRequest = waiting.unregister(socketId);
    if (!lastOfRequest) return;
    const { gameId, playerId } = lastOfRequest;
    const game = games.get(gameId);
    if (game && gameLogic.withdrawJoinRequest(game, playerId)) {
        console.log(`🚪 Player ${playerId} no longer asks to join game ${gameId}`);
        io.to(gameId).emit('join-request-closed', { playerId, outcome: 'withdrawn' });
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // A room page connects after its HTTP join. Only a player of this room,
    // with their secret, gets in: the room hears every move of the game, and
    // from now on the socket acts for that player
    safeHandler(socket, 'join-room', (data) => {
        const { playerId, playerSecret } = data;
        const gameId = typeof data.gameId === 'string' ? data.gameId.toUpperCase() : '';
        const game = games.get(gameId);
        // The page drew the room from its HTTP join, but its player has left
        // since (in another tab, say) or the room is gone: tell this page it is
        // out, as a leaver's own page is told, or it stays in a room it never hears
        if (gameLogic.isValidPlayerId(playerId) && !(game && game.players.some(p => p.id === playerId))) {
            socket.emit('player-left', { playerId, gameDeleted: !game });
            return;
        }
        if (!game || !gameLogic.checkPlayerSecret(game, playerId, playerSecret)) {
            return;
        }
        // A socket is one page: one player of one room
        const registered = connections.getPlayer(socket.id);
        if (registered && (registered.gameId !== gameId || registered.playerId !== playerId)) {
            return;
        }

        socket.join(gameId);
        connections.register(socket.id, gameId, playerId);
        gameLogic.markPlayerConnected(game, playerId);
        console.log(`📍 Socket ${socket.id} → Player ${playerId} in game ${gameId}`);

        // Send current game state to the user, with the newcomers waiting to
        // be let in: a page that opens now shows their request too
        socket.emit('game-state', { ...gameLogic.serializeGame(game), joinRequests: gameLogic.listJoinRequests(game) });
    });

    // A newcomer's waiting page asks to join the started round (its HTTP join
    // answered waitingForApproval). The socket does not join the room's
    // channel: until a player lets them in, the newcomer hears nothing of it
    safeHandler(socket, 'ask-to-join', (data) => {
        // A player's page has nothing to ask
        if (connections.getPlayer(socket.id)) return;
        const { playerId, playerSecret, playerName, avatar } = data;
        const gameId = typeof data.gameId === 'string' ? data.gameId.toUpperCase() : '';

        const result = gameLogic.requestToJoin(games, gameId, playerName, avatar, playerId, playerSecret);
        if (result.retryJoin) {
            socket.emit('join-request-ended', { outcome: 'retry' });
            return;
        }
        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        // A socket waits for one request: one it waited for before goes first
        const previous = waiting.getPlayer(socket.id);
        if (previous && (previous.gameId !== gameId || previous.playerId !== playerId)) {
            withdrawWaitingSocket(socket.id);
        }
        waiting.register(socket.id, gameId, playerId);
        console.log(`🚪 Player ${playerId} asks to join game ${gameId}`);
        io.to(gameId).emit('join-requested', result.request);
    });

    // Any player answers a request; the first answer decides (game-logic.js)
    playerHandler(socket, 'admit-player', (data, me) => {
        const result = gameLogic.admitPlayer(games, me.gameId, data.playerId, me.playerId);
        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        console.log(`🚪 Player ${result.player.id} let into game ${me.gameId} by ${me.playerId}`);
        io.to(me.gameId).emit('player-joined', {
            player: result.player,
            players: result.players,
            characters: result.characters,
            revealedPlayers: result.revealedPlayers
        });
        io.to(me.gameId).emit('join-request-closed', {
            playerId: result.player.id,
            outcome: 'admitted',
            playerName: result.player.name
        });
        // Their page joins the usual way now: the HTTP join lets them in
        endJoinRequests(me.gameId, [result.player.id], 'retry');
    });

    playerHandler(socket, 'decline-player', (data, me) => {
        const result = gameLogic.declinePlayer(games, me.gameId, data.playerId, me.playerId);
        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        console.log(`🚪 Player ${data.playerId} declined in game ${me.gameId} by ${me.playerId}`);
        io.to(me.gameId).emit('join-request-closed', {
            playerId: data.playerId,
            outcome: 'declined',
            playerName: result.playerName
        });
        endJoinRequests(me.gameId, [data.playerId], 'declined');
    });

    // Final character assignment (when editing completes): `playerId` is the
    // player who gets the character, the one who gives it is the sender
    playerHandler(socket, 'assign-character', (data, me) => {
        const { playerId, character } = data;

        const result = gameLogic.assignCharacter(games, me.gameId, playerId, character, me.playerId);

        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        console.log(`✅ Character finalized for player ${playerId} in game ${me.gameId}`);

        // Send complete character state to all players for consistency.
        // io.to() includes the sender, so their own page updates the same way
        io.to(me.gameId).emit('character-finalized', {
            playerId: playerId,
            character: result.character,
            allCharacters: result.characters
        });
    });

    playerHandler(socket, 'start-game', (data, me) => {
        const result = gameLogic.startGame(games, me.gameId, me.playerId);

        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        console.log(`Game ${me.gameId} started by player ${me.playerId}`);

        // Broadcast game start to all players in the room
        io.to(me.gameId).emit('game-started', result);
    });

    // A player reveals their own character, nobody else's
    playerHandler(socket, 'reveal-character', (data, me) => {
        const result = gameLogic.revealCharacter(games, me.gameId, me.playerId);

        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        console.log(`Player ${me.playerId} revealed their character in game ${me.gameId}`);

        // Broadcast character reveal to all players in the room
        io.to(me.gameId).emit('character-revealed', result);

        // Broadcast notification about the reveal to all players
        io.to(me.gameId).emit('player-revealed-notification', {
            playerName: result.revealedPlayer.name,
            character: result.revealedPlayer.character,
            playerId: me.playerId
        });
    });

    playerHandler(socket, 'restart-game', (data, me) => {
        const result = gameLogic.restartGame(games, me.gameId, me.playerId);

        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        console.log(`Game ${me.gameId} restarted by player ${me.playerId}`);

        // Broadcast game restart to all players in the room
        io.to(me.gameId).emit('game-restarted', result);
        // The lobby is open to everybody: the newcomers waiting just join
        endJoinRequests(me.gameId, result.endedJoinRequests, 'retry');
    });

    // A player leaves the room themselves: nobody can remove anybody else
    playerHandler(socket, 'leave-game', (data, me) => {
        const { gameId, playerId } = me;
        const result = gameLogic.removePlayerFromGame(games, gameId, playerId);

        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        console.log(`👋 Player ${playerId} left game ${gameId}`);

        // Emit BEFORE the sockets leave the room so the leaver receives the
        // confirmation and uses it as the trigger to redirect home
        io.to(gameId).emit('player-left', {
            playerId: playerId,
            playerName: result.removedPlayer.name,
            players: result.players,
            characters: result.characters,
            revealedPlayers: result.revealedPlayers,
            gameDeleted: result.gameDeleted
        });

        // None of the player's tabs speaks for them or hears the room any
        // more; their later disconnects become no-ops
        io.in(connections.unregisterPlayer(gameId, playerId)).socketsLeave(gameId);

        // Nobody is left to answer the newcomers waiting: their pages join
        // again and learn that the room is gone
        endJoinRequests(gameId, result.endedJoinRequests, 'retry');

        if (result.gameDeleted) {
            console.log(`🗑️ Game ${gameId} removed - last player left`);
            // Its old link must not bring it back from the backup
            backups.remove(gameId);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // A newcomer's waiting page: its request goes with its last page
        withdrawWaitingSocket(socket.id);

        // Returns null while the player still has another socket (a second
        // tab, or the new page after a refresh)
        const playerInfo = connections.unregister(socket.id);
        if (!playerInfo) {
            return;
        }

        const { gameId, playerId } = playerInfo;
        console.log(`🔌 Player ${playerId} disconnected from game ${gameId}`);

        // Mark player as disconnected but keep them in the game
        const game = games.get(gameId);
        if (game) {
            const player = gameLogic.markPlayerDisconnected(game, playerId);
            if (player) {
                console.log(`⏰ Player ${playerId} marked as disconnected at ${new Date().toISOString()}`);

                // Notify other players about the disconnection
                socket.to(gameId).emit('player-disconnected', {
                    playerId: playerId,
                    playerName: player.name
                });
            }
        }
    });
});

// Backups not written for 4 hours go (a room is saved while it has players online)
const BACKUP_MAX_AGE = 4 * 60 * 60 * 1000;

// Keep-alive functionality for active games
function keepGamesAlive() {
    // First remove "ghosts" - players disconnected for over an hour
    // (usually the same person who came back under a new player ID, e.g.
    // after clearing localStorage or joining from a messenger's in-app
    // browser). Done before saving so the disk backup is already clean.
    // The payload matches the leave-game handler, so clients reuse their
    // existing 'player-left' handling (list update + notification).
    const removals = gameLogic.removeStaleDisconnectedPlayers(games);
    for (const removal of removals) {
        console.log(`👻 Removed ghost player ${removal.removedPlayer.id} from game ${removal.gameId} (disconnected too long)`);
        io.to(removal.gameId).emit('player-left', {
            playerId: removal.removedPlayer.id,
            playerName: removal.playerName,
            players: removal.players,
            characters: removal.characters,
            revealedPlayers: removal.revealedPlayers,
            gameDeleted: removal.gameDeleted
        });
        endJoinRequests(removal.gameId, removal.endedJoinRequests, 'retry');
        // A room emptied here keeps its disk backup: when every phone of a
        // group slept through a break, the room link still brings it back
    }

    for (const [gameId, game] of games.entries()) {
        // Only keep alive games that have connected players
        const connectedPlayers = game.players.filter(p => p.isConnected).length;

        if (connectedPlayers > 0) {
            console.log(`🔄 Keep-alive: Game ${gameId} has ${connectedPlayers} connected players`);
            backups.save(game);
        } else {
            console.log(`⏳ Game ${gameId} has no connected players, keeping in memory`);
        }
    }

    // Remove long-inactive games from memory (their files stay on disk for
    // up to 4 more hours, so recently abandoned rooms can still be restored)
    const removedGames = gameLogic.cleanupInactiveGames(games);
    if (removedGames.length > 0) {
        console.log(`🧹 Removed ${removedGames.length} inactive games from memory: ${removedGames.join(', ')}`);
    }

    // Clean up old backups after keep-alive
    try {
        const removedBackups = backups.removeOld(games, BACKUP_MAX_AGE);
        if (removedBackups.length > 0) {
            console.log(`🧹 Removed old backups: ${removedBackups.join(', ')}`);
        }
    } catch (error) {
        console.error('❌ Failed to clean up old backups:', error);
    }
}

const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Open the port and start the keep-alive loop
function startServer() {
    server.listen(PORT, '0.0.0.0', () => {
        if (NODE_ENV === 'production') {
            console.log(`🎭 Who am I? server running in production on port ${PORT}`);
        } else {
            console.log(`🎭 Who am I? server running on http://localhost:${PORT}`);
            console.log('Press Ctrl+C to stop the server');
        }
    });

    // Run keep-alive every 5 minutes, the first time after 1 minute
    setInterval(keepGamesAlive, KEEP_ALIVE_INTERVAL);
    setTimeout(keepGamesAlive, 60 * 1000);
}

// Start only when run as `node server.js` (npm start). Tests require() this
// file to reach the real routes through `app` without opening a port.
if (require.main === module) {
    startServer();
}

module.exports = { app };