// Grimzy claim reopened (Nov 9 2026, Craft): anyone signed in can claim one until
// Nov 16 (end of day Eastern) or until all 50 are taken. #001 stays the creator's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../netlify/functions/limited.mjs';

function memStore() {
    const m = new Map();
    return {
        m,
        async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
        async setJSON(k, v, o = {}) { if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; },
        async *list({ prefix }) { yield { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
    };
}
const call = async (s, user, body, { creator = false, now = '2026-11-10T12:00:00Z' } = {}) =>
    (await handle(new Request('https://x/', { method: 'POST', body: JSON.stringify(body) }), { s, user, creator, now: Date.parse(now) })).json();
const E = { edition: 'grimzy-2026' };
const u = (n) => ({ id: 'u' + n, email: `u${n}@example.com` });

test('claim: friends get #002, #003 (one each); the creator still gets #001', async () => {
    const s = memStore();
    assert.equal((await call(s, u(1), { action: 'status', ...E })).open, true);
    assert.equal((await call(s, u(1), { action: 'status', ...E })).left, 49);
    assert.equal((await call(s, u(1), { action: 'claim', ...E })).serial, 2);
    assert.equal((await call(s, u(1), { action: 'claim', ...E })).serial, 2);              // same person: same number
    assert.equal((await call(s, u(2), { action: 'claim', ...E })).serial, 3);
    assert.equal((await call(s, u(9), { action: 'claim', ...E }, { creator: true })).serial, 1);
    const st = await call(s, u(1), { action: 'status', ...E });
    assert.equal(st.mine, 2);
    assert.equal(st.left, 47);   // 49 numbers for friends (#002-#050), 2 taken; #001 is not counted
});

test('claim: closes after Nov 16 (Eastern) and when all 50 are taken; the creator can still claim', async () => {
    const s = memStore();
    const late = '2026-11-17T06:00:00Z';
    assert.equal((await call(s, u(1), { action: 'status', ...E }, { now: late })).open, false);
    assert.equal((await call(s, u(1), { action: 'claim', ...E }, { now: late })).ok, false);
    assert.equal((await call(s, u(1), { action: 'claim', ...E }, { now: '2026-11-17T04:00:00Z' })).ok, true);   // still Nov 16 in redacted
    for (let n = 2; n <= 49; n++) assert.ok((await call(s, u(100 + n), { action: 'claim', ...E })).ok);   // fills #003 - #050
    const last = await call(s, u(999), { action: 'claim', ...E });
    assert.equal(last.ok, false);
    assert.equal((await call(s, u(999), { action: 'status', ...E })).open, false);
    assert.equal((await call(s, u(5), { action: 'claim', ...E }, { creator: true })).serial, 1);
});
