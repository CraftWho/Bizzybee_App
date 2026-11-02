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
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Math.random = () => 0.99;', context);
    return context.vault;
}

test('hive levels: Lv 1 opens your first bee\'s talent; talent only; one bee per job', async () => {
    const v = harness({ hive: { bees: [bee('first', 'honeymaker', { n: 1 }), bee('two', 'honeymaker', { n: 2 }), bee('nurse', 'nurse', { n: 3 })], tickets: 0, vitalsAt: Date.now() } });
    await v.init();
    assert.deepEqual([...v.hiveOpenJobs()], ['honeymaker']);
    assert.equal(v.assignBeeClass('nurse', 'nurse'), null);        // not open yet
    assert.ok(v.assignBeeClass('first', 'honeymaker'));
    assert.equal(v.assignBeeClass('two', 'honeymaker'), null);     // slot taken
    v.state.bonusXP = [{ xp: 150 }];                                // Lv 2: Nurse took Honey Maker's old place
    assert.ok(v.hiveOpenJobs().includes('nurse'));
    assert.equal(v.assignBeeClass('first', 'nurse'), null);         // wrong talent
    assert.ok(v.assignBeeClass('nurse', 'nurse'));
});

test('hive levels: off-talent, locked or doubled-up bees go to rest once', async () => {
    const v = harness({ hive: { bees: [bee('a', 'nurse', { n: 1, class: 'nurse' }), bee('b', 'nurse', { n: 2, class: 'nurse' }), bee('c', 'cleaner', { n: 3, class: 'guardian' })], tickets: 0, vitalsAt: Date.now() } });
    await v.init();
    const cls = v.getHiveBees().filter(b => b.rarity !== 'Royal').map(b => b.class);
    assert.equal(cls.filter(Boolean).length, 1);
    assert.ok(v.state.hive.talentJobsV1);
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
