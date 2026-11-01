// CORS (Nov 1 2026, Craft): only the Android app's own copy may call the
// cloud functions from another origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCors } from '../netlify/lib/cors.mjs';

const h = withCors(async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
const req = (method, origin) => new Request('https://bizzybeee.netlify.app/.netlify/functions/x', { method, headers: origin ? { origin } : {} });

test('cors: the app copy is allowed, other sites are not', async () => {
    const pre = await h(req('OPTIONS', 'https://localhost'));
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.equal((await h(req('OPTIONS', 'https://evil.example'))).status, 403);
    const get = await h(req('GET', 'https://localhost'));
    assert.equal(get.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.equal(await get.text(), '{"ok":true}');
    const other = await h(req('GET', 'https://evil.example'));
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const same = await h(req('GET'));
    assert.equal(same.status, 200);
});
