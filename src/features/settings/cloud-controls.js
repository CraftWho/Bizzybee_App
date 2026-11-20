function cloudEngine() {
    if (typeof CloudSyncAuto === 'undefined') throw new Error('Cloud is connecting. Sign in and try again in a moment.');
    return CloudSyncAuto;
}
function cloudSyncSetStatus(message) {
    document.getElementById('cloud-sync-status').textContent = message;
}
async function settingsAction(button, action) {
    button.disabled = true;
    try { await action(); }
    catch (error) { Toast.show(error.message, 'negative'); }
    finally { button.disabled = false; }
}
function initCloudSync() {
    const toggle = document.getElementById('cloud-sync-auto-toggle');
    toggle.checked = localStorage.getItem('bizzybee_auto_sync') !== 'false';
    toggle.addEventListener('change', () => {
        localStorage.setItem('bizzybee_auto_sync', String(toggle.checked));
        if (toggle.checked && typeof CloudSyncAuto !== 'undefined') CloudSyncAuto.schedule();
    });
    const show = user => {
        if (localStorage.getItem('bizzybee_session') !== 'identity') user = null;
        // Nov 17 2026 (Craft): why the cloud login last dropped or was kept (see cloud-sync.js).
        try {
            const ev = JSON.parse(localStorage.getItem('bizzybee_cloud_event') || 'null'), el = document.getElementById('cloud-last-event');
            if (ev && el) { el.textContent = 'Last cloud login event: ' + ev.msg + ' (' + new Date(ev.at).toLocaleString() + ')'; el.hidden = false; }
        } catch { /* fine */ }
        document.getElementById('cloud-sync-signed-out').hidden = !!user;
        document.getElementById('cloud-sync-signed-in').hidden = !user;
        if (!user) return;
        document.getElementById('cloud-sync-email').textContent = user.email || '';
        document.getElementById('reset-account-email').value = user.email || '';
        bizzybeeApp.initCloudSyncAuto();
    };
    if (typeof netlifyIdentity !== 'undefined') {
        netlifyIdentity.on('init', show);
        netlifyIdentity.on('login', user => {
            localStorage.setItem('bizzybee_cloud_owner', user.id);
            localStorage.setItem('bizzybee_session', 'identity');
            window.location.reload();
        });
        netlifyIdentity.on('logout', () => {
            localStorage.removeItem('bizzybee_session');
            window.location.href = '../../../index.html';
        });
        netlifyIdentity.init();
        show(netlifyIdentity.currentUser());
    }
    document.getElementById('cloud-sync-login-btn').onclick = () => {
        if (typeof netlifyIdentity === 'undefined') { Toast.show('Could not load Netlify login. Check your connection and reload.', 'negative'); return; }
        const existing = netlifyIdentity.currentUser();
        if (existing) {
            localStorage.setItem('bizzybee_cloud_owner', existing.id);
            localStorage.setItem('bizzybee_session', 'identity');
            window.location.reload();
            return;
        }
        netlifyIdentity.open('login');
    };
    document.getElementById('cloud-sync-logout-btn').onclick = () => netlifyIdentity.logout();
    const wire = (id, action) => { const button = document.getElementById(id); button.onclick = () => settingsAction(button, action); };
    wire('cloud-sync-push-btn', async () => {
        const engine = cloudEngine();
        // Oct 2026: when both copies changed, Save to Cloud offers to keep this
        // device's copy instead of just failing. The cloud copy is backed up first.
        if (engine.hasConflict && engine.hasConflict()) {
            if (!confirm('The cloud copy changed too. Save this device’s copy to the cloud? The current cloud copy is kept in Backups first.')) return;
            await engine.useDeviceCopy();
            refreshSyncCompare();
            await refreshCloudBackups().catch(() => {});
            return;
        }
        if (!await engine.pushNow()) throw new Error('Cloud save is not complete. Check the sync status above.');
        refreshSyncCompare();
    });
    wire('cloud-sync-pull-btn', async () => {
        if (confirm('Use the latest cloud copy on this device? A local recovery copy will be kept first.')) await cloudEngine().pullLatest();
    });
    wire('cloud-sync-use-device-btn', async () => {
        if (confirm('Replace cloud progress with this device’s copy? The previous cloud copy will be backed up first.')) await cloudEngine().useDeviceCopy();
        refreshSyncCompare();
    });
    wire('backup-refresh-btn', refreshCloudBackups);
    wire('backup-now-btn', async () => {
        if (!await cloudEngine().pushNow()) throw new Error('Complete cloud sync before backing up current progress.');
        await cloudEngine().request('backups', { action: 'create' });
        await refreshCloudBackups();
    });
    window.addEventListener('cloud-sync-ready', () => {
        refreshCloudBackups().catch(error => { document.getElementById('backup-status').textContent = error.message; });
        refreshSyncCompare();
    });
    if (typeof CloudSyncAuto !== 'undefined') {
        cloudSyncSetStatus(CloudSyncAuto.getStatus());
        if (CloudSyncAuto.isReady()) {
            refreshCloudBackups().catch(error => { document.getElementById('backup-status').textContent = error.message; });
            refreshSyncCompare();
        }
    }
}
async function refreshCloudBackups() {
    const result = await cloudEngine().request('backups');
    // Oct 31 2026 (Craft): daily backups, keep 4, plus copies made before a restore.
    document.getElementById('backup-status').textContent = `Hourly while you upload (last ${result.keepHourly || 24}), daily at about 4 AM when something changed (last ${result.keepDaily || 7} days), and before a restore or Back Up Now (last ${result.keepOther || 10}).`;
    const list = document.getElementById('cloud-backup-list');
    list.replaceChildren();
    if (!result.backups.length) list.textContent = 'No cloud backups yet. Use Back Up Now to create your first.';
    for (const item of result.backups) {
        const button = document.createElement('button'); button.textContent = 'Restore';
        button.onclick = () => settingsAction(button, async () => {
            if (confirm('Restore this backup to your cloud account and this device? The current cloud and device copies will be preserved first.')) await cloudEngine().restoreBackup(item.id);
        });
        // Oct 2026: keep a copy of any cloud backup as a file (in your
        // save-files folder if one is chosen, otherwise Downloads).
        const save = document.createElement('button'); save.textContent = '⬇️ Save file';
        save.onclick = () => settingsAction(save, async () => {
            const backup = await cloudEngine().request('backups?id=' + encodeURIComponent(item.id));
            const text = typeof backup.data === 'string' ? backup.data : JSON.stringify(backup.data, null, 2);
            const d = new Date(item.createdAt), pad = n => String(n).padStart(2, '0');
            const name = `bizzybee-REAL-cloud-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}.json`;   // Oct 31 2026 (Craft): cloud = REAL
            const written = typeof FolderBackup !== 'undefined' ? await FolderBackup.writeFile(name, text) : { ok: false };
            if (written.ok) { Toast.show(`💾 Saved ${name} to ${written.folder}.`, 'positive'); return; }
            await downloadFile(text, name, 'application/json');
        });
        button.className = save.className = 'btn';
        list.append(svRow({ ...item, kind: item.kind === 'other' ? 'checkpoint' : item.kind }, item.kind === 'daily' ? 'Daily' : item.kind === 'hourly' ? 'Hourly' : 'Before change', [save, button]));
    }
}
function getLocalUpdateText() {
    const localUpdatedAt = (typeof Vault !== 'undefined' && Vault.getLastLocalUpdate) ? Vault.getLastLocalUpdate() : null;
    return { localUpdatedAt, localText: localUpdatedAt ? new Date(localUpdatedAt).toLocaleString() : 'No local changes yet' };
}
function updateLocalOnlyTimestamp() {
    const localOnlyEl = document.getElementById('local-only-updated');
    if (localOnlyEl) localOnlyEl.textContent = getLocalUpdateText().localText;
}
async function refreshSyncCompare() {
    const localEl = document.getElementById('sync-compare-local');
    const cloudEl = document.getElementById('sync-compare-cloud');
    const verdictEl = document.getElementById('sync-compare-verdict');
    updateLocalOnlyTimestamp();
    if (!localEl || !cloudEl || !verdictEl) return;
    const { localUpdatedAt, localText } = getLocalUpdateText();
    localEl.textContent = localText;
    verdictEl.textContent = 'Checking cloud…';
    let cloud;
    try { cloud = await cloudEngine().peekCloud(); }
    catch (error) { cloudEl.textContent = '—'; verdictEl.textContent = 'Could not check cloud: ' + error.message; return; }
    if (!cloud.hasData) {
        cloudEl.textContent = 'No cloud save yet';
        verdictEl.textContent = localUpdatedAt ? '📍 This device has progress not yet saved to the cloud. Use Save to Cloud.' : 'Nothing saved yet on either copy.';
        return;
    }
    cloudEl.textContent = cloud.updatedAt ? new Date(cloud.updatedAt).toLocaleString() : 'Unknown';
    if (!localUpdatedAt || !cloud.updatedAt) { verdictEl.textContent = 'Comparison unavailable — keep using the app so both sides have a timestamp.'; return; }
    const diff = new Date(localUpdatedAt).getTime() - new Date(cloud.updatedAt).getTime();
    if (Math.abs(diff) < 5000) verdictEl.textContent = '✅ In sync — both copies match.';
    else if (diff > 0) verdictEl.textContent = '📍 This device is newer. Use Save to Cloud to update the cloud copy.';
    else verdictEl.textContent = '☁️ The cloud copy is newer. Use Load from Cloud to update this device.';
}
function deviceRecoveryEntries() {
    const entries = Vault.getLocalBackups();
    const legacy = localStorage.getItem('bizzybee_user_data');
    if (legacy && Vault.storageKey !== 'bizzybee_user_data' && localStorage.getItem('bizzybee_legacy_owner') === localStorage.getItem('bizzybee_cloud_owner')) entries.push({ id: 'previous-device-save', reason: 'Device save from before cloud account separation', data: legacy });
    return entries;
}
// Nov 17 2026 (Craft): each copy says what is in it, so you can tell level 13 from level 11 before you restore.
function backupLabel(item) {
    const m = item.meta;
    const what = m ? ` · Level ${m.level} · ${Number(m.xp).toLocaleString()} XP` : '';
    return `${item.protect ? '🛡 ' : ''}${item.reason}${what}${item.createdAt ? ' · ' + new Date(item.createdAt).toLocaleString() : ''}`;
}
// Nov 20 2026 (Craft): every copy shows level, XP, coins, when and which device, the same way everywhere.
const SV_ICON = { exit: '🚪', hourly: '🕐', daily: '📅', checkpoint: '🛡', other: '🛡', 'before-replacement': '🛡' };
function svWhen(iso) { try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } }
function svRow(item, title, buttons) {
    const m = item.meta || {};
    const row = document.createElement('div'); row.className = 'sv-row';
    const info = document.createElement('div'); info.className = 'sv-info';
    const top = document.createElement('b'); top.textContent = `${SV_ICON[item.kind] || '💾'} ${title} · ${svWhen(item.createdAt)}`;
    const sub = document.createElement('small');
    sub.textContent = m.level != null ? `Lv ${m.level} · ${Number(m.xp || 0).toLocaleString()} XP · 🪙 ${Number(m.coins || 0).toLocaleString()}${m.device ? ' · ' + m.device : ''}` : 'Level not recorded (older copy)';
    info.append(top, sub);
    const acts = document.createElement('div'); acts.className = 'sv-acts';
    buttons.forEach(b => acts.append(b));
    row.append(info, acts);
    return row;
}
function svBtn(text, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = text; b.onclick = () => settingsAction(b, fn); return b; }
let svKind = '';
function renderSaveNow() {
    const el = document.getElementById('sv-now');
    if (!el || typeof Vault === 'undefined' || !Vault.state) return;
    const m = Vault.backupMeta(Vault.state) || {};
    const signedIn = localStorage.getItem('bizzybee_session') === 'identity' && !Vault.devTest;
    const dirty = localStorage.getItem(Vault.storageKey + ':dirty') === 'true';
    const synced = localStorage.getItem(Vault.storageKey + ':syncedAt');
    const engine = typeof CloudSyncAuto !== 'undefined' ? CloudSyncAuto : null;
    let cloud = 'Not signed in: saved on this device only.';
    if (signedIn) {
        if (engine && engine.isInactive && engine.isInactive()) cloud = '🔴 Not uploading: another device is saving.';
        else if (dirty) cloud = '🟠 Saved here, waiting to upload to the cloud.';
        else cloud = synced ? `✅ In the cloud · ${svWhen(synced)}` : '✅ In the cloud';
    }
    el.innerHTML = '';
    const big = document.createElement('div'); big.className = 'sv-big';
    big.innerHTML = `<span class="sv-lv">Lv ${m.level ?? '?'}</span><span>${Number(m.xp || 0).toLocaleString()} XP · 🪙 ${Number(m.coins || 0).toLocaleString()}</span>`;
    const line = (t) => { const s = document.createElement('small'); s.textContent = t; return s; };
    el.append(big, line(`${m.device || 'This device'} · last change ${svWhen(Vault.state.updatedAt) || '—'}`), line(cloud));
}
function renderSyncLog(all = false) {
    const host = document.getElementById('sync-log');
    if (!host) return;
    const list = typeof syncLogList === 'function' ? syncLogList() : [];
    host.replaceChildren();
    if (!list.length) { host.textContent = 'Nothing logged yet. Saves, uploads and switches show up here.'; return; }
    const ICON = { fail: '⚠️', upload: '☁️', load: '⬇️', inactive: '🔴', review: '❓', choice: '👆', 'save-point': '💾', restore: '↩️', login: '🔑', open: '📱' };
    for (const e of list.slice(0, all ? 200 : 20)) {
        const row = document.createElement('div'); row.className = 'sv-log';
        const t = document.createElement('small'); t.textContent = `${svWhen(e.at)}${e.lv != null ? ` · Lv ${e.lv} · ${Number(e.xp || 0).toLocaleString()} XP` : ''}${e.dev ? ' · ' + e.dev : ''}`;
        const b = document.createElement('span'); b.textContent = `${ICON[e.kind] || '•'} ${e.msg}`;
        row.append(b, t); host.append(row);
    }
}
function metaOfRaw(raw) { try { return Vault.backupMeta(JSON.parse(raw)); } catch { return null; } }
function deviceRestore(getData, label) {
    return async () => {
        const raw = await getData();
        if (!raw) throw new Error('That copy could not be read.');
        const m = metaOfRaw(raw);
        const now = Vault.backupMeta(Vault.state || {});
        const msg = `Restore this copy${m ? ` (Level ${m.level}, ${Number(m.xp).toLocaleString()} XP)` : ''}? ${now ? `This device is now at Level ${now.level} (${Number(now.xp).toLocaleString()} XP) and that is saved first. ` : ''}It then becomes your cloud copy too (the current cloud copy is backed up first).`;
        if (!confirm(msg)) return;
        try { Vault.createLocalBackup('Before restoring: ' + label, { protect: true }); } catch { /* full: the copy being restored stays */ }
        // Nov 20 2026 (Craft): after the reload, this copy goes straight to the cloud (the old cloud copy is backed up first).
        localStorage.setItem('bizzybee_after_restore', '1');
        const result = Vault.importFullState(raw, { backup: false });
        if (!result.ok) throw new Error(result.error);
        if (typeof syncLog === 'function') syncLog('restore', `Restored ${label}${m ? ` (Lv ${m.level} · ${m.xp} XP)` : ''}. `, m);
        window.location.reload();
    };
}
function renderDeviceBackups() {
    const list = document.getElementById('local-backup-list');
    list.replaceChildren();
    let entries;
    try { entries = deviceRecoveryEntries(); } catch { list.textContent = 'Recovery list could not be read.'; return; }
    if (!entries.length) list.textContent = 'No device recovery copies yet.';
    for (const item of entries) {
        if (!item.meta) item.meta = metaOfRaw(item.data);
        const row = document.createElement('div'); row.className = 'settings-action-row';
        const label = document.createElement('span'); label.textContent = backupLabel(item);
        const download = document.createElement('button'); download.textContent = 'Export';
        download.onclick = () => downloadFile(item.data, 'bizzybee-device-recovery.json', 'application/json');
        const restore = document.createElement('button'); restore.textContent = 'Restore';
        restore.onclick = () => settingsAction(restore, deviceRestore(async () => item.data, item.reason));
        row.append(label, download, restore); list.append(row);
        if (item.id !== 'previous-device-save') {
            const remove = document.createElement('button'); remove.textContent = 'Remove';
            remove.onclick = () => settingsAction(remove, async () => {
                if (!confirm('Remove this device recovery copy? Export it first if you want to keep it.')) return;
                Vault.removeLocalBackup(item.id); renderDeviceBackups();
            });
            row.append(remove);
        }
    }
    renderAutoBackups();
    renderBackupHealth();
}
async function renderAutoBackups() {
    const list = document.getElementById('auto-backup-list');
    if (!list) return;
    let copies = [];
    try { copies = await Vault.listAutoBackups(); } catch (error) { list.textContent = 'Automatic copies could not be read: ' + error.message; return; }
    list.replaceChildren();
    const shown = copies.filter(c => !svKind || c.kind === svKind);
    if (!shown.length) { list.textContent = copies.length ? 'None of this kind yet.' : 'No save points yet. The first is made shortly after the app opens.'; return; }
    for (const item of shown) {
        const name = `bizzybee-${Vault.saveType ? Vault.saveType() : 'REAL'}-savepoint-${(item.createdAt || '').slice(0, 16).replace(/[:T]/g, '-')}.json`;
        list.append(svRow(item, item.reason || 'Save point', [
            svBtn('Export', async () => downloadFile(await Vault.getAutoBackupData(item.id), name, 'application/json')),
            svBtn('Restore', deviceRestore(() => Vault.getAutoBackupData(item.id), item.reason || 'save point')),
        ]));
    }
}
// One line per kind of backup: working, or what is wrong (Nov 17 2026, Craft).
async function renderBackupHealth() {
    const host = document.getElementById('backup-health');
    if (!host) return;
    const h = Vault.backupHealth(), now = Date.now(), lines = [];
    const ago = iso => { if (!iso) return 'never'; const m = Math.round((now - Date.parse(iso)) / 60000); return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
    const add = (ok, text) => lines.push(`${ok ? '✅' : '⚠️'} ${text}`);
    const autoAt = Vault.autoBackupLastAt();
    if (h.autoErr) add(false, `Automatic copy failed: ${h.autoErr}`);
    else if (!autoAt) add(false, 'Save points: none yet (the first is made shortly after the app opens).');
    else add(now - autoAt < 26 * 3600000, `Hourly save point: last ${ago(new Date(autoAt).toISOString())}.`);
    if (h.safetyErr) add(false, `Device copy failed: ${h.safetyErr}`);
    else add(true, `Device copies before changes: last ${ago(h.safetyAt)}.`);
    const synced = localStorage.getItem(Vault.storageKey + ':syncedAt');
    const signedIn = localStorage.getItem('bizzybee_session') === 'identity';
    if (!signedIn) add(false, 'Cloud: not signed in, so nothing is backed up to the cloud.');
    else if (localStorage.getItem('bizzybee_auto_sync') === 'false') add(false, 'Cloud: automatic uploads are off.');
    else add(!!synced, `Cloud: last saved ${ago(synced)}.`);
    if (typeof FolderBackup !== 'undefined') {
        try {
            const st = await FolderBackup.status();
            if (!st.supported) { if (!document.documentElement.classList.contains('bb-app')) add(false, 'Save folder: this browser cannot pick one.'); }
            else if (!st.connected) add(false, 'Save folder: none chosen.');
            else add(st.permission === 'granted', st.permission === 'granted' ? `Save folder: ${st.name}.` : `Save folder: ${st.name} needs permission again.`);
        } catch { /* skip */ }
    }
    host.innerHTML = lines.map(l => `<div class="settings-action-row"><span>${l}</span></div>`).join('');
}
function initDeviceBackups() {
    document.getElementById('local-backup-btn').onclick = event => settingsAction(event.currentTarget, async () => { Vault.createLocalBackup(); renderDeviceBackups(); updateLocalOnlyTimestamp(); });
    document.getElementById('local-backup-refresh-btn').onclick = renderDeviceBackups;
    const nowBtn = document.getElementById('auto-backup-now-btn');
    if (nowBtn) nowBtn.onclick = event => settingsAction(event.currentTarget, async () => {
        const r = await Vault.savePoint('checkpoint', 'Made by you');
        if (!r.ok) throw new Error('Could not make the save point: ' + r.error);
        Toast.show('💾 Save point made.', 'positive');
        renderAutoBackups(); renderBackupHealth(); renderSyncLog();
    });
    const exp = document.getElementById('sv-export-btn');
    if (exp) exp.onclick = event => settingsAction(event.currentTarget, async () => downloadFile(Vault.exportFullState(), Vault.saveFileName ? Vault.saveFileName() : 'bizzybee-save.json', 'application/json'));
    document.querySelectorAll('#sv-filter .sv-chip').forEach(c => c.onclick = () => {
        svKind = c.dataset.k; document.querySelectorAll('#sv-filter .sv-chip').forEach(x => x.classList.toggle('on', x === c)); renderAutoBackups();
    });
    let more = false;
    const mb = document.getElementById('sync-log-more');
    if (mb) mb.onclick = () => { more = !more; mb.textContent = more ? 'Show Less' : 'Show More'; renderSyncLog(more); };
    renderSaveNow(); renderSyncLog();
    window.addEventListener('vault-saved', renderSaveNow);
    window.addEventListener('cloud-sync-status', renderSaveNow);
    renderDeviceBackups();
    updateLocalOnlyTimestamp();
}

// FolderBackup (src/core/services/folder-backup.js) may still be loading its own
// script tag when this runs - waitForFolderBackup() polls briefly rather
// than assuming it's already a global.
function waitForFolderBackup(tries = 20) {
    return new Promise(resolve => {
        (function poll() {
            if (typeof FolderBackup !== 'undefined') return resolve(FolderBackup);
            if (tries-- <= 0) return resolve(null);
            setTimeout(poll, 150);
        })();
    });
}
async function refreshFolderBackupStatus() {
    const statusEl = document.getElementById('folder-backup-status');
    const chooseBtn = document.getElementById('folder-backup-choose-btn');
    const disconnectBtn = document.getElementById('folder-backup-disconnect-btn');
    const engine = await waitForFolderBackup();
    if (!engine) { statusEl.textContent = "Couldn't load - try reopening Settings."; return; }
    const s = await engine.status();
    if (!s.supported) {
        statusEl.textContent = 'Not supported in this browser. Use Download a Copy Now instead.';
        chooseBtn.hidden = true; disconnectBtn.hidden = true;
        return;
    }
    if (!s.connected) {
        statusEl.textContent = 'Not set up yet. Choose a folder to save there automatically.';
        chooseBtn.hidden = false; disconnectBtn.hidden = true;
        return;
    }
    if (s.permission !== 'granted') {
        statusEl.textContent = `Folder "${s.name}" needs permission again.`;
        chooseBtn.hidden = false; disconnectBtn.hidden = false;
        return;
    }
    statusEl.textContent = `Saving automatically to "${s.name}".`;
    chooseBtn.hidden = true; disconnectBtn.hidden = false;
}
function initFolderBackup() {
    document.getElementById('folder-backup-download-btn').onclick = event => settingsAction(event.currentTarget, async () => {
        const engine = await waitForFolderBackup();
        if (!engine) throw new Error("Couldn't load the backup module - try reopening Settings.");
        engine.downloadNow();
        Toast.show('⬇️ Backup downloaded.', 'positive');
    });
    document.getElementById('folder-backup-choose-btn').onclick = event => settingsAction(event.currentTarget, async () => {
        const engine = await waitForFolderBackup();
        if (!engine) throw new Error("Couldn't load the backup module - try reopening Settings.");
        const name = await engine.chooseFolder();
        await engine.saveNow();
        Toast.show(`📁 Saving your last 3 saves to "${name}".`, 'positive');
        await refreshFolderBackupStatus();
    });
    document.getElementById('folder-backup-disconnect-btn').onclick = event => settingsAction(event.currentTarget, async () => {
        if (!confirm('Stop auto-saving to this folder? Files already saved there are untouched.')) return;
        const engine = await waitForFolderBackup();
        if (engine) await engine.disconnect();
        await refreshFolderBackupStatus();
    });
    refreshFolderBackupStatus();
}
function initPasswordReset() {
    const button = document.getElementById('reset-account-password-btn');
    button.onclick = () => settingsAction(button, async () => {
        const input = document.getElementById('reset-account-email');
        if (!input.value.trim() || !input.checkValidity()) throw new Error('Enter your cloud account email.');
        await AccountRecovery.send(input.value.trim());
        document.getElementById('reset-password-status').textContent = 'If that account exists, a reset link will arrive by email. Check your spam folder too.';
    });
}
