// Ask first (Oct 31 2026, Craft): a new tag next to a skill, and an everyday
// skill you keep doing, are only offered. Nothing joins the Dictionary until
// you say yes; a "No" is never asked again. A skill merge keeps a device copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], dailyTasks: [], todos: [], habits: [], plugins: { dictionary: true },
        dictionary: [{ id: 'd1', name: 'Array', category: 'JavaScript' }], hive: { bees: [], tickets: 0 }, onboarding: { stage: 'done' }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {}, warn() {} }, Event, setTimeout, CustomEvent: class extends Event { constructor(n, o) { super(n); this.detail = o && o.detail; } },
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', ctx);
    return { v: ctx.vault, data };
}
const words = (v) => v.getDictionaryTerms().map(t => t.name);

test('ask first: a new tag next to a skill is offered, not added', async () => {
    const { v } = harness();
    await v.init();
    v.addTodo({ label: 'Practice', tags: ['JavaScript', 'Closure'], difficulty: 'Easy' });
    assert.ok(!words(v).includes('Closure'));
    const o = v.getOffers();
    assert.equal(o.length, 1);
    assert.equal(o[0].name, 'Closure');
    v.answerOffer(o[0].id, true);
    const t = v.getDictionaryTerms().find(x => x.name === 'Closure');
    assert.equal(t.category, 'JavaScript');
    assert.equal(v.getOffers().length, 0);
});

test('ask first: "No" is remembered and never asked again', async () => {
    const { v } = harness();
    await v.init();
    v.addTodo({ label: 'A', tags: ['JavaScript', 'Hoisting'], difficulty: 'Easy' });
    v.answerOffer(v.getOffers()[0].id, false);
    v.addTodo({ label: 'B', tags: ['JavaScript', 'Hoisting'], difficulty: 'Easy' });
    assert.equal(v.getOffers().length, 0);
    assert.ok(!words(v).includes('Hoisting'));
});

test('ask first: an everyday skill is offered after 2 check-offs, not made', async () => {
    const { v } = harness();
    await v.init();
    v.noteCheckoff({ label: 'Go for a run' });
    v.noteCheckoff({ label: 'Gym workout' });
    assert.ok(!v.hasSkill('Fitness'));
    const o = v.getOffers().find(x => x.kind === 'skill');
    assert.equal(o.name, 'Fitness');
    v.answerOffer(o.id, true);
    assert.ok(v.hasSkill('Fitness'));
});

test('skill merge: device copy first, Undo restores', async () => {
    const { v, data } = harness({ todos: [{ id: 't1', label: 'x', tags: ['JS'], completed: false }] });
    await v.init();
    v.mergeSkill('JS', 'JavaScript');
    assert.deepEqual([...v.state.todos[0].tags], ['JavaScript']);
    const backups = JSON.parse(data.get('bizzybee_user_data:backups') || '[]');
    assert.ok(backups.some(b => b.reason === 'Before merging JS into JavaScript'));
    assert.ok(v.undoMerge());
    assert.deepEqual([...v.state.todos[0].tags], ['JS']);
});

test('times-done skill: Level up works when its bar is full', async () => {
    const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
    const { v } = harness({ todos: Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, label: 'Run', tags: ['Fitness'], difficulty: 'Trivial', completed: true, completedDate: day(i) })),
        skillMeta: { Fitness: { measure: 'times' } } });
    await v.init();
    const row = v.getSkillMatrix().find(m => m.category === 'Fitness');
    assert.equal(row.maxed, true);
    const r = await v.levelUpSkill('Fitness');
    assert.ok(r, 'level up should succeed');
});
