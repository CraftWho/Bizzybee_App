// Oct 31 2026 (Craft): "Colony" was renamed "Hive Mind". A save made before
// still says "colony"; it must load with every bee, ticket and setting kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(save, extra = {}) {
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)], ...Object.entries(extra)]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {}, warn() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', context);
    return { v: context.vault, data };
}
const oldSave = () => ({ schemaVersion: 8, user: { name: 'T' }, quests: [], onboarding: { stage: 'done' },
    colony: { bees: [{ id: 'b1', name: 'Buzz' }], tickets: 7 },
    homeAppOrder: ['quests', 'colony', 'colony-bees'],
    hints: { off: false, seen: { colony: true, quests: true }, snooze: { 'colony-bees': 3 } } });

test('hive rename: old "colony" save loads into "hive", nothing lost', async () => {
    const { v, data } = harness(oldSave(), { bizzybee_colony_hatched: '["b1"]' });
    await v.init();
    assert.equal(v.state.colony, undefined);
    assert.equal(v.state.hive.tickets, 7);
    assert.equal(v.state.hive.bees[0].name, 'Buzz');
    assert.deepEqual([...v.state.homeAppOrder], ['quests', 'hive-mind', 'hive-bees']);
    assert.equal(v.state.hints.seen['hive-mind'], true);
    assert.equal(v.state.hints.seen.colony, undefined);
    assert.equal(v.state.hints.snooze['hive-bees'], 3);
    const stored = JSON.parse(data.get('bizzybee_user_data'));
    assert.equal(stored.colony, undefined);                 // written back to the device
    assert.equal(stored.hive.tickets, 7);
    assert.equal(data.get('bizzybee_hive_hatched'), '["b1"]');
    const backups = JSON.parse(data.get('bizzybee_user_data:backups') || '[]');
    const copy = backups.find(b => b.reason === 'Before Hive Mind rename');
    assert.ok(copy);
    assert.equal(JSON.parse(copy.data).colony.tickets, 7);   // device copy kept before the move
});

test('hive rename: importing an old file works too', async () => {
    const { v } = harness({ schemaVersion: 8, user: { name: 'T' }, quests: [], onboarding: { stage: 'done' }, hive: { bees: [], tickets: 0 } });
    await v.init();
    await v.importFullState(JSON.stringify(oldSave()), { backup: false });
    assert.equal(v.state.colony, undefined);
    assert.equal(v.state.hive.tickets, 7);
});
