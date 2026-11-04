// The shared base of a room: one Durable Object per room code, its pages'
// sockets and its timer. Nothing here knows the game - no event names, no
// texts, no rules - so the next app with rooms copies this file unchanged;
// the game's own room (worker/room.js) builds on it.
//
// A room sleeps between messages and may be taken out of memory at any
// moment, so nothing lives only in memory: whose a socket is lives in the
// socket itself (its attachment), everything else in the room's storage.
import { DurableObject } from 'cloudflare:workers';

export class RoomBase extends DurableObject {
    // The open sockets of this room's pages whose info passes the filter
    sockets(filter = () => true) {
        return this.ctx.getWebSockets().filter(ws => {
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
