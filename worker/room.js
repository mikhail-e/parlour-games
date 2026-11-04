// A room of the game: one Durable Object per room code (worker/index.js
// routes to it by the code), on the shared base in room-base.js. The rules
// are game-logic.js's; this file keeps the room's one game in its storage and
// tells the pages what happened.
//
// game-logic.js keeps its games in a Map of every room; here the Map holds
// this room's game only, under its code.
import gameLogic from '../game-logic.js';
import { RoomBase } from './room-base.js';

// A value from a request as the log gets it: short, whatever was sent (Workers
// Logs are the owner's to read). A secret never goes into the log, nor a photo
const LOG_LENGTH = 64;
export function forLog(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return (text && text.length > LOG_LENGTH) ? `${text.slice(0, LOG_LENGTH)}…` : text;
}

const isPlayer = info => info.role === 'player';

export class Room extends RoomBase {
    constructor(ctx, env) {
        super(ctx, env);
        this.games = new Map();
        this.roomCode = null;
        // When the last page of a player closed, or null while one is open
        this.emptySince = null;

        ctx.blockConcurrencyWhile(async () => {
            const saved = await ctx.storage.get(['game', 'roomCode', 'emptySince']);
            this.roomCode = saved.get('roomCode') || null;
            this.emptySince = saved.get('emptySince') ?? null;
            if (saved.get('game') && this.roomCode) {
                this.games.set(this.roomCode, gameLogic.gameFromStorage(saved.get('game')));
            }
        });
    }

    get game() {
        return this.games.get(this.roomCode);
    }

    // The game into the room's storage; a room without one keeps nothing
    async save() {
        if (this.game) {
            await this.ctx.storage.put('game', gameLogic.gameToStorage(this.game));
        } else {
            await this.ctx.storage.deleteAll();
        }
    }

    // A new game under this room's code; false when the room has one already
    async create(roomCode) {
        if (this.game) return { success: false };
        this.roomCode = roomCode;
        gameLogic.createGame(this.games, roomCode);
        await this.ctx.storage.put({ roomCode, game: gameLogic.gameToStorage(this.game) });
        console.log(`Game ${roomCode} created`);
        return { success: true };
    }

    async hasGame() {
        return Boolean(this.game);
    }

    // /api/join-game for this room (worker/index.js has checked the fields
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

        // Every page sends the player's secret (PLAYER_SECRET in utils.js): it is
        // what lets only this browser act as this player (addPlayerToGame)
        if (!gameLogic.isValidPlayerId(playerSecret)) {
            console.log('Join without a player secret refused');
            return { status: 400, body: { error: 'Missing required fields' } };
        }

        const result = gameLogic.addPlayerToGame(this.games, gameId, playerName, avatar, playerId, playerSecret);

        // A newcomer to a started round: not an error - their room page waits and
        // asks over its socket (ask-to-join) for a player to let them in
        if (result.waitingForApproval) {
            console.log(`Player ${forLog(playerId)} has to ask to join started game ${gameId}`);
            return { status: 200, body: result };
        }

        if (!result.success) {
            console.log('Failed to add player to game:', result.error);
            return { status: 400, body: result };
        }

        console.log(`Player ${forLog(result.player.name)} ${result.isNewPlayer ? 'joined' : 'reconnected to'} game ${gameId}`);

        // Every player's page hears it. Characters and reveals are included
        // because a returning leaver gets their character restored - the other
        // pages must see it reappear on the card
        this.broadcast(result.isNewPlayer ? 'player-joined' : 'player-reconnected', {
            player: result.player,
            players: result.game.players,
            characters: result.game.characters,
            revealedPlayers: result.game.revealedPlayers
        }, { only: isPlayer });

        await this.save();
        return { status: 200, body: result };
    }
}
