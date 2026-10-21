// Bizzybee service worker (Oct 2026): phone reminders (web push) and
// downloaded packs (src/core/services/packs/packs.js). It never caches the app
// itself, so it can't serve a stale app. Pack files: network first, stored
// copy when offline. The big 3D model: stored copy first (saves data).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const PACK_PATHS = /^\/src\/(plugins\/(calendar|dictionary|study|terminal)\/|assets\/3d\/)/;
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

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
    event.waitUntil(self.registration.showNotification(data.title || '🐝 Bizzybee', {
        body: data.body || '',
        tag: data.tag || undefined,
        icon: '/src/assets/icons/icon-192x192.png',
        badge: '/src/assets/icons/badge-96x96.png',
        data: { url: data.url || '/src/features/home/home.html' }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || '/src/features/home/home.html', self.location.origin).href;
    event.waitUntil((async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of all) {
            if (client.url.startsWith(self.location.origin)) {
                await client.focus();
                if ('navigate' in client) { try { await client.navigate(url); } catch {} }
                return;
            }
        }
        await self.clients.openWindow(url);
    })());
});
