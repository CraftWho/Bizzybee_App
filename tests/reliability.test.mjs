import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomBytes } from 'node:crypto';
import { encryptSave, decryptSave } from '../netlify/lib/save-crypto.mjs';

const stores = new Map();
let etag = 0;
function store(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return {
        async get(key) { return structuredClone(data.get(key)?.data ?? null); },
        async getWithMetadata(key) { return structuredClone(data.get(key) ?? null); },
        async setJSON(key, value, options = {}) {
            if (options.onlyIfNew && data.has(key) || options.onlyIfMatch && options.onlyIfMatch !== data.get(key)?.etag) return { modified: false };
            const revision = 'r' + ++etag;
            data.set(key, { data: structuredClone(value), etag: revision });
            return { modified: true, etag: revision };
        },
        list(options = {}) {
            const blobs = [...data.keys()].filter(key => key.startsWith(options.prefix || '')).map(key => ({ key }));
            if (options.paginate) return (async function* () { yield { blobs }; })();
            return Promise.resolve({ blobs });
        },
        async delete(key) { data.delete(key); }
    };
}
mock.module('@netlify/blobs', { namedExports: { getStore: ({ name }) => store(name) } });
const save = (await import('../netlify/functions/save-state.mjs')).default;
const load = (await import('../netlify/functions/load-state.mjs')).default;
const backup = (await import('../netlify/functions/backups.mjs')).default;
const scheduled = (await import('../netlify/functions/scheduled-backups.mjs')).default;
const cloud = await import('../netlify/lib/cloud-store.mjs');
const sample = () => JSON.stringify({ schemaVersion: 8, user: { name: 'Test Bee' }, quests: [{ id: 'q', tasks: [{ id: 't', xp: 5, completed: true }] }], profilePhoto: 'data:image/jpeg;base64,TESTPHOTO' });
const req = (path, body, user = 'alice') => new Request('https://test.netlify.app/.netlify/functions/' + path, { method: body ? 'POST' : 'GET', headers: user ? { Authorization: `Bearer ${user}` } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => {
    stores.clear(); etag = 0;
    process.env.BIZZYBEE_SAVE_KEY = randomBytes(32).toString('hex');
    globalThis.fetch = async (url, options) => {
        assert.equal(new URL(url).pathname, '/.netlify/identity/user');
        return Response.json({ id: options.headers.Authorization.slice(7) });
    };
});

test('encryption round-trips photos, hides plaintext, randomizes ciphertext and binds account', () => {
    const encrypted = encryptSave(sample(), 'alice');
    assert.equal(decryptSave(encrypted, 'alice'), sample());
    assert.ok(!JSON.stringify(encrypted).includes('TESTPHOTO'));
    assert.notEqual(encrypted.ciphertext, encryptSave(sample(), 'alice').ciphertext);
    assert.throws(() => decryptSave(encrypted, 'bob'));
    assert.throws(() => decryptSave({ ...encrypted, tag: randomBytes(16).toString('base64') }, 'alice'));
});
test('missing encryption key fails closed without writing a save', async () => {
    delete process.env.BIZZYBEE_SAVE_KEY;
    assert.equal((await save(req('save-state', { data: sample(), revision: null }))).status, 503);
    assert.equal(await store('bizzybee-saves').get('alice'), null);
});
test('save/load round-trip is encrypted at rest and revision checked', async () => {
    const result = await (await save(req('save-state', { data: sample(), revision: null }))).json();
    assert.equal(result.ok, true);
    assert.equal((await store('bizzybee-saves').get('alice')).data, undefined);
    const loaded = await (await load(req('load-state'))).json();
    assert.equal(loaded.data, sample());
    assert.equal(loaded.revision, result.revision);
    assert.equal((await save(req('save-state', { data: sample(), revision: null }))).status, 409);
});
test('unauthenticated access fails and accounts cannot read each other', async () => {
    await save(req('save-state', { data: sample(), revision: null }));
    for (const handler of [load, backup]) assert.equal((await handler(req('load-state', null, null))).status, 401);
    assert.equal((await save(req('save-state', { data: sample() }, null))).status, 401);
    assert.equal((await (await load(req('load-state', null, 'bob'))).json()).data, null);
});
test('malformed or oversized saves do not change cloud progress', async () => {
    for (const data of ['{bad', '{}', JSON.stringify({ user: [], quests: [] }), 'x'.repeat(4 * 1024 * 1024 + 1)]) {
        assert.equal((await save(req('save-state', { data, revision: null }))).status, 400);
    }
    assert.equal(await store('bizzybee-saves').get('alice'), null);
});
test('legacy save upgrade preserves an encrypted recovery backup', async () => {
    await store('bizzybee-saves').setJSON('alice', { data: sample(), updatedAt: new Date().toISOString() });
    const current = await cloud.readLatest('alice');
    const response = await save(req('save-state', { data: sample(), revision: current.etag }));
    assert.equal(response.status, 200);
    const items = await cloud.listBackups('alice');
    assert.equal(items.length, 1);
    const recovery = await backup(req('backups?id=' + items[0].id));
    assert.equal((await recovery.json()).data, sample());
    assert.equal((await backup(req('backups?id=' + items[0].id, null, 'bob'))).status, 404);
});
test('backup schedule accepts exactly 4, 8, 12 and 24 hours', async () => {
    for (const hours of [4, 8, 12, 24]) {
        assert.equal((await backup(req('backups', { action: 'schedule', hours }))).status, 200);
        assert.equal((await store('bizzybee-backup-schedules').get('alice')).hours, hours);
    }
    assert.equal((await backup(req('backups', { action: 'schedule', hours: 3 }))).status, 400);
});
test('server scheduler backs up without an open client and is idempotent', async () => {
    await save(req('save-state', { data: sample(), revision: null }));
    await store('bizzybee-backup-schedules').setJSON('alice', { hours: 4, startsAt: Date.now() - 5 * 3600000 });
    await scheduled(); await scheduled();
    assert.equal((await cloud.listBackups('alice')).length, 1);
});
test('backup retention keeps the latest 30 snapshots', async () => {
    const entry = { data: sample(), updatedAt: new Date().toISOString() };
    for (let i = 0; i < 33; i++) await cloud.createBackup('alice', entry, 'manual', `${1700000000000 + i}-test`);
    const entries = await cloud.listBackups('alice');
    assert.equal(entries.length, 30);
    assert.equal(entries[0].id, '1700000000032-test');
});

function vaultHarness(raw = sample()) {
    const data = new Map(raw ? [['bizzybee_user_data', raw]] : []);
    let failKey = null;
    const localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => {
        if (key === failKey) throw new Error('Quota exceeded'); data.set(key, String(value));
    }, removeItem: key => data.delete(key) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} },
        fetch: async () => ({ ok: true, json: async () => JSON.parse(sample()) }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', context);
    return { vault: context.vault, data, context, fail: key => { failKey = key; } };
}
test('old schema preserves progress and takes a recovery copy', async () => {
    const old = JSON.parse(sample()); old.schemaVersion = 6;
    const h = vaultHarness(JSON.stringify(old)); await h.vault.init();
    assert.equal(h.vault.state.quests[0].tasks[0].completed, true);
    assert.equal(h.vault.state.profilePhoto, old.profilePhoto);
    assert.equal(h.vault.getLocalBackups().length, 1);
});
test('schema 7 save with "dp" points is converted to "xp" (DP to XP rename)', async () => {
    const old = JSON.parse(sample()); old.schemaVersion = 7;
    const task = old.quests[0].tasks[0]; task.dp = task.xp; delete task.xp;
    old.habits = [{ id: 'h', label: 'Walk', dp: 20, history: [] }];
    old.dailyTasks = [{ id: 'd', label: 'Read', dp: 10 }];
    old.todos = [{ id: 'o', label: 'Call', dp: 30 }];
    const h = vaultHarness(JSON.stringify(old)); await h.vault.init();
    const st = h.vault.state;
    assert.equal(st.quests[0].tasks[0].xp, 5);
    assert.equal(st.habits[0].xp, 20);
    assert.equal(st.dailyTasks[0].xp, 10);
    assert.equal(st.todos[0].xp, 30);
    assert.ok(!JSON.stringify(st).includes('"dp"'));
    assert.equal(st.schemaVersion, 8);
    // The untouched original is kept as a recovery copy.
    assert.ok(h.vault.getLocalBackups()[0].data.includes('"dp":20'));
});
test('importing an old "dp" save file converts it to "xp"', () => {
    const h = vaultHarness();
    const old = JSON.parse(sample()); old.schemaVersion = 7;
    const task = old.quests[0].tasks[0]; task.dp = task.xp; delete task.xp;
    assert.equal(h.vault.importFullState(JSON.stringify(old)).ok, true);
    assert.equal(h.vault.state.quests[0].tasks[0].xp, 5);
    assert.ok(!('dp' in h.vault.state.quests[0].tasks[0]));
});
test('server accepts both new "xp" saves and old "dp" saves', async () => {
    assert.equal((await save(req('save-state', { data: sample(), revision: null }))).status, 200);
    const old = JSON.parse(sample()); const task = old.quests[0].tasks[0]; task.dp = task.xp; delete task.xp;
    assert.equal((await save(req('save-state', { data: JSON.stringify(old), revision: null }, 'bob'))).status, 200);
    const bad = JSON.parse(sample()); delete bad.quests[0].tasks[0].xp;
    assert.notEqual((await save(req('save-state', { data: JSON.stringify(bad), revision: null }, 'carol'))).status, 200);
});
test('corrupt JSON is retained and future schemas are rejected', async () => {
    const h = vaultHarness('{broken'); await assert.rejects(h.vault.init());
    assert.equal(h.data.get('bizzybee_user_data'), '{broken');
    const future = JSON.parse(sample()); future.schemaVersion = 99;
    assert.equal(h.vault.importFullState(JSON.stringify(future)).ok, false);
    assert.equal(h.data.get('bizzybee_user_data'), '{broken');
});
test('invalid nested data is rejected before replacing local progress', () => {
    const h = vaultHarness();
    const bad = JSON.parse(sample()); bad.quests[0].tasks = 'bad';
    assert.equal(h.vault.importFullState(JSON.stringify(bad)).ok, false);
    assert.equal(h.data.get('bizzybee_user_data'), sample());
});
test('import preserves photo and creates a recoverable previous copy', () => {
    const h = vaultHarness(); const next = JSON.parse(sample()); next.user.name = 'Updated';
    assert.equal(h.vault.importFullState(JSON.stringify(next)).ok, true);
    assert.equal(h.vault.state.profilePhoto, next.profilePhoto);
    assert.equal(h.vault.getLocalBackups()[0].data, sample());
    assert.equal(h.data.get('bizzybee_user_data:dirty'), 'true');
});
test('backup storage failure aborts import without changing active data', () => {
    const h = vaultHarness(); h.fail('bizzybee_user_data:backups');
    assert.equal(h.vault.importFullState(sample()).ok, false);
    assert.equal(h.data.get('bizzybee_user_data'), sample());
});
test('primary storage failure retains the existing persisted save', () => {
    const h = vaultHarness(); h.vault.state = JSON.parse(sample()); h.vault.state.user.name = 'Changed';
    h.fail('bizzybee_user_data'); assert.throws(() => h.vault.save());
    assert.equal(h.data.get('bizzybee_user_data'), sample());
});

