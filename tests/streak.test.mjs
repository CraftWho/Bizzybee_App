// Streak (Nov 1 2026, Craft): a day counts once 5 tasks of any kind are done;
// not everything has to be finished. Habits don't count (Craft).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(extra) {
    const save = Object.assign({ schemaVersion: 8, user: { name: 'T' }, quests: [], hive: { bees: [], tickets: 0 }, onboarding: { stage: 'done' } }, extra);
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', context);
    return context.vault;
}
const T = '2026-11-03', Y = '2026-11-02', Y2 = '2026-11-01';

test('streak: 5 dailies / To-Dos / quest tasks make a day count; habits do not', async () => {
    const v = harness({
        dailyTasks: [{ id: 'd1', label: 'A', xp: 10, completedDates: [T, Y, Y2] }, { id: 'd2', label: 'B', xp: 10, completedDates: [Y] }],
        todos: [{ id: 't1', label: 'X', xp: 10, completed: true, completedDate: T }, { id: 't2', label: 'Z', xp: 10, completed: true, completedDate: Y }],
        quests: [{ id: 'q1', title: 'Q', tasks: [
            { id: 'qa', label: 'a', xp: 10, completed: true, dateCompleted: T }, { id: 'qb', label: 'b', xp: 10, completed: true, dateCompleted: T }, { id: 'qc', label: 'c', xp: 10, completed: true, dateCompleted: T },
            { id: 'qd', label: 'd', xp: 10, completed: true, dateCompleted: Y }, { id: 'qe', label: 'e', xp: 10, completed: true, dateCompleted: Y }] }],
        habits: [{ id: 'h1', label: 'H', history: [
            { id: 'h-1', date: T, direction: 'positive' }, { id: 'h-2', date: T, direction: 'positive' }, { id: 'h-3', date: T, direction: 'positive' },
            { id: 'h-4', date: Y, direction: 'positive' }, { id: 'h-5', date: Y, direction: 'positive' },
            { id: 'h-6', date: Y2, direction: 'negative' }, { id: 'h-7', date: Y2, direction: 'negative' }, { id: 'h-8', date: Y2, direction: 'negative' }, { id: 'h-9', date: Y2, direction: 'negative' }] }]
    });
    await v.init();
    assert.equal(v.tasksDoneOn(T), 5);      // 1 daily + 1 To-Do + 3 quest tasks (habit taps ignored)
    assert.equal(v.tasksDoneOn(Y), 5);      // 2 dailies + 1 To-Do + 2 quest tasks
    assert.equal(v.tasksDoneOn(Y2), 1);     // habit taps don't count
    assert.equal(v.taskStreak(T), 2);
    assert.equal(v.taskStreak('2026-11-04'), 2);   // tomorrow: today not at 5 yet, streak still standing
});
