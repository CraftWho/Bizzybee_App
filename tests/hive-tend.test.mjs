// Tend the hive (Nov 17 2026): the hive moves bees the moment they need it, not once an hour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const bee = (id, extra = {}) => ({ id, name: `Bee ${id}`, rarity: 'Common', class: null, sex: 'f', talent: extra.class || 'cleaner', stats: { level: 1, hp: 30, offense: 10, defense: 10, speed: 10, power: 10 }, element: 'fire', dexNumber: 1, weight: 1, customNamed: false, ...extra });
const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, fatigue: 0, bornAt: daysAgo(9), faintedAt: null, birthTrait: null, ...o });
function world(bees, hive = {}, xp = 5000) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], bonusXP: [{ xp }], hive: { bees, tickets: 0, vitalsAt: Date.now(), lifeTick: today, honey: 40, ...hive }, inventory: { materials: {} } };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Math.random = () => 0.99;', context);
    return { v: context.vault, g: (c) => vm.runInContext(c, context) };
}
const B = (v, id) => v.getHiveBees().find(b => b.id === id);
const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };

test('tend: a hungry bee eats at once (no hourly tick), but not at night', async () => {
    const { v } = world([bee('h', { class: 'collector', life: life({ fullness: 20 }) })]);
    await v.init();
    B(v, 'h').life.fullness = 20; delete B(v, 'h').life.cafeAt;
    const night = new Date(); night.setHours(23, 0, 0, 0);
    assert.equal(v._tendHive(night), 0);
    assert.equal(B(v, 'h').life.fullness, 20);
    assert.ok(v._tendHive(noon()) >= 1);
    assert.ok(B(v, 'h').life.fullness >= 60);
    assert.ok(v.state.hive.honey < 40);
});

test('tend: Rescue works on demand, one bee per need, and every carry tires the Rescue bee', async () => {
    const { v } = world([bee('r', { class: 'rescue', life: life({ fatigue: 10 }) }), bee('p1', { class: 'cleaner', life: life({ health: 40 }) }), bee('p2', { class: 'cleaner', life: life({ health: 50 }) }), bee('ok', { class: 'cleaner', life: life({}) })]);
    await v.init();
    const f0 = B(v, 'r').life.fatigue;
    v._tendHive(noon());
    assert.equal(B(v, 'p1').life.nursery, true);
    assert.equal(B(v, 'p2').life.nursery, true);                  // both in the same pass, not one an hour
    assert.equal(B(v, 'ok').life.nursery, undefined);
    assert.equal(B(v, 'r').life.fatigue, f0 + 2 * 3);              // +3 per bee carried
});

test('tend: a worn-out Rescue team stops carrying; no bed free stops it too', async () => {
    const { v } = world([bee('r', { class: 'rescue', life: life({ fatigue: 96 }) }), bee('p', { class: 'cleaner', life: life({ health: 30 }) })]);
    await v.init();
    v._tendHive(noon());
    assert.equal(B(v, 'p').life.nursery, undefined);
    const w = world([bee('r', { class: 'rescue', life: life({}) }), bee('a', { class: 'cleaner', life: life({ health: 20 }) }), bee('b', { class: 'cleaner', life: life({ health: 30 }) }), bee('c', { class: 'cleaner', life: life({ health: 40 }) })]);
    await w.v.init();
    w.v._tendHive(noon());
    const inBed = ['a', 'b', 'c'].filter(id => B(w.v, id).life.nursery).length;
    assert.equal(inBed, w.v.nurseryBeds().total);                  // exactly the beds there are (2 + 0 nurses)
    assert.equal(B(w.v, 'a').life.nursery, true);                  // the sickest first
});

