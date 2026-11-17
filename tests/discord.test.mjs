import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, notify, webhookFor } from '../netlify/lib/discord.mjs';
import { handle } from '../netlify/functions/report.mjs';

const HOOK = 'https://discord.com/api/webhooks/123456789/abc-DEF_ghi';
const env = { DISCORD_WEBHOOK_REPORTS: HOOK };
const mem = () => { const m = new Map(); return { async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; }, async setJSON(k, v) { m.set(k, JSON.stringify(v)); } }; };
const post = (body) => new Request('https://x/report', { method: 'POST', body: JSON.stringify(body) });

test('discord: keys, tokens, emails and webhook addresses are blanked', () => {
    const t = redact(`Authorization: Bearer abcdefgh12345678 token="sekret-value-1" mail me@x.com ${HOOK} ${'a'.repeat(64)}`);
    for (const bad of ['abcdefgh12345678', 'sekret-value-1', 'me@x.com', '/api/webhooks/', 'a'.repeat(64)]) assert.ok(!t.includes(bad), bad);
});
test('discord: only a real Discord webhook is used, and none means quiet', async () => {
    assert.equal(webhookFor('reports', { DISCORD_WEBHOOK_REPORTS: 'https://evil.example/hook' }), '');
    assert.equal(webhookFor('logs', { DISCORD_WEBHOOK_URL: HOOK }), HOOK);
    assert.equal(await notify('reports', { title: 'x' }, { env: {} , fetchImpl: () => { throw new Error('no'); } }), false);
});
test('report: posts to Discord with the log attached, waits between reports', async () => {
    const sent = []; const fetchImpl = async (url, init) => { sent.push({ url, init }); return { ok: true }; };
    const s = mem();
    const r = await handle(post({ kind: 'bug', message: 'It broke', page: 'home', app: '1.0', logs: ['10:00 home error: boom token=abcd1234efgh'] }), { s, env, fetchImpl, now: 1000 });
    assert.equal(r.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, HOOK);
    assert.ok(sent[0].init.body instanceof FormData);
    const again = await handle(post({ message: 'again' }), { s, env, fetchImpl, now: 2000 });
    assert.equal(again.status, 429);
    assert.equal((await handle(post({ message: '' }), { s: mem(), env, fetchImpl })).status, 400);
    assert.equal((await handle(post({ message: 'hi' }), { s: mem(), env: {}, fetchImpl })).status, 503);
});
