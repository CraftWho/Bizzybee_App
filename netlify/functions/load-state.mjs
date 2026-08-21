// Cloud Sync - "pull" endpoint. Returns whatever was last saved for the
// signed-in Identity user via save-state.mjs, or a null/empty result if
// they've never pushed from any device yet (NOT an error - a brand new
// beta tester signing in for the first time is the expected common case).
import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';

export default async (req) => {
    if (req.method !== 'GET') {
        return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    const user = await getUser();
    if (!user) {
        return json({ ok: false, error: 'Not signed in' }, 401);
    }

    try {
        const store = getStore('bizzybee-saves');
        const entry = await store.get(user.id, { type: 'json' });

        if (!entry) {
            return json({ ok: true, data: null, updatedAt: null });
        }

        return json({ ok: true, data: entry.data, updatedAt: entry.updatedAt });
    } catch (err) {
        return json({ ok: false, error: 'Failed to read save data' }, 500);
    }
};

function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
