// Packs (Oct 2026): plugins and quality packs work like game downloads.
// Switch on = the files are downloaded into this device's storage (Cache
// Storage, one cache per pack). Switch off = that cache is deleted. Saved
// progress lives in the save file, never in a pack, so deleting is safe.
// sw.js serves pack files from storage when the network can't.
const PACK_CACHE_PREFIX = 'bizzybee-pack-';
const MODEL_VIEWER_URL = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js';

// kb = download size on disk (rounded). files are paths from the app root.
const PACKS = [
    { id: 'calendar', kind: 'plugin', icon: '📅', label: 'Calendar', kb: 30,
      files: ['src/plugins/calendar/calendar.html', 'src/plugins/calendar/calendar.css', 'src/plugins/calendar/calendar.js'] },
    { id: 'dictionary', kind: 'plugin', icon: '📖', label: 'Dictionary', kb: 17,
      files: ['src/plugins/dictionary/dictionary.html', 'src/plugins/dictionary/dictionary.css', 'src/plugins/dictionary/dictionary.js'] },
    { id: 'study', kind: 'plugin', icon: '🎓', label: 'Study', kb: 12,
      files: ['src/plugins/study/study.html', 'src/plugins/study/study.css', 'src/plugins/study/study.js'] },
    { id: 'bee3d', kind: 'pack', icon: '🐝', label: '3D Bee Model', hd: true, kb: 3600,
      description: 'The full 3D bee on the Models page. Without it you see the flat art only.',
      files: ['src/assets/3d/bizzy-bee.glb', MODEL_VIEWER_URL] }
];

const Packs = {
    list(kind) { return PACKS.filter(p => !kind || p.kind === kind); },
    get(id) { return PACKS.find(p => p.id === id) || null; },
    supported() { return typeof caches !== 'undefined'; },
    flagKey(id) { return `bizzybee_pack_${id}`; },

    // Synchronous best guess (flag set when a download finishes).
    isDownloadedSync(id) {
        try { return localStorage.getItem(this.flagKey(id)) === '1'; } catch { return false; }
    },

    async isDownloaded(id) {
        if (!this.supported()) return this.isDownloadedSync(id);
        const has = await caches.has(PACK_CACHE_PREFIX + id);
        if (!has) { try { localStorage.removeItem(this.flagKey(id)); } catch {} }
        return has && this.isDownloadedSync(id);
    },

    url(path, root) {
        if (/^https?:/.test(path)) return path;
        const base = root || (typeof AppShell !== 'undefined' && AppShell.root) || (/\/src\/(features|plugins)\//.test(location.pathname) ? '../../..' : '.');
        return new URL(`${base}/${path}`, location.href).href;
    },

    // Registers the worker that serves pack files (same one push uses).
    async ensureWorker() {
        if (!('serviceWorker' in navigator)) return;
        try { await navigator.serviceWorker.register('/sw.js'); } catch { /* storage still works online */ }
    },

    // Downloads every file into this pack's cache. onProgress(0..1).
    async download(id, onProgress = () => {}) {
        const pack = this.get(id);
        if (!pack) throw new Error('Unknown pack.');
        if (!this.supported()) throw new Error('This browser cannot store downloads.');
        const cache = await caches.open(PACK_CACHE_PREFIX + id);
        let bytes = 0;
        try {
            for (let i = 0; i < pack.files.length; i++) {
                const url = this.url(pack.files[i]);
                const res = await fetch(url, { cache: 'no-store', mode: /^https?:/.test(pack.files[i]) && !url.startsWith(location.origin) ? 'cors' : 'same-origin' });
                if (!res.ok) throw new Error(`Could not download ${pack.files[i].split('/').pop()} (${res.status}).`);
                const blob = await res.blob();
                bytes += blob.size;
                await cache.put(url, new Response(blob, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' } }));
                onProgress((i + 1) / pack.files.length);
            }
        } catch (error) {
            await caches.delete(PACK_CACHE_PREFIX + id);
            throw error;
        }
        try { localStorage.setItem(this.flagKey(id), '1'); } catch {}
        this.ensureWorker();
        return { bytes };
    },

    async remove(id) {
        if (this.supported()) await caches.delete(PACK_CACHE_PREFIX + id);
        try { localStorage.removeItem(this.flagKey(id)); } catch {}
    },

    // Bytes actually stored for each downloaded pack.
    async storedBytes(id) {
        if (!this.supported() || !(await caches.has(PACK_CACHE_PREFIX + id))) return 0;
        const cache = await caches.open(PACK_CACHE_PREFIX + id);
        let n = 0;
        for (const req of await cache.keys()) { const r = await cache.match(req); if (r) n += (await r.blob()).size; }
        return n;
    }
};
