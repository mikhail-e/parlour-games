// The shared socket of a room page: one WebSocket to the room
// (the kit's worker/room-base.js), messages { event, data } as JSON. Nothing
// here knows a game, so every game's room page takes it.
//
// It connects again by itself, and notices a connection that died without a
// word - a phone woken from sleep keeps a socket that looks open: the page
// pings the room, the room answers 'pong' without waking, and a socket the
// room has not been heard on for too long is replaced.
/* exported RoomSocket */

class RoomSocket {
    static PING_EVERY_MS = 25_000;
    // Heard nothing for this long: the connection is dead. More than a minute:
    // a desktop tab hidden for a while gets its timers once a minute, so its
    // pings go a minute apart; less than the room's limit (room-base.js)
    static SILENCE_LIMIT_MS = 90_000;
    // The first wait before connecting again; it doubles up to the longest
    static RETRY_FIRST_MS = 1000;
    static RETRY_LONGEST_MS = 5000;
    // A page back on the screen pings: no answer this soon - connect again
    static WAKE_CHECK_MS = 5000;

    // path like '/ws/ABC123'; connects at once
    constructor(path, { log = () => {} } = {}) {
        this.path = path;
        this.log = log;
        this.handlers = new Map();
        this.socket = null;
        this.closedForGood = false;
        this.retryDelay = RoomSocket.RETRY_FIRST_MS;
        this.retryTimer = null;
        this.lastHeard = 0;

        this.pingTimer = setInterval(() => this.checkConnection(), RoomSocket.PING_EVERY_MS);
        this.onVisible = () => {
            if (document.visibilityState === 'visible') this.checkAfterWake();
        };
        document.addEventListener('visibilitychange', this.onVisible);
        this.open();
    }

    get connected() {
        return Boolean(this.socket) && this.socket.readyState === WebSocket.OPEN;
    }

    // The current WebSocket, or null (tests close it to drop the connection)
    get ws() {
        return this.socket;
    }

    // 'connect' on every opening, 'disconnect' on every close of an open
    // connection, or an event the room sends
    on(event, handler) {
        if (!this.handlers.has(event)) this.handlers.set(event, []);
        this.handlers.get(event).push(handler);
    }

    once(event, handler) {
        const wrapper = data => {
            this.off(event, wrapper);
            handler(data);
        };
        this.on(event, wrapper);
    }

    off(event, handler) {
        const list = this.handlers.get(event) || [];
        const index = list.indexOf(handler);
        if (index !== -1) list.splice(index, 1);
    }

    // To the room; while not connected, nothing is sent
    emit(event, data) {
        if (!this.connected) {
            this.log('Not connected, not sent:', event);
            return;
        }
        this.socket.send(JSON.stringify({ event, data }));
    }

    // Closed for good: no connecting again
    disconnect() {
        this.closedForGood = true;
        clearTimeout(this.retryTimer);
        clearInterval(this.pingTimer);
        document.removeEventListener('visibilitychange', this.onVisible);
        this.drop();
    }

    fire(event, data) {
        for (const handler of [...(this.handlers.get(event) || [])]) handler(data);
    }

    open() {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
        const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${scheme}//${location.host}${this.path}`);
        this.socket = ws;
        let opened = false;

        ws.addEventListener('open', () => {
            if (ws !== this.socket) return;
            opened = true;
            this.retryDelay = RoomSocket.RETRY_FIRST_MS;
            this.lastHeard = Date.now();
            this.log('Room socket open');
            this.fire('connect');
        });
        ws.addEventListener('message', event => {
            if (ws !== this.socket) return;
            this.lastHeard = Date.now();
            if (event.data === 'pong') return;
            let message;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }
            if (message && typeof message.event === 'string') this.fire(message.event, message.data);
        });
        ws.addEventListener('close', () => {
            if (ws !== this.socket) return;
            this.socket = null;
            if (opened) {
                this.log('Room socket closed');
                this.fire('disconnect');
            }
            this.retryLater();
        });
    }

    // Let go of the current socket at once, without waiting for its close: a
    // dead connection may take long to report it
    drop() {
        const ws = this.socket;
        if (!ws) return;
        this.socket = null;
        const wasOpen = ws.readyState === WebSocket.OPEN;
        try {
            ws.close();
        } catch {
            // closed already
        }
        if (wasOpen) this.fire('disconnect');
    }

    retryLater() {
        if (this.closedForGood || this.retryTimer) return;
        const delay = this.retryDelay * (1 + Math.random() / 2);
        this.retryDelay = Math.min(this.retryDelay * 2, RoomSocket.RETRY_LONGEST_MS);
        this.retryTimer = setTimeout(() => this.open(), delay);
    }

    reconnectNow() {
        if (this.closedForGood) return;
        this.log('Room socket silent, connecting again');
        this.drop();
        this.retryDelay = RoomSocket.RETRY_FIRST_MS;
        this.open();
    }

    checkConnection() {
        if (!this.connected) return;
        if (Date.now() - this.lastHeard > RoomSocket.SILENCE_LIMIT_MS) {
            this.reconnectNow();
            return;
        }
        this.socket.send('ping');
    }

    // Back on the screen: a phone may have slept with the socket open
    checkAfterWake() {
        if (this.closedForGood) return;
        if (!this.connected) {
            // Waiting to connect again: no need to wait any longer
            if (this.retryTimer) this.open();
            return;
        }
        const pinged = this.socket;
        const pingedAt = Date.now();
        pinged.send('ping');
        // Only the socket pinged is judged: one that replaced it meanwhile
        // may still be opening
        setTimeout(() => {
            if (this.socket === pinged && this.lastHeard < pingedAt) this.reconnectNow();
        }, RoomSocket.WAKE_CHECK_MS);
    }
}
