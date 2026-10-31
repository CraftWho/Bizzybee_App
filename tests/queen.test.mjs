// Queen stats + Start My Day (Oct 2026): coins, health, faint, and the
// yesterday review with Guard Bee / Streak Charm saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const iso = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = iso(0), y = iso(-1);
function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], hive: { bees: [], tickets: 0 }, onboarding: { stage: 'done' }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Math.random = () => 0.99;', context);
    return { v: context.vault, g: (c) => vm.runInContext(c, context) };
}
const daily = (id, extra = {}) => ({ id, label: `Daily ${id}`, xp: 10, difficulty: 'Medium', repeats: { type: 'daily', every: 1, daysOfWeek: [] }, startDate: iso(-30), completedDates: [], ...extra });

test('queen: coins come from tasks finished since the start, health heals once per task', async () => {
    const { v } = harness({ dailyTasks: [daily('a')], todos: [{ id: 't1', label: 'x', xp: 10, difficulty: 'Hard', completed: false }] });
    await v.init();
    v.state.queen.hp = 40;
    v.toggleDailyTask('a');
    assert.equal(v.getQueenStats().coins, 3);
    assert.equal(v.getQueenStats().hp, 41);
    v.toggleDailyTask('a'); v.toggleDailyTask('a');           // un-check, re-check: no extra heal
    assert.equal(v.getQueenStats().hp, 41);
    v.toggleDailyTask('a');                                     // un-checked: coins go back
    assert.equal(v.getQueenStats().coins, 0);
    v.toggleTodoComplete('t1');
    assert.equal(v.getQueenStats().coins, 5);
});

test('queen: bad habit hurts; at 0 she faints and loses 10% coins, never a level', async () => {
    const { v } = harness({ habits: [{ id: 'h', label: 'Snack', xp: 5, difficulty: 'Hard', positive: true, negative: true, history: [] }] });
    await v.init();
    v.state.queen.hp = 3;
    v.state.queen.spent = -100;                                 // pretend 100 coins
    v.bumpHabit('h', 'negative');                               // Hard/2 = 4 -> faint
    const s = v.getQueenStats();
    assert.equal(s.hp, 25);
    assert.equal(s.coins, 90);
    assert.ok(s.fainted);
});

test('start my day: credits yesterday, Guard Bee and Streak Charm save streaks, misses hurt', async () => {
    const hist = [iso(-2), iso(-3), iso(-4)];
    const { v } = harness({
        dailyTasks: [daily('did', { completedDates: hist.slice() }), daily('g', { completedDates: hist.slice() }), daily('c', { completedDates: [iso(-2), iso(-3)] }), daily('lost', { completedDates: [iso(-2)] })],
        hive: { bees: [{ id: 'gb', name: 'Bramble', rarity: 'Common', class: 'guardian', jobSince: iso(-10), sex: 'f', stats: { hp: 10, defense: 5 }, life: { health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: iso(-20), faintedAt: null } }], tickets: 0, lifeTick: today },
        inventory: { materials: {}, items: { 'streak-charm': 1 }, fragments: {} }
    });
    await v.init();
    v.state.queen.guardLog = [{ beeId: 'gb', date: today }];   // 1 of 2 saves used this week
    const r0 = v.getDayReview();
    assert.equal(r0.dailies.length, 4);
    assert.equal(r0.guards[0].left, 1);
    const r = v.finishDayReview({ doneDailyIds: ['did'] });
    assert.equal(r.credited, 1);
    const by = Object.fromEntries(r.saves.map(s => [s.id, s.by]));
    assert.equal(by.g, 'guard');                                // longest streak saved first
    assert.equal(by.c, 'charm');
    assert.equal(by.lost, 'lost');
    assert.equal(r.damage, 12);                                 // 3 missed Medium dailies
    assert.equal(v.state.inventory.items['streak-charm'], 0);
    const streak = (id) => v.getDailyTasks().find(t => t.id === id).streak;
    assert.equal(streak('g'), 4);
    assert.equal(streak('lost'), 0);
    assert.equal(v.getDayReview(), null);                       // once a day
});

test('start my day: a new guard (under 3 days) cannot shield', async () => {
    const { v } = harness({
        dailyTasks: [daily('g', { completedDates: [iso(-2), iso(-3)] })],
        hive: { bees: [{ id: 'gb', name: 'New', rarity: 'Common', class: 'guardian', jobSince: iso(-1), sex: 'f', stats: { hp: 10, defense: 5 }, life: { health: 100, stamina: 100, fullness: 80, happiness: 70, bornAt: iso(-20), faintedAt: null } }], tickets: 0, lifeTick: today }
    });
    await v.init();
    assert.equal(v.getDayReview().guards.length, 0);
    assert.equal(v.finishDayReview({}).saves[0].by, 'lost');
});
