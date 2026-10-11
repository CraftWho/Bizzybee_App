// Phone reminders: runs every minute on Netlify, even when the app is
// closed, and sends any reminder that is due to that account's devices.
import webpush from 'web-push';
import { pushStore, dueItems, afterSend, vapid } from '../lib/push-store.mjs';

export default async () => {
    const keys = vapid();
    if (!keys) return;
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    const store = pushStore();
    const now = Date.now();
    for await (const page of store.list({ paginate: true })) {
        for (const { key: userId } of page.blobs) {
            try {
                const current = await store.getWithMetadata(userId, { type: 'json' });
                if (!current?.data) continue;
                const record = current.data;
                const due = dueItems(record, now);
                const stale = (record.schedule || []).some(i => Date.parse(i.at) <= now - 20 * 60000);
                if (!due.length && !stale) continue;
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
                    if (result.modified) break;
                    base = await store.getWithMetadata(userId, { type: 'json' });
                }
            } catch (error) {
                console.error('push-send', userId, error.message);
            }
        }
    }
};
export const config = { schedule: '* * * * *' };
