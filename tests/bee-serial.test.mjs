// Oct 31 2026 (Craft): every bee gets a serial number that never changes,
// including bees in saves made before serials existed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('serials: old bees get one on load, new bees on save, and they stay', async () => {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], onboarding: { stage: 'done' },
        hive: { bees: [{ id: 'a', name: 'A', rarity: 'Common' }, { id: 'b', name: 'B', rarity: 'Rare', serial: 'BZ-AAAA-BBBB' }] } };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {}, warn() {} }, Event, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', ctx);
    const v = ctx.vault;
    await v.init();
    const [a, b] = v.state.hive.bees;
    assert.match(a.serial, /^BZ-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    assert.equal(b.serial, 'BZ-AAAA-BBBB');                  // kept
    v.state.hive.bees.push({ id: 'c', name: 'C', rarity: 'Epic' });
    v.save();
    const stored = JSON.parse(data.get('bizzybee_user_data')).hive.bees;
    assert.ok(stored[2].serial);
    assert.equal(stored[0].serial, a.serial);                // never changes
    assert.equal(new Set(stored.map(x => x.serial)).size, 3);
});

test('memories: a new Rare bee remembers the last task; old bees and Commons do not', async () => {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], onboarding: { stage: 'done' }, todos: [{ id: 't1', label: 'Pay rent', difficulty: 'Easy', completed: false }],
        hive: { bees: [{ id: 'old', name: 'Old', rarity: 'Epic' }] } };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {}, warn() {} }, Event, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', ctx);
    const v = ctx.vault;
    await v.init();
    const old = v.state.hive.bees[0];
    assert.ok(old.height > 0 && old.recovery > 0);
    assert.equal(old.memory, undefined);                     // from before memories
    v.toggleTodoComplete('t1');
    const rare = v.awardBee('gacha', 'Rare');
    const common = v.awardBee('gacha', 'Common');
    v.save();
    const [, r, c] = JSON.parse(data.get('bizzybee_user_data')).hive.bees;
    assert.equal(r.id, rare.id);
    assert.equal(r.memory.how, 'gacha');
    assert.equal(r.memory.task.label, 'Pay rent');
    assert.equal(r.memory.task.kind, 'To-Do');
    assert.equal(c.memory, undefined);                       // Commons keep no memory
    assert.ok(c.height > 0 && c.recovery >= 20 && c.recovery <= 60);
});
