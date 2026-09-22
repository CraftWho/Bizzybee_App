import { authenticatedUser } from '../lib/auth.mjs';
import { encryptSave } from '../lib/save-crypto.mjs';
import { json, saves, readLatest, validateSave, createBackup, ensureSchedule } from '../lib/cloud-store.mjs';
export default async (req) => {
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Identity is unavailable. Please retry.' }, 503); }
    if (!user) return json({ ok: false, error: 'Not signed in' }, 401);
    let body;
    try { body = await req.json(); validateSave(body.data); }
    catch { return json({ ok: false, error: 'Invalid save or save exceeds 4 MB.' }, 400); }
    try {
        const current = await readLatest(user.id);
        if (body.revision !== (current?.etag ?? null)) return json({ ok: false, error: 'Cloud progress changed. Resolve the conflict in Settings.' }, 409);
        const updatedAt = new Date().toISOString();
        const encrypted = encryptSave(body.data, user.id);
        if (current && (body.preservePrevious || !current.data.encrypted)) await createBackup(user.id, current.data, 'before-replacement');
        await ensureSchedule(user.id);
        const result = await saves().setJSON(user.id, { encrypted, updatedAt }, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
        if (!result.modified || !result.etag) return json({ ok: false, error: 'Cloud progress changed. Resolve the conflict in Settings.' }, 409);
        return json({ ok: true, revision: result.etag, updatedAt, encrypted: true });
    } catch (error) {
        return json({ ok: false, error: error.message.includes('BIZZYBEE_SAVE_KEY') ? error.message : 'Encrypted cloud save failed. Your local progress is retained.' }, 503);
    }
};
