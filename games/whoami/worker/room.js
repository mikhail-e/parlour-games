// A room of the game: one Durable Object per room code (worker/index.js
// routes to it by the code), on the kit's room with players
// (packages/room-kit/worker/game-room.js): the room's storage and timer, the
// players' joins and their pages' sockets, the waiting newcomers' pages,
// leaving, are the kit's. The rules are game-logic.js's; this file holds the
// game's moves and tells the pages what they changed - and lets a waiting
// newcomer into the round.
import gameLogic from '../game-logic.js';
import { GameRoom, isPlayer } from '@parlour-games/room-kit/worker/game-room.js';

// What a player does in the room (leave-game is the kit's): the handler gets
// the player the socket speaks for, never an ID from the message
const MOVES = {
    'admit-player': 'admitPlayer',
    'decline-player': 'declinePlayer',
    'assign-character': 'assignCharacter',
    'start-game': 'startGame',
    'reveal-character': 'revealCharacter',
    'restart-game': 'restartGame',
};

export class Room extends GameRoom {
    constructor(ctx, env) {
        super(ctx, env, { rules: gameLogic, moves: MOVES });
    }

    // Any player answers a request; the first answer decides (game-logic.js)
    async admitPlayer(ws, data, me) {
        const result = gameLogic.admitPlayer(this.games, me.gameId, data.playerId, me.playerId);
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }

        console.log(`🚪 Player ${result.player.id} let into game ${me.gameId} by ${me.playerId}`);
        this.broadcast('player-joined', {
            player: result.player,
            players: result.players,
            characters: result.characters,
            revealedPlayers: result.revealedPlayers
        }, { only: isPlayer });
        this.broadcast('join-request-closed', {
            playerId: result.player.id,
            outcome: 'admitted',
            playerName: result.player.name
        }, { only: isPlayer });
        // Their page joins the usual way now: the HTTP join lets them in
        this.endJoinRequests([result.player.id], 'retry');
        await this.afterChange();
    }

    async declinePlayer(ws, data, me) {
        const result = gameLogic.declinePlayer(this.games, me.gameId, data.playerId, me.playerId);
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }

        console.log(`🚪 Player ${data.playerId} declined in game ${me.gameId} by ${me.playerId}`);
        this.broadcast('join-request-closed', {
            playerId: data.playerId,
            outcome: 'declined',
            playerName: result.playerName
        }, { only: isPlayer });
        this.endJoinRequests([data.playerId], 'declined');
        await this.afterChange();
    }

    // Final character assignment (when editing completes): `playerId` is the
    // player who gets the character, the one who gives it is the sender
    async assignCharacter(ws, data, me) {
        const { playerId, character } = data;
        const result = gameLogic.assignCharacter(this.games, me.gameId, playerId, character, me.playerId);
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }

        console.log(`✅ Character finalized for player ${playerId} in game ${me.gameId}`);
        // Every page, the sender's own included, updates the same way
        this.broadcast('character-finalized', {
            playerId,
            character: result.character,
            allCharacters: result.characters
        }, { only: isPlayer });
        await this.afterChange();
    }

    async startGame(ws, data, me) {
        const result = gameLogic.startGame(this.games, me.gameId, me.playerId);
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }

        console.log(`Game ${me.gameId} started by player ${me.playerId}`);
        this.broadcast('game-started', result, { only: isPlayer });
        await this.afterChange();
    }

    // A player reveals their own character, nobody else's
    async revealCharacter(ws, data, me) {
        const result = gameLogic.revealCharacter(this.games, me.gameId, me.playerId);
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }

        console.log(`Player ${me.playerId} revealed their character in game ${me.gameId}`);
        this.broadcast('character-revealed', result, { only: isPlayer });
        this.broadcast('player-revealed-notification', {
            playerName: result.revealedPlayer.name,
            character: result.revealedPlayer.character,
            playerId: me.playerId
        }, { only: isPlayer });
        await this.afterChange();
    }

    async restartGame(ws, data, me) {
        const result = gameLogic.restartGame(this.games, me.gameId, me.playerId);
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }

        console.log(`Game ${me.gameId} restarted by player ${me.playerId}`);
        this.broadcast('game-restarted', result, { only: isPlayer });
        // The lobby is open to everybody: the newcomers waiting just join
        this.endJoinRequests(result.endedJoinRequests, 'retry');
        await this.afterChange();
    }
}
