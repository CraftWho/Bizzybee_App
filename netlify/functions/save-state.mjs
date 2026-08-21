// Cloud Sync - "push" endpoint. Takes the caller's already-exported Full
// Save payload (Vault.exportFullState(), still whatever shape/encryption
// that produces) and stores it in Netlify Blobs, keyed by the signed-in
// Identity user's id. One blob per user - nothing is ever shared across
// accounts, and nothing is inspected/parsed here, this function is just a
// dumb authenticated container for whatever string the client sends.
//
// Modern (2026) Netlify Functions v2 API: Web-standard Request/Response,
// ESM default export. getUser() reads the Authorization: Bearer <jwt>
// header automatically from the in-flight request via async context -
// no manual header parsing needed.
import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB - generous headroom for a JSON save file

export default async (req) => {
    if (req.method !== 'POST') {
        return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    const user = await getUser();
    if (!user) {
        return json({ ok: false, error: 'Not signed in' }, 401);
    }

    let body;
    try {
        body = await req.json();
    } catch (err) {
        return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    if (!body || typeof body.data !== 'string' || !body.data) {
        return json({ ok: false, error: 'Missing "data" string in body' }, 400);
    }

    if (body.data.length > MAX_BYTES) {
        return json({ ok: false, error: 'Save data too large' }, 413);
    }

    const updatedAt = new Date().toISOString();

    try {
        const store = getStore('bizzybee-saves');
        await store.setJSON(user.id, { data: body.data, updatedAt }, {
            metadata: { updatedAt },
        });
    } catch (err) {
        return json({ ok: false, error: 'Failed to write save data' }, 500);
    }

    return json({ ok: true, updatedAt });
};

function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
