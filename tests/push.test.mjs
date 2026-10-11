// Phone reminders: the server's pure helpers (no network, no Blobs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSubscription, cleanSchedule, dueItems, afterSend } from '../netlify/lib/push-store.mjs';

test('push: subscriptions must be https with keys', () => {
    assert.equal(cleanSubscription({ endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } }), null);
    assert.equal(cleanSubscription({ endpoint: 'https://x' }), null);
    assert.deepEqual(cleanSubscription({ endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' }, extra: 1 }),
        { endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } });
});

test('push: schedule items are cleaned and capped', () => {
    const list = cleanSchedule([{ id: 'a', at: '2026-10-11T12:00:00Z', body: 'x'.repeat(500), url: 'https://evil' }, { id: 'b', at: 'nope' }, null]);
    assert.equal(list.length, 1);
    assert.equal(list[0].body.length, 200);
    assert.equal(list[0].url, '/src/features/home/home.html');
});

test('push: due once, never twice, late ones skipped', () => {
    const now = Date.parse('2026-10-11T12:00:00Z');
    const record = { schedule: [
        { id: 'due', at: '2026-10-11T12:00:10Z' },
        { id: 'later', at: '2026-10-11T13:00:00Z' },
        { id: 'tooLate', at: '2026-10-11T11:00:00Z' }
    ], sent: [] };
    assert.deepEqual(dueItems(record, now).map(i => i.id), ['due']);
    const next = afterSend(record, ['due'], now);
    assert.deepEqual(next.schedule.map(i => i.id), ['later']);
    // The app re-uploads the same item: still not sent again.
    assert.deepEqual(dueItems({ ...next, schedule: [...next.schedule, { id: 'due', at: '2026-10-11T12:00:10Z' }] }, now).map(i => i.id), []);
});
