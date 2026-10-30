// Save merge: two copies of a save become one (db.js, Oct 28 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('const MERGE_LISTS'), src.indexOf('const Vault = new DatabaseManager()'));
const ctx = {};
vm.runInNewContext(block + '\nthis.M = { stampSaveChanges, mergeSaves };', ctx);
const { stampSaveChanges, mergeSaves } = ctx.M;
const plain = (o) => JSON.parse(JSON.stringify(o));

test('merge: a daily done on one copy, a different day on the other, both stay', () => {
    const a = { updatedAt: '2026-10-28T10:00:00Z', dailyTasks: [{ id: 'd1', completedDates: ['2026-10-27'], _days: { '2026-10-27': { done: true, t: 100 } }, _mt: 100 }] };
    const b = { updatedAt: '2026-10-28T09:00:00Z', dailyTasks: [{ id: 'd1', completedDates: ['2026-10-28'], _days: { '2026-10-28': { done: true, t: 90 } }, _mt: 90 }] };
    const m = plain(mergeSaves(a, b));
    assert.deepEqual(m.dailyTasks[0].completedDates, ['2026-10-27', '2026-10-28']);
});

test('merge: a later uncheck beats an earlier check', () => {
    const a = { updatedAt: '2026-10-28T10:00:00Z', dailyTasks: [{ id: 'd1', completedDates: ['2026-10-28'], _days: { '2026-10-28': { done: true, t: 100 } }, _mt: 100 }] };
    const b = { updatedAt: '2026-10-28T09:00:00Z', dailyTasks: [{ id: 'd1', completedDates: [], _days: { '2026-10-28': { done: false, t: 200 } }, _mt: 200 }] };
    assert.deepEqual(plain(mergeSaves(a, b)).dailyTasks[0].completedDates, []);
});

test('merge: newer change to the same to-do wins, new items from both stay', () => {
    const a = { updatedAt: '2026-10-28T10:00:00Z', todos: [{ id: 't1', label: 'old', _mt: 50 }, { id: 't2', label: 'pc', _mt: 60 }] };
    const b = { updatedAt: '2026-10-28T09:00:00Z', todos: [{ id: 't1', label: 'new', _mt: 80 }, { id: 't3', label: 'phone', _mt: 70 }] };
    const m = plain(mergeSaves(a, b));
    assert.deepEqual(m.todos.map(t => t.id + ':' + t.label).sort(), ['t1:new', 't2:pc', 't3:phone']);
});

test('merge: a deleted item stays deleted', () => {
    const shadow = stampSaveChanges({ todos: [{ id: 't1', label: 'x' }] }, null, 10);
    const a = { updatedAt: '2026-10-28T10:00:00Z', todos: [] };
    stampSaveChanges(a, shadow, 100);
    assert.equal(a._tomb['todos:t1'], 100);
    const b = { updatedAt: '2026-10-28T09:00:00Z', todos: [{ id: 't1', label: 'x', _mt: 10 }] };
    assert.equal(plain(mergeSaves(a, b)).todos.length, 0);
});

test('merge: habit taps from both devices are kept', () => {
    const a = { updatedAt: '2026-10-28T10:00:00Z', habits: [{ id: 'h1', history: [{ d: '2026-10-28', v: 1 }], _mt: 100 }] };
    const b = { updatedAt: '2026-10-28T09:00:00Z', habits: [{ id: 'h1', history: [{ d: '2026-10-28', v: 1 }, { d: '2026-10-27', v: -1 }], _mt: 90 }] };
    assert.equal(plain(mergeSaves(a, b)).habits[0].history.length, 2);
});

test('stamp: only changed items get a new time', () => {
    const s = { todos: [{ id: 't1', label: 'a', _mt: 5 }, { id: 't2', label: 'b', _mt: 5 }] };
    const shadow = stampSaveChanges(s, null, 5);
    s.todos[1].label = 'c';
    stampSaveChanges(s, shadow, 9);
    assert.deepEqual(s.todos.map(t => t._mt), [5, 9]);
});
