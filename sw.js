// Bizzybee service worker (Oct 2026) - only for phone reminders (web push).
// No caching / offline here on purpose, so it can never serve a stale app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
    event.waitUntil(self.registration.showNotification(data.title || '🐝 Bizzybee', {
        body: data.body || '',
        tag: data.tag || undefined,
        icon: '/src/assets/icons/icon-192x192.png',
        badge: '/src/assets/icons/icon-192x192.png',
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
