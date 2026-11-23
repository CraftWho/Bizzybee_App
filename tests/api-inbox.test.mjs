import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomBytes } from 'node:crypto';
import { encryptSave, decryptSave } from '../netlify/lib/save-crypto.mjs';

const stores = new Map();
let etag = 0;
function store(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return {
        async get(key) { return structuredClone(data.get(key)?.data ?? null); },
        async getWithMetadata(key) { return structuredClone(data.get(key) ?? null); },
        async setJSON(key, value, options = {}) {
            if (options.onlyIfNew && data.has(key) || options.onlyIfMatch && options.onlyIfMatch !== data.get(key)?.etag) return { modified: false };
            const revision = 'r' + ++etag;
            data.set(key, { data: structuredClone(value), etag: revision });
            return { modified: true, etag: revision };
        },
        list(options = {}) {
            const blobs = [...data.keys()].filter(key => key.startsWith(options.prefix || '')).map(key => ({ key }));
            if (options.paginate) return (async function* () { yield { blobs }; })();
            return Promise.resolve({ blobs });
        },
        async delete(key) { data.delete(key); }
    };
}
mock.module('@netlify/blobs', { namedExports: { getStore: ({ name }) => store(name) } });
const save = (await import('../netlify/functions/save-state.mjs')).default;
const load = (await import('../netlify/functions/load-state.mjs')).default;
const backup = (await import('../netlify/functions/backups.mjs')).default;
const inbox = (await import('../netlify/functions/inbox.mjs')).default;
const api = (await import('../netlify/functions/api.mjs')).default;
const cloud = await import('../netlify/lib/cloud-store.mjs');
const sample = () => JSON.stringify({ schemaVersion: 8, user: { name: 'Test Bee' }, quests: [{ id: 'q', tasks: [{ id: 't', xp: 5, completed: true }] }], profilePhoto: 'data:image/jpeg;base64,TESTPHOTO' });
const req = (path, body, user = 'alice') => new Request('https://test.netlify.app/.netlify/functions/' + path, { method: body ? 'POST' : 'GET', headers: user ? { Authorization: `Bearer ${user}` } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => {
    stores.clear(); etag = 0;
    process.env.BIZZYBEE_SAVE_KEY = randomBytes(32).toString('hex');
    globalThis.fetch = async (url, options) => Response.json({ id: options.headers.Authorization.slice(7) });
});
const call = (key, body) => new Request('https://test.netlify.app/.netlify/functions/api', { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + key }, ...(body ? { body: JSON.stringify(body) } : {}) });

test('phone is main: after set-main only the phone writes; the PC gets not-main and proposes to the inbox', async () => {
    const first = await (await save(req('save-state', { data: sample(), revision: null, device: 'phone', becomeMain: true, deviceName: 'Android app' }))).json();
    assert.equal(first.ok, true);
    const pc = await save(req('save-state', { data: sample(), revision: first.revision, device: 'pc', takeover: true }));
    assert.equal(pc.status, 423);
    assert.equal((await pc.json()).code, 'not-main');
    const prop = await (await inbox(req('inbox', { action: 'propose', device: 'pc', deviceName: 'Windows PC', summary: ["Completed 'Gym'"], ops: [{ p: ['x'], n: 1, hn: true, ho: false }] }))).json();
    assert.equal(prop.ok, true);
    const box = await (await inbox(req('inbox'))).json();
    assert.equal(box.items.length, 1);
    assert.equal(box.items[0].from, 'pc');
    assert.equal(box.main.device, 'phone');
    const again = await (await save(req('save-state', { data: sample(), revision: first.revision, device: 'phone' }))).json();
    assert.equal(again.ok, true);                                    // main never needs a takeover
    assert.equal((await (await inbox(req('inbox', { action: 'done', ids: [box.items[0].id] }))).json()).removed, 1);
});

test('API: key made once (hash stored), reads a summary, queues writes for the phone, read-only and pause respected, revoke works', async () => {
    await save(req('save-state', { data: JSON.stringify({ schemaVersion: 8, user: { name: 'Craft' }, quests: [], dailyTasks: [{ id: 'd1', label: 'Gym', completedDates: [] }], todos: [{ id: 't1', label: 'Call mom' }], habits: [] }), revision: null, device: 'phone' }));
    const made = await (await inbox(req('inbox', { action: 'new-key', scope: 'write' }))).json();
    assert.match(made.key, /^bbk_/);
    const list = await (await inbox(req('inbox'))).json();
    assert.equal(list.keys.length, 1); assert.equal(list.keys[0].hash, undefined);   // the key itself is never stored or shown again
    assert.equal((await api(call('bbk_' + 'x'.repeat(32)))).status, 401);
    const read = await (await api(call(made.key))).json();
    assert.equal(read.save.dailies[0].label, 'Gym');
    assert.equal(read.save.todos[0].label, 'Call mom');
    const w = await (await api(call(made.key, { ops: [{ op: 'add', kind: 'daily', label: 'Stretch 10 min', minutes: 10 }, { op: 'complete', kind: 'todo', label: 'Call mom' }] }))).json();
    assert.equal(w.ok, true); assert.equal(w.queued, 2);
    const bad = await api(call(made.key, { ops: [{ op: 'delete-everything', kind: 'daily', label: 'x' }] }));
    assert.equal(bad.status, 400);
    const box = await (await inbox(req('inbox'))).json();
    assert.equal(box.items.length, 1); assert.equal(box.items[0].from, 'claude'); assert.equal(box.items[0].ops.length, 2);
    const ro = await (await inbox(req('inbox', { action: 'new-key', scope: 'read' }))).json();
    assert.equal((await api(call(ro.key, { ops: [{ op: 'add', kind: 'todo', label: 'x' }] }))).status, 403);
    await inbox(req('inbox', { action: 'pause', paused: true }));
    assert.equal((await api(call(made.key))).status, 423);
    await inbox(req('inbox', { action: 'pause', paused: false }));
    await inbox(req('inbox', { action: 'revoke-key', prefix: made.prefix }));
    assert.equal((await api(call(made.key))).status, 401);
});

// Nov 23 2026 (Craft): the API's "today" follows the phone's time zone, not UTC.
test('API: doneToday uses the local day of the save\'s time zone, with UTC only as the fallback', async () => {
    const { summarize, dayIn } = await import('../netlify/functions/api.mjs');
    const night = new Date('2026-11-24T01:30:00Z');   // 8:30 PM Nov 23 in New York
    assert.equal(dayIn('America/New_York', night), '2026-11-23');
    assert.equal(dayIn(undefined, night), '2026-11-24');
    assert.equal(dayIn('Not/AZone', night), '2026-11-24');
    const state = { timeZone: 'America/New_York', dailyTasks: [{ id: 'd1', label: 'Gym', completedDates: ['2026-11-23'] }] };
    const sum = summarize(state, night);
    assert.equal(sum.today, '2026-11-23');
    assert.equal(sum.dailies[0].doneToday, true);
    assert.equal(summarize({ ...state, timeZone: undefined }, night).dailies[0].doneToday, false);
});
