// Bizzybee service worker.
//
// 1. Downloaded packs (src/core/services/packs/packs.js): network first, stored
//    copy when offline. The big 3D model: stored copy first (saves data).
//
// 2. Oct 31 2026 (Craft): APP CACHE, one copy per deploy. Every page and file
//    of the app is kept on the device after its first load, so switching tabs
//    reads from the phone instead of the internet, and the app opens offline.
//    Each deploy writes /version.json (tools/stamp-version.mjs). This worker
//    checks it in the background (at most every 30 s, on page loads). When the
//    version changes, the NEXT page load switches to a fresh copy and the old
//    one is deleted, so a page never mixes old and new files.
//    Never runs on this computer (PC LOCAL): local testing always loads fresh.
//    Never touches /.netlify/ (cloud, sign-in), version.json or other sites.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const PACK_PATHS = /^\/src\/(plugins\/(calendar|dictionary|study|terminal|projects)\/|assets\/3d\/)/;
const host = self.location.hostname;
const LOCAL = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')
    || /^(10|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
const APP_PREFIX = 'bizzy-app-';
const META = 'bizzy-app-meta';
const CHECK_EVERY_MS = 30000;

let current = null;      // version being served
let pending = null;      // newer version found, used from the next page load
let lastCheck = 0;

async function readCurrent() {
    if (current) return current;
    try { const r = await (await caches.open(META)).match('/__version'); current = r ? await r.text() : null; } catch { current = null; }
    return current;
}
async function dropOld() {
    if (!current) return;
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(APP_PREFIX) && n !== META && n !== APP_PREFIX + current).map(n => caches.delete(n)));
}
async function setCurrent(v) {
    current = v;
    try { await (await caches.open(META)).put('/__version', new Response(v)); } catch { /* memory only */ }
    await dropOld();
}
async function checkVersion() {
    if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
    lastCheck = Date.now();
    try {
        const r = await fetch('/version.json', { cache: 'no-store' });
        if (!r.ok) return;
        const v = String((await r.json()).version || '');
        if (!v) return;
        const have = await readCurrent();
        if (!have) await setCurrent(v);
        else if (v !== have) pending = v;
        else await dropOld();   // tidy a copy a late request re-created
    } catch { /* offline: keep the copy we have */ }
}
function isAppFile(url, req) {
    if (url.origin !== self.location.origin) return false;
    if (url.pathname.startsWith('/.netlify/') || url.pathname === '/version.json' || url.pathname === '/sw.js') return false;
    return req.mode === 'navigate' || /\.(html|js|css|json|webp|png|jpe?g|svg|gif|ico|woff2?|mp3|wav|webmanifest)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // 1. Packs
    const isPack = (url.origin === self.location.origin && PACK_PATHS.test(url.pathname)) || url.href.includes('@google/model-viewer@');
    if (isPack) {
        event.respondWith((async () => {
            const stored = await caches.match(req, { ignoreSearch: true });
            if (stored && /\.glb$/.test(url.pathname)) return stored;
            try { return await fetch(req); } catch (error) { if (stored) return stored; throw error; }
        })());
        return;
    }

    // 2. App cache
    if (LOCAL || !isAppFile(url, req)) return;
    const navigate = req.mode === 'navigate';
    event.respondWith((async () => {
        if (navigate && pending) { const v = pending; pending = null; await setCurrent(v); }
        const v = await readCurrent();
        if (navigate || !v) event.waitUntil(checkVersion());
        if (!v) return fetch(req);
        if (v !== current) return fetch(req);   // switched while waiting: don't refill the old copy
        const cache = await caches.open(APP_PREFIX + v);
        // Pages: one copy per page, whatever ?query it was opened with.
        const key = navigate ? new Request(url.origin + url.pathname) : req;
        const hit = await cache.match(key);
        if (hit) return hit;
        try {
            const code = navigate || /\.(html|js|css|json)$/i.test(url.pathname);
            // A page request can't take options, so pages are fetched by address.
            const res = navigate ? await fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' })
                : await fetch(req, code ? { cache: 'no-cache' } : undefined);
            if (res.redirected) return navigate ? Response.redirect(res.url, 302) : res;   // Netlify redirects: never cached
            if (res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
            return res;
        } catch (error) {
            const any = await caches.match(key, { ignoreSearch: true });
            if (any) return any;
            throw error;
        }
    })());
});

// Web push was removed Oct 31 2026 (Android app only). The push and
// notificationclick handlers are in git tag web-reminders-archive.
