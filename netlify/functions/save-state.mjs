import { authenticatedUser } from '../lib/auth.mjs';
import { encryptSave } from '../lib/save-crypto.mjs';
import { json, saves, readLatest, validateSave, createBackup } from '../lib/cloud-store.mjs';
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
        // Oct 31 2026 (Craft): one active device at a time. The cloud keeps the
        // id of the device that saved last; another device must take over
        // (open the app, or tap Continue here) before it can save.
        const device = typeof body.device === 'string' && body.device.length <= 80 ? body.device : null;
        const active = current?.data.device || null;
        if (active && device && active !== device && !body.takeover) return json({ ok: false, code: 'other-device', error: 'Active on another device.' }, 423);
        if (body.revision !== (current?.etag ?? null)) return json({ ok: false, error: 'Cloud progress changed. Resolve the conflict in Settings.' }, 409);
        const updatedAt = new Date().toISOString();
        const encrypted = encryptSave(body.data, user.id);
        // Backups only before an explicit replace (restore, use this device's
        // copy) or the one-time upgrade of an old unencrypted save. Normal
        // saves and device switches make none (Oct 31 2026: daily backups only).
        if (current && (body.preservePrevious || !current.data.encrypted)) await createBackup(user.id, current.data, 'before-replacement');
        const result = await saves().setJSON(user.id, { encrypted, updatedAt, device: device || active }, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
        if (!result.modified || !result.etag) return json({ ok: false, error: 'Cloud progress changed. Resolve the conflict in Settings.' }, 409);
        return json({ ok: true, revision: result.etag, updatedAt, encrypted: true });
    } catch (error) {
        return json({ ok: false, error: error.message.includes('BIZZYBEE_SAVE_KEY') ? error.message : 'Encrypted cloud save failed. Your local progress is retained.' }, 503);
    }
};