test('JSON null or false is not mistaken for a new installation', async () => {
    for (const raw of ['null', 'false', '0']) {
        const h = vaultHarness(raw); await assert.rejects(h.vault.init());
        assert.equal(h.data.get('bizzybee_user_data'), raw);
    }
});
test('concurrent initialization shares one blueprint fetch', async () => {
    const h = vaultHarness(null); let count = 0;
    h.context.fetch = async () => { count++; await new Promise(resolve => setImmediate(resolve)); return { ok: true, json: async () => JSON.parse(sample()) }; };
    await Promise.all([h.vault.init(), h.vault.init(), h.vault.init()]);
    assert.equal(count, 1);
});
test('failed reset keeps original progress and its recovery copy', async () => {
    const h = vaultHarness(); await h.vault.init();
    const before = h.vault.exportFullState();
    h.context.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(h.vault.forceReset());
    assert.equal(h.vault.exportFullState(), before);
    // (init may also keep a one-time "Before time-based XP" copy)
    assert.equal(h.vault.getLocalBackups().filter(b => b.reason === 'Before reset').length, 1);
});
test('failed cloud import preserves the pre-existing pending-upload marker', () => {
    const h = vaultHarness(); h.data.set('bizzybee_user_data:dirty', 'true'); h.fail('bizzybee_user_data');
    assert.equal(h.vault.importFullState(sample(), { fromCloud: true }).ok, false);
    assert.equal(h.data.get('bizzybee_user_data:dirty'), 'true');
});
test('a rejected Identity token cannot read a cloud save', async () => {
    globalThis.fetch = async () => new Response('', { status: 401 });
    assert.equal((await load(req('load-state', null, 'invalid'))).status, 401);
});

