// A room of the game: one Durable Object per room code (worker/index.js
// routes to it by the code), on the kit's room with players
// (packages/room-kit/worker/game-room.js): the room's storage and timer, the
// players' joins and their pages' sockets, the waiting newcomers' pages,
// leaving, are the kit's. The rules are game-logic.js's; this file holds the
// game's moves and tells the pages what they changed.
import gameLogic from '../game-logic.js';
import { GameRoom } from '@parlour-games/room-kit/worker/game-room.js';

// What a player does in the room (leave-game is the kit's): the handler gets
// the player the socket speaks for, never an ID from the message
const MOVES = {};

export class Room extends GameRoom {
    constructor(ctx, env) {
        super(ctx, env, { rules: gameLogic, moves: MOVES });
    }
}
