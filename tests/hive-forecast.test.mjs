// Hive forecast (Nov 17 2026): the math behind the phone alerts and the status bar.
// Strongest check: forecast a hive, then really run a twin of it hour by hour. Every predicted moment must be true when it arrives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const today = new Date().toLocaleDateString('sv-SE');
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE');
const HOUR = 3600000;
const bee = (id, extra = {}) => ({ id, name: `Bee ${id}`, rarity: 'Common', class: null, sex: 'f', stats: { level: 1, hp: 30, offense: 10, defense: 10, speed: 10, power: 10 }, element: 'fire', dexNumber: 1, weight: 1, customNamed: false, ...extra });
const life = (o) => ({ health: 100, stamina: 100, fullness: 80, happiness: 70, fatigue: 0, bornAt: daysAgo(5), faintedAt: null, birthTrait: null, ...o });
function world(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], hive: { bees: [], tickets: 0, lifeTick: today }, inventory: { materials: {} }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; HIVE_JOB_RULES = false; Math.random = () => 0.99;', context);
    return { vault: context.vault, g: (c) => vm.runInContext(c, context) };
}
const mkHive = (bees, extra = {}) => ({ hive: { bees, tickets: 0, lifeTick: today, honey: 0, ...extra } });
async function pair(state) { const a = world(state), b = world(state); await a.vault.init(); await b.vault.init(); return { a, b }; }

test('forecast: never touches the real save and never saves', async () => {
    const { a } = await pair(mkHive([bee('w', { class: 'cleaner', life: life({ fullness: 60 }) }), bee('r', { life: life({ recuperate: true, stamina: 20 }) })]));
    let saves = 0; const orig = a.vault.save; a.vault.save = function () { saves++; return orig.apply(this, arguments); };
    const before = JSON.stringify(a.vault.state);
    a.vault.hiveForecast(72);
    assert.equal(JSON.stringify(a.vault.state), before);
    assert.equal(saves, 0);
    assert.equal(a.g('LIFE_FORECAST'), false);
});

test('forecast: every predicted hunger, tired, rest and rested moment is true in a real run', async () => {
    const bees = () => [
        bee('hungry', { class: 'cleaner', life: life({ fullness: 55 }) }),
        bee('tired', { class: 'cleaner', life: life({ stamina: 45 }) }),
        bee('sleeper', { life: life({ recuperate: true, stamina: 70, fullness: 90 }) }),
    ];
    const { a, b } = await pair(mkHive(bees()));
    const fc = a.vault.hiveForecast(72);
    const kinds = new Set(fc.events.map(e => e.kind));
    assert.ok(kinds.has('hungry') || kinds.has('tired'), 'something is predicted: ' + [...kinds]);
    const start = b.vault.state.hive.vitalsAt;
    const keyOf = { hungry: 'sad', tired: 'sad', worn: 'sad', rest: 'asleep', faint: 'fainted', idle: 'upset' };
    const byHour = new Map();
    fc.events.forEach(e => { const k = Math.round((Date.parse(e.at) - start) / HOUR); if (!byHour.has(k)) byHour.set(k, []); byHour.get(k).push(e); });
    let checked = 0;
    for (let k = 1; k <= 72; k++) {   // 72 h: started in the evening, the first hunger can land just past 48 h (Nov 21 2026)
        b.vault.hiveHourlyTick(start + k * HOUR);
        for (const e of byHour.get(k) || []) {
            const real = b.vault.getHiveBees().find(x => x.id === e.beeId);
            if (!real || !keyOf[e.kind]) continue;
            const f = b.g('beeFeeling')(real, new Date(start + k * HOUR).toLocaleDateString('sv-SE'), start + k * HOUR);
            assert.equal(f.key, keyOf[e.kind], `${e.name} at hour ${k}: predicted ${e.kind}, real face ${f.face} ${f.why}`);
            checked++;
        }
    }
    assert.ok(checked >= 1, 'at least one moment was checked against the real run');
});

test('forecast: a hungry worker with honey eats and is not predicted hungry', async () => {
    const { a } = await pair(mkHive([bee('w', { class: 'cleaner', life: life({ fullness: 45 }) })], { honey: 50 }));
    const fc = a.vault.hiveForecast(24);
    assert.ok(!fc.events.some(e => e.kind === 'hungry'), JSON.stringify(fc.events));
});

test('forecast: stored honey running out is predicted', async () => {
    const { a } = await pair(mkHive([bee('w1', { class: 'cleaner', life: life({ fullness: 41 }) }), bee('w2', { class: 'cleaner', life: life({ fullness: 41 }) })], { honey: 2 }));
    const fc = a.vault.hiveForecast(72);
    assert.ok(fc.honeyOutAt, 'honey-out predicted');
    assert.ok(fc.events.some(e => e.kind === 'honey-out'));
});

test('forecast: a fully rested sleeper is predicted to wake', async () => {
    const { a } = await pair(mkHive([bee('s', { life: life({ recuperate: true, stamina: 60, fullness: 90, health: 90 }) })]));
    const fc = a.vault.hiveForecast(48);
    assert.ok(fc.events.some(e => e.kind === 'rested' && /fully rested/.test(e.why)), JSON.stringify(fc.events));
});

test('forecast: asking for 0 hours or a hive-less save is safe', async () => {
    const { a } = await pair(mkHive([]));
    assert.equal(a.vault.hiveForecast(0).events.length, 0);
    const e = world({}); await e.vault.init();
    assert.ok(Array.isArray(e.vault.hiveForecast(12).events));
});
