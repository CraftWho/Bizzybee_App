// Cloud is authoritative when this device has no pending changes. Writes are
// serialized and conditional; dirty state persists across navigation/offline.
//
// Oct 31 2026 (Craft): ONE ACTIVE DEVICE AT A TIME (replaces save merge).
// Each device has an id. The cloud remembers which device saved last (the
// active one) and refuses saves from any other device. Opening the app on a
// device makes it active: it loads the cloud copy first, then claims. The
// other device shows a banner ("Active on another device") and stops saving
// until you tap Continue here. Only one device ever writes, so there is
// nothing to merge: no merge backups, nothing coming back or vanishing.
const CloudSyncAuto = (() => {
    let timer, running = false, ready = false, conflict = false, revision = null, inactive = false;
    let accountId = null;
    let lastStatus = 'Connecting to cloud…', lastError = '';
    const enabled = () => {
        // Nov 1 2026 (Craft): paused while the Terminal is open (terminal-shell.js).
        try { if (sessionStorage.getItem('bizzybee_sync_paused') === '1') return false; } catch { /* storage off */ }
        return localStorage.getItem('bizzybee_auto_sync') !== 'false';
    };
    const dirty = () => localStorage.getItem(Vault.storageKey + ':dirty') === 'true';
    const revisionKey = () => Vault.storageKey + ':revision';
    // This browser/app install. Tabs on one device share it (same storage).
    function deviceId() {
        let id = localStorage.getItem('bizzybee_device_id');
        if (!id) {
            id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
            localStorage.setItem('bizzybee_device_id', id);
        }
        return id;
    }
    function status(message) {
        lastStatus = message;
        window.dispatchEvent(new CustomEvent('cloud-sync-status', { detail: message }));
        const el = document.getElementById('cloud-sync-status');
        if (el) el.textContent = message;
    }
    function failure(message) {
        status(message);
        if (message !== lastError && typeof Toast !== 'undefined') Toast.show(message, 'negative', { action: { label: 'Open Settings', href: '/src/features/settings/settings.html#cloud' } });
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
        const response = await fetch((window.BB_SITE || '') + '/.netlify/functions/' + path, {   // Nov 1 2026 (Craft): app copy -> site
            method: body ? 'POST' : 'GET', cache: 'no-store',
            headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000)
        });
        const result = await response.json();
        if (!sameAccount()) throw new Error('Account changed. Reload before syncing.');
        if (!response.ok || !result.ok) {
            const error = new Error(result.error || 'Cloud request failed.');
            error.status = response.status; error.code = result.code || null;
            throw error;
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
        if (inactive) { showBanner(); return; }
        status('Saved on this device — cloud upload pending.');
        clearTimeout(timer);
        timer = setTimeout(() => { if (enabled()) pushNow(); }, 1500);
    }
    // ---- Active device banner (Oct 31 2026) ----
    function showBanner() {
        if (!document.body || document.getElementById('bb-inactive')) return;
        const bar = document.createElement('div');
        bar.id = 'bb-inactive';
        bar.setAttribute('role', 'alert');
        bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 96px);z-index:5000;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:#1a0f02;border:1px solid #ffcc00;color:#fff;font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.6)';
        bar.innerHTML = '<span style="flex:1">📱 Active on another device. Changes here won\'t be saved.</span><button type="button" style="flex:none;padding:8px 12px;border-radius:10px;border:0;background:#ffcc00;color:#1a0f02;font:800 13px system-ui,sans-serif;cursor:pointer">Continue here</button>';
        bar.querySelector('button').addEventListener('click', async (event) => {
            event.target.disabled = true; event.target.textContent = 'Loading…';
            try { await continueHere(); } catch (error) { event.target.disabled = false; event.target.textContent = 'Continue here'; failure(error.message); }
        });
        document.body.appendChild(bar);
    }
    function goInactive() {
        inactive = true;
        clearTimeout(timer);
        status('Active on another device. This device is not saving to the cloud.');
        showBanner();
    }
    // Load the cloud copy here, then make this the active device.
    async function claim(result, { reload = true } = {}) {
        const changed = !!result.data && result.revision !== revision;
        // Nov 17 2026 (Craft): ALWAYS keep this device's copy before the cloud copy replaces it (it used to
        // happen only when "unsent changes" was flagged, and the copy shared 3 slots with everything else).
        // It is a protected copy, and a notice after the reload says what was replaced.
        if (changed) {
            try {
                const mine = Vault.backupMeta(JSON.parse(localStorage.getItem(Vault.storageKey) || 'null') || {});
                const theirs = Vault.backupMeta(JSON.parse(result.data));
                Vault.createLocalBackup('This device before the cloud copy replaced it', { protect: true });
                const id = (Vault.getLocalBackups()[0] || {}).id;
                if (mine && theirs && mine.xp !== theirs.xp) localStorage.setItem('bizzybee_cloud_switch_notice', JSON.stringify({ at: new Date().toISOString(), id, device: mine, cloud: theirs }));
            } catch { /* full or unreadable: the cloud copy still wins, as before */ }
        }
        if (changed) {
            const imported = Vault.importFullState(result.data, { fromCloud: true, backup: false });
            if (!imported.ok) throw new Error(imported.error);
        }
        const data = result.data || Vault.exportFullState();
        const saved = await request('save-state', { data, revision: result.revision ?? null, device: deviceId(), takeover: true });
        acknowledge(saved);
        localStorage.setItem(Vault.storageKey + ':dirty', 'false');
        inactive = false;
        const bar = document.getElementById('bb-inactive'); if (bar) bar.remove();
        if (changed && reload) window.location.reload();
        return changed;
    }
    async function continueHere() {
        if (running) throw new Error('Wait for the current sync to finish.');
        running = true;
        try { const result = await request('load-state'); await claim(result); }
        finally { running = false; }
        status('This device is active. Saving to the cloud.');
    }
    async function pushNow(tries = 0) {
        if (!ready || running || inactive || !sameAccount()) return false;
        running = true;
        const snapshot = Vault.exportFullState();
        try {
            status('Saving to encrypted cloud storage…');
            const result = await request('save-state', { data: snapshot, revision, device: deviceId() });
            acknowledge(result);
            lastError = '';
            // Never clear a newer edit's dirty flag while acknowledging an older request.
            if (snapshot === Vault.exportFullState() && JSON.stringify(JSON.parse(snapshot)) === localStorage.getItem(Vault.storageKey)) {
                localStorage.setItem(Vault.storageKey + ':dirty', 'false');
                status('Saved to encrypted cloud storage · ' + new Date(result.updatedAt).toLocaleString());
            } else schedule();
            return true;
        } catch (error) {
            running = false;
            if (error.code === 'other-device') { goInactive(); return false; }
            if (error.status === 409 && tries < 1) {
                // Another tab on THIS device saved first (tabs share the device
                // copy, so it's already here). Take the new revision and resend.
                try {
                    const current = await request('load-state');
                    if (current.device && current.device !== deviceId()) { goInactive(); return false; }
                    acknowledge(current);
                    return await pushNow(tries + 1);
                } catch (e) { failure(e.message + ' Your device copy is retained.'); return false; }
            }
            failure(error.message + ' Your device copy is retained.'); return false;
        }
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
            const result = await request('save-state', { data: snapshot, revision: current.revision, preservePrevious: true, device: deviceId(), takeover: true });
            acknowledge(result);
            conflict = false; inactive = false;
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
            const result = await request('save-state', { data: backup.data, revision: current.revision, preservePrevious: true, device: deviceId(), takeover: true });
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
            const result = await request('load-state');
            // Oct 31 2026 (Craft): opening the app here makes this the active
            // device. If the cloud moved on (another device, or an older app
            // without device ids), the cloud copy wins; this device's unsent
            // changes go to a device backup first.
            const mine = result.device === deviceId();
            if (result.data && !mine && result.revision !== revision) {
                if (await claim(result)) return;   // reloading with the cloud copy
            } else if (result.data && result.revision !== revision) {
                // This device is active; another tab of it saved. Same device
                // copy, so just take the new revision.
                acknowledge(result);
            } else acknowledge(result);
            ready = true;
            if ((dirty() || (result.data && !result.encrypted)) && enabled()) schedule();
            else status(result.encrypted ? 'Cloud save is encrypted and up to date.' : 'Ready to save to encrypted cloud storage.');
            window.dispatchEvent(new Event('cloud-sync-ready'));
        } catch (error) {
            failure(error.message + ' Working from this device; reconnect to retry.');
            accountId = null;
        }
    }
    // Nov 11 2026 (Craft): Steam Deck companion. Only runs once a Deck is linked (Vault.deckLinked),
    // so an account with no Deck makes no extra calls. Every 2 minutes while the app is on screen:
    // apply check-offs from the Deck, read its game data, and refresh the task list it shows.
    let deckHash = '';
    async function deckTick() {
        if (!ready || inactive || document.visibilityState !== 'visible' || !sameAccount() || !Vault.deckLinked || !Vault.deckLinked()) return;
        try {
            const r = await request('deck', { action: 'inbox' });
            if (r.events && r.events.length) { Vault.deckApply(r.events); await request('deck', { action: 'ack', eids: r.events.map(e => e.eid) }); }
            if (r.games && r.games.games) Vault.deckApplyGames(r.games.games);
            const snap = Vault.deckSnapshot(), h = JSON.stringify(snap);
            if (h !== deckHash) { await request('deck', { action: 'push-snapshot', snapshot: snap }); deckHash = h; }
        } catch { /* try again next time */ }
    }
    setInterval(deckTick, 120000);
    window.addEventListener('cloud-sync-ready', () => setTimeout(deckTick, 3000));
    // After the cloud copy replaced this device's save, say so and offer a way back (Nov 17 2026, Craft).
    window.addEventListener('cloud-sync-ready', () => setTimeout(() => {
        let n = null;
        try { n = JSON.parse(localStorage.getItem('bizzybee_cloud_switch_notice') || 'null'); localStorage.removeItem('bizzybee_cloud_switch_notice'); } catch { /* none */ }
        if (!n || typeof Toast === 'undefined') return;
        const lv = m => `Level ${m.level} · ${m.xp.toLocaleString()} XP`;
        const useDevice = async () => {
            const entry = Vault.getLocalBackups().find(b => b.id === n.id);
            if (!entry) { Toast.show('That device copy is no longer in Backups.', 'negative'); return; }
            try {
                const r = Vault.importFullState(entry.data);
                if (!r.ok) throw new Error(r.error);
                await useDeviceCopy();
                Toast.show('Your device copy is now the cloud copy. The old cloud copy is in Backups.', 'positive');
                setTimeout(() => window.location.reload(), 1200);
            } catch (e) { Toast.show(e.message || 'Could not switch back.', 'negative'); }
        };
        Toast.show(`Cloud loaded: ${lv(n.cloud)}. This device had ${lv(n.device)} and it is saved in Backups.`, n.device.xp > n.cloud.xp ? 'negative' : 'neutral', { ms: 20000, action: { label: 'Use device copy', onClick: useDevice } });
    }, 1500));
    window.addEventListener('vault-saved', schedule);
    window.addEventListener('online', () => ready ? schedule() : start(netlifyIdentity.currentUser()));
    // Recover pending uploads after page navigation and transient connection errors.
    setInterval(() => {
        if (!ready) start(netlifyIdentity.currentUser());
        else if (enabled() && dirty() && !inactive) pushNow();
    }, 30000);
    // Coming back to the app (Oct 27 2026): a phone keeps the app "open" in
    // the background, so newer cloud changes from another device never
    // showed up. Now: send this device's changes first, then load a newer
    // cloud copy if there is one (only when this device has nothing unsent).
    async function refreshFromCloud() {
        if (!ready || running || inactive || !sameAccount()) return 'skip';
        if (dirty()) { await pushNow(); return inactive ? 'inactive' : 'pushed'; }
        running = true;
        try {
            const result = await request('load-state');
            // Oct 31 2026 (Craft): another device took over: stop saving here.
            if (result.device && result.device !== deviceId()) { running = false; goInactive(); return 'inactive'; }
            if (!result.data || result.revision === revision) return 'same';
            if (dirty()) return 'skip';
            const imported = Vault.importFullState(result.data, { fromCloud: true, backup: false });
            if (!imported.ok) throw new Error(imported.error);
            acknowledge(result);
            return 'updated';
        } finally { running = false; }
    }
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', async () => {
        // Nov 10 2026 (Craft): leaving the app sends unsent changes right away (a phone can freeze the app before the timer fires).
        if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); if (enabled() && dirty() && ready && !inactive) pushNow(); return; }
        if (enabled() && dirty()) { pushNow(); return; }
        if (!enabled() || Date.now() - hiddenAt < 20000) return;
        if (document.querySelector('.lvr, .gfx.on, dialog[open], .pj-sheet-bg:not([hidden]), .dc-sheet-bg:not([hidden])')) return;
        try { if (await refreshFromCloud() === 'updated') window.location.reload(); } catch {}
    });
    // ---- Keep the cloud login (Nov 17 2026, Craft) ----
    // The login library (gotrue-js) deletes the saved login whenever refreshing it fails, even
    // for a short network drop after the phone wakes. That is why Cloud "logged out" by itself.
    // Fix: keep a copy of the saved login; if a refresh fails for a network/server reason, put it
    // back; if the phone is offline, don't try the refresh at all. A real rejection (400/401) is
    // left alone, so a truly expired login still asks you to sign in again.
    const GT = 'gotrue.user', GT_BK = 'bizzybee_gotrue_backup', GT_EVT = 'bizzybee_cloud_event';
    const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };
    const cloudEvent = msg => lsSet(GT_EVT, JSON.stringify({ at: new Date().toISOString(), msg }));
    const backupLogin = () => { const v = lsGet(GT); if (v) lsSet(GT_BK, v); };
    const restoreLogin = () => { const b = lsGet(GT_BK); if (b && !lsGet(GT)) { lsSet(GT, b); return true; } return false; };
    const transientAuthError = e => !e || typeof e.status !== 'number' || e.status >= 500;
    function guardLogin(user) {
        const proto = user && Object.getPrototypeOf(user);
        if (!proto || proto.bbGuarded || typeof proto.jwt !== 'function') return;
        const orig = proto.jwt;
        proto.bbGuarded = true;
        proto.jwt = function (force) {
            let d = null;
            try { d = this.tokenDetails(); } catch { /* none */ }
            const needsRefresh = force || !d || d.expires_at - 60000 < Date.now();
            if (needsRefresh && navigator.onLine === false) { cloudEvent('Offline, so the cloud login was kept for later.'); return Promise.reject(new Error('You are offline. Cloud will reconnect when you are back online.')); }
            backupLogin();
            return orig.call(this, force).then(token => { backupLogin(); return token; }, err => {
                if (transientAuthError(err)) { if (restoreLogin()) cloudEvent('Network problem while renewing the cloud login. Login kept.'); else cloudEvent('Network problem while renewing the cloud login.'); }
                else cloudEvent('Cloud login was rejected (' + err.status + '). Sign in again.');
                throw err;
            });
        };
    }
    // A login that was already lost (but backed up): bring it back before anything reads it.
    if (!netlifyIdentity.currentUser() && lsGet('bizzybee_session') === 'identity' && restoreLogin()) {
        if (netlifyIdentity.currentUser()) cloudEvent('Cloud login restored after it dropped.');
        else { try { localStorage.removeItem(GT); } catch { /* fine */ } }
    }
    guardLogin(netlifyIdentity.currentUser());
    setInterval(backupLogin, 60000);
    netlifyIdentity.on('init', user => { guardLogin(user); start(user); });
    netlifyIdentity.on('login', user => { guardLogin(user); backupLogin(); start(user); });
    netlifyIdentity.on('logout', () => { try { localStorage.removeItem(GT_BK); } catch { /* fine */ } ready = false; accountId = null; clearTimeout(timer); });
    netlifyIdentity.init();
    if (netlifyIdentity.currentUser()) { guardLogin(netlifyIdentity.currentUser()); start(netlifyIdentity.currentUser()); }
    return { request, isEnabled: enabled, isReady: () => ready, hasConflict: () => conflict, isInactive: () => inactive, continueHere, deviceId, getStatus: () => lastStatus, pushNow, pullLatest, useDeviceCopy, restoreBackup, peekCloud, request, schedule, refreshFromCloud };
})();
