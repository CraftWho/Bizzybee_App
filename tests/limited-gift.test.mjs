// Grimzy gifts (Nov 1 2026, Craft): the creator sends a numbered card with a
// letter to an email; that person gets it once, with that number.
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
const call = async (s, user, body, creator = false) => (await handle(new Request('https://x/', { method: 'POST', body: JSON.stringify(body) }), { s, user, creator, now: Date.parse('2026-11-02T12:00:00Z') })).json();
const craft = { id: 'u-craft', email: 'Craft@Example.com' }, her = { id: 'u-her', email: 'her@example.com' };

test('gift: creator sends #002, she gets it once; numbers never repeat', async () => {
    const s = memStore();
    assert.equal((await call(s, her, { action: 'gift', edition: 'grimzy-2026', email: her.email, serial: 2, letter: 'Hi' })).ok, false);   // not the creator
    const sent = await call(s, craft, { action: 'gift', edition: 'grimzy-2026', email: 'HER@example.com', serial: 2, letter: 'Happy Halloween!' }, true);
    assert.equal(sent.ok, true);
    assert.equal((await call(s, craft, { action: 'gift', edition: 'grimzy-2026', email: 'other@example.com', serial: 2 }, true)).ok, false);   // #002 is taken
    const inbox = await call(s, her, { action: 'inbox' });
    assert.equal(inbox.gifts.length, 1);
    assert.equal(inbox.gifts[0].serial, 2);
    assert.equal(inbox.gifts[0].letter, 'Happy Halloween!');
    assert.equal((await call(s, craft, { action: 'inbox' }, true)).gifts.length, 0);   // not his
    assert.equal((await call(s, her, { action: 'accept', edition: 'grimzy-2026' })).serial, 2);
    assert.equal((await call(s, her, { action: 'inbox' })).gifts.length, 0);
    assert.equal((await call(s, her, { action: 'status', edition: 'grimzy-2026' })).mine, 2);
});

test('gift: the creator can send himself #001, even if he claimed it before', async () => {
    const s = memStore();
    await call(s, craft, { action: 'claim', edition: 'grimzy-2026', day: '2026-10-31' }, true);   // creator can claim any time: #001
    const r = await call(s, craft, { action: 'gift', edition: 'grimzy-2026', email: craft.email, serial: 1, letter: 'For me' }, true);
    assert.equal(r.ok, true);
    assert.equal((await call(s, craft, { action: 'accept', edition: 'grimzy-2026' }, true)).serial, 1);
});
