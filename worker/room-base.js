// The shared base of a room: one Durable Object per room code, its pages'
// sockets and its timer. Nothing here knows the game - no event names, no
// texts, no rules - so the next app with rooms copies this file unchanged;
// the game's own room (worker/room.js) builds on it.
//
// A room sleeps between messages and may be taken out of memory at any
// moment, so nothing lives only in memory: whose a socket is lives in the
// socket itself (its attachment), everything else in the room's storage.
import { DurableObject } from 'cloudflare:workers';

// A page pings its room every 25 seconds (room-socket.js). A socket the room
// has not heard for this long belongs to a page that is gone without a word -
// a phone asleep, a lost network - and counts no more
export const SOCKET_SILENCE_MS = 2 * 60 * 1000;
// While sockets are open, the room looks for silent ones this often
export const SWEEP_EVERY_MS = 60 * 1000;

export class RoomBase extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        // Sockets gone while the room is awake. Their attachment says so too,
        // for after a sleep; a closed socket may refuse a new attachment
        this.goneSockets = new WeakSet();
        // A page checks its connection with 'ping' (room-socket.js): the
        // answer comes without waking the room
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }

    // A page opens its socket to the room (worker/index.js passes it on)
    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('A room speaks WebSocket only', { status: 426 });
        }
        const { 0: page, 1: room } = new WebSocketPair();
        this.ctx.acceptWebSocket(room);
        this.setInfo(room, { connectedAt: Date.now() });
        return new Response(null, { status: 101, webSocket: page });
    }

    // A message from a page: { event, data } as JSON. Anything else is not
    // the app's and gets no answer; a handler that fails cannot break the room
    async webSocketMessage(ws, message) {
        if (typeof message !== 'string') return;
        let parsed;
        try {
            parsed = JSON.parse(message);
        } catch {
            return;
        }
        if (!parsed || typeof parsed !== 'object' || typeof parsed.event !== 'string') return;
        const { event } = parsed;
        const data = (parsed.data && typeof parsed.data === 'object') ? parsed.data : {};

        try {
            await this.onEvent(ws, event, data);
        } catch (error) {
            console.error(`Error handling "${event}":`, error);
            this.onEventError(ws, event, error);
        }
    }

    async webSocketClose(ws) {
        await this.socketGone(ws);
    }

    async webSocketError(ws) {
        await this.socketGone(ws);
    }

    // A socket is gone (closed, broken, or silent too long): it counts no
    // more, from now on - its close may still be on its way
    async socketGone(ws) {
        const info = this.getInfo(ws);
        if (info.gone || this.goneSockets.has(ws)) return;
        this.goneSockets.add(ws);
        try {
            this.setInfo(ws, { ...info, gone: true });
            ws.close();
        } catch {
            // closed already
        }
        await this.onSocketGone(ws, info);
    }

    // For the app's room to fill in: a message from a page, a handler that
    // failed, a socket that is gone (with what the room knew about it)
    async onEvent(_ws, _event, _data) {}
    onEventError(_ws, _event, _error) {}
    async onSocketGone(_ws, _info) {}

    // The open sockets of this room's pages whose info passes the filter
    sockets(filter = () => true) {
        return this.ctx.getWebSockets().filter(ws => {
            if (this.goneSockets.has(ws)) return false;
            const info = this.getInfo(ws);
            return !info.gone && filter(info);
        });
    }

    // What the room knows about a socket; it survives the room's sleep
    getInfo(ws) {
        return ws.deserializeAttachment() || {};
    }

    setInfo(ws, info) {
        ws.serializeAttachment(info);
    }

    // One message to one socket: { event, data } as JSON. A socket that has
    // just gone cannot take it, and that is no error of the sender's
    send(ws, event, data) {
        try {
            ws.send(JSON.stringify({ event, data }));
        } catch {
            // the socket closed in the meantime
        }
    }

    // One message to every socket whose info passes `only`, the sender
    // included unless it is `except`
    broadcast(event, data, { only = () => true, except = null } = {}) {
        for (const ws of this.sockets(only)) {
            if (ws !== except) this.send(ws, event, data);
        }
    }

    // Every open socket the room has not heard for longer than the limit is
    // gone. A ping's answer is the room's own (no wake), so its time is asked
    // of the runtime; a socket that never pinged counts from its connection
    async sweepSilentSockets(limitMs = SOCKET_SILENCE_MS) {
        const now = Date.now();
        for (const ws of this.sockets()) {
            const lastPing = this.ctx.getWebSocketAutoResponseTimestamp(ws);
            const lastHeard = lastPing ? lastPing.getTime() : this.getInfo(ws).connectedAt;
            if (now - lastHeard > limitMs) await this.socketGone(ws);
        }
    }

    // The timer goes off at the earliest of the times given; none - no timer
    async setAlarmAt(times) {
        const due = times.filter(time => typeof time === 'number');
        if (due.length) {
            await this.ctx.storage.setAlarm(Math.min(...due));
        } else {
            await this.ctx.storage.deleteAlarm();
        }
    }
}