test('tend: a tired worker swaps with a rested bee at once; the tired one rests', async () => {
    const { v } = world([bee('lead', { class: 'nurse', rarity: 'Rare', life: life({}) }), bee('w', { class: 'collector', life: life({ stamina: 20 }) }), bee('s', { talent: 'collector', life: life({ stamina: 100 }) })], { autoManage: { on: true } });
    await v.init();
    Object.assign(B(v, 'w'), { class: 'collector', talent: 'collector' }); Object.assign(B(v, 's'), { class: null, talent: 'collector' });
    for (let i = 0; v.jobHolders('collector').length < v.jobSlots('collector'); i++) v.state.hive.bees.push({ ...bee('f' + i, { class: 'collector', talent: 'collector', life: life({}) }) });   // job is full
    B(v, 'w').life.stamina = 20;
    assert.ok(v._tendHive(noon()) >= 1);
    assert.equal(B(v, 's').class, 'collector');
    assert.equal(B(v, 'w').class, null);
    assert.equal(B(v, 'w').life.recuperate, true);
});

test('tend: no job for 3+ days takes any open job with room; 1 day does not', async () => {
    const mk = (idleDays) => world([bee('lead', { class: 'nurse', rarity: 'Rare', life: life({}) }), bee('x', { talent: 'cleaner', life: life({ idleSince: daysAgo(idleDays) }) })], { autoManage: { on: true } });
    const a = mk(4); await a.v.init();
    a.g('HIVE_JOB_RULES = false');
    B(a.v, 'x').life.idleSince = daysAgo(4);
    a.v._tendHive(noon());
    // the open job with free slots that is NOT its talent
    assert.ok(B(a.v, 'x').class, 'a bored bee took a job');
    const b = mk(1); await b.v.init();
    B(b.v, 'x').life.idleSince = daysAgo(1);
    b.v._tendHive(noon());
    assert.ok(!B(b.v, 'x').class || B(b.v, 'x').class === 'cleaner', 'a 1-day idle bee only takes its own talent');
});

test('Rest button: a hungry bee with no honey is NOT parked in Recuperate', async () => {
    const { v } = world([bee('h', { class: 'collector', life: life({ fullness: 20 }) })], { honey: 0 });
    await v.init();
    B(v, 'h').life.fullness = 20; v.state.hive.honey = 0;
    const r = v.sendBeeToNeed('h');
    assert.equal(r.to, 'hungry');
    assert.equal(B(v, 'h').class, 'collector');
    assert.equal(B(v, 'h').life.recuperate, undefined);
    v.state.hive.honey = 5;
    assert.equal(v.sendBeeToNeed('h').to, 'cafe');
});

test('faces: sleepy, tired, worn out, bored, angry', async () => {
    const { v, g } = world([bee('a', { class: 'collector', life: life({}) })]);
    await v.init();
    const feel = (o, cls = 'collector', idle) => { const b = { ...bee('t', { class: cls }), life: life(o) }; if (idle != null) b.life.idleSince = daysAgo(idle); return g('beeFeeling')(b); };
    assert.equal(feel({ stamina: 45 }).face, '😪');
    assert.equal(feel({ stamina: 25 }).face, '🥱');
    assert.equal(feel({ fatigue: 85 }).face, '😩');
    assert.equal(feel({ fullness: 20, stamina: 25 }).face, '😢');   // hunger wins the face, both are listed
    assert.equal(feel({}, null, 1).face, '😤');
    assert.equal(feel({}, null, 4).face, '😡');
    assert.equal(feel({}, null, 0).face, '🙂');
    assert.equal(feel({}, 'collector').face, '😊');
});

test('starter talents: the first bees cover health, food, workers, rescue and receiving, then it is random', async () => {
    const { v } = world([bee('q', { talent: 'nurse', class: 'nurse', life: life({}) })], {}, 0);
    await v.init();
    const got = [];
    for (let i = 0; i < 6; i++) { const nb = v.addHiveBee({ id: 'n' + i, name: 'N' + i, rarity: 'Common', class: null, sex: 'f', stats: {}, element: 'fire', dexNumber: 1, weight: 1 }); got.push(nb.talent); }
    assert.deepEqual([...got.slice(0, 4)], ['honeymaker', 'collector', 'rescue', 'receiver']);
});

