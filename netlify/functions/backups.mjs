import { authenticatedUser } from '../lib/auth.mjs';
import { json, HOURS, RETAIN, schedules, backups, readLatest, listBackups, createBackup, plain, ensureSchedule } from '../lib/cloud-store.mjs';
export default async (req) => {
    if (!['GET', 'POST'].includes(req.method)) return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Identity is unavailable. Please retry.' }, 503); }
    if (!user) return json({ ok: false, error: 'Not signed in' }, 401);
    try {
        await ensureSchedule(user.id);
        if (req.method === 'POST') {
            const body = await req.json();
            if (body.action === 'schedule') {
                if (!HOURS.includes(body.hours)) return json({ ok: false, error: 'Choose 4, 8, 12, or 24 hours.' }, 400);
                await schedules().setJSON(user.id, { hours: body.hours, startsAt: Date.now() });
            } else if (body.action === 'create') {
                const current = await readLatest(user.id);
                if (!current) return json({ ok: false, error: 'Save to cloud before creating a backup.' }, 400);
                await createBackup(user.id, current.data);
            } else return json({ ok: false, error: 'Unknown action.' }, 400);
        }
        const id = new URL(req.url).searchParams.get('id');
        if (id) {
            if (!/^\d{13}-[a-zA-Z0-9-]+$/.test(id)) return json({ ok: false, error: 'Invalid backup.' }, 400);
            const entry = await backups().get(`${user.id}/${id}`, { type: 'json' });
            if (!entry) return json({ ok: false, error: 'Backup not found.' }, 404);
            return json({ ok: true, data: plain(entry, user.id), updatedAt: entry.updatedAt });
        }
        return json({ ok: true, schedule: await schedules().get(user.id, { type: 'json' }), backups: await listBackups(user.id), retain: RETAIN });
    } catch { return json({ ok: false, error: 'Backup operation failed. Check cloud encryption configuration and try again.' }, 503); }
};
