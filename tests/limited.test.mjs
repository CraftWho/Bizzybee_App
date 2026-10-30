// Limited bees (Oct 29 2026): numbered, can't be renamed, destroyed or combined, never die.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const today = new Date().toISOString().slice(0, 10);
function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], dailyTasks: [], colony: { bees: [], tickets: 0, lifeTick: today }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event, CustomEvent: class extends Event { constructor(n, o) { super(n); this.detail = o && o.detail; } }, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', ctx);
    return { v: ctx.vault, saved: () => JSON.parse(data.get('bizzybee_user_data')) };
}

test('limited: Grimzy is added once with its serial and saved', async () => {
    const { v, saved } = harness({});
    await v.init();
    const bee = v.addLimitedBee('grimzy-2026', 7);
    assert.equal(bee.name, 'Grimzy');
    assert.equal(bee.title, 'reaper');
    assert.equal(bee.limited.serial, 7);
    assert.equal(v.addLimitedBee('grimzy-2026', 7).id, bee.id);          // no second copy
    assert.equal(v.addLimitedBee('grimzy-2026', 51), null);                // only 50 exist
    assert.equal(v.renameBee(bee.id, 'Bob'), null);
    assert.equal(v.destroyBee(bee.id), null);
    assert.ok(saved().colony.bees.some(b => b.limited && b.limited.serial === 7));
});

test('limited: the Reaper title is never rolled for normal Named bees', () => {
    const { v } = harness({});
    const src = readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8');
    assert.match(src, /NAMED_TITLE_IDS = Object\.keys\(NAMED_TITLES\)\.filter\(id => !NAMED_TITLES\[id\]\.limited\)/);
    assert.ok(v);
});