test('hive asleep: night, or every awake bee resting; not while someone works', async () => {
    const { v } = world([bee('a', { class: 'collector', life: life({}) }), bee('b', { life: life({ recuperate: true }) })]);
    await v.init();
    const night = new Date(); night.setHours(23, 0, 0, 0);
    assert.equal(v.hiveAllAsleep(night), true);
    assert.equal(v.hiveAllAsleep(noon()), false);
    B(v, 'a').class = null; B(v, 'a').life.recuperate = true;
    assert.equal(v.hiveAllAsleep(noon()), true);
});

test('rest remembers the job; Ready at Return-at; Return puts it back', async () => {
    const { v } = world([bee('a', { class: 'collector', talent: 'collector', life: life({}) })]);
    await v.init();
    Object.assign(B(v, 'a'), { class: 'collector', talent: 'collector' });
    v.assignBeeClass('a', 'recuperate');
    assert.equal(B(v, 'a').life.restFrom, 'collector');
    B(v, 'a').life.stamina = 60;
    v.setAutoSwap({ returnPct: 70 });
    assert.equal(v.beeIsReady(B(v, 'a')), false);
    B(v, 'a').life.stamina = 75;
    assert.equal(v.beeIsReady(B(v, 'a')), true);
    assert.ok(v.returnBeeToWork('a'));
    assert.equal(B(v, 'a').class, 'collector');
    assert.equal(B(v, 'a').life.restFrom, undefined);
    assert.equal(B(v, 'a').life.recuperate, undefined);
});

test('Grave Comb: once a day each Undertaker lays up to 5 week-old finished To-Dos to rest, +1 Pollen each', async () => {
    const old = Date.now() - 9 * 86400000;
    const todos = Array.from({ length: 7 }, (_, i) => ({ id: 't' + i, label: 'Old ' + i, xp: 5, completed: true, completedAt: old }))
        .concat([{ id: 'n1', label: 'Fresh', xp: 5, completed: true, completedAt: Date.now() }, { id: 'o1', label: 'Open', xp: 5 }]);
    const { v } = world([bee('u', { class: 'undertaker', talent: 'undertaker', life: life({}) })]);
    await v.init();
    Object.assign(B(v, 'u'), { class: 'undertaker', talent: 'undertaker' });
    v.state.todos = todos;
    const before = (v.state.inventory.materials.pollen || 0);
    assert.equal(v.graveQueue().length, 7);
    v._tendHive(noon());
    assert.equal(v.state.todos.length, 4);                       // 5 laid to rest, 2 old + fresh + open stay
    assert.ok(v.state.todos.some(t => t.id === 'n1') && v.state.todos.some(t => t.id === 'o1'));
    assert.equal((v.state.inventory.materials.pollen || 0) - before, 5);
    v._tendHive(noon());
    assert.equal(v.state.todos.length, 4);                       // once a day
});

test('work boredom: 5 days straight -> 😤 and extra unhappiness; workaholics never; auto-swap sends a bored worker to a play break', async () => {
    const { v, g } = world([bee('lead', { class: 'nurse', rarity: 'Rare', life: life({}) }), bee('w', { class: 'collector', talent: 'collector', life: life({}) }), bee('s', { talent: 'collector', life: life({}) })], { autoManage: { on: true } });
    await v.init();
    Object.assign(B(v, 'w'), { class: 'collector', talent: 'collector' }); Object.assign(B(v, 's'), { class: null, talent: 'collector' });
    for (let i = 0; v.jobHolders('collector').length < v.jobSlots('collector'); i++) v.state.hive.bees.push({ ...bee('f' + i, { class: 'collector', talent: 'collector', life: life({}) }) });
    B(v, 'w').life.workFrom = daysAgo(6);
    assert.equal(g('beeFeeling')(B(v, 'w')).face, '😤');
    const h0 = B(v, 'w').life.happiness;
    v._lifeHour(noon());
    assert.ok(B(v, 'w').life.happiness < h0 - 1);                       // bored work costs extra happiness
    const wk = { ...B(v, 'w'), life: { ...B(v, 'w').life, birthTrait: 'workaholic' } };
    assert.notEqual(g('beeFeeling')(wk).face, '😤');
    v._ensureQueen().bonus = 100000; v.purchaseStoreItem('queens-whistle');
    v._autoSwapHour();
    assert.equal(B(v, 'w').class, null);
    assert.equal(B(v, 'w').life.recuperate, undefined);                  // a play break, not rest
    assert.ok(v._onBreak(B(v, 'w')));
    assert.equal(v._autoReady(B(v, 'w')), false);                       // not put straight back to work
    assert.equal(B(v, 's').class, 'collector');
});

