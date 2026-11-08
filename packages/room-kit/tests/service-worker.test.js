// The kit's service worker (public/kit/js/service-worker.js), run in a made-up
// service worker scope: a game only works online, so the worker must never
// serve the game itself from a cache - only the icons, which never change.
// Caching HTML or JS again would bring back the "player stuck on an old
// version" kind of bug.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'kit', 'js', 'service-worker.js'), 'utf8');
const ORIGIN = 'https://game.example';
const CACHE = 'game-v1';
const ICONS = ['/favicon.ico', '/icons/icon-192x192.png'];

// The worker as a game's sw.js starts it, with the caches it finds
function startWorker({ caches: existing = [] } = {}) {
    const listeners = {};
    const stores = new Map(existing.map(name => [name, new Map()]));
    const fetched = [];
    const self = {
        location: new URL(`${ORIGIN}/sw.js`),
        addEventListener: (type, listener) => { listeners[type] = listener; },
        skipWaiting: jest.fn(),
        clients: { claim: jest.fn() }
    };
    const pathOf = request => new URL(typeof request === 'string' ? `${ORIGIN}${request}` : request.url).pathname;
    const caches = {
        open: async (name) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                addAll: async (urls) => urls.forEach(url => store.set(pathOf(url), `the cached ${url}`)),
                put: async (request, response) => store.set(pathOf(request), response)
            };
        },
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
        match: async (request) => {
            for (const store of stores.values()) {
                if (store.has(pathOf(request))) return store.get(pathOf(request));
            }
            return undefined;
        }
    };
    const fetch = async (request) => {
        fetched.push(request.url);
        return { status: 200, clone() { return `a copy of ${request.url}`; } };
    };
    const quiet = { log() {}, warn() {}, error() {} };
    vm.runInNewContext(`${SOURCE}\ncacheIconsOnly(CACHE, ICONS);`,
        { self, caches, fetch, URL, console: quiet, CACHE, ICONS });

    // An event the worker waits on, and what it waited for
    async function dispatch(type, fields = {}) {
        const waits = [];
        listeners[type]({ ...fields, waitUntil: promise => waits.push(promise) });
        await Promise.all(waits);
    }

    // A request the page makes: the worker's answer, or undefined when it
    // leaves the request to the browser
    function request(url, method = 'GET') {
        let answer;
        listeners.fetch({ request: { url, method }, respondWith: promise => { answer = promise; } });
        return answer;
    }

    return { self, stores, fetched, dispatch, request };
}

describe("the kit's service worker", () => {
    test('installing caches the icons and nothing else', async () => {
        const worker = startWorker();
        await worker.dispatch('install');

        expect([...worker.stores.keys()]).toEqual([CACHE]);
        expect([...worker.stores.get(CACHE).keys()]).toEqual(ICONS);
        expect(worker.self.skipWaiting).toHaveBeenCalled();
    });

    test("activating drops every other cache, the game's own stays", async () => {
        const worker = startWorker({ caches: ['game-v0', CACHE, 'something-else'] });
        await worker.dispatch('activate');

        expect([...worker.stores.keys()]).toEqual([CACHE]);
        expect(worker.self.clients.claim).toHaveBeenCalled();
    });

    test('an icon comes from the cache', async () => {
        const worker = startWorker();
        await worker.dispatch('install');

        await expect(worker.request(`${ORIGIN}/favicon.ico`)).resolves.toBe('the cached /favicon.ico');
        expect(worker.fetched).toEqual([]);
    });

    test('an icon missing from the cache is fetched and kept', async () => {
        const worker = startWorker();

        const answer = await worker.request(`${ORIGIN}/icons/icon-192x192.png`);

        expect(answer.status).toBe(200);
        expect(worker.fetched).toEqual([`${ORIGIN}/icons/icon-192x192.png`]);
        expect(worker.stores.get(CACHE).get('/icons/icon-192x192.png')).toBe(`a copy of ${ORIGIN}/icons/icon-192x192.png`);
    });

    test.each([
        ['the landing page', `${ORIGIN}/`],
        ['a room page', `${ORIGIN}/game/ABC123`],
        ['a script', `${ORIGIN}/js/game-room.js`],
        ["the kit's script", `${ORIGIN}/kit/js/app.js`],
        ['a stylesheet', `${ORIGIN}/css/style.css`],
        ['the manifest', `${ORIGIN}/manifest.json`],
        ['the API', `${ORIGIN}/api/version`],
        ["the room's socket", `${ORIGIN}/ws/ABC123`],
        ['an icon\'s path in the query only', `${ORIGIN}/?icon=/favicon.ico`],
        ['a path an icon starts with', `${ORIGIN}/icons/`],
        ['an icon of another site', 'https://elsewhere.example/favicon.ico'],
        ['a browser extension', 'chrome-extension://abc/favicon.ico']
    ])('%s is left to the browser', (what, url) => {
        expect(startWorker().request(url)).toBeUndefined();
    });

    test('only GET of an icon is answered', () => {
        expect(startWorker().request(`${ORIGIN}/favicon.ico`, 'POST')).toBeUndefined();
    });

    test("the update banner's button takes the new worker at once", () => {
        const worker = startWorker();
        worker.dispatch('message', { data: 'CHECK_UPDATE' });

        expect(worker.self.skipWaiting).toHaveBeenCalled();
    });
});
