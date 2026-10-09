// Cloud is authoritative when this device has no pending changes. Writes are
// serialized and conditional; dirty state persists across navigation/offline.
const CloudSyncAuto = (() => {
    let timer, running = false, ready = false, conflict = false, revision = null;
    let accountId = null;
    let lastStatus = 'Connecting to cloud…', lastError = '';
    const enabled = () => localStorage.getItem('bizzybee_auto_sync') !== 'false';
    const dirty = () => localStorage.getItem(Vault.storageKey + ':dirty') === 'true';
    const revisionKey = () => Vault.storageKey + ':revision';
    function status(message) {
        lastStatus = message;
        window.dispatchEvent(new CustomEvent('cloud-sync-status', { detail: message }));
        const el = document.getElementById('cloud-sync-status');
        if (el) el.textContent = message;
    }
    function failure(message) {
        status(message);
        if (message !== lastError && typeof Toast !== 'undefined') Toast.show(message + ' Open Settings for recovery options.', 'negative');
        lastError = message;
    }
    function sameAccount() {
        if (Vault.devTest) return false;   // dev test save never syncs (dev-tools.js)
        return netlifyIdentity.currentUser()?.id === accountId && localStorage.getItem('bizzybee_cloud_owner') === accountId && localStorage.getItem('bizzybee_session') === 'identity';
    }
    async function request(path, body) {
        if (!sameAccount()) throw new Error('Sign in to your cloud account to sync.');
        const user = netlifyIdentity.currentUser();
        const token = await user.jwt();
        if (!sameAccount()) throw new Error('Account changed. Reload before syncing.');
        const response = await fetch('/.netlify/functions/' + path, {
            method: body ? 'POST' : 'GET', cache: 'no-store',
            headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000)
        });
        const result = await response.json();
        if (!sameAccount()) throw new Error('Account changed. Reload before syncing.');
        if (!response.ok || !result.ok) {
            if (response.status === 409) conflict = true;
            throw new Error(result.error || 'Cloud request failed.');
        }
        return result;
    }
    function acknowledge(result) {
        revision = result.revision;
        localStorage.setItem(revisionKey(), JSON.stringify(revision));
        if (result.updatedAt) localStorage.setItem(Vault.storageKey + ':syncedAt', result.updatedAt);
    }
    function schedule() {
        if (!enabled()) return;
        status('Saved on this device — cloud upload pending.');
        clearTimeout(timer);
        timer = setTimeout(() => { if (enabled()) pushNow(); }, 1500);
    }
    async function pushNow() {
        if (!ready || running || !sameAccount()) return false;
        if (conflict) { status('Both copies have changes. Choose a copy in Cloud settings.'); return false; }
        running = true;
        const snapshot = Vault.exportFullState();
        try {
            status('Saving to encrypted cloud storage…');
            const result = await request('save-state', { data: snapshot, revision });
            acknowledge(result);
            lastError = '';
            // Never clear a newer edit's dirty flag while acknowledging an older request.
            if (snapshot === Vault.exportFullState() && JSON.stringify(JSON.parse(snapshot)) === localStorage.getItem(Vault.storageKey)) {
                localStorage.setItem(Vault.storageKey + ':dirty', 'false');
                status('Saved to encrypted cloud storage · ' + new Date(result.updatedAt).toLocaleString());
            } else schedule();
            return true;
        } catch (error) { failure(error.message + ' Your device copy is retained.'); return false; }
        finally { running = false; }
    }
    async function pullLatest() {
        if (running || !ready) throw new Error('Wait for the current sync to finish.');
        running = true;
        clearTimeout(timer);
        const before = Vault.exportFullState();
        try {
            const result = await request('load-state');
            if (!result.data) throw new Error('No cloud save exists yet.');
            if (before !== Vault.exportFullState()) throw new Error('Progress changed while loading. Try again when edits are finished.');
            const imported = Vault.importFullState(result.data, { fromCloud: true });
            if (!imported.ok) throw new Error(imported.error);
            acknowledge(result);
            conflict = false;
            window.location.reload();
        } finally { running = false; }
    }
    async function useDeviceCopy() {
        if (running || !ready) throw new Error('Wait for the current sync to finish.');
        running = true;
        clearTimeout(timer);
        try {
            const current = await request('load-state');
            const snapshot = Vault.exportFullState();
            const result = await request('save-state', { data: snapshot, revision: current.revision, preservePrevious: true });
            acknowledge(result);
            conflict = false;
            if (snapshot === Vault.exportFullState()) localStorage.setItem(Vault.storageKey + ':dirty', 'false');
            status('Device copy saved to cloud. The previous cloud copy is in Backups.');
        } finally { running = false; }
    }
    // Read-only: checks the cloud's current save timestamp/revision without
    // pulling, importing, or reloading. Safe to call anytime once ready.
    async function peekCloud() {
        if (!sameAccount()) throw new Error('Sign in to your cloud account to sync.');
        const result = await request('load-state');
        return { updatedAt: result.updatedAt || null, revision: result.revision ?? null, hasData: !!result.data, encrypted: !!result.encrypted };
    }
    async function restoreBackup(id) {
        if (running || !ready) throw new Error('Wait for the current sync to finish.');
        running = true;
        clearTimeout(timer);
        const before = Vault.exportFullState();
        try {
            const backup = await request('backups?id=' + encodeURIComponent(id));
            Vault.validateFullState(JSON.parse(backup.data));
            Vault.createLocalBackup('Before cloud backup restore');
            const current = await request('load-state');
            if (before !== Vault.exportFullState()) throw new Error('Progress changed while preparing the restore. Try again.');
            const result = await request('save-state', { data: backup.data, revision: current.revision, preservePrevious: true });
            if (before !== Vault.exportFullState()) {
                conflict = true;
                throw new Error('Backup restored in cloud. New device edits were preserved; choose a copy in Cloud settings.');
            }
            const imported = Vault.importFullState(backup.data, { fromCloud: true });
            if (!imported.ok) {
                conflict = true;
                throw new Error('Cloud backup restored, but this device could not load it: ' + imported.error);
            }
            acknowledge(result);
            conflict = false;
            window.location.reload();
        } finally { running = false; }
    }
    async function start(user) {
        if (!user || ready || accountId) return;
        accountId = user.id;
        // Bind old sessions too. Existing unscoped data stays available as a recovery copy.
        if (localStorage.getItem('bizzybee_cloud_owner') !== user.id || Vault.storageKey !== 'bizzybee_user_data:' + user.id) {
            localStorage.setItem('bizzybee_cloud_owner', user.id);
            localStorage.setItem('bizzybee_session', 'identity');
            window.location.reload();
            return;
        }
        try {
            try { await Vault.init(); }
            catch (error) {
                ready = true; conflict = true;
                failure(error.message + ' Use Load from Cloud or restore a backup in Settings.');
                window.dispatchEvent(new Event('cloud-sync-ready'));
                return;
            }
            revision = JSON.parse(localStorage.getItem(revisionKey()) || 'null');
            const before = Vault.exportFullState();
            const beforeStored = localStorage.getItem(Vault.storageKey);
            const result = await request('load-state');
            if (result.data && revision !== result.revision) {
                if (revision !== null && dirty()) conflict = true;
                else if (before !== Vault.exportFullState() || beforeStored !== localStorage.getItem(Vault.storageKey)) conflict = true;
                else {
                    const imported = Vault.importFullState(result.data, { fromCloud: true });
                    if (!imported.ok) throw new Error(imported.error);
                    acknowledge(result);
                    window.location.reload();
                    return;
                }
            } else acknowledge(result);
            ready = true;
            if (conflict) failure('Both copies have changes. Choose a copy in Cloud settings.');
            else if ((dirty() || (result.data && !result.encrypted)) && enabled()) schedule();
            else status(result.encrypted ? 'Cloud save is encrypted and up to date.' : 'Ready to save to encrypted cloud storage.');
            window.dispatchEvent(new Event('cloud-sync-ready'));
        } catch (error) {
            failure(error.message + ' Working from this device; reconnect to retry.');
            accountId = null;
        }
    }
    window.addEventListener('vault-saved', schedule);
    window.addEventListener('online', () => ready ? schedule() : start(netlifyIdentity.currentUser()));
    // Recover pending uploads after page navigation and transient connection errors.
    setInterval(() => {
        if (!ready) start(netlifyIdentity.currentUser());
        else if (enabled() && dirty() && !conflict) pushNow();
    }, 30000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && enabled() && dirty()) pushNow();
    });
    netlifyIdentity.on('init', start);
    netlifyIdentity.on('login', start);
    netlifyIdentity.on('logout', () => { ready = false; accountId = null; clearTimeout(timer); });
    netlifyIdentity.init();
    if (netlifyIdentity.currentUser()) start(netlifyIdentity.currentUser());
    return { isEnabled: enabled, isReady: () => ready, getStatus: () => lastStatus, pushNow, pullLatest, useDeviceCopy, restoreBackup, peekCloud, request, schedule };
})();
