// Hive Life (Oct 2026): sex, vitals, faint/death, old age, roles, revive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const bee = (id, extra = {}) => ({ id, name: `Bee ${id}`, rarity: 'Common', class: null, stats: { level: 1, hp: 30, offense: 10, defense: 10, speed: 10, power: 10 }, element: 'fire', dexNumber: 1, weight: 1, customNamed: false, ...extra });
function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], hive: { bees: [], tickets: 0 }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; HIVE_JOB_RULES = false; Math.random = () => 0.99; LIFE.deathEnabled = true;', context);
    return { vault: context.vault, g: (code) => vm.runInContext(code, context) };
}

test('hive life: old bees get sex and vitals, age starts today, workers stay female', async () => {
    const h = harness({ hive: { bees: [bee('a', { class: 'collector' }), bee('b')], tickets: 0 } });
    await h.vault.init();
    const [a, b] = h.vault.getHiveBees();
    assert.equal(a.sex, 'f');
    assert.ok(['f', 'm'].includes(b.sex));
    assert.equal(a.life.bornAt, today);
    assert.equal(a.life.health, 100);
    assert.equal(h.vault.getFallenBees().length, 0);
});

test('hive life: a sick, starving bee faints hour by hour, then dies after 3 days; Undertakers leave pollen', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: daysAgo(5), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const h = harness({ hive: { bees: [
        bee('weak', { sex: 'f', life: life({ health: 1, fullness: 0, sickUntil: daysAgo(-30) }) }),
        bee('ut', { sex: 'f', class: 'undertaker', life: life({}) })
    ], tickets: 0, lifeTick: daysAgo(5), vitalsAt: Date.now() - 5 * 86400000 }, inventory: { materials: {} } });
    await h.vault.init();
    const names = h.vault.getHiveBees().map(b => b.id);
    assert.ok(!names.includes('weak'));
    const fallen = h.vault.getFallenBees();
    assert.equal(fallen[0].id, 'weak');
    assert.equal(fallen[0].cause, 'neglect');
    assert.ok(h.vault.state.inventory.materials.pollen >= 1);
    assert.equal(h.vault.state.hive.lifeTick, today);
    assert.ok(h.vault.getLifeEvents().some(e => e.type === 'death'));
});

test('hive life: old age, Royal Jelly extends life', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: daysAgo(50), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const h = harness({ hive: { bees: [bee('old', { sex: 'f', life: life({}) }), bee('jelly', { sex: 'f', life: life({ royalJelly: true }) })], tickets: 0, lifeTick: daysAgo(1) } });
    await h.vault.init();
    assert.equal(h.vault.getHiveBees().map(b => b.id).join(), "jelly");
    assert.equal(h.vault.getFallenBees()[0].cause, 'old age');
});

test('hive life: only males can be Drones; revive and Royal Jelly cost Honey Drops', async () => {
    const h = harness({ hive: { bees: [bee('f1', { sex: 'f' }), bee('m1', { sex: 'm' })], tickets: 0 }, inventory: { materials: { 'honey-drop': 16 } } });
    await h.vault.init();
    assert.equal(h.vault.assignBeeClass('f1', 'drone'), null);
    assert.equal(h.vault.assignBeeClass('m1', 'collector'), null);
    assert.equal(h.vault.assignBeeClass('m1', 'drone').class, 'drone');
    assert.equal(h.vault.assignBeeClass('f1', 'guardian').class, 'guardian');
    const f1 = h.vault.getHiveBees()[0];
    f1.life.faintedAt = today; f1.life.health = 0;
    assert.equal(h.vault.reviveBee('f1').ok, true);
    assert.equal(h.vault.state.inventory.materials['honey-drop'], 6);
    assert.equal(h.vault.getHiveBees()[0].life.faintedAt, null);
    assert.equal(h.vault.reviveBee('f1').ok, false);
    assert.equal(h.vault.craftRoyalJelly().ok, true);
    assert.equal(h.vault.giveRoyalJelly('f1').ok, true);
    assert.equal(h.g('beeLifespan(Vault.getHiveBees()[0])'), 120);
});

