// A room of the game: one Durable Object per room code (worker/index.js
// routes to it by the code), on the kit's room with players
// (packages/room-kit/worker/game-room.js): the room's storage and timer, the
// players' joins and their pages' sockets, the waiting newcomers' pages,
// leaving, are the kit's. The rules are game-logic.js's; this file holds the
// game's moves and tells the pages what they changed.
//
// Every page draws the round from one event, `round-state` (game-logic.js's
// roundView): after every change of the room while a round is on - a move, a
// page that joins or goes, a leaver, a ghost - so a seat's presence is always
// the room's. It never carries an answer before the last sheet is open. The
// answers of an open sheet go to the sockets of the player who opened it
// (`sheet`), and again to their page when it joins after a reload.
import gameLogic from '../game-logic.js';
import { GameRoom, isPlayer, isPlayerOf } from '@parlour-games/room-kit/worker/game-room.js';

// What a player does in the room (leave-game is the kit's): the handler gets
// the player the socket speaks for, never an ID from the message
const MOVES = {
    'start-round': 'startRound',
    'write-answer': 'writeAnswer',
    'take-sheet': 'takeSheet',
    'return-sheet': 'returnSheet',
    'open-sheet': 'openSheet',
    'new-round': 'newRound',
};

// A player ID from a message: a text, or nothing
const idFrom = value => (typeof value === 'string' ? value : null);

export class Room extends GameRoom {
    constructor(ctx, env) {
        super(ctx, env, { rules: gameLogic, moves: MOVES });
    }

    // Every change is saved, then the pages get the round as it is now
    async afterChange(alsoStore) {
        await super.afterChange(alsoStore);
        if (this.game && this.game.round) this.broadcastRound();
    }

    broadcastRound() {
        this.broadcast('round-state', { state: this.game.state, round: gameLogic.roundView(this.game) }, { only: isPlayer });
    }

    // The room has just been loaded: a sheet held by a player without a page
    // goes back on the table, as when their last page goes
    async reconcile() {
        const { game } = this;
        let freed = false;
        if (game && game.round) {
            for (const holder of new Set(Object.values(game.round.takenBy))) {
                if (this.sockets(isPlayerOf(holder)).length === 0) {
                    freed = gameLogic.releaseSheetsOf(game, holder).length > 0 || freed;
                }
            }
        }
        await super.reconcile();
        if (freed) await this.afterChange();
    }

    // A player's page joins: after the kit's game-state, the sheets this
    // player opened, with their answers - the only ones they may see yet
    async joinRoom(ws, data) {
        await super.joinRoom(ws, data);
        const info = this.getInfo(ws);
        if (info.role !== 'player' || !this.game) return;
        for (const sheet of gameLogic.sheetsOpenedBy(this.game, info.playerId)) {
            this.send(ws, 'sheet', sheet);
        }
    }

    // A player's last page has gone: the sheets they held go back on the table
    // before the kit marks them offline and saves (a player holding a sheet is
    // online until then, so the kit's save takes this along)
    async onSocketGone(ws, info) {
        if (info.role === 'player' && this.game && this.sockets(isPlayerOf(info.playerId)).length === 0) {
            const freed = gameLogic.releaseSheetsOf(this.game, info.playerId);
            if (freed.length > 0) console.log(`📄 Sheets of ${freed.join(', ')} back on the table in game ${this.roomCode}`);
        }
        await super.onSocketGone(ws, info);
    }

    async startRound(ws, data, me) {
        const result = gameLogic.startRound(this.games, me.gameId, me.playerId);
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }
        console.log(`Round started in game ${me.gameId} by player ${me.playerId}`);
        await this.afterChange();
    }

    // The answer to this step's question on the sheet in front of the sender,
    // or (`for`) on the absent player's sheet they hold
    async writeAnswer(ws, data, me) {
        const result = gameLogic.writeAnswer(this.games, me.gameId, me.playerId, data.text, idFrom(data.for));
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }
        if (result.stepEnded) console.log(`Game ${me.gameId} is at step ${result.step}`);
        await this.afterChange();
    }

    // "Answer for" or "Read for": `playerId` is the absent seat's player
    async takeSheet(ws, data, me) {
        const result = gameLogic.takeSheet(this.games, me.gameId, me.playerId, idFrom(data.playerId));
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }
        await this.afterChange();
    }

    async returnSheet(ws, data, me) {
        const result = gameLogic.returnSheet(this.games, me.gameId, me.playerId, idFrom(data.playerId));
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }
        await this.afterChange();
    }

    // The sheet in front of the sender, or (`for`) the absent player's sheet
    // they hold: its answers go to the sender's pages only
    async openSheet(ws, data, me) {
        const result = gameLogic.openSheet(this.games, me.gameId, me.playerId, idFrom(data.for));
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }
        const [sheet] = gameLogic.sheetsOpenedBy(this.game, me.playerId).filter(each => each.sheet === result.sheet);
        this.broadcast('sheet', sheet, { only: isPlayerOf(me.playerId) });
        if (result.allOpen) console.log(`Every story of game ${me.gameId} is open`);
        await this.afterChange();
    }

    // Back to the lobby: the pages draw it, the newcomers waiting just join
    async newRound(ws, data, me) {
        const result = gameLogic.newRound(this.games, me.gameId, me.playerId);
        if (!result.success) {
            this.send(ws, 'error', result.error);
            return;
        }
        console.log(`Game ${me.gameId} back in the lobby, by player ${me.playerId}`);
        this.broadcast('round-state', { state: this.game.state, round: null }, { only: isPlayer });
        this.endJoinRequests(result.endedJoinRequests, 'retry');
        await this.afterChange();
    }
}
