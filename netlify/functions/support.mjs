// Contact support save copies (Oct 30 2026, Craft). A player can tick
// "Attach my save" in Contact support; the save is encrypted here with
// BIZZYBEE_SAVE_KEY and kept for 30 days so the creator can see what
// they see. Only the creator (BIZZYBEE_CREATOR_EMAIL) can list or open them.
// POST { action } with the cloud sign-in token:
//   attach { data }  -> { id }           any signed-in player
//   list             -> { items }        creator only
//   get    { id }    -> { data, email }  creator only
import { getStore } from '@netlify/blobs';
import { authenticatedUser } from '../lib/auth.mjs';
import { json, validateSave } from '../lib/cloud-store.mjs';
import { encryptSave, decryptSave } from '../lib/save-crypto.mjs';

const KEEP_MS = 30 * 24 * 3600 * 1000;
const store = () => getStore({ name: 'bizzybee-support', consistency: 'strong' });
const isCreator = (user) => {
    const want = String(process.env.BIZZYBEE_CREATOR_EMAIL || '').trim().toLowerCase();
    return !!want && String(user.email || '').toLowerCase() === want;
};

export default async (req) => {
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Sign-in is unavailable. Try again.' }, 503); }
    if (!user) return json({ ok: false, error: 'Sign in to attach your save.' }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
    const s = store();
    try {
        if (body.action === 'attach') {
            try { validateSave(body.data); } catch (e) { return json({ ok: false, error: e.message }, 400); }
            const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
            await s.setJSON(id, { email: user.email || '', user: user.id, at: new Date().toISOString(), save: encryptSave(body.data, `support:${id}`) });
            return json({ ok: true, id });
        }
        if (!isCreator(user)) return json({ ok: false, error: 'Only the creator can open support saves.' }, 403);
        if (body.action === 'list') {
            const items = [];
            for await (const page of s.list({ paginate: true })) {
                for (const b of page.blobs) {
                    const e = await s.get(b.key, { type: 'json' });
                    if (!e) continue;
                    if (Date.now() - Date.parse(e.at) > KEEP_MS) { await s.delete(b.key); continue; }
                    items.push({ id: b.key, email: e.email, at: e.at });
                }
            }
            items.sort((a, b) => b.at.localeCompare(a.at));
            return json({ ok: true, items });
        }
        if (body.action === 'get') {
            const e = await s.get(String(body.id || ''), { type: 'json' });
            if (!e) return json({ ok: false, error: 'Not found (copies are kept 30 days).' }, 404);
            return json({ ok: true, email: e.email, at: e.at, data: decryptSave(e.save, `support:${body.id}`) });
        }
        return json({ ok: false, error: 'Unknown action.' }, 400);
    } catch (e) {
        return json({ ok: false, error: 'Try again in a minute.' }, 500);
    }
};
