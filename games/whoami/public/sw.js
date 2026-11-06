// Who am I? Game - Service Worker
//
// This game only works online (a room lives on the server), so offline
// support is pointless. The service worker exists for two reasons:
//   1. Installability - a PWA needs a registered service worker to be
//      added to the home screen.
//   2. Icons never change, so serving them from cache is a free win.
//
// Everything else - HTML, CSS, JS - goes to the network first. A cached
// copy is only used when the network fails, so players never get stuck on
// a stale version of the app.

const CACHE_NAME = 'whoami-game-v1.6.0';

// The only assets worth caching: they are immutable and identified by name.
// Do NOT add HTML, CSS or JS here - those must always come from the network.
// The icons the pages and the manifest name (node scripts/icons.js takes them)
const iconAssets = [
    '/favicon.ico',
    '/icons/apple-touch-icon.png',
    '/icons/icon-48x48.png',
    '/icons/icon-72x72.png',
    '/icons/icon-96x96.png',
    '/icons/icon-144x144.png',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// Install event - pre-cache the icons
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(iconAssets))
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
                    .filter((cacheName) => cacheName !== CACHE_NAME)
                    .map((cacheName) => {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
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
    return parsed.origin === self.location.origin && iconAssets.includes(parsed.pathname);
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
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        } catch (cacheError) {
            console.warn('Failed to cache response:', request.url, cacheError);
        }
    }
    return response;
}

// Fetch event
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Icons: serve from cache, they never change
    if (request.method === 'GET' && isCacheableRequest(request) && isIconAsset(request.url)) {
        event.respondWith(cacheFirstStrategy(request));
        return;
    }

    // Everything else (HTML, CSS, JS, the Bootstrap CDN, Socket.IO, /api/)
    // is left to the browser: it goes to the network, and its normal HTTP
    // cache still applies. Nothing is stored by the service worker, so a
    // player can never be served a stale version of the app.
});

// Message handler for update checks from PWA manager
self.addEventListener('message', (event) => {
    if (event.data === 'CHECK_UPDATE') {
        console.log('Manual update check requested');
        self.skipWaiting();
    }
});
