// Hive Life (Oct 2026): sex, vitals, faint/death, old age, roles, revive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const bee = (id, extra = {}) => ({ id, name: `Bee ${id}`, rarity: 'Common', class: null, stats: { level: 1, hp: 30, offense: 10, defense: 10, speed: 10, power: 10 }, element: 'fire', dexNumber: 1, weight: 1, customNamed: false, ...extra });
function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], colony: { bees: [], tickets: 0 }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Math.random = () => 0.99; LIFE.deathEnabled = true;', context);
    return { vault: context.vault, g: (code) => vm.runInContext(code, context) };
}

test('hive life: old bees get sex and vitals, age starts today, workers stay female', async () => {
    const h = harness({ colony: { bees: [bee('a', { class: 'collector' }), bee('b')], tickets: 0 } });
    await h.vault.init();
    const [a, b] = h.vault.getColonyBees();
    assert.equal(a.sex, 'f');
    assert.ok(['f', 'm'].includes(b.sex));
    assert.equal(a.life.bornAt, today);
    assert.equal(a.life.health, 100);
    assert.equal(h.vault.getFallenBees().length, 0);
});

test('hive life: hunger leads to fainting, then death after 3 days; Undertakers leave pollen', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: daysAgo(5), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const h = harness({ colony: { bees: [
        bee('weak', { sex: 'f', life: life({ health: 10, fullness: 0 }) }),
        bee('ut', { sex: 'f', class: 'undertaker', life: life({}) })
    ], tickets: 0, lifeTick: daysAgo(5) }, inventory: { materials: {} } });
    await h.vault.init();
    const names = h.vault.getColonyBees().map(b => b.id);
    assert.ok(!names.includes('weak'));
    const fallen = h.vault.getFallenBees();
    assert.equal(fallen[0].id, 'weak');
    assert.equal(fallen[0].cause, 'neglect');
    assert.ok(h.vault.state.inventory.materials.pollen >= 1);
    assert.equal(h.vault.state.colony.lifeTick, today);
    assert.ok(h.vault.getLifeEvents().some(e => e.type === 'death'));
});

test('hive life: old age, Royal Jelly extends life', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: daysAgo(50), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const h = harness({ colony: { bees: [bee('old', { sex: 'f', life: life({}) }), bee('jelly', { sex: 'f', life: life({ royalJelly: true }) })], tickets: 0, lifeTick: daysAgo(1) } });
    await h.vault.init();
    assert.equal(h.vault.getColonyBees().map(b => b.id).join(), "jelly");
    assert.equal(h.vault.getFallenBees()[0].cause, 'old age');
});

test('hive life: only males can be Drones; revive and Royal Jelly cost Honey Drops', async () => {
    const h = harness({ colony: { bees: [bee('f1', { sex: 'f' }), bee('m1', { sex: 'm' })], tickets: 0 }, inventory: { materials: { 'honey-drop': 16 } } });
    await h.vault.init();
    assert.equal(h.vault.assignBeeClass('f1', 'drone'), null);
    assert.equal(h.vault.assignBeeClass('m1', 'collector'), null);
    assert.equal(h.vault.assignBeeClass('m1', 'drone').class, 'drone');
    assert.equal(h.vault.assignBeeClass('f1', 'guardian').class, 'guardian');
    const f1 = h.vault.getColonyBees()[0];
    f1.life.faintedAt = today; f1.life.health = 0;
    assert.equal(h.vault.reviveBee('f1').ok, true);
    assert.equal(h.vault.state.inventory.materials['honey-drop'], 6);
    assert.equal(h.vault.getColonyBees()[0].life.faintedAt, null);
    assert.equal(h.vault.reviveBee('f1').ok, false);
    assert.equal(h.vault.craftRoyalJelly().ok, true);
    assert.equal(h.vault.giveRoyalJelly('f1').ok, true);
    assert.equal(h.g('beeLifespan(Vault.getColonyBees()[0])'), 120);
});

test('hive life: streak, mood, feeding and one counter-raid a day', async () => {
    const dailies = [{ id: 'd', label: 'x', completedDates: [daysAgo(1), daysAgo(2), daysAgo(3)], startDate: daysAgo(10) }];
    const h = harness({ dailyTasks: dailies, colony: { bees: [bee('a', { sex: 'f' })], tickets: 0 } });
    await h.vault.init();
    assert.equal(h.vault.getHiveStreak(), 3);
    assert.equal(h.g('computeHiveStreak([{ id: "d", completedDates: [], startDate: "2020-01-01" }], "' + today + '", 0)'), -14);
    assert.equal(h.g('computeHiveStreak([{ id: "d", completedDates: [], startDate: "2020-01-01" }], "' + today + '", 2)') > -14, true);
    const a = h.vault.getColonyBees()[0];
    a.life.fullness = 50;
    h.vault._feedHive();
    assert.equal(a.life.fullness, 54);
    assert.equal(h.g('beeMood(Vault.getColonyBees()[0], 3).label'), 'Joyful');
    const r = h.vault.counterRaid();
    assert.equal(r.ok, true);
    assert.equal(h.vault.counterRaid().ok, false);
});

