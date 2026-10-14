// FolderBackup - a copy of your progress that lives outside browser storage,
// so clearing site data / cache can't take it with everything else.
//
// Two tiers, because not every browser can do the good one:
// 1. "Choose Folder" (File System Access API - Chrome/Edge/desktop-class
//    browsers only, NOT Safari/iOS) - picks a real folder once, remembers
//    the handle in IndexedDB (separate from localStorage, and survives a
//    localStorage-only clear), and silently rewrites one file there
//    whenever the Vault saves, throttled so it isn't constant disk churn.
// 2. "Download a Copy Now" - a plain file download. Works everywhere,
//    including iPhone Safari, but has to be a manual click (browsers won't
//    let a page silently spam downloads with no interaction).
//
// This file is loaded on every page (statically on settings.html, injected
// by app.js's initFolderBackupAuto() everywhere else) so the throttled
// auto-write below can run in the background no matter which page the
// user happens to be on.
const FolderBackup = (() => {
    const DB_NAME = 'bizzybee-folder-backup';
    const STORE = 'handles';
    const KEY = 'folder';
    const AUTO_THROTTLE_MS = 2 * 60 * 60 * 1000; // one silent write per 2h of activity, not per save
    const KEEP = 3;                               // save files kept in the folder (Oct 2026)
    const SAVE_RE = /^bizzybee-save-.*\.json$/;
    const AUTO_LAST_KEY = 'bizzybee_folder_backup_auto_last';

    const supported = () => typeof window.showDirectoryPicker === 'function' && 'indexedDB' in window;

    function timestampSlug(d = new Date()) {
        return d.toISOString().replace(/[:.]/g, '-');
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function getHandle() {
        try {
            const db = await openDb();
            return await new Promise((resolve, reject) => {
                const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch { return null; }
    }
    async function setHandle(handle) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(handle, KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
    async function clearHandle() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // Opens the picker, asks for write permission, and remembers the choice.
    // Must be called from a real click - the picker and the permission
    // prompt both require one.
    async function chooseFolder() {
        if (!supported()) throw new Error("This browser can't pick a folder for auto-backups. Use \"Download a Copy Now\" instead.");
        const handle = await window.showDirectoryPicker({ id: 'bizzybee-backup', mode: 'readwrite' });
        const permission = await handle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') throw new Error('Permission was not granted, so nothing was saved there.');
        await setHandle(handle);
        return handle.name;
    }

    async function disconnect() {
        await clearHandle();
    }

    // { supported } | { supported, connected: false } | { supported, connected: true, name, permission }
    async function status() {
        if (!supported()) return { supported: false };
        const handle = await getHandle();
        if (!handle) return { supported: true, connected: false };
        let permission;
        try { permission = await handle.queryPermission({ mode: 'readwrite' }); }
        catch { return { supported: true, connected: false }; }
        return { supported: true, connected: true, name: handle.name, permission };
    }

    // Oct 2026: auto saves are dated files - bizzybee-save-<name>-<date>.json -
    // and only the newest KEEP (3) are kept, so the folder always holds your
    // last 3 save states. Anything else gets its own timestamped file.
    const local = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
    const who = () => String((Vault.state && (Vault.state.displayName || (Vault.state.onboarding || {}).name)) || 'save').replace(/[^\w-]+/g, '').slice(0, 20) || 'save';
    async function prune(handle) {
        const names = [];
        for await (const [name, entry] of handle.entries()) if (entry.kind === 'file' && SAVE_RE.test(name)) names.push(name);
        // newest first by the date at the end of the name
        names.sort((a, b) => b.slice(-21).localeCompare(a.slice(-21)));
        for (const name of names.slice(KEEP)) { try { await handle.removeEntry(name); } catch { /* leave it */ } }
    }
    async function writeFile(name, text) {
        const handle = await getHandle();
        if (!handle) return { ok: false, error: 'no-folder' };
        let permission;
        try { permission = await handle.queryPermission({ mode: 'readwrite' }); } catch { return { ok: false, error: 'unavailable' }; }
        if (permission !== 'granted') return { ok: false, error: 'permission-needed' };
        try {
            const fileHandle = await handle.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(text);
            await writable.close();
            return { ok: true, filename: name, folder: handle.name };
        } catch (error) { return { ok: false, error: error.message }; }
    }

    async function writeSnapshot(reason = 'manual') {
        if (typeof Vault === 'undefined' || !Vault.state) return { ok: false, error: 'vault-unavailable' };
        const handle = await getHandle();
        if (!handle) return { ok: false, error: 'no-folder' };
        let permission;
        try { permission = await handle.queryPermission({ mode: 'readwrite' }); }
        catch { return { ok: false, error: 'unavailable' }; }
        if (permission !== 'granted') return { ok: false, error: 'permission-needed' };
        const filename = reason === 'auto' ? `bizzybee-save-${who()}-${local()}.json` : `bizzybee-backup-${reason}-${timestampSlug()}.json`;
        try {
            const fileHandle = await handle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(Vault.exportFullState());
            await writable.close();
            if (reason === 'auto') await prune(handle);
            return { ok: true, filename };
        } catch (error) { return { ok: false, error: error.message }; }
    }

    // Universal fallback: an actual file download, works in every browser.
    function downloadNow() {
        if (typeof Vault === 'undefined' || !Vault.state) throw new Error('Nothing to back up yet.');
        const blob = new Blob([Vault.exportFullState()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bizzybee-backup-${timestampSlug()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    // Background safety net: whenever the Vault actually saves, try a
    // throttled silent write to the chosen folder. Does nothing if no
    // folder is chosen, permission lapsed, or the browser can't do it -
    // failures here are silent by design, since this runs on every page
    // and there's no UI to report to outside Settings.
    let lastAttempt = 0;
    async function maybeAutoWrite() {
        const last = Number(localStorage.getItem(AUTO_LAST_KEY) || 0);
        if (Date.now() - last < AUTO_THROTTLE_MS) return;
        if (Date.now() - lastAttempt < 60000) return; // debounce bursts of saves
        lastAttempt = Date.now();
        const result = await writeSnapshot('auto');
        if (result.ok) localStorage.setItem(AUTO_LAST_KEY, String(Date.now()));
    }
    window.addEventListener('vault-saved', maybeAutoWrite);
    // Also covers a tab left open a long time with no new edits.
    setTimeout(maybeAutoWrite, 8000);

    // Save one now (e.g. right after choosing the folder) - same rules as auto.
    async function saveNow() {
        const result = await writeSnapshot('auto');
        if (result.ok) localStorage.setItem(AUTO_LAST_KEY, String(Date.now()));
        return result;
    }

    return { supported, chooseFolder, disconnect, status, writeSnapshot, downloadNow, saveNow, writeFile };
})();
