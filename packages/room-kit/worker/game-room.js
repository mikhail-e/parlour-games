// A room with players, on the kit's RoomBase: what every game's room does
// with its players and their pages, whatever the game. The room keeps its one
// game in its storage, sets its timer, takes the players' joins and their
// pages' sockets, lets newcomers' pages wait for a round to let them in, and
// tells the pages what happened. The rules are the kit's players list
// (shared/players.js) with the game's hooks; the game's moves are the game's
// room's own methods (a game's worker/room.js extends GameRoom).
//
// The rules keep their games in a Map; here the Map holds this room's game
// only, under its code.
import identity from '../shared/identity.js';
import players from '../shared/players.js';
import { RoomBase, SWEEP_EVERY_MS } from './room-base.js';

const { isValidPlayerId } = identity;
const {
    gameFromStorage,
    gameToStorage,
    markPlayerConnected,
    markPlayerDisconnected,
    restartGhostClocks,
    roomAlarmTime,
    checkPlayerSecret,
    requestToJoin,
    withdrawJoinRequest,
    listJoinRequests,
    ROOM_EMPTY_MS,
    MAX_DISCONNECTED_MS
} = players;

// A value from a request as the log gets it: short, whatever was sent (Workers
// Logs are the owner's to read). A secret never goes into the log, nor a photo
const LOG_LENGTH = 64;
export function forLog(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return (text && text.length > LOG_LENGTH) ? `${text.slice(0, LOG_LENGTH)}…` : text;
}

// Whose a socket is lives in its attachment: { role: 'player', playerId } once
// join-room has checked the player's secret, { role: 'waiting', playerId } for
// a newcomer's page asking to join the round, no role for any other socket
export const isPlayer = info => info.role === 'player';
export const isPlayerOf = playerId => info => info.role === 'player' && info.playerId === playerId;
export const isWaitingFor = playerId => info => info.role === 'waiting' && info.playerId === playerId;
export const withoutRole = ({ role: _role, playerId: _playerId, ...info }) => info;

export class GameRoom extends RoomBase {
    // rules: the game's rules - the functions roomPlayers() gave with the
    // game's hooks (createGame, addPlayerToGame, removePlayerFromGame,
    // removeStaleDisconnectedPlayers, playersView) and serializeGame(game),
    // the game as a player's page gets it when its socket joins.
    // moves: what a player does in the room - event name → the name of the
    // room's method, which gets the player the socket speaks for, never an
    // ID from the message
    constructor(ctx, env, { rules, moves = {} }) {
        super(ctx, env);
        this.rules = rules;
        this.moves = { ...moves, 'leave-game': 'leaveGame' };
        this.games = new Map();
        this.roomCode = null;
        // When the last page of a player closed, or null while one is open
        this.emptySince = null;
        // The room's times; a game's browser tests shorten them (its playwright.config.js)
        this.emptyRoomMs = Number(env.ROOM_EMPTY_MS) || ROOM_EMPTY_MS;
        this.ghostMs = Number(env.GHOST_MS) || MAX_DISCONNECTED_MS;

        ctx.blockConcurrencyWhile(async () => {
            const saved = await ctx.storage.get(['game', 'roomCode', 'emptySince']);
            this.roomCode = saved.get('roomCode') || null;
            this.emptySince = saved.get('emptySince') ?? null;
            if (saved.get('game') && this.roomCode) {
                this.games.set(this.roomCode, gameFromStorage(saved.get('game')));
            }
            await this.reconcile();
        });
    }

    // The room has just been loaded - after a sleep, a deploy, a restart. If
    // it went down with its sockets, it heard none of them close: a player
    // marked online without a page goes offline, a request without a waiting
    // page goes away
    async reconcile() {
        const { game } = this;
        if (!game) return;
        let changed = false;
        for (const player of game.players) {
            if (player.isConnected && this.sockets(isPlayerOf(player.id)).length === 0) {
                markPlayerDisconnected(game, player.id);
                changed = true;
            }
        }
        for (const playerId of [...game.joinRequests.keys()]) {
            if (this.withdrawRequestWithoutPages(playerId)) changed = true;
        }
        if (changed) await this.afterChange();
    }

