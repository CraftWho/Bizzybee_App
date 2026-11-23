// Nov 23 2026 (Craft): the Discord "is live" post (netlify/functions/deploy-succeeded.mjs).
// It posts once per version label, only for live deploys, and only to a real Discord webhook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { announce, cleanWebhook, message } from '../netlify/functions/deploy-succeeded.mjs';

const HOOK = 'https://discord.com/api/webhooks/123456789/abc-DEF_ghi';
function setup(label, last = null) {
    const posts = []; let saved = last;
    const fetchFn = async (url, opts) => {
        if (String(url).endsWith('/version.json')) return { ok: true, json: async () => ({ batch: label }) };
        posts.push(JSON.parse(opts.body)); return { ok: true, status: 204 };
    };
    return { posts, run: (payload, webhook = HOOK) => announce({ payload, webhook, fetchFn, lastBatch: async () => saved, saveBatch: async (b) => { saved = b; } }) };
}

test('announce: a live deploy posts the version once, and a redeploy of the same version stays quiet', async () => {
    const a = setup('Version 1.1.0');
    assert.equal(await a.run({ context: 'production' }), 'announced Version 1.1.0');
    assert.equal(a.posts.length, 1);
    assert.match(a.posts[0].content, /BizzyBee Version 1\.1\.0 is live/);
    assert.deepEqual(a.posts[0].allowed_mentions, { parse: [] });
    assert.match(await a.run({ context: 'production' }), /already announced/);
    assert.equal(a.posts.length, 1);
});

test('announce: test deploys, a missing label and a bad webhook all do nothing', async () => {
    assert.match(await setup('Version 1.1.0').run({ context: 'deploy-preview' }), /not a live deploy/);
    assert.match(await setup(null).run({ context: 'production' }), /no batch/);
    assert.match(await setup('Version 1.1.0').run({ context: 'production' }, 'https://example.com/hook'), /no announcement webhook/);
    assert.equal(cleanWebhook(' "' + HOOK + '" '), HOOK);
    assert.match(message('Version 1.1.0').content, /Version 1\.1\.0/);
});
