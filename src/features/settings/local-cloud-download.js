// Uses an explicitly selected project directory. No local server endpoint,
// saved credentials, or cloud upload is needed for this one-way transfer.
const LocalCloudDownload = {
    async writeFile(directory, name, content) {
        const handle = await directory.getFileHandle(name, { create: true });
        const stream = await handle.createWritable();
        try { await stream.write(content); await stream.close(); }
        catch (error) { try { await stream.abort(); } catch {} throw error; }
    },
    async saveToProject(directory, cloudSave) {
        const manifest = JSON.parse(await (await (await directory.getFileHandle('package.json')).getFile()).text());
        if (manifest.name !== 'bizzybee-app') throw new Error('Choose the Bizzybee_App project folder, not Downloads or src.');
        if (!cloudSave?.data) throw new Error('No cloud save exists yet. Nothing was changed.');
        const state = JSON.parse(cloudSave.data);
        Vault.validateFullState(state);
        const core = await (await directory.getDirectoryHandle('src')).getDirectoryHandle('core');
        const id = crypto.randomUUID();
        let previous;
        try { previous = await (await (await core.getFileHandle('data.personal.json')).getFile()).text(); }
        catch (error) { if (error.name !== 'NotFoundError') throw error; }
        // Keep backups under the already-private core path, excluded from Git.
        if (previous !== undefined) {
            const backups = await core.getDirectoryHandle('local-save-backups', { create: true });
            await this.writeFile(backups, `data.personal-${Date.now()}-${id}.json`, previous);
        }
        state.blueprintSource = 'personal';
        state._localCloudTransfer = { id, cloudUpdatedAt: cloudSave.updatedAt || null, downloadedAt: new Date().toISOString() };
        await this.writeFile(core, 'data.personal.json', JSON.stringify(state, null, 2));
        return { backedUp: previous !== undefined };
    },
    async download() {
        const status = document.getElementById('cloud-local-download-status');
        if (typeof window.showDirectoryPicker !== 'function') {
            throw new Error('Automatic file placement needs a browser with folder access. Open these Settings in desktop Chrome or Edge.');
        }
        // Must happen directly in the click gesture, before fetching cloud data.
        const directory = await window.showDirectoryPicker({ id: 'bizzybee-local-project', mode: 'readwrite' });
        status.textContent = 'Downloading the latest cloud save…';
        const cloudSave = await cloudEngine().request('load-state');
        const result = await this.saveToProject(directory, cloudSave);
        status.textContent = `Saved to src/core/data.personal.json.${result.backedUp ? ' The previous file was backed up.' : ''} Reload your localhost app using your local dev login to load this progress. Your local edits stay local.`;
    },
    init() {
        const button = document.getElementById('cloud-local-download-btn');
        button.onclick = async () => {
            button.disabled = true;
            try { await this.download(); }
            catch (error) {
                const message = error.name === 'AbortError' ? 'Download cancelled. No new save was installed.' : error.message;
                document.getElementById('cloud-local-download-status').textContent = message;
            } finally { button.disabled = false; }
        };
    }
};