    get game() {
        return this.games.get(this.roomCode);
    }

    // After every change: the game into the room's storage, and the room's
    // timer set for what is due next. A room without a game keeps nothing and
    // sets no timer. alsoStore goes into the same write
    async afterChange(alsoStore = {}) {
        if (!this.game) {
            this.emptySince = null;
            await this.ctx.storage.deleteAll();
            await this.ctx.storage.deleteAlarm();
            return;
        }
        const playerPagesOpen = this.sockets(isPlayer).length > 0;
        if (playerPagesOpen) {
            this.emptySince = null;
        } else {
            this.emptySince ??= Date.now();
        }
        await this.ctx.storage.put({ ...alsoStore, game: gameToStorage(this.game), emptySince: this.emptySince });
        await this.setTimer(playerPagesOpen);
    }

    // The timer for what is due next: the room's end or a ghost's time, and
    // the next look for silent sockets while any are open
    async setTimer(playerPagesOpen) {
        await this.setAlarmAt([
            roomAlarmTime(this.game, { playerPagesOpen, emptySince: this.emptySince },
                { emptyRoomMs: this.emptyRoomMs, ghostMs: this.ghostMs }),
            this.sockets().length ? Date.now() + SWEEP_EVERY_MS : null
        ]);
    }

    // The room's timer: a room nobody had open for the empty-room time goes;
    // while somebody plays, the ghosts go. Then the silent sockets
    async alarm() {
        const playerPagesOpen = this.sockets(isPlayer).length > 0;
        let changed = false;
        if (this.game && !playerPagesOpen && this.emptySince !== null && Date.now() >= this.emptySince + this.emptyRoomMs) {
            this.deleteRoom();
            changed = true;
        } else if (this.game && playerPagesOpen) {
            changed = this.removeGhosts();
        }
        // A silent socket is gone: onSocketGone saves what that changes
        await this.sweepSilentSockets();
        // A page left open keeps the room awake once a minute: when nothing
        // changed, there is nothing to write - the timer is only set again
        if (changed || !this.game) {
            await this.afterChange();
        } else {
            await this.setTimer(this.sockets(isPlayer).length > 0);
        }
    }

    // Nobody had the room open for the empty-room time: it goes, and its code
    // is free again. The newcomers waiting join again and learn it is gone
    deleteRoom() {
        console.log(`🗑️ Game ${this.roomCode} removed - no page open for ${this.emptyRoomMs / 60000} min`);
        this.endJoinRequests([...this.game.joinRequests.keys()], 'retry');
        this.games.clear();
    }

    // Players offline for longer than the ghost time leave, as if they had
    // left themselves (only while a page of a player is open: a group that
    // took a break finds its room as it left it). True when somebody left
    removeGhosts() {
        const { game } = this;
        const removals = this.rules.removeStaleDisconnectedPlayers(this.games, this.ghostMs);
        for (const removal of removals) {
            console.log(`👻 Removed ghost player ${removal.removedPlayer.id} from game ${this.roomCode} (disconnected too long)`);
            this.broadcast('player-left', {
                playerId: removal.removedPlayer.id,
                playerName: removal.playerName,
                ...this.rules.playersView(game),
                gameDeleted: removal.gameDeleted
            }, { only: isPlayer });
            this.endJoinRequests(removal.endedJoinRequests, 'retry');
        }
        return removals.length > 0;
    }

    // A new game under this room's code; false when the room has one already
    async create(roomCode) {
        if (this.game) return { success: false };
        this.roomCode = roomCode;
        this.rules.createGame(this.games, roomCode);
        // A room nobody ever opens goes after the empty-room time too
        this.emptySince = Date.now();
        await this.afterChange({ roomCode });
        console.log(`Game ${roomCode} created`);
        return { success: true };
    }

    async hasGame() {
        return Boolean(this.game);
    }

