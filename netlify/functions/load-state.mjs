import { authenticatedUser } from '../lib/auth.mjs';
import { json, readLatest, plain } from '../lib/cloud-store.mjs';
export default async (req) => {
    if (req.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Identity is unavailable. Please retry.' }, 503); }
    if (!user) return json({ ok: false, error: 'Not signed in' }, 401);
    try {
        const entry = await readLatest(user.id);
        return json({ ok: true, data: entry ? plain(entry.data, user.id) : null, revision: entry?.etag ?? null, updatedAt: entry?.data.updatedAt ?? null, encrypted: !!entry?.data.encrypted });
    } catch { return json({ ok: false, error: 'Could not read cloud save. Check encryption configuration.' }, 503); }
};