test('hive life: with death paused, a long-fainted or old bee stays in the hive', async () => {
    const life = (o) => ({ health: 0, stamina: 0, fullness: 0, happiness: 10, bornAt: daysAgo(90), faintedAt: daysAgo(6), royalJelly: false, birthTrait: null, ...o });
    const h = harness({ colony: { bees: [bee('kept', { sex: 'f', life: life({}) })], tickets: 0, lifeTick: daysAgo(5) } });
    h.g('LIFE.deathEnabled = false');
    await h.vault.init();
    assert.equal(h.vault.getColonyBees().map(b => b.id).join(), 'kept');
    assert.equal(h.vault.getFallenBees().length, 0);
});

test('comb rooms: new bees start as eggs, keep a picked job, and hatch (faster with a Nurse)', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: daysAgo(5), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const h = harness({ colony: { bees: [
        bee('egg1', { sex: 'f', class: 'guardian', life: life({ hatchOn: today }) }),
        bee('egg2', { sex: 'f', life: life({ hatchOn: tomorrow }) }),
        bee('nurse', { sex: 'f', class: 'nurse', life: life({}) })
    ], tickets: 0, lifeTick: daysAgo(1) } });
    await h.vault.init();
    const [e1, e2] = h.vault.getColonyBees();
    assert.equal(e1.life.hatchOn, undefined);
    assert.equal(e1.class, 'guardian');
    assert.equal(e2.life.hatchOn, undefined);          // the Nurse took a day off
    assert.equal(e2.life.idleSince, today);
    assert.ok(h.vault.getLifeEvents().some(e => e.type === 'hatch'));

    const fresh = h.vault.awardBee('gacha');
    assert.ok(h.g('beeIsBrood')(fresh));
    assert.equal(h.g('beeCanWork')(fresh), false);
    assert.ok(h.vault.assignBeeClass(fresh.id, 'honeymaker'));
    assert.equal(fresh.life.idleSince, undefined);
    assert.equal(h.g('beeFeeling')(fresh).key, 'egg');
});

test('comb rooms: faces - happy, sad when lacking, upset after 3 days with no job', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: daysAgo(5), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const h = harness({ colony: { bees: [
        bee('ok', { sex: 'f', class: 'cleaner', life: life({}) }),
        bee('hungry', { sex: 'f', class: 'cleaner', life: life({ fullness: 20 }) }),
        bee('idle', { sex: 'f', life: life({ idleSince: daysAgo(4) }) }),
        bee('new-idle', { sex: 'f', life: life({ idleSince: today }) })
    ], tickets: 0, lifeTick: today } });
    await h.vault.init();
    const feel = (id) => h.g('beeFeeling')(h.vault.getColonyBees().find(b => b.id === id)).key;
    assert.equal(feel('ok'), 'happy');
    assert.equal(feel('hungry'), 'sad');
    assert.equal(feel('idle'), 'upset');
    assert.equal(feel('new-idle'), 'calm');
    h.vault.assignBeeClass('idle', 'cleaner');
    assert.equal(feel('idle'), 'happy');
});

test('bee names: new bees get real names; old default names are replaced once, renamed bees kept', async () => {
    const h = harness({ colony: { bees: [
        bee('d1', { name: 'Common Bee #3' }),
        bee('mine', { name: 'Rare Bee #4', customNamed: true }),
        bee('ok', { name: 'Sir Buzzalot' })
    ], tickets: 0 } });
    await h.vault.init();
    const [d1, mine, ok] = h.vault.getColonyBees();
    assert.ok(!/Bee #\d+$/.test(d1.name));
    assert.equal(mine.name, 'Rare Bee #4');
    assert.equal(ok.name, 'Sir Buzzalot');
    const fresh = h.vault.awardBee('gacha');
    assert.ok(!/Bee #\d+$/.test(fresh.name));
    const names = h.vault.getColonyBees().map(b => b.name.toLowerCase());
    assert.equal(new Set(names).size, names.length);
    const full = h.g('BEE_NAME_POOL').slice();
    assert.match(h.g('randomBeeName')(full), / (II|III)$/);
});