    // /api/join-game for this room (the game's Worker has checked the fields
    // and the code): the answer's status and body
    async join({ playerName, avatar, playerId, playerSecret }) {
        // A lost room is reported before the secret is checked: a page that
        // sends no secret (an old page left open while a new version was
        // deployed) learns that the room is gone, not that something is missing.
        // A room without a game writes nothing
        if (!this.game) {
            return { status: 400, body: { success: false, error: 'Game not found' } };
        }
        const gameId = this.roomCode;

        // Every page sends the player's secret (PLAYER_SECRET, the kit's app.js): it is
        // what lets only this browser act as this player (addPlayerToGame)
        if (!isValidPlayerId(playerSecret)) {
            console.log('Join without a player secret refused');
            return { status: 400, body: { error: 'Missing required fields' } };
        }

        const result = this.rules.addPlayerToGame(this.games, gameId, playerName, avatar, playerId, playerSecret);

        // A newcomer to a started round: not an error - their room page waits
        // and asks over its socket (ask-to-join)
        if (result.waitingForApproval) {
            console.log(`Player ${forLog(playerId)} has to ask to join started game ${gameId}`);
            return { status: 200, body: result };
        }

        if (!result.success) {
            console.log('Failed to add player to game:', result.error);
            return { status: 400, body: result };
        }

        console.log(`Player ${forLog(result.player.name)} ${result.isNewPlayer ? 'joined' : 'reconnected to'} game ${gameId}`);

        // Every player's page hears it, with the game's part of the list: a
        // returning leaver gets back what the game kept of them, and the
        // other pages must see it reappear
        this.broadcast(result.isNewPlayer ? 'player-joined' : 'player-reconnected', {
            player: result.player,
            ...this.rules.playersView(this.game)
        }, { only: isPlayer });

        await this.afterChange();
        return { status: 200, body: result };
    }

    // A page's socket: join-room and ask-to-join for anybody, a move only for
    // the player the socket speaks for
    async onEvent(ws, event, data) {
        if (event === 'join-room') return this.joinRoom(ws, data);
        if (event === 'ask-to-join') return this.askToJoin(ws, data);
        if (!Object.hasOwn(this.moves, event)) return;

        const info = this.getInfo(ws);
        if (info.role !== 'player') {
            this.send(ws, 'error', 'You are not in this game');
            return;
        }
        await this[this.moves[event]](ws, data, { gameId: this.roomCode, playerId: info.playerId });
    }

    onEventError(ws) {
        this.send(ws, 'error', 'Something went wrong, please try again');
    }

    // The game as a player's page gets it when its socket joins: the game's
    // own picture of it, with the newcomers waiting to be let in (a page that
    // opens now shows their requests too)
    gameState(game) {
        return { ...this.rules.serializeGame(game), joinRequests: listJoinRequests(game) };
    }

    // A room page connects after its HTTP join. Only a player of this room,
    // with their secret, gets in: the socket hears every move of the game,
    // and from now on it acts for that player
    async joinRoom(ws, data) {
        const { playerId, playerSecret } = data;
        const gameId = typeof data.gameId === 'string' ? data.gameId.toUpperCase() : '';
        const game = this.games.get(gameId);
        // The page drew the room from its HTTP join, but its player has left
        // since (in another tab, say) or the room is gone: tell this page it is
        // out, as a leaver's own page is told, or it stays in a room it never hears
        if (isValidPlayerId(playerId) && !(game && game.players.some(p => p.id === playerId))) {
            this.send(ws, 'player-left', { playerId, gameDeleted: !game });
            return;
        }
        if (!game || !checkPlayerSecret(game, playerId, playerSecret)) {
            return;
        }
        // A socket is one page: one player
        const info = this.getInfo(ws);
        if (info.role === 'player' && info.playerId !== playerId) {
            return;
        }

        // The first page back after a time without any: every player still
        // offline gets a fresh ghost time (restartGhostClocks)
        if (this.emptySince !== null) restartGhostClocks(game);
        this.setInfo(ws, { ...info, role: 'player', playerId });
        // A socket that waited for a request waits no more (askToJoin does the same)
        if (info.role === 'waiting') this.withdrawRequestWithoutPages(info.playerId);
        markPlayerConnected(game, playerId);
        console.log(`📍 A page of player ${playerId} joined game ${gameId}`);

        this.send(ws, 'game-state', this.gameState(game));
        await this.afterChange();
    }