test('hive life: streak, mood, feeding and one counter-raid a day', async () => {
    const dailies = [{ id: 'd', label: 'x', completedDates: [daysAgo(1), daysAgo(2), daysAgo(3)], startDate: daysAgo(10) }];
    const h = harness({ dailyTasks: dailies, hive: { bees: [bee('a', { sex: 'f' })], tickets: 0 } });
    await h.vault.init();
    assert.equal(h.vault.getHiveStreak(), 3);
    assert.equal(h.g('computeHiveStreak([{ id: "d", completedDates: [], startDate: "2020-01-01" }], "' + today + '", 0)'), -14);
    assert.equal(h.g('computeHiveStreak([{ id: "d", completedDates: [], startDate: "2020-01-01" }], "' + today + '", 2)') > -14, true);
    const a = h.vault.getHiveBees()[0];
    a.life.fullness = 50;
    h.vault._feedHive();
    assert.equal(a.life.fullness, 54);
    assert.equal(h.g('beeMood(Vault.getHiveBees()[0], 3).label'), 'Joyful');
    const r = h.vault.counterRaid();
    assert.equal(r.ok, true);
    assert.equal(h.vault.counterRaid().ok, false);
});

test('hive life: with death paused, a long-fainted or old bee stays in the hive', async () => {
    const life = (o) => ({ health: 0, stamina: 0, fullness: 0, happiness: 10, bornAt: daysAgo(90), faintedAt: daysAgo(6), royalJelly: false, birthTrait: null, ...o });
    const h = harness({ hive: { bees: [bee('kept', { sex: 'f', life: life({}) })], tickets: 0, lifeTick: daysAgo(5) } });
    h.g('LIFE.deathEnabled = false');
    await h.vault.init();
    assert.equal(h.vault.getHiveBees().map(b => b.id).join(), 'kept');
    assert.equal(h.vault.getFallenBees().length, 0);
});

test('comb rooms: new bees start as eggs, can\'t take a job until they hatch, and hatch (faster with a Nurse)', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: daysAgo(5), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const h = harness({ hive: { bees: [
        bee('egg1', { sex: 'f', class: 'guardian', life: life({ hatchOn: today }) }),
        bee('egg2', { sex: 'f', life: life({ hatchOn: tomorrow }) }),
        bee('nurse', { sex: 'f', class: 'nurse', life: life({}) })
    ], tickets: 0, lifeTick: daysAgo(1) } });
    await h.vault.init();
    // Ready eggs wait for a tap (Oct 28 2026), then hatch.
    assert.ok(h.vault.getHiveBees().slice(0, 2).every(b => b.life.readyAt));
    assert.ok(h.vault.hatchEgg('egg1') && h.vault.hatchEgg('egg2'));
    const [e1, e2] = h.vault.getHiveBees();
    assert.equal(e1.life.hatchOn, undefined);
    assert.equal(e1.class, 'guardian');
    assert.equal(e2.life.hatchOn, undefined);          // the Nurse took a day off
    assert.equal(e2.life.idleSince, today);
    assert.ok(h.vault.getLifeEvents().some(e => e.type === 'hatch'));

    const fresh = h.vault.awardBee('gacha');
    assert.ok(h.g('beeIsBrood')(fresh));
    assert.equal(h.g('beeCanWork')(fresh), false);
    assert.equal(h.vault.assignBeeClass(fresh.id, 'honeymaker'), null);   // eggs keep everything secret (Oct 27 2026)
    assert.equal(fresh.class, null);
    assert.equal(fresh.life.idleSince, undefined);
    assert.equal(h.g('beeFeeling')(fresh).key, 'egg');
});

test('comb rooms: faces - happy, sad when lacking, upset after 3 days with no job', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: daysAgo(5), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const h = harness({ hive: { bees: [
        bee('ok', { sex: 'f', class: 'cleaner', life: life({}) }),
        bee('hungry', { sex: 'f', class: 'cleaner', life: life({ fullness: 20 }) }),
        bee('idle', { sex: 'f', life: life({ idleSince: daysAgo(4) }) }),
        bee('new-idle', { sex: 'f', life: life({ idleSince: today }) })
    ], tickets: 0, lifeTick: today } });
    await h.vault.init();
    const feel = (id) => h.g('beeFeeling')(h.vault.getHiveBees().find(b => b.id === id)).key;
    assert.equal(feel('ok'), 'happy');
    assert.equal(feel('hungry'), 'sad');
    assert.equal(feel('idle'), 'upset');
    assert.equal(feel('new-idle'), 'calm');
    h.vault.assignBeeClass('idle', 'cleaner');
    assert.equal(feel('idle'), 'happy');
});

