// Bizzybee service worker (Oct 2026): downloaded packs (src/core/services/packs/packs.js). It never caches the app
// itself, so it can't serve a stale app. Pack files: network first, stored
// copy when offline. The big 3D model: stored copy first (saves data).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const PACK_PATHS = /^\/src\/(plugins\/(calendar|dictionary|study|terminal|projects)\/|assets\/3d\/)/;
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const isPack = (url.origin === self.location.origin && PACK_PATHS.test(url.pathname)) || url.href.includes('@google/model-viewer@');
    if (!isPack) return;
    event.respondWith((async () => {
        const stored = await caches.match(req, { ignoreSearch: true });
        if (stored && /\.glb$/.test(url.pathname)) return stored;
        try { return await fetch(req); } catch (error) { if (stored) return stored; throw error; }
    })());
});

// Oct 31 2026 (Craft): web push removed (Android app only). The push and
// notificationclick handlers are in git tag web-reminders-archive.
