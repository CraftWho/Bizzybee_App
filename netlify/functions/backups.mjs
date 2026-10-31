import { authenticatedUser } from '../lib/auth.mjs';
import { json, KEEP_DAILY, KEEP_OTHER, backups, readLatest, listBackups, createBackup, plain } from '../lib/cloud-store.mjs';
export default async (req) => {
    if (!['GET', 'POST'].includes(req.method)) return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Identity is unavailable. Please retry.' }, 503); }
    if (!user) return json({ ok: false, error: 'Not signed in' }, 401);
    try {
        if (req.method === 'POST') {
            const body = await req.json();
            // Oct 31 2026 (Craft): backups are daily now; the old interval
            // picker's 'schedule' action is accepted and ignored.
            if (body.action === 'schedule') { /* daily only */ }
            else if (body.action === 'create') {
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
        return json({ ok: true, backups: await listBackups(user.id), keepDaily: KEEP_DAILY, keepOther: KEEP_OTHER });
    } catch { return json({ ok: false, error: 'Backup operation failed. Check cloud encryption configuration and try again.' }, 503); }
};
