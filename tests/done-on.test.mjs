// Oct 31 2026 (Craft): Vault.doneOn is the one list behind XP today, Done
// today and History. Quest tasks use the local day; a bad habit tap costs half.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('doneOn: totals match the level bar math', async () => {
    const pad = (n) => String(n).padStart(2, '0'), d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const save = { schemaVersion: 8, user: { name: 'T' }, onboarding: { stage: 'done' }, hive: { bees: [] },
        dailyTasks: [{ id: 'd1', label: 'Read', xp: 15, completedDates: [today] }],
        todos: [{ id: 't1', label: 'Mail', xp: 10, completed: true, completedDate: today }],
        habits: [{ id: 'h1', label: 'Snack', difficulty: 'Easy', history: [{ id: 'x-1', direction: 'negative', date: today }, { id: 'x-2', direction: 'positive', date: today }] }],
        quests: [{ id: 'q1', title: 'Course', tasks: [{ id: 'k1', label: 'Lesson', xp: 30, completed: true, dateCompleted: new Date().toISOString() }] }] };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {}, warn() {} }, Event, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', ctx);
    const v = ctx.vault;
    await v.init();
    const list = v.doneOn(today);
    assert.equal(list.length, 5);
    const habit = [...list].filter(x => x.kind === 'habit').map(x => x.xp).sort((a, b) => a - b);
    assert.deepEqual([...habit], [-8, 15]);              // Easy = 15 XP; a bad tap costs half (8)
    assert.equal(list.find(x => x.kind === 'quest').label, 'Lesson');
    assert.equal(v.doneOn('2001-01-01').length, 0);
});
