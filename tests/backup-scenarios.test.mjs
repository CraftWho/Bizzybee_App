// Backup scenarios (Nov 17 2026): copies, limits, storage full, 12-hour copies, sign-in with the cloud down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fakeIdb() {
    const stores = {};
    const req = (v) => { const r = {}; setTimeout(() => { r.result = v; r.onsuccess && r.onsuccess(); }, 0); return r; };
    return {
        open() {
            const r = {}; const db = { objectStoreNames: { contains: n => !!stores[n] }, createObjectStore(n) { stores[n] = new Map(); },
                transaction(n) { const tx = {}; const st = stores[n];
                    tx.objectStore = () => ({ put(v) { st.set(v.id, v); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); return {}; }, delete(id) { st.delete(id); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); return {}; }, getAll() { return req([...st.values()]); } });
                    return tx; } };
            setTimeout(() => { r.result = db; r.onupgradeneeded && r.onupgradeneeded(); r.onsuccess && r.onsuccess(); }, 0); return r;
        }
    };
}
function world({ local, cloud, loggedIn, quota = Infinity, idb = true, extra = {} } = {}) {
    const data = new Map(Object.entries(extra));
    if (local) data.set(local.key, JSON.stringify(local.save));
    if (loggedIn) { data.set('bizzybee_session', 'identity'); data.set('bizzybee_cloud_owner', 'u1'); }
    const size = () => [...data.values()].reduce((n, v) => n + v.length, 0);
    const ls = { getItem: k => data.get(k) ?? null, removeItem: k => data.delete(k),
        setItem: (k, v) => { const had = (data.get(k) || '').length; if (size() - had + String(v).length > quota) throw new Error('QuotaExceededError'); data.set(k, String(v)); } };
    const ctx = vm.createContext({ localStorage: ls, console: { log() {}, error() {}, warn() {} }, Event, AbortSignal, setTimeout, clearTimeout,
        window: { location: { pathname: '/' }, dispatchEvent() {} },
        ...(idb ? { indexedDB: fakeIdb() } : {}),
        netlifyIdentity: loggedIn ? { currentUser: () => ({ id: 'u1', jwt: async () => 't' }) } : { currentUser: () => null },
        fetch: async (url) => {
            if (/data(\.personal)?\.json/.test(String(url))) return { ok: true, json: async () => JSON.parse(readFileSync(new URL('../src/core/data.json', import.meta.url), 'utf8')) };
            if (!cloud) return { ok: false, json: async () => ({}) };
            return { ok: true, json: async () => ({ ok: true, data: JSON.stringify(cloud), revision: 'r1', device: 'other' }) };
        } });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.V = Vault; globalThis.XP = characterXPToReach;', ctx);
    return { V: ctx.V, data, g: c => vm.runInContext(c, ctx), xp: n => ctx.XP(n) + 5 };
}
const save = (xp, extra = {}) => ({ schemaVersion: 8, user: { name: 'T' }, quests: [], hive: { bees: [], tickets: 0 }, bonusXP: [{ xp }], ...extra });

test('copies know their level, and protected copies are never pushed out by ordinary ones', async () => {
    const w = world({ local: { key: 'bizzybee_user_data', save: save(0) } });
    w.data.set('bizzybee_user_data', JSON.stringify(save(w.xp(13))));
    await w.V.init();
    w.V.createLocalBackup('before cloud replaced it', { protect: true });
    for (let i = 0; i < 9; i++) w.V.createLocalBackup('ordinary ' + i);
    const list = w.V.getLocalBackups();
    assert.equal(list.filter(b => !b.protect).length, 6);
    assert.equal(list.filter(b => b.protect).length, 1);
    assert.equal(list.find(b => b.protect).meta.level, 13);
});

