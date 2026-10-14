// Uses an explicitly selected project directory. No local server endpoint,
// saved credentials, or cloud upload is needed for this one-way transfer.
const LocalCloudDownload = {
    async writeFile(directory, name, content) {
        const handle = await directory.getFileHandle(name, { create: true });
        const stream = await handle.createWritable();
        try { await stream.write(content); await stream.close(); }
        catch (error) { try { await stream.abort(); } catch {} throw error; }
    },
    // Oct 2026: the cloud save may arrive as a JSON string or an object.
    readCloudState(cloudSave) {
        if (!cloudSave?.data) throw new Error('No cloud save exists yet. Nothing was changed.');
        const state = typeof cloudSave.data === 'string' ? JSON.parse(cloudSave.data) : cloudSave.data;
        Vault.validateFullState(state);
        return state;
    },
    async isProjectRoot(directory) {
        try {
            const manifest = JSON.parse(await (await (await directory.getFileHandle('package.json')).getFile()).text());
            return manifest.name === 'bizzybee-app';
        } catch { return false; }
    },
    // Writes bizzybee-save-<name>-<date>.json and keeps only the newest 3.
    async writeSaveFile(folder, state) {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
        const who = String(state.displayName || (state.onboarding || {}).name || 'save').replace(/[^\w-]+/g, '').slice(0, 20) || 'save';
        const name = `bizzybee-save-${who}-${stamp}.json`;
        await this.writeFile(folder, name, JSON.stringify(state, null, 2));
        const names = [];
        for await (const [n, entry] of folder.entries()) if (entry.kind === 'file' && /^bizzybee-save-.*\.json$/.test(n)) names.push(n);
        names.sort((a, b) => b.slice(-21).localeCompare(a.slice(-21)));
        for (const old of names.slice(3)) { try { await folder.removeEntry(old); } catch { /* leave it */ } }
        return name;
    },
    async saveToProject(directory, cloudSave) {
        if (!await this.isProjectRoot(directory)) throw new Error('Choose the Bizzybee_App project folder, not Downloads or src.');
        const state = this.readCloudState(cloudSave);
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
        const local = { ...state, blueprintSource: 'personal', _localCloudTransfer: { id, cloudUpdatedAt: cloudSave.updatedAt || null, downloadedAt: new Date().toISOString() } };
        await this.writeFile(core, 'data.personal.json', JSON.stringify(local, null, 2));
        return { backedUp: previous !== undefined };
    },
    async download() {
        const status = document.getElementById('cloud-local-download-status');
        if (typeof window.showDirectoryPicker !== 'function') {
            throw new Error('Automatic file placement needs a browser with folder access. Open these Settings in desktop Chrome or Edge.');
        }
        // Must happen directly in the click gesture, before fetching cloud data.
        const directory = await window.showDirectoryPicker({ id: 'bizzybee-local-project', mode: 'readwrite' });
        if (directory.requestPermission && await directory.requestPermission({ mode: 'readwrite' }) !== 'granted') {
            throw new Error('Chrome did not get permission to save in that folder. Nothing was changed.');
        }
        status.textContent = 'Downloading the latest cloud save…';
        const cloudSave = await cloudEngine().request('load-state');
        const state = this.readCloudState(cloudSave);
        // Bizzybee_App folder: install for localhost + keep a copy in save-files.
        // Any other folder (e.g. save-files itself): just drop the save file there.
        if (await this.isProjectRoot(directory)) {
            const result = await this.saveToProject(directory, cloudSave);
            const saves = await directory.getDirectoryHandle('save-files', { create: true });
            const file = await this.writeSaveFile(saves, state);
            return `Saved. src/core/data.personal.json updated${result.backedUp ? ' (old file backed up)' : ''}, and save-files/${file} added. Reload your localhost app to load it.`;
        }
        const file = await this.writeSaveFile(directory, state);
        return `Saved ${file} in "${directory.name}". To also update your offline profile, pick the Bizzybee_App folder instead.`;
    },
    init() {
        const button = document.getElementById('cloud-local-download-btn');
        button.onclick = async () => {
            button.disabled = true;
            const status = document.getElementById('cloud-local-download-status');
            const tell = (message, tone) => {
                status.textContent = message;
                status.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                if (typeof Toast !== 'undefined') Toast.show(message, tone);
            };
            try { tell(await this.download(), 'positive'); }
            catch (error) {
                console.error('[LocalCloudDownload]', error);
                tell(error.name === 'AbortError' ? 'Download cancelled. Nothing was saved.' : `Download failed: ${error.message || error}`, 'negative');
            } finally { button.disabled = false; }
        };
    }
};
