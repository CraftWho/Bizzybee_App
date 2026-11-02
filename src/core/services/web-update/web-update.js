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

    async function check({ force = false } = {}) {
        const P = plugin();
        if (!P || busy || !window.BB_SITE || window.BB_PERSONAL) return null;
        let last = 0;
        try { last = Number(localStorage.getItem(KEY)) || 0; } catch { /* fine */ }
        if (!force && Date.now() - last < CHECK_EVERY) return null;
        if (!navigator.onLine) return null;
        busy = true;
        try { localStorage.setItem(KEY, String(Date.now())); } catch { /* fine */ }
        try {
            const r = await P.update({ site: window.BB_SITE });
            if (r && r.updated && typeof Toast !== 'undefined') {
                Toast.show(`⬆️ BizzyBee updated (${r.downloaded} file${r.downloaded === 1 ? '' : 's'}). It loads next time you open the app.`, 'neutral',
                    { action: { label: 'Restart now', onClick: () => P.restart() } });
            }
            return r;
        } catch (e) { console.warn('App update check failed', e && e.message); return null; }
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
    return { start, check };
})();
WebUpdate.start();