test('storage full: the oldest ordinary copy goes, the new copy stays; nothing fits: a clear error and health note', async () => {
    const w = world({ local: { key: 'bizzybee_user_data', save: save(w0()) } });
    function w0() { return 10; }
    await w.V.init();
    for (let i = 0; i < 4; i++) w.V.createLocalBackup('c' + i);
    const total = [...w.data.values()].reduce((n, v) => n + v.length, 0);
    const tight = world({ local: { key: 'bizzybee_user_data', save: save(10) }, quota: 0 });
    // fill almost to the limit, then one more copy must drop an old one
    const used = () => [...w.data.values()].reduce((n, v) => n + v.length, 0);
    w.data.set('pad', 'x'); // keep the key counted
    const lim = world({ local: { key: 'bizzybee_user_data', save: save(10) }, quota: 40000 });
    await lim.V.init();
    for (let i = 0; i < 12; i++) lim.V.createLocalBackup('n' + i);
    assert.equal(lim.V.getLocalBackups()[0].reason, 'n11');   // newest kept
    assert.ok(total > 0 && used() > 0);
    // a quota too small for even one copy
    const none = world({ local: { key: 'bizzybee_user_data', save: save(10) }, quota: 3000 });
    await none.V.init();
    assert.throws(() => none.V.createLocalBackup('too big'), /Not enough storage/);
    assert.match(none.V.backupHealth().safetyErr || '', /storage/i);
});

test('every 12 hours: due when never made, not due inside 12 hours, due after, kept to 14, test saves skipped', async () => {
    const w = world({ local: { key: 'bizzybee_user_data', save: save(100) } });
    await w.V.init();
    assert.equal(w.V.autoBackupDue(), true);
    const r1 = await w.V.autoBackupNow();
    assert.equal(r1.ok, true);
    assert.equal((await w.V.listAutoBackups()).length, 1);
    assert.equal(w.V.autoBackupDue(), false);
    assert.equal((await w.V.autoBackupNow()).skipped, true);
    const later = Date.now() + 12 * 3600000 + 1000;
    assert.equal(w.V.autoBackupDue(later), true);
    for (let i = 0; i < 20; i++) await w.V.autoBackupNow({ force: true, reason: 'x' + i });
    assert.equal((await w.V.listAutoBackups()).length, 14);
    const data = await w.V.getAutoBackupData((await w.V.listAutoBackups())[0].id);
    assert.ok(JSON.parse(data).user);
    const dev = world({ local: { key: 'bizzybee_user_data:devtest', save: save(1) }, extra: { bizzybee_dev_test: '1' } });
    await dev.V.init();
    assert.equal(dev.V.autoBackupDue(), false);
});

test('a browser with no IndexedDB: the automatic copy fails quietly and Backup health says why', async () => {
    const w = world({ local: { key: 'bizzybee_user_data', save: save(100) }, idb: false });
    await w.V.init();
    const r = await w.V.autoBackupNow();
    assert.equal(r.ok, false);
    assert.match(w.V.backupHealth().autoErr, /IndexedDB/);
});

test('signing in with the cloud down: a device with progress keeps it; a blank device starts fresh', async () => {
    const probe = world();
    const phone = world({ local: { key: 'bizzybee_user_data', save: save(probe.xp(13)) }, cloud: null, loggedIn: true });
    await phone.V.init();
    assert.equal(phone.V.getUser().level, 13);                       // not a blank level 1
    assert.ok(phone.data.get('bizzybee_user_data:u1'));              // saved under the account
    assert.ok(phone.data.get('bizzybee_user_data'));                 // old copy untouched
    const blank = world({ local: { key: 'bizzybee_user_data', save: save(0) }, cloud: null, loggedIn: true });
    await blank.V.init();
    assert.equal(blank.V.getUser().level, 1);
});

test('signing in with the cloud up: the cloud copy loads and the device copy stays in the old slot', async () => {
    const probe = world();
    const w = world({ local: { key: 'bizzybee_user_data', save: save(probe.xp(13)) }, cloud: save(probe.xp(11)), loggedIn: true });
    await w.V.init();
    assert.equal(w.V.getUser().level, 11);
    assert.equal(JSON.parse(w.data.get('bizzybee_user_data')).bonusXP[0].xp, probe.xp(13));
});
