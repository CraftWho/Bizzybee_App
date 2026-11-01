import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tick = () => new Promise(resolve => setImmediate(resolve));
const fixture = () => ({ schemaVersion: 8, user: { name: 'Bee' }, quests: [], profilePhoto: 'photo-data' });
async function harness({ dirty = false, revision = 'r1', remoteRevision = 'r1', remote = fixture(), auto = true, failLoad = false, merge = false, remoteDevice = null } = {}) {
    const key = 'bizzybee_user_data:alice';
    const state = fixture();
    const data = new Map([['bizzybee_session', 'identity'], ['bizzybee_cloud_owner', 'alice'], [key, JSON.stringify(state)],
        [key + ':dirty', String(dirty)], [key + ':revision', JSON.stringify(revision)], ['bizzybee_auto_sync', String(auto)]]);
    const localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
    const window = new EventTarget(); window.location = { reload() { h.reloaded++; } };
    const document = new EventTarget(); document.visibilityState = 'visible'; document.getElementById = () => null;
    const timers = []; const intervals = [];
    const user = { id: 'alice', jwt: async () => 'token' };
    const Vault = { storageKey: key, state, init: async () => {}, exportFullState: () => JSON.stringify(Vault.state, null, 2),
        importFullState(value) { h.imports++; Vault.state = JSON.parse(value); data.set(key, JSON.stringify(Vault.state)); data.set(key + ':dirty', 'false'); return { ok: true }; },
        validateFullState() {}, createLocalBackup() {} };
    const h = { data, key, timers, intervals, Vault, imports: 0, reloaded: 0, posts: [],
        respond: async () => ({ ok: true, revision: 'r2', updatedAt: new Date().toISOString() }),
        edit() { Vault.state.user.name += '!'; data.set(key, JSON.stringify(Vault.state)); data.set(key + ':dirty', 'true'); window.dispatchEvent(new Event('vault-saved')); } };
    const context = vm.createContext({ localStorage, window, document, Vault, Event, CustomEvent, AbortSignal,
        setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => { if (id) timers[id - 1] = null; }, setInterval: fn => intervals.push(fn),
        netlifyIdentity: { currentUser: () => user, init() {}, on() {} },
        fetch: async (url, options) => {
            if (options.method === 'GET') {
                if (failLoad) throw new Error('offline');
                return { ok: true, json: async () => ({ ok: true, data: remote ? JSON.stringify(remote) : null, revision: remoteRevision, encrypted: true, device: remoteDevice }) };
            }
            h.posts.push(JSON.parse(options.body));
            const result = await h.respond();
            return { ok: result.ok, status: result.ok ? 200 : (result.status || 409), json: async () => result };
        } });
    if (merge) { const db = readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8'); vm.runInContext(db.slice(db.indexOf('const MERGE_LISTS'), db.indexOf('const Vault = new DatabaseManager()')) + '\nglobalThis.mergeSaves = mergeSaves;', context); }
    vm.runInContext(readFileSync(new URL('../src/core/services/cloud-sync/cloud-sync.js', import.meta.url), 'utf8') + '\nglobalThis.engine = CloudSyncAuto;', context);
    h.engine = context.engine;
    await tick(); await tick();
    return h;
}
test('pending uploads survive navigation and start automatically', async () => {
    const h = await harness({ dirty: true });
    assert.ok(h.timers.some(Boolean));
    await h.timers.find(Boolean)(); await tick();
    assert.equal(h.posts.length, 1);
    assert.equal(h.data.get(h.key + ':dirty'), 'false');
});
test('an edit during upload remains pending and uploads next', async () => {
    const h = await harness({ dirty: true }); let release;
    h.respond = () => new Promise(resolve => { release = resolve; });
    const first = h.engine.pushNow(); await tick();
    assert.equal(await h.engine.pushNow(), false); // No concurrent requests.
    h.edit(); release({ ok: true, revision: 'r2' }); await first;
    assert.equal(h.data.get(h.key + ':dirty'), 'true');
    h.respond = async () => ({ ok: true, revision: 'r3' });
    assert.equal(await h.engine.pushNow(), true);
    assert.equal(h.data.get(h.key + ':dirty'), 'false');
    assert.equal(h.posts[1].revision, 'r2');
    assert.equal(JSON.parse(h.posts[1].data).user.name, 'Bee!');
});
test('automatic uploads stay off even if a timer was already scheduled', async () => {
    const h = await harness({ dirty: true });
    h.data.set('bizzybee_auto_sync', 'false'); h.timers.find(Boolean)(); await tick();
    assert.equal(h.posts.length, 0);
    assert.equal(h.data.get(h.key + ':dirty'), 'true');
});
// Oct 31 2026 (Craft): one active device at a time replaced save merge.
test('new device loads cloud progress instead of overwriting it, then takes over', async () => {
    const remote = fixture(); remote.user.name = 'Cloud Bee';
    const h = await harness({ revision: null, dirty: true, remote });
    assert.equal(h.imports, 1); assert.equal(h.reloaded, 1);
    assert.equal(h.posts.length, 1); assert.equal(h.posts[0].takeover, true);
    assert.equal(JSON.parse(h.posts[0].data).user.name, 'Cloud Bee');
    assert.equal(h.Vault.state.user.name, 'Cloud Bee');
});
test('opening on this device after another device saved: cloud copy wins, never merged', async () => {
    const remote = fixture(); remote.quests = [{ id: 'q1', name: 'Cloud quest' }];
    const h = await harness({ dirty: true, remoteRevision: 'r9', remote, remoteDevice: 'phone' });
    assert.equal(h.imports, 1); assert.equal(h.posts.length, 1);
    assert.equal(h.posts[0].revision, 'r9'); assert.equal(h.posts[0].takeover, true); assert.notEqual(h.posts[0].preservePrevious, true);
    assert.equal(JSON.parse(h.posts[0].data).quests[0].name, 'Cloud quest');
    assert.equal(h.data.get(h.key + ':dirty'), 'false');
});
test('another device took over: saves stop here and nothing is overwritten', async () => {
    const h = await harness({ dirty: true });
    h.respond = async () => ({ ok: false, status: 423, code: 'other-device', error: 'Active on another device.' });
    assert.equal(await h.engine.pushNow(), false);
    assert.equal(h.engine.isInactive(), true);
    assert.equal(await h.engine.pushNow(), false);
    assert.equal(h.posts.length, 1);
    assert.equal(h.data.get(h.key + ':dirty'), 'true');
});
test('server conflict leaves pending changes intact', async () => {
    const h = await harness({ dirty: true });
    h.respond = async () => ({ ok: false, error: 'Cloud changed' });
    assert.equal(await h.engine.pushNow(), false);
    assert.equal(h.data.get(h.key + ':dirty'), 'true');
    assert.equal(h.posts.length, 2);   // one retry with the fresh revision, then stop
});
test('failed startup never pushes a device copy before checking cloud', async () => {
    const h = await harness({ dirty: true, failLoad: true });
    assert.equal(await h.engine.pushNow(), false); assert.equal(h.posts.length, 0);
    assert.equal(h.data.get(h.key + ':dirty'), 'true');
});
test('account switch cannot upload the previous account’s state', async () => {
    const h = await harness({ dirty: true }); h.data.set('bizzybee_cloud_owner', 'bob');
    assert.equal(await h.engine.pushNow(), false); assert.equal(h.posts.length, 0);
});
test('photo-sized uploads use normal fetch rather than an exit-time keepalive', async () => {
    const h = await harness({ dirty: true }); h.Vault.state.profilePhoto = 'p'.repeat(200000); h.edit();
    await h.engine.pushNow(); assert.equal(JSON.parse(h.posts[0].data).profilePhoto.length, 200000);
});

test('password reset: verifies the recovery token first, and stops if it expired', async () => {
    const recovery = (fetch) => { const c = vm.createContext({ AbortSignal, fetch }); vm.runInContext(readFileSync(new URL('../src/core/login/account-recovery.js', import.meta.url), 'utf8') + '\nglobalThis.recovery = AccountRecovery;', c); return c.recovery; };
    const calls = [];
    await recovery(async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ access_token: 'recovery-access' }) }; }).reset('email-token', 'a-long-new-password');
    assert.equal(calls[0].url, '/.netlify/identity/verify');
    assert.deepEqual(JSON.parse(calls[0].options.body), { type: 'recovery', token: 'email-token' });
    assert.equal(calls[1].options.headers.Authorization, 'Bearer recovery-access');
    assert.equal(calls[1].url, '/.netlify/identity/user');
    let count = 0;
    await assert.rejects(recovery(async () => { count++; return { ok: false }; }).reset('expired', 'long-password'));
    assert.equal(count, 1);
});