test('bee names: new bees get real names; old default names are replaced once, renamed bees kept', async () => {
    const h = harness({ hive: { bees: [
        bee('d1', { name: 'Common Bee #3' }),
        bee('mine', { name: 'Rare Bee #4', customNamed: true }),
        bee('ok', { name: 'Sir Buzzalot' })
    ], tickets: 0 } });
    await h.vault.init();
    const [d1, mine, ok] = h.vault.getHiveBees();
    assert.ok(!/Bee #\d+$/.test(d1.name));
    assert.equal(mine.name, 'Rare Bee #4');
    assert.equal(ok.name, 'Sir Buzzalot');
    const fresh = h.vault.awardBee('gacha');
    assert.ok(!/Bee #\d+$/.test(fresh.name));
    const names = h.vault.getHiveBees().map(b => b.name.toLowerCase());
    assert.equal(new Set(names).size, names.length);
    const full = h.g('BEE_NAME_POOL').slice();
    assert.match(h.g('randomBeeName')(full), / (II|III)$/);
});

test('named titles: old Named names split into name + title; Identity Card keeps the name; title powers', async () => {
    const h = harness({ hive: { bees: [
        bee('n1', { rarity: 'Named', name: 'Comet The Relentless' }),
        bee('n2', { rarity: 'Named', name: 'Sir Kin' }),
        bee('c1', { name: 'Hazel', class: 'guardian', sex: 'f' })
    ], tickets: 0 }, inventory: { materials: {}, items: { 'identity-card': 1 }, fragments: {} } });
    await h.vault.init();
    const [n1, n2] = h.vault.getHiveBees();
    assert.equal(n1.name, 'Comet');
    assert.equal(n1.title, 'relentless');
    assert.equal(n2.name, 'Sir Kin');
    assert.ok(h.g('NAMED_TITLES')[n2.title]);
    const r = h.vault.evolveToNamed('c1', 'identity-card');
    assert.equal(r.bee.name, 'Hazel');
    assert.equal(r.bee.rarity, 'Named');
    assert.ok(r.bee.title);
    r.bee.title = 'guardian'; r.bee.class = 'guardian';
    assert.ok(h.g('beeTitlePower')(r.bee, 'guardian'));
    // the title locks the job
    assert.equal(h.vault.assignBeeClass('c1', 'collector'), null);
    assert.ok(h.vault.assignBeeClass('c1', 'guardian'));
    assert.equal(h.g('beeLockedJob')(r.bee), 'guardian');
    assert.equal(h.g('beeFullName')(n1), 'Comet “The Relentless”');
});

test('talents: every normal bee is born with one; Named Beasts and the Queen have none', async () => {
    const h = harness({ hive: { bees: [bee('a', { sex: 'f' }), bee('m', { sex: 'm' }), bee('r', { rarity: 'Royal' })], tickets: 0 } });
    await h.vault.init();
    const [a, m, r] = h.vault.getHiveBees();
    assert.ok(h.g('BEE_CLASSES')[a.talent] && !h.g('BEE_CLASSES')[a.talent].maleOnly);
    assert.equal(m.talent, 'drone');
    assert.equal(r.talent, undefined);
    a.class = a.talent;
    assert.equal(h.g('beeTalentBoost')(a), 1.2);
    const fresh = h.vault.awardBee('gacha');
    assert.ok(fresh.talent);
});

test('bee models: finds are remembered after the bee is gone; first visit has no NEW tags', async () => {
    const h = harness({ hive: { bees: [bee('a', { element: 'water', class: 'collector' })], tickets: 0 } });
    await h.vault.init();
    const seen = h.vault.getSeenModels();
    assert.ok(seen['rar:Common'] && seen['el:water'] && seen['hive:worker']);
    assert.ok(!seen['rar:Legendary'] && !seen['el:wind']);
    assert.ok(h.vault.getViewedModels().includes('el:water'));       // already had it: no NEW
    h.vault.addHiveBee(bee('n', { rarity: 'Named', title: 'wanderer', element: 'wind' }));
    assert.ok(h.vault.getSeenModels()['title:wanderer']);
    assert.ok(!h.vault.getViewedModels().includes('title:wanderer')); // a new find: NEW
    h.vault.markModelViewed('title:wanderer');
    assert.ok(h.vault.getViewedModels().includes('title:wanderer'));
    h.vault.destroyBee('n');
    const after = h.vault.getSeenModels();
    assert.ok(after['title:wanderer'] && after['el:wind'] && after['rar:Named']);
});

test('#CamelCase: splits into words, still matches its task, old terms and tags are renamed', async () => {
    const h = harness({ plugins: { dictionary: true },
        dictionary: [{ id: 't1', name: 'TimeManagement', category: 'Productivity', source: 'hashtag' }, { id: 't2', name: 'HTML', category: 'HTML', source: 'hashtag' }],
        todos: [{ id: 'x', label: 'Plan week #TimeManagement', tags: ['TimeManagement'], completed: false }],
        skillLevels: { TimeManagement: { level: 3, leveledUpAt: null } }, timeXPVersion: 1 });
    await h.vault.init();
    assert.equal(h.g('splitTagWords("TimeManagement")'), 'Time Management');
    assert.equal(h.g('splitTagWords("CSSGrid")'), 'CSS Grid');
    assert.equal(h.g('splitTagWords("HTML")'), 'HTML');
    assert.deepEqual([...h.g('findHashtags("go #TimeManagement and #event-loop")')], ['Time Management', 'event loop']);
    const names = h.vault.getDictionaryTerms().map(t => t.name);
    assert.ok(names.includes('Time Management') && names.includes('HTML') && !names.includes('TimeManagement'));
    assert.deepEqual([...h.vault.state.todos[0].tags], ['Time Management']);
    assert.equal(h.vault.state.skillLevels['Time Management'].level, 3);
    const cats = h.g(`skillMatcher(Vault.state.dictionary)('Read about #TimeManagement', [])`).map(c => c.category);
    assert.ok(cats.includes('Productivity'));
});

test('hour by hour: work costs by job, rest helps less by day than at night, Nursery heals 4x and frees the bed', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, fatigue: 0, bornAt: daysAgo(5), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const h = harness({ hive: { bees: [
        bee('fora', { sex: 'f', class: 'collector', talent: 'scout', life: life({}) }),
        bee('rest', { sex: 'f', life: life({ stamina: 20, fatigue: 60, recuperate: true }) }),
        bee('bed', { sex: 'f', life: life({ health: 40, nursery: true }) })
    ], tickets: 0, lifeTick: today } });
    await h.vault.init();
    const v = h.vault, B = (id) => v.getHiveBees().find(b => b.id === id);
    const at = (hr) => { const d = new Date(); d.setHours(hr, 0, 0, 0); return d; };
    v._lifeHour(at(10));                                   // daytime hour
    assert.equal(B('fora').life.stamina, 94);              // Forager: -6 stamina
    assert.equal(B('fora').life.fatigue, 3);
    assert.equal(B('rest').life.stamina, 24);              // day rest +4
    assert.equal(B('rest').life.fatigue, 57);
    assert.equal(B('bed').life.health, 44);                // Nursery +4 (no Nurse)
    v._lifeHour(at(23));                                   // night: everyone sleeps
    assert.equal(B('fora').life.stamina, 100);             // +7, capped
    assert.equal(B('rest').life.fatigue, 51);              // -6 at night
    for (let i = 0; i < 12; i++) v._lifeHour(at(12));
    assert.equal(B('bed').life.nursery, undefined);        // healed (90+) and left the bed
    assert.equal(h.g('beeHurtLevel')({ life: { health: 25 } }), 3);
    assert.equal(h.g('beeCanWork')({ life: { health: 25, stamina: 90 } }), false);   // severely hurt can't work
    assert.equal(h.g('beeWellFactor')({ life: { health: 45, stamina: 90, fullness: 80 } }), 0.7);   // badly hurt = -30%
});

test('held items: Rare and up hold them, use-up items fire when needed, gear counts', async () => {
    const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, fatigue: 0, bornAt: daysAgo(5), faintedAt: null, royalJelly: false, birthTrait: null, ...o });
    const h = harness({ hive: { bees: [
        bee('com', { sex: 'f', life: life({}) }),
        bee('rare', { sex: 'f', rarity: 'Rare', class: 'collector', life: life({ fullness: 45 }) }),
        bee('leg', { sex: 'f', rarity: 'Legendary', life: life({}) })
    ], tickets: 0, lifeTick: today }, inventory: { materials: {}, items: { 'honey-extract': 1, 'wax-shield': 2 } } });
    await h.vault.init();
    const v = h.vault, B = (id) => v.getHiveBees().find(b => b.id === id);
    assert.equal(v.giveBeeItem('com', 'honey-extract').ok, false);       // Common: no slot
    assert.equal(v.giveBeeItem('rare', 'honey-extract').ok, true);
    assert.equal(v.state.inventory.items['honey-extract'], 0);
    assert.equal(v.giveBeeItem('leg', 'wax-shield', 1).ok, true);         // Legendary: 2 slots
    assert.equal(h.g('beeGear')(B('leg'), 'defense'), 1.15);
    const d = new Date(); d.setHours(10, 0, 0, 0);
    v._lifeHour(d); v._lifeHour(d);                                       // Forager: -4 an hour, drops below 40
    assert.ok(B('rare').life.fullness >= 70);                             // the Honey Extract fired (+40)
    assert.equal(B('rare').held[0], null);
    assert.equal(v.takeBeeItem('leg', 1), true);
    assert.equal(v.state.inventory.items['wax-shield'], 2);
});
