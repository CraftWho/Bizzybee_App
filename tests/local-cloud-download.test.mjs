import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const sample = () => ({ schemaVersion: 8, user: { name: 'Cloud Bee' }, quests: [{ id: 'q', tasks: [{ id: 't', xp: 75, completed: true }] }], profilePhoto: 'photo-data', colony: { bees: [] } });
function directory(files, prefix = '', failWrite = '') {
    return {
        async getFileHandle(name, options = {}) {
            const path = prefix + name;
            if (!files.has(path) && !options.create) throw Object.assign(new Error('Missing'), { name: 'NotFoundError' });
            return { getFile: async () => ({ text: async () => files.get(path) }), createWritable: async () => {
                if (path.includes(failWrite) && failWrite) throw new Error('Permission denied');
                let staged;
                return { write: async text => { staged = text; }, close: async () => files.set(path, staged), abort: async () => {} };
            } };
        },
        async getDirectoryHandle(name) { return directory(files, prefix + name + '/', failWrite); }
    };
}
function downloader() {
    const context = vm.createContext({ crypto: webcrypto, Vault: { validateFullState: value => {
        if (!value?.user || !Array.isArray(value.quests)) throw new Error('Invalid save');
    } } });
    vm.runInContext(readFileSync('src/features/settings/local-cloud-download.js', 'utf8') + '\nglobalThis.download = LocalCloudDownload;', context);
    return context.download;
}
test('cloud download uses exact project path and backs up the original before replacement', async () => {
    const files = new Map([['package.json', '{"name":"bizzybee-app"}'], ['src/core/data.personal.json', 'old-local-data']]);
    await downloader().saveToProject(directory(files), { data: JSON.stringify(sample()) });
    const installed = JSON.parse(files.get('src/core/data.personal.json'));
    assert.equal(installed.quests[0].tasks[0].xp, 75);
    assert.equal(installed.profilePhoto, 'photo-data');
    assert.equal(installed.blueprintSource, 'personal');
    assert.ok(installed._localCloudTransfer.id);
    const backup = [...files.keys()].find(key => key.startsWith('src/core/local-save-backups/'));
    assert.equal(files.get(backup), 'old-local-data');
});
test('wrong project and invalid cloud saves never overwrite a local file', async () => {
    const files = new Map([['package.json', '{"name":"other"}'], ['src/core/data.personal.json', 'original']]);
    await assert.rejects(downloader().saveToProject(directory(files), { data: JSON.stringify(sample()) }));
    files.set('package.json', '{"name":"bizzybee-app"}');
    await assert.rejects(downloader().saveToProject(directory(files), { data: '{}' }));
    assert.equal(files.get('src/core/data.personal.json'), 'original');
    assert.equal(files.size, 2);
});
test('failed disk backup prevents local file replacement', async () => {
    const files = new Map([['package.json', '{"name":"bizzybee-app"}'], ['src/core/data.personal.json', 'original']]);
    await assert.rejects(downloader().saveToProject(directory(files, '', 'local-save-backups'), { data: JSON.stringify(sample()) }));
    assert.equal(files.get('src/core/data.personal.json'), 'original');
});
function vaultHarness(hostname = 'localhost') {
    const values = new Map([['bizzybee_user_data', JSON.stringify(sample())]]);
    const state = sample(); state.user.name = 'Downloaded'; state._localCloudTransfer = { id: 'transfer-1' };
    let reads = 0;
    const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    const context = vm.createContext({ localStorage, Event, console: { log() {}, error() {} },
        window: { location: { hostname, pathname: '/src/features/home/home.html' }, dispatchEvent() {} },
        fetch: async () => { reads++; return { ok: true, json: async () => structuredClone(state) }; } });
    vm.runInContext(readFileSync('src/core/db.js', 'utf8') + '\nglobalThis.vault = Vault;', context);
    return { vault: context.vault, values, reads: () => reads };
}
test('localhost applies downloaded full save once and preserves subsequent local edits', async () => {
    const h = vaultHarness(); await h.vault.refreshLocalCloudDownload();
    assert.equal(JSON.parse(h.values.get('bizzybee_user_data')).user.name, 'Downloaded');
    assert.equal(h.vault.getLocalBackups().length, 1);
    const edited = JSON.parse(h.values.get('bizzybee_user_data')); edited.user.name = 'Local edit';
    h.values.set('bizzybee_user_data', JSON.stringify(edited));
    await h.vault.refreshLocalCloudDownload();
    assert.equal(JSON.parse(h.values.get('bizzybee_user_data')).user.name, 'Local edit');
    assert.equal(h.vault.getLocalBackups().length, 1);
});
test('live sites and Identity sessions never auto-import development files', async () => {
    const live = vaultHarness('bizzybeee.netlify.app'); await live.vault.refreshLocalCloudDownload();
    assert.equal(live.reads(), 0);
    const local = vaultHarness(); local.values.set('bizzybee_session', 'identity');
    await local.vault.refreshLocalCloudDownload(); assert.equal(local.reads(), 0);
});
