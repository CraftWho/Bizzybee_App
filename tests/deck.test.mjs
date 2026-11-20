import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, cleanGames } from '../netlify/functions/deck.mjs';

const mem = () => { const m = new Map(); return { async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; }, async setJSON(k, v) { m.set(k, JSON.stringify(v)); }, async delete(k) { m.delete(k); } }; };
const post = (body, auth) => new Request('https://x/deck', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) });
const J = async (p) => (await p).json();

test('deck: QR pairing, check-off inbox, games', async () => {
    const s = mem(), user = { id: 'u1' };
    const st = await J(handle(post({ action: 'start' }), { s }));
    assert.equal((await J(handle(post({ action: 'poll', code: st.code, pollKey: st.pollKey }), { s }))).pending, true);
    assert.equal((await handle(post({ action: 'approve', code: st.code }), { s })).status, 401);
    await handle(post({ action: 'approve', code: st.code }, 'Bearer x'), { s, user });
    assert.equal((await handle(post({ action: 'poll', code: st.code, pollKey: 'wrong' }), { s })).status, 410);
    const tok = (await J(handle(post({ action: 'poll', code: st.code, pollKey: st.pollKey }), { s }))).token;
    assert.match(tok, /^[a-f0-9]{64}$/);
    assert.equal((await handle(post({ action: 'poll', code: st.code, pollKey: st.pollKey }), { s })).status, 410);   // one use
    const dev = `Device ${tok}`;
    await handle(post({ action: 'push-snapshot', snapshot: { dailies: [{ id: 'd1', title: 'Run', done: false }] } }, 'Bearer x'), { s, user });
    await handle(post({ action: 'complete', kind: 'daily', id: 'd1' }, dev), { s });
    const snap = await J(handle(post({ action: 'snapshot' }, dev), { s }));
    assert.equal(snap.snapshot.dailies[0].done, true);
    const box = await J(handle(post({ action: 'inbox' }, 'Bearer x'), { s, user }));
    assert.equal(box.events.length, 1);
    await handle(post({ action: 'ack', eids: [box.events[0].eid] }, 'Bearer x'), { s, user });
    assert.equal((await J(handle(post({ action: 'inbox' }, 'Bearer x'), { s, user }))).events.length, 0);
    await handle(post({ action: 'unlink' }, 'Bearer x'), { s, user });
    assert.equal((await handle(post({ action: 'snapshot' }, dev), { s })).status, 401);
});

test('deck: games are cleaned', () => {
    assert.deepEqual(cleanGames([{ appid: '12a3', name: 'G', minutes: -5, ach: 2 }, { name: 'no id' }]).map(g => [g.appid, g.minutes, g.ach]), [['123', 0, 2]]);
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
async function vault() {
    const data = new Map([['bizzybee_user_data', JSON.stringify({ schemaVersion: 8, user: { name: 'T', level: 1 }, quests: [] })]]);
    const ctx = vm.createContext({ localStorage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) }, console: { log() {}, error() {} }, Event, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', ctx);
    const v = ctx.vault; await v.init(); return v;
}
test('gaming XP: first sight is a baseline; minutes and achievements pay once, with daily caps', async () => {
    const v = await vault(), g = (minutes, ach) => [{ appid: '1', name: 'G', minutes, ach, achTotal: 50 }];
    v.deckApplyGames(g(1000, 10));
    assert.equal(v.getGaming().xp || 0, 0);
    v.deckApplyGames(g(1065, 12));          // +2 blocks (4 XP) +2 ach (20 XP)
    assert.equal(v.getGaming().xp, 24);
    v.deckApplyGames(g(1065, 12));          // same data: nothing more
    assert.equal(v.getGaming().xp, 24);
    v.deckApplyGames(g(1065, 20));          // +8 ach, daily cap 50 -> only 3 more (30)
    assert.equal(v.getGaming().xp, 54);
});

test('steps pay as you walk (100 steps = 1 min = 1 XP), goal bonus once; goal can be set', async () => {
    const v = await vault(), day = new Date(); const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const stepXP = () => v.state.bonusXP.filter(b => String(b.key).endsWith(iso)).reduce((n, b) => n + b.xp, 0);
    assert.equal(v.getStepGoal(), 8000);
    assert.equal(v.setStepGoal(500).ok, false);
    assert.equal(v.setStepGoal(6000).goal, 6000);
    v.state.steps = { [iso]: 4527 };
    assert.equal(v.stepGoalTick(iso), null);           // no prize yet, but the walk already counts
    assert.equal(stepXP(), 45);
    v.state.steps[iso] = 6500;
    const r = v.stepGoalTick(iso);
    assert.ok(r.gave.length >= 1); assert.equal(r.xp, 20 + 25);   // 20 more walking minutes + the goal bonus
    assert.equal(stepXP(), 65 + 25);
    assert.equal(v.stepGoalTick(iso), null);            // no repeats
    assert.equal(stepXP(), 90);
    v.state.steps[iso] = 10000; v.stepGoalTick(iso);
    assert.equal(stepXP(), 100 + 25);
    assert.equal(v.getRealBySkill().Fitness, 100); assert.equal(v.getRealBySkill().Health, 100);
    assert.equal(v.getStepStats(iso).streak, 1);
});