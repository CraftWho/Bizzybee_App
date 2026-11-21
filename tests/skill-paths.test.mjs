// Skill paths (Oct 29 2026): each milestone's reward is claimed once, and saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const today = new Date().toLocaleDateString('sv-SE');
function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], dailyTasks: [], hive: { bees: [], tickets: 0, lifeTick: today }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event, CustomEvent: class extends Event { constructor(n, o) { super(n); this.detail = o && o.detail; } }, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', ctx);
    return { v: ctx.vault, saved: () => JSON.parse(data.get('bizzybee_user_data')) };
}
const todo = (id, label) => ({ id, label, difficulty: 'Easy', completed: true, completedDate: today + 'T09:00:00.000Z' });

test('skill paths: times-done milestone claims once and is saved', async () => {
    const { v, saved } = harness({ todos: [1, 2, 3, 4, 5].map(i => todo('t' + i, 'Wake up on time')),
        skillMeta: { 'Time Management': { measure: 'times' } } });
    await v.init();
    v.createLibrarySkill('Time Management');
    const p = v.getSkillPath('Time Management');
    assert.equal(p.progress, 5);
    assert.equal(p.milestones[0].name, 'Early Bird');
    assert.equal(p.milestones[0].reached, true);
    assert.equal(p.milestones[1].reached, false);
    assert.equal(v.skillPathWaiting('Time Management'), 1);
    const r = v.claimSkillMilestone('Time Management', p.milestones[0].id);
    assert.equal(r.reward.id, 'pollen');
    assert.equal(v.claimSkillMilestone('Time Management', p.milestones[0].id), null);   // only once
    assert.equal(v.claimSkillMilestone('Time Management', p.milestones[1].id), null);   // not reached
    const s = saved();
    assert.equal(s.inventory.materials.pollen, 5);
    assert.ok(s.pathClaims['Time Management'][p.milestones[0].id]);
    assert.equal(v.skillPathWaiting('Time Management'), 0);
});

test('skill paths: Codex tree nodes sit on the HTML path', async () => {
    const { v } = harness({ todos: [{ ...todo('h', 'Page layout'), tags: ['HTML'] }] });
    await v.init();
    const ids = v.getSkillPath('HTML', null).milestones.map(m => m.id);
    assert.ok(ids.includes('codex-architect') && ids.includes('semantic-html') && ids.includes('github-pages'));
    const last = v.getSkillPath('HTML', null).milestones.at(-1);
    assert.equal(last.reward.id, 'royal-jelly');
});
