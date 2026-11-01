// Titles (Oct 31 2026, Craft): earned titles can be worn; titles not earned
// yet show NO info (no name, no how-to), only that they exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(extra = {}) {
    const save = Object.assign({ schemaVersion: 8, user: { name: 'T' }, quests: [], hive: { bees: [], tickets: 0 }, onboarding: { stage: 'done' } }, extra);
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', context);
    return context.vault;
}

test('titles: locked ones give away nothing', async () => {
    const v = harness();
    await v.init();
    const t = v.getTitles();
    assert.equal(t.earned.length, 0);
    assert.ok(t.locked > 0);
    for (const x of t.all.filter(x => !x.earned)) {
        assert.equal(x.name, undefined);
        assert.equal(x.how, undefined);
    }
    assert.equal(t.worn, null);
});

test('titles: a quest title can be worn and taken off', async () => {
    const v = harness({ titles: [{ title: 'Script Bee', ability: 'JS quest' }] });
    await v.init();
    assert.equal(v.getTitles().earned.length, 1);
    assert.equal(v.wearTitle('nope'), null);           // can't wear what you don't have
    v.wearTitle(v.getTitles().earned[0].id);
    assert.equal(v.getTitles().worn.name, 'Script Bee');
    v.wearTitle(null);
    assert.equal(v.getTitles().worn, null);
});
