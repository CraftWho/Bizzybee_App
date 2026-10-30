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
    // Oct 30 2026 (Craft): cloud only - the switch is for the creator (dev mode).
    if (localStorage.getItem('bizzybee_dev') !== '1') {
        const row = toggle.closest('.row') || toggle.parentElement;
        if (row) { row.querySelector('small') && (row.querySelector('small').textContent = 'Always on. Your hive is saved to your account every couple of minutes.'); }
        toggle.disabled = true; toggle.checked = true;
    }
    toggle.addEventListener('change', () => {
        localStorage.setItem('bizzybee_auto_sync', String(toggle.checked));
        if (toggle.checked && typeof CloudSyncAuto !== 'undefined') CloudSyncAuto.schedule();
    });
    const show = user => {
        if (localStorage.getItem('bizzybee_session') !== 'identity') user = null;
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
    wire('backup-schedule-btn', async () => {
        await cloudEngine().request('backups', { action: 'schedule', hours: Number(document.getElementById('backup-interval').value) });
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
    document.getElementById('backup-interval').value = result.schedule.hours;
    const hours = result.schedule.hours;
    const period = hours * 3600000;
    const next = result.schedule.startsAt + (Math.floor((Date.now() - result.schedule.startsAt) / period) + 1) * period;
    document.getElementById('backup-status').textContent = `Every ${hours} hours · next due ${new Date(next).toLocaleString()} (processed within the following hour). Keeping the latest ${result.retain} backups.`;
    const list = document.getElementById('cloud-backup-list');
    list.replaceChildren();
    if (!result.backups.length) list.textContent = 'No cloud backups yet. Use Back Up Now to create your first.';
    for (const item of result.backups) {
        const row = document.createElement('div'); row.className = 'settings-action-row';
        const label = document.createElement('span'); label.textContent = new Date(item.createdAt).toLocaleString();
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
            const name = `bizzybee-cloud-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}.json`;
            const written = typeof FolderBackup !== 'undefined' ? await FolderBackup.writeFile(name, text) : { ok: false };
            if (written.ok) { Toast.show(`💾 Saved ${name} to ${written.folder}.`, 'positive'); return; }
            const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        });
        row.append(label, save, button); list.append(row);
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
function renderDeviceBackups() {
    const list = document.getElementById('local-backup-list');
    list.replaceChildren();
    let entries;
    try { entries = deviceRecoveryEntries(); } catch { list.textContent = 'Recovery list could not be read.'; return; }
    if (!entries.length) list.textContent = 'No device recovery copies yet.';
    for (const item of entries) {
        const row = document.createElement('div'); row.className = 'settings-action-row';
        const label = document.createElement('span'); label.textContent = `${item.reason}${item.createdAt ? ' · ' + new Date(item.createdAt).toLocaleString() : ''}`;
        const download = document.createElement('button'); download.textContent = 'Export';
        download.onclick = () => downloadFile(item.data, 'bizzybee-device-recovery.json', 'application/json');
        const restore = document.createElement('button'); restore.textContent = 'Restore';
        restore.onclick = () => settingsAction(restore, async () => {
            if (!confirm('Restore this device copy? Cloud auto uploads will pause so you can review it.')) return;
            localStorage.setItem('bizzybee_auto_sync', 'false');
            const result = Vault.importFullState(item.data);
            if (!result.ok) throw new Error(result.error);
            window.location.reload();
        });
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
}
function initDeviceBackups() {
    document.getElementById('local-backup-btn').onclick = event => settingsAction(event.currentTarget, async () => { Vault.createLocalBackup(); renderDeviceBackups(); updateLocalOnlyTimestamp(); });
    document.getElementById('local-backup-refresh-btn').onclick = renderDeviceBackups;
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
