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

// --- Profile photo (moved here from profile.js - the Profile page itself
// is read-only now, all editing happens under Settings > Profile). Same
// "self-contained feature page" duplication tradeoff profile.js's own
// characterLevelBarToRows comment documents elsewhere in this app - simpler
// to keep one small copy of the preview-resolution logic here than build a
// shared cross-page module for it.

// Reads the picked file, draws it onto an offscreen canvas capped at
// maxDim on its longest edge, and re-exports as a JPEG data URL - keeps a
// phone-camera-sized photo (often several MB) from bloating localStorage
// or a Full Save export file. Typical result: well under 200KB, against a
// localStorage quota that's usually 5-10MB.
function downscaleImageFile(file, maxDim = 640, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width >= height) {
                        height = Math.round(height * (maxDim / width));
                        width = maxDim;
                    } else {
                        width = Math.round(width * (maxDim / height));
                        height = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('not-an-image'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('read-failed'));
        reader.readAsDataURL(file);
    });
}

// Same priority order Profile's old applyAvatarImage used: a Vault-stored
// custom photo first, then the gitignored static me.jpg convention, then
// the generic placeholder. Only touches this page's small preview thumbnail
// and the icon-only remove control's visibility.
function applySettingsAvatarPreview() {
    const img = document.getElementById('settings-avatar-preview');
    const removeBtn = document.getElementById('settings-avatar-remove-btn');
    const customPhoto = Vault.getProfilePhoto();

    if (customPhoto) {
        img.onerror = null;
        img.src = customPhoto;
        removeBtn.hidden = false;
        return;
    }

    removeBtn.hidden = true;
    img.onerror = () => { img.onerror = null; img.src = '../../assets/images/avatar-placeholder.svg'; };
    img.src = '../../assets/images/me.jpg';
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

    applySettingsAvatarPreview();

    document.getElementById('settings-avatar-edit-btn').addEventListener('click', () => {
        document.getElementById('settings-avatar-input').click();
    });

    document.getElementById('settings-avatar-input').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            Toast.show("That doesn't look like an image file.", 'negative');
            event.target.value = '';
            return;
        }

        try {
            const dataUrl = await downscaleImageFile(file);
            Vault.setProfilePhoto(dataUrl);
            applySettingsAvatarPreview();
            Toast.show('🖼️ Photo updated.', 'positive');
        } catch (error) {
            Toast.show('Could not process that image.', 'negative');
        } finally {
            event.target.value = '';
        }
    });

    document.getElementById('settings-avatar-remove-btn').addEventListener('click', () => {
        if (!confirm('Remove your custom photo? This falls back to the default avatar.')) return;
        Vault.clearProfilePhoto();
        applySettingsAvatarPreview();
        Toast.show('Photo removed.', 'negative');
    });

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