// ---- time-based XP (Oct 2026) ----
test('time XP: minutes from titles, effort and the 10,000-hour level curve', async () => {
    const h = vaultHarness(); await h.vault.init();
    const g = (code) => vm.runInContext(code, h.context);
    assert.equal(g('minutesFromText("Scrimba study for 20 minutes")'), 20);
    assert.equal(g('minutesFromText("Study for 2 hours a day!")'), 120);
    assert.equal(g('minutesFromText("HTML MASTER")'), null);
    assert.equal(g('xpForMinutes(30, "Hard")'), 45);
    assert.ok(g('xpForMinutes(3, "Trivial")') < g('xpForMinutes(15, "Easy")'));
    assert.equal(g('computeLevelProgress(1200).level'), 5);          // 20 h -> level 5
    assert.equal(g('computeLevelProgress(60 * 9900).level'), 100);   // ~10,000 h -> level 100
});
test('time XP: logged minutes change a completion, history counts, level never jumps on its own', async () => {
    const old = JSON.parse(sample());
    old.characterLevelBar = { acknowledgedLevel: 3 };
    old.quests[0].tasks.push({ id: 'h', label: 'Old Codex lesson', xp: 0, historyXP: 600, completed: true });
    old.dailyTasks = [{ id: 'd', label: 'Read for 10 minutes', difficulty: 'Easy', completedDates: [new Date().toISOString().slice(0, 10)] }];
    const h = vaultHarness(JSON.stringify(old)); await h.vault.init();
    const xp0 = h.vault.getUser().totalXP;
    assert.ok(xp0 >= 600 + 10);
    h.vault.logCompletionMinutes('daily', 'd', 40);
    assert.equal(h.vault.getUser().totalXP, xp0 + 30);
    assert.equal(h.vault.getCharacterLevelBar().level, Math.min(3, h.vault.getUser().level));
    h.vault._ensureTimeXP();   // runs once only
    assert.equal(h.vault.state.timeXPVersion, 1);
});
test('gacha: the 6th pull without a Rare is a guaranteed Rare or better; Named Beast costs 10 tickets', async () => {
    const h = vaultHarness(); await h.vault.init();
    vm.runInContext('Math.random = () => 0.01', h.context);   // always Common
    h.vault.state.colony = { bees: [], tickets: 12, pity: 0 };
    const pulls = Array.from({ length: 6 }, () => h.vault.pullWithTicket());
    assert.deepEqual(pulls.map(p => p.bee.rarity !== 'Common'), [false, false, false, false, false, true]);
    assert.equal(h.vault.unwrapTicket(), null);   // 6 left, not enough
    h.vault.state.colony.tickets = 10;
    assert.equal(h.vault.unwrapTicket().rarity, 'Named');
    assert.equal(h.vault.getTicketCount(), 0);
});
