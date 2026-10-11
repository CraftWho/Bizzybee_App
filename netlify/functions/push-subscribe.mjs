// Phone reminders: GET -> the public VAPID key. POST (signed in) ->
//   { subscription, schedule }  save this device + the upcoming reminders
//   { schedule }                just refresh the upcoming reminders
//   { disable: true, endpoint } remove this device
//   { test: true }              send a test notification to your devices
import webpush from 'web-push';
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';
import { pushStore, cleanSubscription, cleanSchedule, vapid, MAX_SUBS } from '../lib/push-store.mjs';

export default async (req) => {
    const keys = vapid();
    if (req.method === 'GET') {
        return keys ? json({ ok: true, publicKey: keys.publicKey }) : json({ ok: false, error: 'Phone reminders are not set up on the server yet (VAPID keys missing).' }, 503);
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    if (!keys) return json({ ok: false, error: 'Phone reminders are not set up on the server yet (VAPID keys missing).' }, 503);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Identity is unavailable. Please retry.' }, 503); }
    if (!user) return json({ ok: false, error: 'Not signed in' }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); }

    const store = pushStore();
    for (let attempt = 0; attempt < 3; attempt++) {
        const current = await store.getWithMetadata(user.id, { type: 'json' });
        const record = current?.data || { subs: [], schedule: [], sent: [] };
        let subs = record.subs || [];

        if (body.disable) {
            subs = subs.filter(s => s.endpoint !== body.endpoint);
        } else if (body.subscription) {
            const sub = cleanSubscription(body.subscription);
            if (!sub) return json({ ok: false, error: 'Invalid subscription' }, 400);
            subs = [...subs.filter(s => s.endpoint !== sub.endpoint), { ...sub, addedAt: new Date().toISOString() }].slice(-MAX_SUBS);
        }
        if (body.test) {
            webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
            const payload = JSON.stringify({ title: '🐝 Bizzybee', body: 'Phone reminders are on. You\'ll get your task reminders here.', tag: 'bizzybee-test', url: '/src/features/home/home.html' });
            const results = await Promise.allSettled(subs.map(s => webpush.sendNotification(s, payload, { TTL: 600, urgency: 'high' })));
            const sent = results.filter(r => r.status === 'fulfilled').length;
            return json({ ok: sent > 0, sent, error: sent ? undefined : 'No device accepted the test. Try turning reminders off and on again.' }, sent ? 200 : 502);
        }

        const next = { ...record, subs, updatedAt: new Date().toISOString() };
        if (Array.isArray(body.schedule)) next.schedule = cleanSchedule(body.schedule);
        if (!subs.length) { await store.delete(user.id); return json({ ok: true, devices: 0 }); }
        const result = await store.setJSON(user.id, next, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
        if (result.modified) return json({ ok: true, devices: subs.length, upcoming: next.schedule.length });
    }
    return json({ ok: false, error: 'Busy - please retry.' }, 409);
};
