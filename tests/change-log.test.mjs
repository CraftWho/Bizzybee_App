// One change log (Nov 21 2026, Craft): save changes + honesty notes + cloud events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../src/core/ui/change-log/change-log.js', import.meta.url), 'utf8') + '\nglobalThis.CL = ChangeLog;', ctx);
const { merge } = vm.runInContext('CL', ctx);
const at = (min) => new Date(Date.UTC(2026, 10, 21, 12, min, 0)).toISOString();

test('change log: a note sits on the save change logged right after it', () => {
    const journal = [{ id: 1, at: at(0), sum: ['Gym ✓'] }, { id: 2, at: at(10), sum: ['Gym unchecked'] }];
    const notes = [{ at: new Date(Date.parse(at(10)) - 3000).toISOString(), type: 'uncheck', text: 'Unchecked "Gym"', note: '−30m', flag: false }];
    const rows = merge(journal, notes, []);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].e.id, 2);                 // newest first
    assert.equal(rows[0].notes.length, 1);
    assert.equal(rows[0].honest, true);
    assert.equal(rows[1].notes.length, 0);
});

test('change log: a note with no change nearby stands on its own, flags carry', () => {
    const journal = [{ id: 1, at: at(30) }];
    const notes = [{ at: at(0), type: 'edit', text: 'Logged time', note: 'Big change', flag: true }];
    const rows = merge(journal, notes, []);
    assert.equal(rows.length, 2);
    const lone = rows.find(r => r.kind === 'note');
    assert.equal(lone.flag, true);
    assert.equal(lone.honest, true);
    assert.equal(rows.find(r => r.kind === 'change').notes.length, 0);   // 30 min later: not its change
});

test('change log: a note never lands on an earlier change; cloud events are kept apart', () => {
    const journal = [{ id: 1, at: at(0) }];
    const notes = [{ at: at(1), type: 'delete', text: 'Deleted x', note: '' }];
    const cloud = [{ at: at(2), kind: 'upload', msg: 'Uploaded' }, { at: at(3), kind: 'save-point', msg: 'x' }];
    const rows = merge(journal, notes, cloud);
    assert.equal(rows.filter(r => r.kind === 'cloud').length, 1);   // save-point rows are skipped
    assert.equal(rows.find(r => r.kind === 'change').notes.length, 0);
    assert.equal(rows.filter(r => r.kind === 'note').length, 1);
    assert.equal(rows.map(r => r.kind).join(), 'cloud,note,change');
});

test('change log: empty is fine', () => {
    assert.equal(merge([], [], []).length, 0);
    assert.equal(merge(undefined, undefined, undefined).length, 0);
});
