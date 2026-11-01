import { authenticatedUser } from '../lib/auth.mjs';
import { json, readLatest, plain } from '../lib/cloud-store.mjs';
import { withCors } from '../lib/cors.mjs';   // Nov 1 2026 (Craft): the Android app's own copy calls in
const handler = async (req) => {
    if (req.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Identity is unavailable. Please retry.' }, 503); }
    if (!user) return json({ ok: false, error: 'Not signed in' }, 401);
    try {
        const entry = await readLatest(user.id);
        return json({ ok: true, data: entry ? plain(entry.data, user.id) : null, revision: entry?.etag ?? null, updatedAt: entry?.data.updatedAt ?? null, encrypted: !!entry?.data.encrypted, device: entry?.data.device ?? null });   // Oct 31 2026 (Craft): active device
    } catch { return json({ ok: false, error: 'Could not read cloud save. Check encryption configuration.' }, 503); }
};
export default withCors(handler);
