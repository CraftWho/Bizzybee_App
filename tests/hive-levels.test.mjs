// Hive levels (Nov 1 2026, Craft): jobs open with your level, talent only,
// one bee per job, off-talent bees rest once, all-Rare combs, auto-manage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const life = (o = {}) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, fatigue: 0, bornAt: '2026-10-01', faintedAt: null, royalJelly: false, birthTrait: null, ...o });
const bee = (id, talent, extra = {}) => ({ id, name: id, rarity: 'Common', class: null, sex: 'f', talent, obtainedAt: `2026-10-0${extra.n || 5}T00:00:00Z`, stats: { level: 1, hp: 30, offense: 10, defense: 10, speed: 10, power: 10 }, element: 'fire', dexNumber: 1, weight: 1, customNamed: false, life: life(), ...extra });
function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T', level: 1 }, quests: [], hive: { bees: [], tickets: 0, vitalsAt: Date.now() }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Math.random = () => 0.99; Vault.__run = (c) => eval(c);', context);
    return context.vault;
}

test('hive levels: Lv 1 opens your first bee\'s talent; talent only; slots per job', async () => {
    const v = harness({ hive: { bees: [bee('first', 'honeymaker', { n: 1 }), bee('two', 'honeymaker', { n: 2 }), bee('nurse', 'nurse', { n: 3 })], tickets: 0, vitalsAt: Date.now() } });
    await v.init();
    assert.deepEqual([...v.hiveOpenJobs()], ['honeymaker']);
    assert.equal(v.assignBeeClass('nurse', 'nurse'), null);        // not open yet
    assert.equal(v.jobSlots('honeymaker'), 2);                      // 3 adults, about 80% work
    assert.ok(v.assignBeeClass('first', 'honeymaker'));
    assert.ok(v.assignBeeClass('two', 'honeymaker'));
    v.state.bonusXP = [{ xp: 150 }];                                // Lv 2: Nurse opens, Honey Maker's share shrinks
    assert.ok(v.hiveOpenJobs().includes('nurse'));
    assert.equal(v.jobSlots('honeymaker'), 1);
    v.assignBeeClass('two', null);
    assert.equal(v.assignBeeClass('two', 'honeymaker'), null);     // full now
    assert.equal(v.assignBeeClass('first', 'nurse'), null);         // wrong talent
    assert.ok(v.assignBeeClass('nurse', 'nurse'));
});

test('hive levels: off-talent, locked or extra bees go to rest once', async () => {
    const v = harness({ hive: { bees: [bee('a', 'nurse', { n: 1, class: 'nurse' }), bee('b', 'nurse', { n: 2, class: 'nurse' }), bee('c', 'cleaner', { n: 3, class: 'guardian' })], tickets: 0, vitalsAt: Date.now() } });
    await v.init();
    v._talentJobsMigrate();
    const cls = v.getHiveBees().filter(b => b.rarity !== 'Royal').map(b => b.class);
    assert.equal(cls.filter(Boolean).length, 2);                    // both nurses fit the 2 slots; c rests
    assert.ok(v.state.hive.talentJobsV1);
});

