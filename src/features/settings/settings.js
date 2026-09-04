console.log("/// SETTINGS PROTOCOLS INITIALIZED ///");

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// --- Cloud Sync (Netlify Identity + Netlify Blobs) ---------------------
// Page-level only, deliberately: reuses Vault.exportFullState()/
// importFullState() exactly as the existing Full Save Transfer buttons do,
// rather than adding new methods to db.js. The cloud side is just two
// small Functions (netlify/functions/save-state.mjs, load-state.mjs) that
// store/return that same export string per signed-in user - see
// HANDOFF.md for the full writeup on why this lives here instead of Vault.
//
// Can't be exercised at all until this is actually deployed on Netlify
// with Identity enabled (invite-only) - on any other host, or before
// Identity's enabled, the widget script is a harmless no-op and this
// whole panel just quietly does nothing when clicked.

// Same localStorage keys cloud-sync.js uses for the auto-sync engine -
// duplicated as plain string literals rather than imported, since that
// module loads asynchronously (injected by app.js) and isn't guaranteed to
// exist yet by the time this file's own DOMContentLoaded handler runs. See
// cloud-sync.js's header comment for the full rationale.
const CLOUD_SYNC_AUTO_KEY = 'bizzybee_auto_sync';
const CLOUD_SYNC_LAST_SYNCED_KEY = 'bizzybee_last_synced_at';

function cloudSyncShowSignedOut() {
    document.getElementById('cloud-sync-signed-out').hidden = false;
    document.getElementById('cloud-sync-signed-in').hidden = true;
}

function cloudSyncLastSyncedText() {
    const timestamp = localStorage.getItem(CLOUD_SYNC_LAST_SYNCED_KEY);
    return timestamp
        ? `Last synced: ${new Date(timestamp).toLocaleString()}`
        : 'Not synced yet on this device.';
}

function cloudSyncShowSignedIn(user) {
    document.getElementById('cloud-sync-signed-out').hidden = true;
    document.getElementById('cloud-sync-signed-in').hidden = false;
    document.getElementById('cloud-sync-email').textContent = user.email || '';
    // Reads whatever was actually last persisted (by a manual Save/Load
    // here, or by the auto-sync engine on any other page) rather than the
    // hardcoded "Not synced yet" this used to leave in place until the next
    // fresh manual action - see HANDOFF.md's auto-sync entry.
    cloudSyncSetStatus(cloudSyncLastSyncedText());
}

function cloudSyncSetStatus(message) {
    const el = document.getElementById('cloud-sync-status');
    if (el) el.textContent = message;
}

async function cloudSyncAuthedFetch(path, options = {}) {
    const user = netlifyIdentity.currentUser();
    if (!user) throw new Error('Not signed in');
    const token = await user.jwt();
    return fetch(path, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
        },
    });
}