test('sim fixes: tired worker rests itself, bored worker breaks itself and returns, resting bee eats below 50, Return swaps into a full job', async () => {
    const at = noon();
    const { v } = world([bee('t', { class: 'collector', talent: 'collector', life: life({}) }), bee('b', { class: 'honeymaker', talent: 'honeymaker', life: life({}) }), bee('r', { talent: 'collector', life: life({}) })]);
    await v.init();
    Object.assign(B(v, 't'), { class: 'collector', talent: 'collector' }); Object.assign(B(v, 'b'), { class: 'honeymaker', talent: 'honeymaker' });
    B(v, 't').life.stamina = 5;
    B(v, 'b').life.workFrom = daysAgo(6); B(v, 'b').life.happiness = 40;
    v._careHour(at, at.toISOString().slice(0, 10));
    assert.equal(B(v, 't').class, null); assert.equal(B(v, 't').life.recuperate, true); assert.equal(B(v, 't').life.restFrom, 'collector');
    assert.equal(B(v, 'b').class, null); assert.ok(B(v, 'b').life.playUntil);
    const later = new Date(at.getTime() + 5 * 3600000);
    v._careHour(later, later.toISOString().slice(0, 10));
    assert.equal(B(v, 'b').class, 'honeymaker');                      // back from its break
    B(v, 't').life.fullness = 45; v.state.hive.honey = 10;
    v._tendHive(at);
    assert.ok(B(v, 't').life.fullness > 45);                          // resting bee ate below 50
    // Return into a full job: the most tired holder goes to rest
    Object.assign(B(v, 'r'), { class: null, talent: 'collector' });
    for (let i = 0; v.jobHolders('collector').length < v.jobSlots('collector'); i++) v.state.hive.bees.push({ ...bee('c' + i, { class: 'collector', talent: 'collector', life: life({ stamina: 40 + i }) }) });
    B(v, 't').life.stamina = 100; B(v, 't').life.recuperate = true;
    const r = v.returnBeeToWork('t');
    assert.ok(r); assert.equal(B(v, 't').class, 'collector');
    assert.equal(B(v, 'c0').class, null); assert.equal(B(v, 'c0').life.recuperate, true);
});

test('sim fixes: a sick Rescue bee walks itself to a bed; beds in use never shrink; a sick leader still leads', async () => {
    const { v } = world([bee('res', { class: 'rescue', talent: 'rescue', life: life({ health: 30 }) }), bee('n', { class: 'nurse', talent: 'nurse', rarity: 'Rare', life: life({}) })]);
    await v.init();
    Object.assign(B(v, 'res'), { class: 'rescue', talent: 'rescue' }); Object.assign(B(v, 'n'), { class: 'nurse', talent: 'nurse' });
    B(v, 'res').life.health = 30;
    v._tendHive(noon());
    assert.equal(B(v, 'res').life.nursery, true);
    const total0 = v.nurseryBeds().total;
    v.state.hive.bees.push(bee('p1', { life: life({ nursery: true }) }), bee('p2', { life: life({ nursery: true }) }));
    B(v, 'n').class = null;                                              // the Nurse stops working
    assert.ok(v.nurseryBeds().total >= v.nurseryBeds().used);
    assert.equal(v.nurseryBeds().free, 0);
    B(v, 'n').class = 'nurse'; B(v, 'n').life.health = 25;            // sick, can't work, still the leader
    assert.equal((v.hiveLeader() || {}).id, 'n');
    assert.ok(total0 >= 2);
});
