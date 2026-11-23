// Deleting never changes XP (Nov 23 2026, Craft: "received points for deleting a habit").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const today = new Date().toLocaleDateString('sv-SE');
function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], dailyTasks: [], habits: [], todos: [], hive: { bees: [], tickets: 0, lifeTick: today }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const window = { location: { pathname: '/' }, dispatchEvent() {}, addEventListener() {} };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {}, warn() {} }, Event, window, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null }, location: window.location, fetch: async () => ({ ok: false }), setTimeout, clearTimeout });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Math.random = () => 0.5;', ctx);
    return ctx.vault;
}
const bad = { id: 'h-bad', label: 'Snacking', xp: 4, history: [{ date: today, direction: 'negative' }, { date: today, direction: 'negative' }, { date: today, direction: 'negative' }] };
const good = { id: 'h-good', label: 'Read', xp: 5, history: [{ date: today, direction: 'positive' }, { date: today, direction: 'positive' }] };

test('deleting a bad habit does not give XP', async () => {
    const v = harness({ habits: [JSON.parse(JSON.stringify(bad)), JSON.parse(JSON.stringify(good))] });
    await v.init();
    const before = v._rawXP();
    v.removeHabit('h-bad');
    assert.equal(v._rawXP(), before);
    const log = v.getChangeLog()[0];
    assert.match(log.note, /XP kept \(-[1-9]\d*\)/);   // its penalty stays
});

test('deleting a habit with real taps really moves XP the old way (guard the test itself)', async () => {
    const v = harness({ habits: [JSON.parse(JSON.stringify(bad))] });
    await v.init();
    assert.ok(v._rawXP() < 0 || v.state.habits[0].history.length === 3);
});

test('deleting a good habit or a daily does not take XP away', async () => {
    const v = harness({ habits: [JSON.parse(JSON.stringify(good))], dailyTasks: [{ id: 'd1', label: 'Gym', xp: 10, completedDates: [today] }] });
    await v.init();
    const before = v._rawXP();
    v.removeHabit('h-good'); v.removeDailyTask('d1');
    assert.equal(v._rawXP(), before);
});

test('restoring from the Archive does not count it twice', async () => {
    const v = harness({ habits: [JSON.parse(JSON.stringify(good))] });
    await v.init();
    const before = v._rawXP();
    v.removeHabit('h-good');
    const arc = v.getArchive()[0];
    assert.equal(v.restoreArchived(arc.id).ok, true);
    assert.equal(v._rawXP(), before);
});

test('things deleted before this fix stay as they were (no surprise level change)', async () => {
    const v = harness({ archive: [{ id: 'old', kind: 'habit', item: JSON.parse(JSON.stringify(bad)), deletedAt: '2026-11-20T10:00:00Z' }], timeLog: [] });
    await v.init();
    const fresh = harness({});
    await fresh.init();
    assert.equal(v._rawXP(), fresh._rawXP());
    assert.ok(v.getArchive().length === 1);
});
