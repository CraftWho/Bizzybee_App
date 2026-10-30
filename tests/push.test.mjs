// Phone reminders: the server's pure helpers (no network, no Blobs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSubscription, cleanSchedule, dueItems, afterSend, nextAt } from '../netlify/lib/push-store.mjs';

test('push: subscriptions and schedules are cleaned and capped', () => {
    assert.equal(cleanSubscription({ endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } }), null);
    assert.equal(cleanSubscription({ endpoint: 'https://x' }), null);
    assert.deepEqual(cleanSubscription({ endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' }, extra: 1 }),
        { endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } });
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

// Oct 29 2026: the sender runs every 15 min and sends early, never late.
test('push: 15-minute sender sends up to 15 min early and knows the next time', () => {
    const now = Date.parse('2026-10-11T12:00:00Z');
    const record = { schedule: [{ id: 'soon', at: '2026-10-11T12:07:00Z' }, { id: 'later', at: '2026-10-11T12:16:00Z' }], sent: [{ id: 'old' }] };
    assert.deepEqual(dueItems(record, now).map(i => i.id), ['soon']);
    assert.equal(nextAt(record), Date.parse('2026-10-11T12:07:00Z'));
    assert.equal(nextAt(afterSend(record, ['soon'], now)), Date.parse('2026-10-11T12:16:00Z'));
    assert.equal(nextAt({ schedule: [] }), Infinity);
});
