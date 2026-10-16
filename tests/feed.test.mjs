// Calendar feed: the pure .ics builder (no network, no Blobs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, dailyRule, cleanItems, newToken, validToken } from '../netlify/lib/feed.mjs';

const state = {
    calendarEvents: [{ id: 'e1', date: '2026-10-16', time: '18:30', title: 'Team, training; night', notes: 'Room 2\nbring notes' }, { id: 'e2', date: '2026-10-20', title: 'All day thing' }],
    todos: [{ id: 't1', label: 'Push update', dueDate: '2026-10-17' }, { id: 't2', label: 'Done one', dueDate: '2026-10-17', completed: true }, { id: 't3', label: 'No date' }],
    dailyTasks: [{ id: 'd1', label: 'Code', startDate: '2026-10-01' }, { id: 'd2', label: 'Gym', startDate: '2026-10-01', repeats: { type: 'weekly', every: 2, daysOfWeek: [5, 1] } }]
};

test('feed: events, due to-dos, no dailies by default', () => {
    const ics = buildIcs(state, undefined, Date.parse('2026-10-16T00:00:00Z'));
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /DTSTART:20261016T183000\r\nDURATION:PT1H/);
    assert.match(ics, /SUMMARY:📌 Team\\, training\\; night/);
    assert.match(ics, /DESCRIPTION:Room 2\\nbring notes/);
    assert.match(ics, /DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021/);
    assert.match(ics, /✅ Push update/);
    assert.doesNotMatch(ics, /Done one|No date|☀️/);
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
});

test('feed: dailies become repeating events', () => {
    const ics = buildIcs(state, { events: false, todos: false, dailies: true });
    assert.match(ics, /RRULE:FREQ=DAILY\r\n/);
    assert.match(ics, /RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR/);
    assert.equal(dailyRule({ repeats: { type: 'weekly', daysOfWeek: [] } }), null);
    assert.equal(dailyRule({ startDate: '2026-01-31', repeats: { type: 'monthly', every: 1 } }), 'FREQ=MONTHLY;BYMONTHDAY=-1');
});

test('feed: long lines fold, items and tokens are checked', () => {
    const ics = buildIcs({ calendarEvents: [{ id: 'x', date: '2026-10-16', title: 'a'.repeat(200) }] }, { events: true });
    for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
    assert.deepEqual(cleanItems({ events: false, todos: 'yes', junk: true }), { events: false, todos: true, dailies: false });
    assert.ok(validToken(newToken()));
    assert.equal(validToken('../etc'), false);
});
