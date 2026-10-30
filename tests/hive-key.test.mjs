// Hive key (Oct 30 2026): the King/Queen is the hive's identity. Two copies
// of the same hive merge; two different hives never mix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('const MERGE_LISTS'), src.indexOf('const Vault = new DatabaseManager()'));
const ctx = {};
vm.runInNewContext(block + '\nthis.M = { mergeSaves, makeHiveKey, hiveKeyOf, sameHive };', ctx);
const { mergeSaves, makeHiveKey, hiveKeyOf, sameHive } = ctx.M;
const hive = (key, todo) => ({ updatedAt: '2026-10-30T10:00:00Z', hiveKey: key, colony: { bees: [{ id: 'bee-royal', rarity: 'Royal', key }] }, todos: [{ id: todo, label: todo }] });

test('hive key: the same hatch record gives the same key on every device', () => {
    const seed = '2026-10-09T12:00:00.000Z|onboarding|queen';
    assert.equal(makeHiveKey(seed), makeHiveKey(seed));
    assert.match(makeHiveKey(seed), /^HV-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.notEqual(makeHiveKey(seed), makeHiveKey('2026-10-10T08:00:00.000Z|onboarding|queen'));
});

test('hive key: the same hive merges, keeping both copies\' work', () => {
    const m = mergeSaves(hive('HV-AAAA-BBBB', 'phone'), hive('HV-AAAA-BBBB', 'pc'));
    assert.equal(m.todos.length, 2);
    assert.equal(m.colony.bees.filter(b => b.rarity === 'Royal').length, 1);
});

test('hive key: two different hives never mix', () => {
    assert.equal(sameHive(hive('HV-AAAA-BBBB', 'x'), hive('HV-CCCC-DDDD', 'y')), false);
    assert.throws(() => mergeSaves(hive('HV-AAAA-BBBB', 'x'), hive('HV-CCCC-DDDD', 'y')), e => e.code === 'different-hive');
});

test('hive key: a save still in the egg (no royal) can join any hive', () => {
    const egg = { updatedAt: '2026-10-30T09:00:00Z', colony: { bees: [] }, todos: [{ id: 'early', label: 'early' }] };
    assert.equal(hiveKeyOf(egg), null);
    assert.equal(mergeSaves(egg, hive('HV-AAAA-BBBB', 'h')).todos.length, 2);
});
