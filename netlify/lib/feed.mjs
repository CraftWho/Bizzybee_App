// Calendar feed (Oct 2026): a private link any calendar app (Google
// Calendar on Android, Apple, Outlook) can subscribe to. One-way: the app
// reads Bizzybee, never writes. The link holds a long random token; it
// maps to one account and can be turned off or replaced anytime.
import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';

export const feeds = () => getStore({ name: 'bizzybee-feeds', consistency: 'strong' });
export const FEED_ITEMS = ['events', 'todos', 'dailies'];
export const DEFAULT_ITEMS = { events: true, todos: true, dailies: false };
export const newToken = () => randomBytes(24).toString('base64url');
export const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t);

export function cleanItems(items) {
    const out = {};
    for (const k of FEED_ITEMS) out[k] = items && typeof items[k] === 'boolean' ? items[k] : DEFAULT_ITEMS[k];
    return out;
}

// RFC 5545 text escaping and 75-octet line folding.
const esc = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
    const out = [];
    let cur = '';
    for (const ch of line) {
        if (Buffer.byteLength(cur + ch, 'utf8') > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
        cur += ch;
    }
    out.push(cur);
    return out.join('\r\n ');
}
const ymd = (s) => /^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10).replace(/-/g, '') : null;
const nextDay = (d8) => {
    const d = new Date(Date.UTC(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8) + 1));
    return d.toISOString().slice(0, 10).replace(/-/g, '');
};
const stamp = (now) => new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// A daily's repeat schedule as an RRULE (matches db.js isDailyDueOn).
export function dailyRule(daily) {
    const r = daily.repeats || { type: 'daily', every: 1 };
    const every = Math.max(1, Math.min(365, Number(r.every) || 1));
    const iv = every > 1 ? `;INTERVAL=${every}` : '';
    if (r.type === 'weekly') {
        const days = (r.daysOfWeek || []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
        if (!days.length) return null;
        return `FREQ=WEEKLY${iv};BYDAY=${[...new Set(days)].sort().map(d => DAYS[d]).join(',')}`;
    }
    if (r.type === 'monthly') {
        const day = daily.startDate ? Number(String(daily.startDate).slice(8, 10)) : 1;
        return `FREQ=MONTHLY${iv};BYMONTHDAY=${day > 28 ? -1 : day}`;
    }
    return `FREQ=DAILY${iv}`;
}

export function buildIcs(state, items, now = Date.now()) {
    const want = cleanItems(items);
    const dt = stamp(now);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bizzybee//Calendar Feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'X-WR-CALNAME:🐝 Bizzybee', 'X-PUBLISHED-TTL:PT3H', 'REFRESH-INTERVAL;VALUE=DURATION:PT3H'];
    const add = (uid, summary, start, extra = []) => {
        lines.push('BEGIN:VEVENT', `UID:${uid}@bizzybee`, `DTSTAMP:${dt}`, ...start, `SUMMARY:${esc(summary)}`, ...extra, 'END:VEVENT');
    };
    const allDay = (d8) => [`DTSTART;VALUE=DATE:${d8}`, `DTEND;VALUE=DATE:${nextDay(d8)}`];
    const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'x';

    if (want.events) for (const e of state.calendarEvents || []) {
        const d8 = ymd(e && e.date);
        if (!d8 || !e.title) continue;
        const time = /^\d{2}:\d{2}$/.test(e.time || '') ? e.time.replace(':', '') : null;
        // Timed events use "floating" local time, so they show at the
        // same clock time the event was entered with.
        const start = time ? [`DTSTART:${d8}T${time}00`, 'DURATION:PT1H'] : allDay(d8);
        add(`event-${safeId(e.id || d8 + e.title)}`, `📌 ${e.title}`, start, e.notes ? [`DESCRIPTION:${esc(String(e.notes).slice(0, 500))}`] : []);
    }
    if (want.todos) for (const t of state.todos || []) {
        const d8 = ymd(t && t.dueDate);
        if (!d8 || t.completed || !t.label) continue;
        add(`todo-${safeId(t.id)}`, `✅ ${t.label}`, allDay(d8));
    }
    if (want.dailies) for (const d of state.dailyTasks || []) {
        const rule = d && d.label ? dailyRule(d) : null;
        const d8 = ymd(d && d.startDate) || ymd(new Date(now).toISOString());
        if (!rule) continue;
        add(`daily-${safeId(d.id)}`, `☀️ ${d.label}`, allDay(d8), [`RRULE:${rule}`]);
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
}
