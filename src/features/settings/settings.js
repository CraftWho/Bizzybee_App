console.log("/// SETTINGS PROTOCOLS INITIALIZED ///");

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// Builds one plugin's Personal Information sub-section straight from its
// PLUGIN_CATALOG entry's `personalInfoFields` (see plugins.js) - only ever
// called for plugins that are BOTH available AND currently enabled
// (Plugins.isEnabled), so a field never shows up for a plugin you haven't
// actually turned on yet. Each input's id is namespaced
// `pi-plugin-<pluginId>-<fieldKey>` so readPersonalInfoForm below can walk
// them back out generically without a plugin-by-plugin switch statement.
function renderPluginPersonalInfoSection(entry) {
    const saved = Vault.getPluginPersonalInfo(entry.id);
    const fieldsHTML = entry.personalInfoFields.map(field => `
        <label class="personal-info-field">
            <span>${escapeHTML(field.label)}</span>
            <input type="${field.type === 'number' ? 'number' : 'text'}"
                   id="pi-plugin-${entry.id}-${field.key}"
                   placeholder="${escapeHTML(field.placeholder || '')}"
                   value="${escapeHTML(saved[field.key] != null ? String(saved[field.key]) : '')}">
        </label>
    `).join('');

    return `
        <div class="personal-info-plugin-block" data-plugin-id="${entry.id}">
            <h4>${entry.icon} ${escapeHTML(entry.label)}</h4>
            <div class="personal-info-grid">${fieldsHTML}</div>
        </div>
    `;
}

function loadPersonalInfoForm() {
    const core = Vault.getPersonalInfo();
    document.getElementById('pi-fullName').value = core.fullName || '';
    document.getElementById('pi-address').value = core.address || '';
    document.getElementById('pi-age').value = core.age != null ? core.age : '';
    document.getElementById('pi-height').value = core.height || '';

    const pluginContainer = document.getElementById('personal-info-plugin-sections');
    const activeEntries = Plugins.getCatalog().filter(entry =>
        Array.isArray(entry.personalInfoFields) && entry.personalInfoFields.length > 0 && Plugins.isEnabled(entry.id)
    );
    pluginContainer.innerHTML = activeEntries.map(renderPluginPersonalInfoSection).join('');
}

function savePersonalInfoForm() {
    Vault.setPersonalInfo({
        fullName: document.getElementById('pi-fullName').value.trim(),
        address: document.getElementById('pi-address').value.trim(),
        age: document.getElementById('pi-age').value ? Number(document.getElementById('pi-age').value) : null,
        height: document.getElementById('pi-height').value.trim()
    });

    document.querySelectorAll('.personal-info-plugin-block').forEach(block => {
        const pluginId = block.dataset.pluginId;
        const entry = Plugins.getEntry(pluginId);
        if (!entry || !entry.personalInfoFields) return;

        const values = {};
        entry.personalInfoFields.forEach(field => {
            const input = document.getElementById(`pi-plugin-${pluginId}-${field.key}`);
            if (!input) return;
            values[field.key] = field.type === 'number'
                ? (input.value ? Number(input.value) : null)
                : input.value.trim();
        });
        Vault.setPluginPersonalInfo(pluginId, values);
    });

    Toast.show('💾 Personal information saved.', 'positive');
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    HiveMind.setActions(baseHiveMindActions());

    loadPersonalInfoForm();
    document.getElementById('save-personal-info-btn').addEventListener('click', savePersonalInfoForm);

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
        window.location.href = '../login/login.html';
    });
});
