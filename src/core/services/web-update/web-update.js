// App copy updates (Nov 1 2026, Craft). The Android app runs its own copy of
// the app (no waiting on the site to open a page). After each deploy, this
// asks the native BeeWeb plugin to download only the files that changed into
// a new folder. The new version opens the next time you start BizzyBee, or
// right away with "Restart". If a new version fails to start twice, the app
// goes back to the last good one by itself (MainActivity.java).
const WebUpdate = (() => {
    const CHECK_EVERY = 30 * 60 * 1000;
    const KEY = 'bb_web_update_check';
    const plugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BeeWeb) || null;
    let busy = false;
    // Nov 17 2026 (Craft): remember what the last check did, so Settings › About can show it
    // (before, a failed update was silent).
    const LAST = 'bb_web_update_last';
    const record = (o) => { try { localStorage.setItem(LAST, JSON.stringify({ at: Date.now(), ...o })); } catch { /* storage off */ } };
    const last = () => { try { return JSON.parse(localStorage.getItem(LAST) || 'null'); } catch { return null; } };

    async function check({ force = false } = {}) {
        const P = plugin();
        if (!P || busy || !window.BB_SITE || window.BB_PERSONAL) { if (window.BB_PERSONAL) record({ state: 'skipped', note: 'This is the BizzyBee Dev copy. It does not take site updates.' }); return null; }
        let last = 0;
        try { last = Number(localStorage.getItem(KEY)) || 0; } catch { /* fine */ }
        if (!force && Date.now() - last < CHECK_EVERY) return null;
        if (!navigator.onLine) { record({ state: 'skipped', note: 'Offline.' }); return null; }
        busy = true;
        try { localStorage.setItem(KEY, String(Date.now())); } catch { /* fine */ }
        try {
            const r = await P.update({ site: window.BB_SITE });
            // Nov 20 2026 (Craft): a checkpoint before new app files load, so an update can never cost progress.
            if (r && r.updated && typeof Vault !== 'undefined') { try { Vault.createLocalBackup(`Before app update${r.version ? ' ' + r.version : ''}`); } catch { /* still update */ } }
            if (r && r.updated && typeof syncLog === 'function') syncLog('update', `App files updated (${r.downloaded} file${r.downloaded === 1 ? '' : 's'})`);
            record(r && r.updated ? { state: 'updated', version: r.version, note: `Downloaded ${r.downloaded} file${r.downloaded === 1 ? '' : 's'}. Opens next time you start the app.` } : { state: 'current', version: r && r.version, note: 'Already on the newest files.' });
            if (r && r.updated && typeof Toast !== 'undefined') {
                Toast.show(`⬆️ BizzyBee updated (${r.downloaded} file${r.downloaded === 1 ? '' : 's'}). It loads next time you open the app.`, 'neutral',
                    { action: { label: 'Restart now', onClick: () => P.restart() } });
            }
            return r;
        } catch (e) { console.warn('App update check failed', e && e.message); record({ state: 'failed', note: (e && e.message) || 'Update failed' }); return null; }
        finally { busy = false; }
    }

    function start() {
        const P = plugin();
        if (!P || !window.BB_APP_COPY || window.BB_PERSONAL) return;   // Nov 2 2026 (Craft): BizzyBee Dev runs its own branch, never the live site's files
        // This version started fine: keep it.
        P.confirm().catch(() => {});
        setTimeout(() => check(), 4000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }
    return { start, check, last };
})();
WebUpdate.start();
