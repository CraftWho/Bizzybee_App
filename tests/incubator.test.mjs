// Egg Incubator (Oct 28 2026): steps and dailies take days off eggs inside.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const today = day(0);
const life = (o) => ({ health: 100, stamina: 100, fullness: 50, happiness: 50, bornAt: day(-1), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
const egg = (id, hatchOn) => ({ id, name: id, rarity: 'Common', class: null, sex: 'f', talent: 'x', stats: { level: 1 }, life: life({ hatchOn }) });
function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], dailyTasks: [], colony: { bees: [], tickets: 0, lifeTick: today }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Math.random = () => 0.01;', ctx);
    return ctx.vault;
}

test('incubator: steps and dailies take days off, capped, once per day', async () => {
    const v = harness({ steps: { [today]: 9000 }, incubator: { tier: 'warm', owned: ['warm'], slots: [], applied: {} },
        colony: { bees: [egg('a', day(7)), egg('b', day(7)), egg('c', day(7))], tickets: 0, lifeTick: today } });
    await v.init();
    assert.equal(v.incubatorAdd('a').ok, true);
    assert.equal(v.incubatorAdd('b').ok, true);
    assert.equal(v.incubatorAdd('c').ok, false);                     // warm = 2 slots
    const bees = () => v.getColonyBees();
    assert.equal(bees().find(b => b.id === 'a').life.hatchOn, day(5)); // 9000 / 4000 = 2 days off
    v.state.steps[today] = 16000; v.incubatorTick();
    assert.equal(bees().find(b => b.id === 'a').life.hatchOn, day(5)); // capped at 2 a day
    assert.equal(bees().find(b => b.id === 'c').life.hatchOn, day(7)); // not inside: untouched
    assert.equal(v.buyIncubator('royal').ok, false);                  // no coins
});

test('incubator: hatching inside gives the tier extras and frees the slot', async () => {
    const v = harness({ incubator: { tier: 'royal', owned: ['royal'], slots: ['a'], applied: {} },
        colony: { bees: [egg('a', day(0))], tickets: 0, lifeTick: day(-1) } });
    await v.init();
    assert.ok(v.hatchEgg('a'));                                         // tapped open
    const a = v.getColonyBees().find(b => b.id === 'a');
    assert.equal(a.life.hatchOn, undefined);
    assert.ok(a.life.happiness >= 100 - 10 && a.life.birthTrait);       // happy + trait (random 0.01)
    assert.equal(v.state.incubator.slots.length, 0);
});
