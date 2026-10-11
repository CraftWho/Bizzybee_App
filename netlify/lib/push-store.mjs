// Phone reminders (Oct 2026): web push subscriptions + each user's upcoming
// reminder times. Saves are encrypted, so the server can't read reminders
// from them - instead the app uploads a short list of upcoming reminder
// times (next ~10 days) whenever tasks change. push-send.mjs delivers them.
import { getStore } from '@netlify/blobs';

export const pushStore = () => getStore({ name: 'bizzybee-push', consistency: 'strong' });

export const MAX_SUBS = 6;          // devices per account
export const MAX_ITEMS = 400;       // upcoming reminders kept per account
export const MAX_SENT = 600;        // recently sent ids remembered (no repeats)
export const LATE_MS = 20 * 60000;  // a reminder more than 20 min late is skipped

const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export function cleanSubscription(sub) {
    if (!sub || !str(sub.endpoint, 1000) || !/^https:\/\//.test(sub.endpoint)) return null;
    const keys = sub.keys || {};
    if (!str(keys.p256dh, 200) || !str(keys.auth, 100)) return null;
    return { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export function cleanSchedule(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const item of list.slice(0, MAX_ITEMS)) {
        if (!item || !str(item.id, 160) || !str(item.at, 40)) continue;
        const at = Date.parse(item.at);
        if (!Number.isFinite(at)) continue;
        out.push({
            id: item.id,
            at: new Date(at).toISOString(),
            title: str(item.title, 80) ? item.title : '🐝 Bizzybee',
            body: typeof item.body === 'string' ? item.body.slice(0, 200) : '',
            url: str(item.url, 200) && item.url.startsWith('/') ? item.url : '/src/features/home/home.html'
        });
    }
    return out;
}

// Which reminders are due now and not sent yet.
export function dueItems(record, now = Date.now()) {
    const sent = new Set((record.sent || []).map(s => s.id));
    return (record.schedule || []).filter(i => {
        const at = Date.parse(i.at);
        return at <= now + 30000 && at > now - LATE_MS && !sent.has(i.id);
    });
}

// After a run: drop past items, remember what was sent.
export function afterSend(record, sentIds, now = Date.now()) {
    const sent = [...(record.sent || []), ...sentIds.map(id => ({ id, at: new Date(now).toISOString() }))].slice(-MAX_SENT);
    const schedule = (record.schedule || []).filter(i => Date.parse(i.at) > now - LATE_MS && !sentIds.includes(i.id));
    return { ...record, schedule, sent };
}

export function vapid() {
    const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return null;
    return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com' };
}
