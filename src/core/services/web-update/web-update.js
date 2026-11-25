// App copy updates (Nov 1 2026, Craft). The Android app runs its own copy of the app files. After each
// deploy, the native BeeWeb plugin downloads only the files that changed into a new folder. If a new version
// fails to start twice, the app goes back to the last good one by itself (MainActivity.java).
//
// Nov 21 2026 (Craft; approved): UPDATES WAIT FOR YOU. A check only finds out that a new version exists
// (version.json on the site vs. the copy in use) and says so ("Update ready", with a link to Settings ›
// Updates). Nothing downloads until you tap Update there. Update makes a safety copy, saves your progress
// to the cloud, logs it, downloads and restarts. The first start on the new files is written to the change log.
const WebUpdate = (() => {
    const CHECK_EVERY = 30 * 60 * 1000;
    const KEY = 'bb_web_update_check';
    const READY = 'bb_web_update_ready';
    const APPLIED = 'bb_web_update_applied';
    const LAST = 'bb_web_update_last';
    const plugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BeeWeb) || null;
    const isApp = () => !!plugin() && !!window.BB_SITE && !window.BB_PERSONAL;
    const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage off */ } };
    const record = (o) => set(LAST, JSON.stringify({ at: Date.now(), ...o }));
    const last = () => { try { return JSON.parse(get(LAST) || 'null'); } catch { return null; } };
    const ready = () => { try { return JSON.parse(get(READY) || 'null'); } catch { return null; } };
    // Nov 23 2026 (Craft): the label is now "Version 1.1.0 · Nov 23" (version + the day it was published),
    // so two updates under the same version don't look the same on the Updates page.
    const labelOf = (v) => { if (!v) return ''; const day = v.builtAt ? new Date(v.builtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''; return v.batch ? [v.batch, day].filter(Boolean).join(' · ') : (day ? 'Version of ' + day : v.version || ''); };
    const log = (msg) => { try { if (typeof syncLog === 'function') syncLog('update', msg); } catch { /* best effort */ } };
    let busy = false;

    async function current() {
        const P = plugin();
        let version = '';
        try { version = (await P.info()).version || ''; } catch { /* unknown */ }
        let local = null;
        try { local = await (await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })).json(); } catch { /* built-in copy may lack it */ }
        return { version, label: labelOf(local) || (version ? version.slice(0, 10) : 'built-in') };
    }
    // Finds out if a newer version exists. Never downloads.
    async function check({ force = false } = {}) {
        const P = plugin();
        if (!P || busy || !isApp()) { if (window.BB_PERSONAL) record({ state: 'skipped', note: 'This is the BizzyBee Dev copy. It does not take site updates.' }); return null; }
        if (!force && Date.now() - (Number(get(KEY)) || 0) < CHECK_EVERY) return null;
        if (!navigator.onLine) { record({ state: 'skipped', note: 'Offline.' }); return { offline: true }; }
        set(KEY, String(Date.now()));
        try {
            const remote = await (await fetch(window.BB_SITE + '/version.json?t=' + Date.now(), { cache: 'no-store' })).json();
            const mine = (await P.info()).version || '';
            if (!remote || !remote.version || remote.version === mine) { set(READY, null); record({ state: 'current', version: mine, note: 'Already on the newest files.' }); return { current: true }; }
            const was = ready();
            const info = { version: remote.version, batch: remote.batch || null, builtAt: remote.builtAt || null, notes: Array.isArray(remote.notes) ? remote.notes.slice(0, 12) : [], label: labelOf(remote) };
            set(READY, JSON.stringify(info));
            record({ state: 'ready', version: remote.version, note: 'An update is ready. Open Settings › Updates.' });
            if ((!was || was.version !== info.version) && typeof Toast !== 'undefined' && !/app-updates/.test(location.pathname)) {
                Toast.show(`⬆️ Update ready: ${info.label}.`, 'neutral', { ms: 12000, action: { label: 'See it', onClick: () => { const i = location.pathname.indexOf('/src/'); location.href = (i >= 0 ? location.pathname.slice(0, i) : '') + '/src/features/app-updates/app-updates.html'; } } });
            }
            return { ready: info };
        } catch (e) { record({ state: 'failed', note: (e && e.message) || 'Check failed' }); return null; }
    }
    // Tap "Update now": safety copy, cloud save, log, download, restart.
    async function apply() {
        const P = plugin();
        const info = ready();
        if (!P || !info) return { ok: false, error: 'No update is ready.' };
        busy = true;
        try {
            const from = await current();
            try { if (typeof Vault !== 'undefined') { Vault.createLocalBackup(`Before app update (${info.label})`); await Vault.journalFlush(); } } catch { /* still update */ }
            try { if (typeof CloudSyncAuto !== 'undefined' && CloudSyncAuto.pushNow) await CloudSyncAuto.pushNow(); } catch { /* still update */ }
            const r = await P.update({ site: window.BB_SITE });
            set(APPLIED, JSON.stringify({ from: from.label, to: info.label, version: r && r.version || info.version, at: Date.now() }));
            set(READY, null);
            log(`Updating from ${from.label} to ${info.label}`);
            record({ state: 'updated', version: r && r.version, note: `Downloaded ${r && r.downloaded || 0} files.` });
            setTimeout(() => P.restart(), 400);
            return { ok: true };
        } catch (e) { record({ state: 'failed', note: (e && e.message) || 'Update failed' }); return { ok: false, error: (e && e.message) || 'Update failed' }; }
        finally { busy = false; }
    }
    // First start on new files: confirm the version is good and write it to the change log.
    async function afterUpdate() {
        let applied = null;
        try { applied = JSON.parse(get(APPLIED) || 'null'); } catch { /* none */ }
        if (!applied) return;
        set(APPLIED, null);
        const note = `App updated to ${applied.to}`;
        log(note);
        try { if (typeof Vault !== 'undefined') { await Vault.init(); setTimeout(() => Vault.journalFlush({ src: 'update', note, force: true }).catch(() => {}), 3000); } } catch { /* logged above */ }
        if (typeof Toast !== 'undefined') Toast.show(`⬆️ ${note}. Your save came with it.`, 'positive');
    }

    function start() {
        const P = plugin();
        if (!P || !window.BB_APP_COPY || window.BB_PERSONAL) return;   // Nov 2 2026 (Craft): BizzyBee Dev runs its own branch, never the live site's files
        P.confirm().catch(() => {});   // this version started fine: keep it
        afterUpdate();
        setTimeout(() => check(), 4000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }
    return { start, check, apply, ready, current, last, isApp };
})();
WebUpdate.start();
