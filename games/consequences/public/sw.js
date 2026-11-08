// Consequences - Service Worker: the icons it caches and the name of their
// cache. What a worker of the games does with them - icons from the cache,
// everything else from the network - is the kit's (/kit/js/service-worker.js).
// Any change to this file, even a comment, is a new worker: every open page
// shows the "Update available" banner.
/* global cacheIconsOnly */

// Bump the version when the icons change: the new ones replace the cached
const CACHE_NAME = 'consequences-game-v2';

// The only assets worth caching: they are immutable and identified by name.
// Do NOT add HTML, CSS or JS here - those must always come from the network.
// The icons the pages and the manifest name (npm run icons takes them)
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

importScripts('/kit/js/service-worker.js');
cacheIconsOnly(CACHE_NAME, iconAssets);
