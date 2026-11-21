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

test('one safety copy: it knows its level and the newest replaces the old one', async () => {
    const w = world({ local: { key: 'bizzybee_user_data', save: save(0) } });
    w.data.set('bizzybee_user_data', JSON.stringify(save(w.xp(13))));
    await w.V.init();
    for (let i = 0; i < 5; i++) w.V.createLocalBackup('step ' + i);
    const list = w.V.getLocalBackups();
    assert.equal(list.length, 1);
    assert.equal(list[0].reason, 'step 4');
    assert.equal(list[0].meta.level, 13);
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

test('backups: made on demand, last 3 kept, labels carry level/XP/device, test saves skipped', async () => {
    const w = world({ local: { key: 'bizzybee_user_data', save: save(100) } });
    await w.V.init();
    assert.equal(w.V.autoBackupDue(), false);                // no timed copies any more
    for (let i = 0; i < 5; i++) assert.equal((await w.V.savePoint('backup', 'mine ' + i)).ok, true);
    const all = await w.V.listAutoBackups();
    assert.deepEqual(all.map(c => c.reason), ['mine 4', 'mine 3', 'mine 2']);
    assert.equal(typeof all[0].meta.level, 'number');
    assert.ok(all[0].meta.device);
    assert.ok(JSON.parse(await w.V.getAutoBackupData(all[0].id)).user);
    const dev = world({ local: { key: 'bizzybee_user_data:devtest', save: save(1) }, extra: { bizzybee_dev_test: '1' } });
    await dev.V.init();
    assert.equal((await dev.V.savePoint('backup')).ok, false);
});

test('a browser with no IndexedDB: the automatic copy fails quietly and Backup health says why', async () => {
    const w = world({ local: { key: 'bizzybee_user_data', save: save(100) }, idb: false });
    await w.V.init();
    const r = await w.V.savePoint('backup');
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

test('change log: plain-words entries, and going back undoes later changes (and is logged)', async () => {
    const w = world({ local: { key: 'bizzybee_user_data', save: save(100, { quests: [{ id: 'q1', title: 'Learn JS', tasks: [{ id: 't1', title: 'Read ch 1', completed: false, xp: 10 }] }] }) } });
    await w.V.init();
    w.V._jPrev = JSON.parse(JSON.stringify(w.V.state)); w.V._jStarted = true;
    w.V.state.quests.push({ id: 'q2', title: 'Walk more', tasks: [] });
    const e1 = await w.V.journalFlush();
    assert.ok(e1.sum.some(t => /Added quest 'Walk more'/.test(t)), e1.sum.join(' | '));
    w.V.state.quests[0].tasks[0].completed = true;
    w.V.state.bonusXP.push({ key: 'x', xp: 50 });
    const e2 = await w.V.journalFlush({ src: 'claude' });
    assert.ok(e2.sum.some(t => /Completed 'Read ch 1'/.test(t)), e2.sum.join(' | '));
    assert.ok(e2.sum.some(t => /\+60 XP/.test(t)), e2.sum.join(' | '));
    assert.equal(e2.src, 'claude');
    assert.equal(await w.V.journalFlush(), null);                     // nothing changed: no entry
    const r = await w.V.journalGoBack(e1.id);
    assert.equal(r.ok, true);
    assert.equal(w.V.state.quests.length, 2);                        // q2 stays (it was added at e1)
    assert.equal(w.V.state.quests[0].tasks[0].completed, false);     // later change undone
    assert.equal(w.V.state.bonusXP.length, 1);
    const list = await w.V.journalList();
    assert.equal(list[0].src, 'restore');
    assert.equal(w.V.getLocalBackups()[0].reason, 'Before going back in the change log');
});

test('changes from outside: Claude ops add/complete/habit by name, PC diff accepted on top of this save', async () => {
    const w = world({ local: { key: 'bizzybee_user_data', save: save(100, { dailyTasks: [{ id: 'd1', label: 'Gym', xp: 15, difficulty: 'Easy', completedDates: [] }], todos: [{ id: 't1', label: 'Call mom', xp: 10, difficulty: 'Easy' }], habits: [{ id: 'h1', label: 'Water', xp: 5, positive: true }] }) } });
    await w.V.init();
    w.V._jPrev = JSON.parse(JSON.stringify(w.V.state)); w.V._jStarted = true;
    const res = w.V.applyOps([
        { op: 'add', kind: 'daily', label: 'Stretch 10 min', minutes: 10 },
        { op: 'complete', kind: 'daily', label: 'gym' },
        { op: 'complete', kind: 'todo', id: 't1' },
        { op: 'habit', kind: 'habit', label: 'Water', dir: '+' },
        { op: 'complete', kind: 'todo', label: 'Not there' },
    ], { src: 'claude' });
    assert.equal(res.map(r => r.ok).join(), 'true,true,true,true,false');
    assert.ok(w.V.state.dailyTasks.some(d => d.label === 'Stretch 10 min'));
    assert.equal(w.V.state.dailyTasks.find(d => d.id === 'd1').completedDates.length, 1);
    assert.equal(w.V.state.todos.find(t => t.id === 't1').completed, true);
    await new Promise(r => setTimeout(r, 20));
    const log = await w.V.journalList();
    assert.equal(log[0].src, 'claude');
    // The PC sends a diff against the copy it loaded; the phone accepts it on top of its own newer save.
    const base = JSON.parse(JSON.stringify(w.V.state));
    const pc = JSON.parse(JSON.stringify(base)); pc.todos.push({ id: 't9', label: 'From PC', xp: 5 });
    w.V.state.habits[0].label = 'Water (phone edit)';                 // the phone moved on meanwhile
    const r = w.V.applyDiff(w.g('jsonDiff')(base, pc));
    assert.equal(r.ok, true);
    assert.ok(w.V.state.todos.some(t => t.label === 'From PC'));
    assert.equal(w.V.state.habits[0].label, 'Water (phone edit)');    // the phone's own change survives
    assert.match(w.V.getLocalBackups()[0].reason, /Before accepting changes/);
});
