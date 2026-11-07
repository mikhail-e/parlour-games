// The service worker of a game with rooms. A game's own /sw.js names its icons
// and their cache, loads this file (importScripts) and calls cacheIconsOnly().
//
// A game only works online (a room lives on the server), so offline support
// is pointless. The service worker exists for two reasons:
//   1. Installability - a PWA needs a registered service worker to be
//      added to the home screen.
//   2. Icons never change, so serving them from cache is a free win.
//
// Everything else - HTML, CSS, JS, the room's socket, /api/ - is left to the
// browser: it goes to the network, and its normal HTTP cache still applies.
// Nothing else is stored here, so a player can never be served a stale
// version of a game.
//
// A change to this file is a new worker of every game: browsers compare the
// imported scripts too, and the kit's pwa.js shows every open page the
// "Update available" banner.
/* exported cacheIconsOnly */

// cacheName: the game's cache of icons (a new name drops the old cache);
// icons: the paths of the icons, exactly as the pages ask for them
function cacheIconsOnly(cacheName, icons) {
    // Install event - pre-cache the icons
    self.addEventListener('install', (event) => {
        console.log('Service Worker installing...');
        event.waitUntil(
            caches.open(cacheName)
                .then((cache) => cache.addAll(icons))
                .catch((error) => console.error('Icon pre-cache failed:', error))
        );
        self.skipWaiting();
    });

    // Activate event - clean old caches
    self.addEventListener('activate', (event) => {
        console.log('Service Worker activating...');
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== cacheName)
                        .map((name) => {
                            console.log('Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
        );
        self.clients.claim();
    });

    // Is this one of the icons we pre-cache? Matched by exact pathname, so a
    // query string can never turn an unrelated URL into an "icon".
    function isIconAsset(url) {
        const parsed = new URL(url);
        return parsed.origin === self.location.origin && icons.includes(parsed.pathname);
    }

    // Helper function to check if request is cacheable (avoid browser extension errors)
    function isCacheableRequest(request) {
        const url = new URL(request.url);

        // Skip non-HTTP(S) schemes (chrome-extension, moz-extension, etc.)
        if (!url.protocol.startsWith('http')) {
            return false;
        }

        // Only same-origin responses are ever stored
        return url.origin === self.location.origin;
    }

    // Cache-first: used for icons only
    async function cacheFirstStrategy(request) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        const response = await fetch(request);
        if (response && response.status === 200 && isCacheableRequest(request)) {
            try {
                const cache = await caches.open(cacheName);
                cache.put(request, response.clone());
            } catch (cacheError) {
                console.warn('Failed to cache response:', request.url, cacheError);
            }
        }
        return response;
    }

    // Fetch event: icons from the cache, they never change. Everything else
    // falls through to the browser untouched
    self.addEventListener('fetch', (event) => {
        const request = event.request;

        if (request.method === 'GET' && isCacheableRequest(request) && isIconAsset(request.url)) {
            event.respondWith(cacheFirstStrategy(request));
        }
    });

    // Message handler for update checks from the kit's pwa.js
    self.addEventListener('message', (event) => {
        if (event.data === 'CHECK_UPDATE') {
            console.log('Manual update check requested');
            self.skipWaiting();
        }
    });
}