    // A newcomer's waiting page asks to join the started round (its HTTP join
    // answered waitingForApproval). Until the game lets them in, the newcomer
    // hears nothing of the room
    async askToJoin(ws, data) {
        const info = this.getInfo(ws);
        // A player's page has nothing to ask
        if (info.role === 'player') return;
        const { playerId, playerSecret, playerName, avatar } = data;
        const gameId = typeof data.gameId === 'string' ? data.gameId.toUpperCase() : '';

        const result = requestToJoin(this.games, gameId, playerName, avatar, playerId, playerSecret);
        if (result.retryJoin) {
            this.send(ws, 'join-request-ended', { outcome: 'retry' });
            return;
        }
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }

        // A socket waits for one request: one it waited for before goes first
        this.setInfo(ws, { ...info, role: 'waiting', playerId });
        if (info.role === 'waiting' && info.playerId !== playerId) {
            this.withdrawRequestWithoutPages(info.playerId);
        }
        console.log(`🚪 Player ${playerId} asks to join game ${gameId}`);
        this.broadcast('join-requested', result.request, { only: isPlayer });
        await this.afterChange();
    }

    // A player leaves the room themselves: nobody can remove anybody else
    async leaveGame(ws, data, me) {
        const { gameId, playerId } = me;
        const { game } = this;
        const result = this.rules.removePlayerFromGame(this.games, gameId, playerId);
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }

        console.log(`👋 Player ${playerId} left game ${gameId}`);
        // Sent BEFORE the player's sockets lose their role, so the leaver
        // receives the confirmation and uses it as the trigger to go home
        this.broadcast('player-left', {
            playerId,
            playerName: result.removedPlayer.name,
            ...this.rules.playersView(game),
            gameDeleted: result.gameDeleted
        }, { only: isPlayer });

        // None of the player's tabs speaks for them or hears the room any
        // more; their later closes change nothing
        for (const socket of this.sockets(isPlayerOf(playerId))) {
            this.setInfo(socket, withoutRole(this.getInfo(socket)));
        }
        // Nobody is left to answer the newcomers waiting: their pages join
        // again and learn that the room is gone
        this.endJoinRequests(result.endedJoinRequests, 'retry');

        if (result.gameDeleted) {
            // The room's storage goes with it: its old link leads home
            console.log(`🗑️ Game ${gameId} removed - last player left`);
        }
        await this.afterChange();
    }

    // A socket is gone: a newcomer's request goes with their last waiting
    // page, a player goes offline with their last page (two tabs are one
    // player; a reloaded page often joins before the old one is gone)
    async onSocketGone(ws, info) {
        let changed = false;
        if (info.role === 'waiting') {
            changed = this.withdrawRequestWithoutPages(info.playerId);
        }
        if (info.role === 'player' && this.game && this.sockets(isPlayerOf(info.playerId)).length === 0) {
            const player = markPlayerDisconnected(this.game, info.playerId);
            if (player) {
                console.log(`🔌 Player ${info.playerId} went offline in game ${this.roomCode}`);
                this.broadcast('player-disconnected', { playerId: info.playerId, playerName: player.name },
                    { only: isPlayer, except: ws });
                changed = true;
            }
        }
        if (changed) await this.afterChange();
    }

    // A newcomer's request, when no page of theirs waits for it any more:
    // withdrawn, and the players' pages hear it. True when it went
    withdrawRequestWithoutPages(playerId) {
        if (!this.game || this.sockets(isWaitingFor(playerId)).length > 0) return false;
        if (!withdrawJoinRequest(this.game, playerId)) return false;
        console.log(`🚪 Player ${playerId} no longer asks to join game ${this.roomCode}`);
        this.broadcast('join-request-closed', { playerId, outcome: 'withdrawn' }, { only: isPlayer });
        return true;
    }

    // Tell the waiting pages of these newcomers that their request is over:
    // 'declined' sends them home, 'retry' makes them join again and follow the
    // answer (let in, the lobby, or a room that is gone)
    endJoinRequests(playerIds, outcome) {
        for (const playerId of playerIds) {
            for (const socket of this.sockets(isWaitingFor(playerId))) {
                this.setInfo(socket, withoutRole(this.getInfo(socket)));
                this.send(socket, 'join-request-ended', { outcome });
            }
        }
    }
}
