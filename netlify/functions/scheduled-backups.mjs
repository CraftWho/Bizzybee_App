import { saves, schedules, readLatest, createBackup } from '../lib/cloud-store.mjs';
// Oct 31 2026 (Craft): one backup a day per account, about 4 AM Eastern
// (09:00 UTC = 4 AM EST / 5 AM EDT). Skipped when the save hasn't changed
// since the last daily copy. Keeps 4 (cloud-store.mjs). Was hourly.
// Deterministic IDs (one per UTC day) make retries safe.
export default async () => {
    let failed = 0;
    const now = new Date();
    const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for await (const page of saves().list({ paginate: true })) {
        for (const { key: userId } of page.blobs) {
            try {
                const entry = await readLatest(userId);
                if (!entry) continue;
                const last = await schedules().get(userId, { type: 'json' }).catch(() => null);
                if (last && last.updatedAt && last.updatedAt === entry.data.updatedAt) continue;   // nothing new
                await createBackup(userId, entry.data, 'scheduled', `${day}-scheduled`);
                await schedules().setJSON(userId, { updatedAt: entry.data.updatedAt, at: Date.now() });
            } catch { failed++; }
        }
    }
    if (failed) throw new Error(`${failed} scheduled backups failed; retry on next run.`);
};
export const config = { schedule: '0 9 * * *' };
