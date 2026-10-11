console.log("/// SETTINGS PROTOCOLS INITIALIZED ///");

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

document.addEventListener('DOMContentLoaded', async () => {
    try { await Vault.init(); } catch (error) { Toast.show(error.message, "negative"); }

    Waggle.setActions(baseWaggleActions());

    initCloudSync();
    LocalCloudDownload.init();
    initDeviceBackups();
    initFolderBackup();
    initPasswordReset();
    initPhoneReminders();
    initHistoryImport();

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

    // Numeric-only, capped at 6 digits - same sanitization pattern as the
    // Account PIN inputs (account-info.js's sanitizePinInput), duplicated
    // here rather than shared across files per this codebase's existing
    // convention for this kind of small coupling.
    document.getElementById('full-save-password').addEventListener('input', (event) => {
        event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
    });

    document.getElementById('export-full-save-btn').addEventListener('click', async () => {
        const snapshot = Vault.exportFullState() || localStorage.getItem(Vault.storageKey);
        if (!snapshot) {
            Toast.show('Nothing to export yet.', 'negative');
            return;
        }

        const pin = document.getElementById('full-save-password').value;
        if (pin) {
            if (!/^\d{4,6}$/.test(pin)) {
                Toast.show('⚠️ PIN must be 4-6 digits.', 'negative');
                return;
            }
            try {
                const encrypted = JSON.parse(await CryptoLite.encrypt(snapshot, pin));
                // The hint is deliberately plain text, sitting outside the
                // encrypted envelope - CryptoLite only ever encrypts the
                // `snapshot` string above, so this never touches the PIN
                // or your real data. Shown back on import to jog your
                // memory; never store the actual PIN in it.
                const hint = document.getElementById('full-save-hint').value.trim();
                if (hint) encrypted.hint = hint;
                downloadFile(JSON.stringify(encrypted), 'bizzybee-full-save.json', 'application/json');
                Toast.show('🔐 Full save exported (encrypted).', 'positive');
            } catch (error) {
                Toast.show('⚠️ Encryption failed - export cancelled.', 'negative');
            }
            return;
        }

        downloadFile(snapshot, 'bizzybee-full-save.json', 'application/json');
        Toast.show('📤 Full save exported.', 'positive');
    });

    document.getElementById('import-full-save-input').addEventListener('change', () => {
        const input = document.getElementById('import-full-save-input');
        const hintDisplay = document.getElementById('import-full-save-hint-display');
        const file = input.files[0];
        hintDisplay.hidden = true;
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (parsed && parsed.bizzybeeEncrypted && parsed.hint) {
                    hintDisplay.textContent = `💡 Hint from export: "${parsed.hint}"`;
                    hintDisplay.hidden = false;
                }
            } catch (error) { /* not JSON, or no hint - nothing to preview */ }
        };
        reader.readAsText(file);
    });

    document.getElementById('import-full-save-btn').addEventListener('click', () => {
        const input = document.getElementById('import-full-save-input');
        const file = input.files[0];
        if (!file) {
            Toast.show('Choose a save file first.', 'negative');
            return;
        }

        const confirmed = confirm(
            'Replace this device’s progress with the imported file? A recovery copy will be kept first. Automatic cloud uploads will be paused for review.'
        );
        if (!confirmed) return;

        const reader = new FileReader();
        reader.onload = async () => {
            let plainText = reader.result;

            if (CryptoLite.isEncryptedEnvelope(plainText)) {
                const password = document.getElementById('full-save-password').value;
                if (!password) {
                    Toast.show('⚠️ This save is encrypted - enter its PIN above first.', 'negative');
                    return;
                }
                try {
                    plainText = await CryptoLite.decrypt(plainText, password);
                } catch (error) {
                    Toast.show('⚠️ Wrong PIN, or the file is corrupted.', 'negative');
                    return;
                }
            }

            localStorage.setItem('bizzybee_auto_sync', 'false');
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

    // Hidden developer tools: tap the SETTINGS title 5 times to reveal.
    const devSection = document.getElementById('dev-section');
    const settingsTitle = document.querySelector('.settings-title');
    let devTaps = 0, devTapTimer = null;
    if (settingsTitle && devSection) settingsTitle.addEventListener('click', () => {
        devTaps += 1;
        clearTimeout(devTapTimer);
        devTapTimer = setTimeout(() => { devTaps = 0; }, 1500);
        if (devTaps >= 5 && devSection.hidden) {
            devSection.hidden = false;
            devSection.open = true;
            devSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            Toast.show('🛠 Developer tools shown.', 'positive');
        }
    });
    document.getElementById('practice-egg-btn').addEventListener('click', () => {
        window.location.href = '../onboarding/onboarding.html?practice=1';
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        if (typeof netlifyIdentity !== 'undefined' && netlifyIdentity.currentUser()) await netlifyIdentity.logout();
        localStorage.removeItem('bizzybee_session');
        // Was '../login/login.html' - a leftover from before the index/login
        // swap (see HANDOFF.md §12). src/features/login/ was deleted when
        // login.html became the project's actual root index.html, which
        // left this pointing at a folder that no longer exists. Found and
        // fixed while working on this file for an unrelated reason.
        window.location.href = '../../../index.html';
    });
});

// Phone reminders (src/core/push/push.js).
function initPhoneReminders() {
    const toggle = document.getElementById('push-toggle');
    const names = document.getElementById('push-names-toggle');
    const test = document.getElementById('push-test-btn');
    const status = document.getElementById('push-status');
    if (!toggle || typeof BizzyPush === 'undefined') return;
    const render = (message) => {
        toggle.checked = BizzyPush.isOn();
        names.checked = BizzyPush.showNames();
        test.disabled = !BizzyPush.isOn();
        if (message) status.textContent = message;
        else if (!BizzyPush.supported()) status.textContent = 'This browser can\'t do phone notifications. Try Chrome.';
        else status.textContent = BizzyPush.isOn() ? 'On. Reminders arrive even when the app is closed.' : 'Off.';
    };
    render();
    toggle.addEventListener('change', async () => {
        toggle.disabled = true;
        try {
            if (toggle.checked) {
                const out = await BizzyPush.enable();
                render(`On. ${out.upcoming || 0} reminder${out.upcoming === 1 ? '' : 's'} coming up in the next 10 days.`);
                Toast.show('🔔 Phone reminders on.', 'positive');
            } else {
                await BizzyPush.disable();
                render();
            }
        } catch (error) {
            await BizzyPush.disable().catch(() => {});
            render(error.message);
            Toast.show(error.message, 'negative');
        } finally {
            toggle.disabled = false;
        }
    });
    names.addEventListener('change', () => BizzyPush.setShowNames(names.checked));
    test.addEventListener('click', async () => {
        test.disabled = true;
        try { await BizzyPush.test(); Toast.show('🔔 Test sent.', 'positive'); }
        catch (error) { Toast.show(error.message, 'negative'); }
        finally { test.disabled = !BizzyPush.isOn(); }
    });
}

// History import (Vault.importHistoryPack).
function initHistoryImport() {
    const btn = document.getElementById('history-import-btn');
    const file = document.getElementById('history-import-file');
    const status = document.getElementById('history-import-status');
    if (!btn || !file) return;
    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        file.value = '';
        if (!f) return;
        try {
            const pack = JSON.parse(await f.text());
            const c = Vault.importHistoryPack(pack, { dryRun: true });
            const list = [`${c.quests} quests (${c.tasks} tasks)`, `${c.terms} dictionary terms`, `${c.projects} projects`, `${c.timeline} timeline entries`, `${c.titles} titles`, `${c.study} study items`];
            if (!c.quests && !c.terms && !c.projects && !c.timeline && !c.titles && !c.study) { status.textContent = 'Nothing new in that file - it was already imported.'; return; }
            if (!confirm(`Import from ${pack.source || 'this file'}?\n\n${list.join('\n')}\n\nNothing is replaced. A device backup is made first.`)) return;
            if (typeof Vault.createLocalBackup === 'function') { try { Vault.createLocalBackup('before history import'); } catch (e) { /* best effort */ } }
            Vault.importHistoryPack(pack);
            status.textContent = `✅ Imported: ${list.join(', ')}.`;
            Toast.show('📥 History imported.', 'positive');
        } catch (error) {
            status.textContent = error.message || 'Could not read that file.';
            Toast.show(status.textContent, 'negative');
        }
    });
}
