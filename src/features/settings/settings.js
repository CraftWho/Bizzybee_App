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

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    HiveMind.setActions(baseHiveMindActions());

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

    document.getElementById('export-full-save-btn').addEventListener('click', () => {
        const snapshot = Vault.exportFullState();
        if (!snapshot) {
            Toast.show('Nothing to export yet.', 'negative');
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
        reader.onload = () => {
            const result = Vault.importFullState(reader.result);
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
