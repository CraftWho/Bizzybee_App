// Phone reminders: runs every 5 minutes on Netlify, even when the app is
// closed, and sends any reminder that is due to that account's devices.
// It first reads one small blob (_next). If nothing is due yet, it stops there.
import webpush from 'web-push';
import { pushStore, dueItems, afterSend, vapid, nextAt, NEXT_KEY, EARLY_MS } from '../lib/push-store.mjs';

export default async () => {
    const keys = vapid();
    if (!keys) return;
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    const store = pushStore();
    const now = Date.now();
    const gate = await store.getWithMetadata(NEXT_KEY, { type: 'json' }).catch(() => null);
    if (gate?.data && gate.data.at > now + EARLY_MS) return;   // nothing due: quit fast
    let soonest = Infinity;
    for await (const page of store.list({ paginate: true })) {
        for (const { key: userId } of page.blobs) {
            if (userId === NEXT_KEY) continue;
            try {
                const current = await store.getWithMetadata(userId, { type: 'json' });
                if (!current?.data) continue;
                const record = current.data;
                const due = dueItems(record, now);
                const stale = (record.schedule || []).some(i => Date.parse(i.at) <= now - 20 * 60000);
                if (!due.length && !stale) { soonest = Math.min(soonest, nextAt(record)); continue; }
                const dead = new Set();
                const sentIds = [];
                for (const item of due) {
                    const payload = JSON.stringify({ title: item.title, body: item.body, tag: item.id, url: item.url });
                    const results = await Promise.allSettled((record.subs || []).map(s => webpush.sendNotification(s, payload, { TTL: 1800, urgency: 'high' })));
                    results.forEach((r, i) => { if (r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode)) dead.add(record.subs[i].endpoint); });
                    sentIds.push(item.id);
                }
                // Record what was sent. If the app updated the record in the
                // meantime, merge into the newer copy so nothing repeats.
                let base = current;
                for (let attempt = 0; attempt < 3 && base?.data; attempt++) {
                    const next = afterSend(base.data, sentIds, now);
                    next.subs = (base.data.subs || []).filter(s => !dead.has(s.endpoint));
                    if (!next.subs.length) { await store.delete(userId); break; }
                    const result = await store.setJSON(userId, next, { onlyIfMatch: base.etag });
                    if (result.modified) { soonest = Math.min(soonest, nextAt(next)); break; }
                    base = await store.getWithMetadata(userId, { type: 'json' });
                }
            } catch (error) {
                soonest = Math.min(soonest, now + 5 * 60000);   // retry next run
                console.error('push-send', userId, error.message);
            }
        }
    }
    // Save the new earliest time. If the app lowered it meanwhile, keep the lower one.
    const at = Number.isFinite(soonest) ? soonest : now + 7 * 86400000;
    const saved = await store.setJSON(NEXT_KEY, { at }, gate ? { onlyIfMatch: gate.etag } : { onlyIfNew: true }).catch(() => ({ modified: true }));
    if (!saved.modified) {
        const cur = await store.get(NEXT_KEY, { type: 'json' }).catch(() => null);
        if (!cur || at < cur.at) await store.setJSON(NEXT_KEY, { at: Math.min(at, cur?.at ?? at) }).catch(() => {});
    }
};
// Oct 31 2026 (Craft): turned off. Web push is retired (the Android app
// rings with phone alarms), so this no longer runs on a timer. Saves the
// ~100-288 scheduled runs a day.
// export const config = { schedule: '*/5 * * * *' };
