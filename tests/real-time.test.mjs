// Real time, Archive and Change log (Nov 7 2026, Craft): only logged minutes
// count toward 10,000 hours, and deleting or editing never takes them away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T', level: 1 }, quests: [], dailyTasks: [], habits: [], todos: [], hive: { bees: [], tickets: 0, vitalsAt: Date.now() }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Vault.__run = (c) => eval(c);', context);
    return context.vault;
}
const daily = (id, extra = {}) => ({ id, label: id, difficulty: 'Medium', completedDates: [], repeats: 'daily', ...extra });

test('real time: old logged minutes and imported history count; planned-only check-offs do not', async () => {
    const v = harness({
        dailyTasks: [daily('d1', { minutes: 30, completedDates: ['2026-11-01', '2026-11-02'], minutesLog: { '2026-11-02': 45 } })],
        quests: [{ id: 'q', title: 'Q', tasks: [{ id: 't1', label: 'old', xp: 90, completed: true, historyXP: 90, dateCompleted: '2026-08-01' }, { id: 't2', label: 'planned', xp: 60, minutes: 60, completed: true, dateCompleted: '2026-11-01' }] }]
    });
    await v.init();
    assert.equal(v.getRealMinutes(), 45 + 90);
    assert.ok(v.getPlannedMinutes() >= 30 * 2 + 60);
});

test('real time: logging, same-day uncheck, delete keeps it, edits never touch it', async () => {
    const v = harness({ dailyTasks: [daily('run', { minutes: 30 })] });
    await v.init();
    v.toggleDailyTask('run');
    v.logCompletionMinutes('daily', 'run', 40);
    assert.equal(v.getRealMinutes(), 40);
    v.toggleDailyTask('run');                       // same-day uncheck: it comes off
    assert.equal(v.getRealMinutes(), 0);
    assert.equal(v.getChangeLog()[0].type, 'uncheck');
    v.toggleDailyTask('run');
    v.logCompletionMinutes('daily', 'run', 50);
    v.updateDailyTask('run', { minutes: 5 });         // edit: XP changes, real time doesn't
    assert.equal(v.getRealMinutes(), 50);
    assert.equal(v.getChangeLog()[0].type, 'edit');
    v.removeDailyTask('run');                         // delete: kept, archived
    assert.equal(v.getRealMinutes(), 50);
    const arc = v.getArchive();
    assert.equal(arc.length, 1);
    assert.equal(arc[0].item.label, 'run');
    assert.ok(v.restoreArchived(arc[0].id).ok);
    assert.equal(v.state.dailyTasks.length, 1);
    assert.equal(v.getArchive().length, 0);
    assert.equal(v.getRealMinutes(), 50);             // never counted twice
});

test('real time: fill in later waits, then counts; a big late change is flagged', async () => {
    const v = harness({ todos: [{ id: 'x', label: 'Fix bug', difficulty: 'Medium', completed: false }] });
    await v.init();
    v.toggleTodoComplete('x');
    assert.ok(v.timeLater('todo', 'x'));
    assert.equal(v.getTimePending().length, 1);
    assert.equal(v.getRealMinutes(), 0);
    assert.ok(v.fillTimePending(v.getTimePending()[0].key, 20));
    assert.equal(v.getTimePending().length, 0);
    assert.equal(v.getRealMinutes(), 20);
    v.logCompletionMinutes('todo', 'x', 240);         // 20 -> 240: flagged
    const e = v.getChangeLog()[0];
    assert.equal(e.type, 'edit');
    assert.ok(e.flag);
    assert.equal(v.getRealMinutes(), 240);
});
