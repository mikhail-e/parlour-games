// The test of the tests' tag, run by every game on its own config: its
// tests/e2e/check-tag.spec.js calls checkTagTest(). Requests of the tests to a
// live site are marked the same way in all of the owner's projects: the user
// agent ends with " EscapistCheck", and Cloudflare's analytics drop them with
// "Source user agent does not contain EscapistCheck". The tag is written out
// here, not read from playwright.js: a slip there fails this test instead of
// quietly letting the checks into the analytics. The server is the test's
// own, so a run against production (BASE_URL) sends nothing there.
const crypto = require('crypto');
const http = require('http');
const { devices } = require('@playwright/test');
const { test, expect } = require('./e2e');

const TAG = ' EscapistCheck';

// The server remembers the user agent of every request, by path: a page that
// loads a stylesheet, the stylesheet, a service worker script, a socket (it
// answers the handshake, so the page's socket opens) and anything else
async function recordingServer() {
    const seen = {};
    const sockets = [];
    const server = http.createServer((req, res) => {
        seen[req.url] = req.headers['user-agent'];
        const files = {
            '/': ['text/html', '<!doctype html><link rel="stylesheet" href="/check.css"><p>check</p>'],
            '/check.css': ['text/css', 'p { color: green }'],
            '/sw.js': ['text/javascript', '// check'],
        };
        const [type, body] = files[req.url] || ['text/plain', 'check'];
        res.writeHead(200, { 'Content-Type': type });
        res.end(body);
    });
    server.on('upgrade', (req, socket) => {
        seen[req.url] = req.headers['user-agent'];
        sockets.push(socket);
        const accept = crypto.createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    });
    await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve); });
    return {
        url: `http://127.0.0.1:${server.address().port}`,
        seen,
        close: () => {
            sockets.forEach(socket => socket.destroy());
            server.closeAllConnections();
            return new Promise(resolve => { server.close(resolve); });
        },
    };
}

function checkTagTest() {
    test('the tag reaches the site from the page, a file it loads, its service worker and socket, and a direct request', async ({ newPlayer, request }, testInfo) => {
        const server = await recordingServer();
        try {
            // A page the way the games' tests open one, and what it fetches:
            // a file, the service worker script (the browser fetches it itself),
            // a socket like a room's
            const { page } = await newPlayer('Check');
            await page.goto(`${server.url}/`);
            await page.evaluate(() => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready));
            await page.evaluate(address => new Promise((resolve, reject) => {
                const socket = new WebSocket(address);
                socket.addEventListener('open', () => { socket.close(); resolve(); });
                socket.addEventListener('error', () => reject(new Error('The socket did not open')));
            }), `${server.url.replace('http', 'ws')}/socket`);
            await request.get(`${server.url}/direct`);

            const ua = await page.evaluate(() => navigator.userAgent);
            expect(ua.endsWith(TAG), ua).toBe(true);
            expect(Object.keys(server.seen)).toEqual(expect.arrayContaining(['/', '/check.css', '/sw.js', '/socket', '/direct']));
            for (const [path, agent] of Object.entries(server.seen)) {
                expect(agent, path).toBe(ua);
            }
            // Only the end changes: the rest is the device's own user agent, and a phone still says it is one
            const rest = ua.slice(0, -TAG.length);
            expect(Object.values(devices).map(device => device.userAgent)).toContain(rest);
            expect(/\bMobile\b/.test(rest), 'a phone says it is one').toBe(!!testInfo.project.use.isMobile);
        } finally {
            await server.close();
        }
    });
}

module.exports = { checkTagTest };
