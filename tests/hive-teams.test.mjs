// Hive teams (Nov 9 2026, Craft): every job open by Lv 5, slot minimums,
// Recuperate -> No Job, the Rescue Team, stored honey and the Cafeteria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const life = (o = {}) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, fatigue: 0, bornAt: '2026-10-01', faintedAt: null, royalJelly: false, birthTrait: null, ...o });
const bee = (id, talent, extra = {}) => ({ id, name: id, rarity: 'Common', class: null, sex: 'f', talent, obtainedAt: '2026-10-05T00:00:00Z', stats: { level: 1, hp: 30, offense: 10, defense: 10, speed: 10, power: 10 }, element: 'fire', dexNumber: 1, weight: 1, customNamed: false, life: life(extra.life), ...extra, ...(extra.life ? { life: life(extra.life) } : {}) });
function harness(bees, level = 5) {
    const save = { schemaVersion: 8, user: { name: 'T', level }, quests: [], hive: { bees, tickets: 0, vitalsAt: Date.now(), newJobsV1: true, talentJobsV1: true } };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Math.random = () => 0.99;', context);
    const v = context.vault;
    v.getUser = () => ({ level });   // the level, without building XP
    return v;
}
const DAY = () => new Date(2026, 10, 9, 10, 0);   // 10 AM local: a work hour
const bee1 = (v, id) => v.getHiveBees().find(b => b.id === id);

test('jobs: all open at Lv 5 except the Undertaker; each has a minimum of slots that grows with the nest', async () => {
    const v = harness([bee('a', 'collector'), bee('b', 'nurse')], 5);
    await v.init();
    const open = [...v.hiveOpenJobs()];
    ['nurse', 'honeymaker', 'collector', 'guardian', 'watercarrier', 'architect', 'attendant', 'cleaner', 'scout', 'drone', 'barrier', 'rescue', 'fanner', 'waxmaker', 'receiver']
        .forEach(j => assert.ok(open.includes(j), j + ' is open at Lv 5'));
    assert.ok(!open.includes('undertaker'));
    assert.equal(v.jobSlots('rescue'), 2);
    v.getUser = () => ({ level: 10 });
    assert.equal(v.jobSlots('rescue'), 3);
    v.getUser = () => ({ level: 17 });
    assert.ok(v.hiveOpenJobs().includes('undertaker'));
});

test('recuperate: Rest goes to Recuperate; fully healed it moves to No Job on its own', async () => {
    const v = harness([bee('w', 'honeymaker', { class: 'honeymaker' })]);
    await v.init();
    assert.ok(v.assignBeeClass('w', 'recuperate'));
    assert.equal(bee1(v, 'w').class, null);
    assert.equal(bee1(v, 'w').life.recuperate, true);
    bee1(v, 'w').life.health = 60;
    v._lifeHour(DAY());
    assert.equal(bee1(v, 'w').life.recuperate, true);               // still hurt: stays
    Object.assign(bee1(v, 'w').life, { health: 100, stamina: 100, fatigue: 0 });
    v._lifeHour(DAY());
    assert.equal(bee1(v, 'w').life.recuperate, undefined);          // healed: No Job
    assert.equal(bee1(v, 'w').class, null);
});

test('rescue team: carries a hurt bee to a bed; it keeps its job and goes back when healed', async () => {
    const v = harness([bee('r', 'rescue', { class: 'rescue' }), bee('p', 'honeymaker', { class: 'honeymaker', life: { health: 40 } })]);
    await v.init();
    v._lifeHour(DAY());
    assert.equal(bee1(v, 'p').life.nursery, true);
    assert.equal(bee1(v, 'p').class, 'honeymaker');                 // its slot is kept
    bee1(v, 'p').life.health = 95;
    v._lifeHour(DAY());
    assert.equal(bee1(v, 'p').life.nursery, undefined);
    assert.equal(bee1(v, 'p').class, 'honeymaker');                 // back to work by itself
});

test('stored honey + Cafeteria: Honey Makers and Fanners fill it, a hungry bee eats for 1 honey, none left = no meal', async () => {
    const v = harness([bee('m', 'honeymaker', { class: 'honeymaker' }), bee('f', 'fanner', { class: 'fanner' }), bee('h', 'collector', { life: { fullness: 30 } })]);
    await v.init();
    v.state.hive.honey = 10;
    v._lifeHour(DAY());
    assert.ok(Math.abs(v.state.hive.honey - (10 + 1.5 + 0.75 - 1)) < 1e-9, 'made 2.25, one meal cost 1: ' + v.state.hive.honey);
    assert.ok(bee1(v, 'h').life.fullness > 60);
    assert.ok(bee1(v, 'h').life.cafeAt);
    // Empty stock: nobody eats.
    v.state.hive.honey = 0;
    Object.assign(bee1(v, 'h').life, { fullness: 30, cafeAt: undefined });
    v.state.hive.bees = v.state.hive.bees.filter(b => b.id === 'h');
    v._lifeHour(DAY());
    assert.ok(bee1(v, 'h').life.fullness < 40);
    assert.equal(bee1(v, 'h').life.cafeAt, undefined);
});