test('real hive: slots grow with the hive, talents use real-hive odds, merges can fill a missing talent', async () => {
    const many = Array.from({ length: 25 }, (_, i) => bee('b' + i, i < 12 ? 'collector' : 'nurse', { n: 1 + (i % 9) }));
    const v = harness({ bonusXP: [{ xp: 5000 }], hive: { bees: [...many, bee('m1', 'drone', { sex: 'm' }), bee('m2', 'drone', { sex: 'm' })], tickets: 0, vitalsAt: Date.now() } });
    await v.init();
    const open = [...v.hiveOpenJobs()];
    const total = open.filter(j => j !== 'drone').reduce((n, j) => n + v.jobSlots(j), 0);
    assert.ok(total >= 18 && total <= 24, 'about 80% of 25 females work: ' + total);
    assert.ok(v.jobSlots('collector') > v.jobSlots('attendant'));
    if (open.includes('drone')) assert.equal(v.jobSlots('drone'), 2);
    // Odds: Collector (22) far more often than Undertaker (3).
    let seed = 1; const counts = {};
    for (let i = 0; i < 2000; i++) { seed = (seed * 16807) % 2147483647; const t = v.__run(`pickBeeTalent({ sex: 'f' }, () => ${seed / 2147483647})`); counts[t] = (counts[t] || 0) + 1; }
    assert.ok(counts.collector > counts.undertaker * 4, JSON.stringify(counts));
    // Merge: with Math.random = 0.99 there's no gap roll, so a parent's talent; two males make a Drone.
    const r1 = v.combineBees('b0', 'b1');
    assert.equal(r1.newBee.talent, 'collector');
    assert.equal(r1.newBee.class, null);
    // A 35% roll gives a talent no bee has yet (here: anything but collector, nurse, drone).
    v.__run('Math.random = () => 0.1');
    const r3 = v.combineBees('b2', 'b3');
    assert.ok(!['collector', 'nurse', 'drone'].includes(r3.newBee.talent), r3.newBee.talent);
    v.__run('Math.random = () => 0.99');
    const r2 = v.combineBees('m1', 'm2');
    assert.equal(r2.newBee.talent, 'drone');
    assert.equal(r2.newBee.sex, 'm');
});
test('hive levels: all-Rare comb, auto-manage unlocks, fills, and pauses when stuck', async () => {
    const v = harness({ bonusXP: [{ xp: 150 }], hive: { bees: [
        bee('r', 'nurse', { n: 1, rarity: 'Rare' }), bee('h', 'honeymaker', { n: 2 }), bee('h2', 'honeymaker', { n: 3 })], tickets: 0, vitalsAt: Date.now() } });
    await v.init();
    v.assignBeeClass('r', 'nurse');
    assert.ok(v.combIsRare('nursery'));
    assert.equal(v.hiveAutoStatus().on, false);
    v.assignBeeClass('h', 'honeymaker');
    assert.equal(v.autoJustUnlocked, true);
    assert.equal(v.hiveAutoStatus().leader.id, 'r');
    // h leaves; the next hour h2 takes the job.
    v.assignBeeClass('h', null);
    v.getHiveBees().find(b => b.id === 'h').life.stamina = 20;   // tired, so not picked
    v._autoManageHour();
    assert.equal(v.jobHolder('honeymaker').id, 'h2');
    // The Leader is tired and no free nurse-talent bee: paused.
    v.getHiveBees().find(b => b.id === 'r').life.stamina = 20;
    const st = v.hiveAutoStatus();
    assert.equal(st.running, false);
    assert.equal(st.stuck.id, 'r');
});

test('auto-swap: Queen\'s Whistle unlocks it; a tired worker hands its job to a rested bee', async () => {
    const v = harness({ hive: { bees: [bee('w', 'nurse', { n: 1 }), bee('r', 'nurse', { n: 2 })], tickets: 0, vitalsAt: Date.now() } });
    await v.init();
    v.assignBeeClass('w', 'nurse');
    assert.equal(v.autoSwapUnlocked(), false);
    assert.equal(v._autoSwapHour().length, 0);
    v.state.queen = { ...(v.state.queen || {}), since: '2026-01-01', bonus: 1000 };
    v._ensureQueen().bonus = 1000;
    assert.ok(v.purchaseStoreItem('queens-whistle'));
    assert.equal(v.purchaseStoreItem('queens-whistle'), null);       // one per hive
    assert.ok(v.autoSwapUnlocked());
    v.getHiveBees().find(b => b.id === 'w').life.stamina = 20;
    const notes = v._autoSwapHour();
    assert.equal(notes.length, 1);
    assert.equal(v.jobHolder('nurse').id, 'r');
    v.setAutoSwap({ mode: 'pick', pool: [] });
    v.getHiveBees().find(b => b.id === 'r').life.stamina = 10;
    assert.equal(v._autoSwapHour().length, 0);                       // "I choose" with nobody picked
});