function initCloudSync() {
    if (typeof netlifyIdentity === 'undefined') return;

    netlifyIdentity.on('init', (user) => {
        if (user) cloudSyncShowSignedIn(user);
        else cloudSyncShowSignedOut();
    });
    netlifyIdentity.on('login', (user) => {
        cloudSyncShowSignedIn(user);
        netlifyIdentity.close();
    });
    netlifyIdentity.on('logout', () => {
        cloudSyncShowSignedOut();
    });
    netlifyIdentity.on('error', (err) => {
        console.error('Netlify Identity error:', err);
        Toast.show('⚠️ Cloud Sync sign-in error - see console.', 'negative');
    });

    document.getElementById('cloud-sync-login-btn').addEventListener('click', () => {
        netlifyIdentity.open('login');
    });

    document.getElementById('cloud-sync-logout-btn').addEventListener('click', () => {
        netlifyIdentity.logout();
    });

    // Defaults ON (absent key = enabled) - matches cloud-sync.js's own
    // isEnabled(); this toggle is how a device opts OUT, not how it opts
    // in. Wired here (not gated behind the 'login' event) since it's a
    // plain localStorage flag with no auth dependency of its own.
    const autoToggle = document.getElementById('cloud-sync-auto-toggle');
    autoToggle.checked = localStorage.getItem(CLOUD_SYNC_AUTO_KEY) !== 'false';
    autoToggle.addEventListener('change', () => {
        localStorage.setItem(CLOUD_SYNC_AUTO_KEY, autoToggle.checked ? 'true' : 'false');
    });

    document.getElementById('cloud-sync-push-btn').addEventListener('click', async () => {
        const snapshot = Vault.exportFullState();
        if (!snapshot) {
            Toast.show('Nothing to save yet.', 'negative');
            return;
        }

        cloudSyncSetStatus('Saving...');
        try {
            const response = await cloudSyncAuthedFetch('/.netlify/functions/save-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: snapshot }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                throw new Error(result.error || `Save failed (${response.status})`);
            }
            localStorage.setItem(CLOUD_SYNC_LAST_SYNCED_KEY, result.updatedAt);
            cloudSyncSetStatus(`Last synced: ${new Date(result.updatedAt).toLocaleString()}`);
            Toast.show('☁️ Saved to cloud.', 'positive');
        } catch (error) {
            cloudSyncSetStatus('Save failed - see below.');
            Toast.show(`⚠️ Cloud save failed: ${error.message}`, 'negative');
        }
    });

    document.getElementById('cloud-sync-pull-btn').addEventListener('click', async () => {
        cloudSyncSetStatus('Checking cloud...');
        try {
            const response = await cloudSyncAuthedFetch('/.netlify/functions/load-state');
            const result = await response.json();
            if (!response.ok || !result.ok) {
                throw new Error(result.error || `Load failed (${response.status})`);
            }
            if (!result.data) {
                cloudSyncSetStatus('Nothing saved to the cloud yet from any device.');
                Toast.show('Nothing saved to the cloud yet.', 'negative');
                return;
            }

            const confirmed = confirm(
                `This replaces everything currently saved in this browser with the version last saved to the cloud (${new Date(result.updatedAt).toLocaleString()}). This cannot be undone. Continue?`
            );
            if (!confirmed) {
                cloudSyncSetStatus(`Last saved to cloud: ${new Date(result.updatedAt).toLocaleString()}`);
                return;
            }

            const importResult = Vault.importFullState(result.data);
            if (!importResult.ok) {
                throw new Error(importResult.error);
            }
            localStorage.setItem(CLOUD_SYNC_LAST_SYNCED_KEY, result.updatedAt);
            Toast.show('☁️ Loaded from cloud - reloading...', 'positive');
            setTimeout(() => window.location.reload(), 800);
        } catch (error) {
            cloudSyncSetStatus('Load failed - see below.');
            Toast.show(`⚠️ Cloud load failed: ${error.message}`, 'negative');
        }
    });

    netlifyIdentity.init();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    Waggle.setActions(baseWaggleActions());

    initCloudSync();

    document.getElementById('export-conversations-btn').addEventListener('click', () => {
        const conversations = Vault.getConversations();
        const jsonl = conversations.map(entry => JSON.stringify(entry)).join('\n');
        downloadFile(jsonl, 'eevee-conversations.jsonl', 'application/jsonl');
        Toast.show('📤 Conversations exported.', 'positive');
    });

    document.getElementById('export-quests-btn').addEventListener('click', () => {
        const quests = Vault.getQuests();
        downloadFile(JSON.stringify(quests, null, 2), 'eevee-quest-data.json', 'application/json');
        Toast.show('📤 Quest data exported.', 'positive');
    });

    document.getElementById('sync-blueprint-btn').addEventListener('click', async () => {
        const updated = await Vault.syncFromBlueprint();
        Toast.show(
            updated ? '🔄 Synced - content updated, progress kept.' : '⚠️ Sync failed - check the console.',
            updated ? 'positive' : 'negative'
        );
    });

    document.getElementById('reset-data-btn').addEventListener('click', async () => {
        const confirmed = confirm(
            'This will erase all local progress (completed tasks, DP, level) and reload fresh from the blueprint. This cannot be undone. Continue?'
        );
        if (!confirmed) return;

        await Vault.forceReset();
        Toast.show('🗑️ Local data reset.', 'negative');
    });

    document.getElementById('export-full-save-btn').addEventListener('click', async () => {
        const snapshot = Vault.exportFullState();
        if (!snapshot) {
            Toast.show('Nothing to export yet.', 'negative');
            return;
        }

        const password = document.getElementById('full-save-password').value;
        if (password) {
            try {
                const encrypted = await CryptoLite.encrypt(snapshot, password);
                downloadFile(encrypted, 'bizzybee-full-save.json', 'application/json');
                Toast.show('🔐 Full save exported (encrypted).', 'positive');
            } catch (error) {
                Toast.show('⚠️ Encryption failed - export cancelled.', 'negative');
            }
            return;
        }

        downloadFile(snapshot, 'bizzybee-full-save.json', 'application/json');
        Toast.show('📤 Full save exported.', 'positive');
    });

    document.getElementById('import-full-save-btn').addEventListener('click', () => {
        const input = document.getElementById('import-full-save-input');
        const file = input.files[0];
        if (!file) {
            Toast.show('Choose a save file first.', 'negative');
            return;
        }

        const confirmed = confirm(
            'This replaces everything currently saved in this browser with the imported file. This cannot be undone. Continue?'
        );
        if (!confirmed) return;

        const reader = new FileReader();
        reader.onload = async () => {
            let plainText = reader.result;

            if (CryptoLite.isEncryptedEnvelope(plainText)) {
                const password = document.getElementById('full-save-password').value;
                if (!password) {
                    Toast.show('⚠️ This save is encrypted - enter its password above first.', 'negative');
                    return;
                }
                try {
                    plainText = await CryptoLite.decrypt(plainText, password);
                } catch (error) {
                    Toast.show('⚠️ Wrong password, or the file is corrupted.', 'negative');
                    return;
                }
            }

            const result = Vault.importFullState(plainText);
            if (!result.ok) {
                Toast.show(`⚠️ ${result.error}`, 'negative');
                return;
            }
            Toast.show('📥 Save imported - reloading...', 'positive');
            setTimeout(() => window.location.reload(), 800);
        };
        reader.onerror = () => Toast.show('⚠️ Could not read that file.', 'negative');
        reader.readAsText(file);
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('bizzybee_session');
        // Was '../login/login.html' - a leftover from before the index/login
        // swap (see HANDOFF.md §12). src/features/login/ was deleted when
        // login.html became the project's actual root index.html, which
        // left this pointing at a folder that no longer exists. Found and
        // fixed while working on this file for an unrelated reason.
        window.location.href = '../../../index.html';
    });
});
