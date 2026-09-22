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
    wire('cloud-sync-push-btn', async () => { if (!await cloudEngine().pushNow()) throw new Error('Cloud save is not complete. Check the sync status above.'); });
    wire('cloud-sync-pull-btn', async () => {
        if (confirm('Use the latest cloud copy on this device? A local recovery copy will be kept first.')) await cloudEngine().pullLatest();
    });
    wire('cloud-sync-use-device-btn', async () => {
        if (confirm('Replace cloud progress with this device’s copy? The previous cloud copy will be backed up first.')) await cloudEngine().useDeviceCopy();
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
    window.addEventListener('cloud-sync-ready', () => refreshCloudBackups().catch(error => { document.getElementById('backup-status').textContent = error.message; }));
    if (typeof CloudSyncAuto !== 'undefined') {
        cloudSyncSetStatus(CloudSyncAuto.getStatus());
        if (CloudSyncAuto.isReady()) refreshCloudBackups().catch(error => { document.getElementById('backup-status').textContent = error.message; });
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
        row.append(label, button); list.append(row);
    }
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
    document.getElementById('local-backup-btn').onclick = event => settingsAction(event.currentTarget, async () => { Vault.createLocalBackup(); renderDeviceBackups(); });
    document.getElementById('local-backup-refresh-btn').onclick = renderDeviceBackups;
    renderDeviceBackups();
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
