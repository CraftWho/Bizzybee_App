import { schedules, readLatest, createBackup } from '../lib/cloud-store.mjs';
// Server-side, including when all clients are closed. Deterministic IDs make retries safe.
export default async () => {
    let failed = 0;
    for await (const page of schedules().list({ paginate: true })) {
        for (const { key: userId } of page.blobs) {
            try {
                const schedule = await schedules().get(userId, { type: 'json' });
                const period = schedule.hours * 3600000;
                const slot = Math.floor((Date.now() - schedule.startsAt) / period);
                if (slot < 1) continue;
                const entry = await readLatest(userId);
                if (entry) await createBackup(userId, entry.data, 'scheduled', `${schedule.startsAt + slot * period}-scheduled`);
            } catch { failed++; }
        }
    }
    if (failed) throw new Error(`${failed} scheduled backups failed; retry on next run.`);
};
// Oct 29 2026 (Craft): every 4 hours, not hourly, to save credits. Every
// backup choice (4, 8, 12, 24 h) is a multiple of 4.
export const config = { schedule: '0 */4 * * *' };
