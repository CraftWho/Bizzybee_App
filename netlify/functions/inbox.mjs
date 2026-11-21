// Nov 21 2026 (Craft; approved): signed-in inbox + main device + API keys.
//  GET                                  -> { items, main, keys: [{ prefix, scope, createdAt, lastUsed }], paused }
//  POST { action: 'propose', from, device, deviceName, summary, ops, base }   (a non-main device sends changes)
//  POST { action: 'done', ids }                                   (the main device applied / rejected them)
//  POST { action: 'set-main', device, deviceName }                (make this device the main one)
//  POST { action: 'new-key', scope: 'read' | 'write' }           -> { key } shown once
//  POST { action: 'revoke-key', prefix }   POST { action: 'pause', paused }
import { randomUUID } from 'node:crypto';
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';
import { withCors } from '../lib/cors.mjs';
import { readInbox, addToInbox, removeFromInbox, getMain, setMain, keys, newKey, hashKey } from '../lib/inbox.mjs';

const handler = async (req) => {
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Identity is unavailable. Please retry.' }, 503); }
    if (!user) return json({ ok: false, error: 'Not signed in' }, 401);
    const ks = keys();
    const mine = (await ks.get(`u/${user.id}`, { type: 'json' })) || { keys: [], paused: false };
    if (req.method === 'GET') {
        const box = await readInbox(user.id);
        return json({ ok: true, items: box.items || [], main: await getMain(user.id), keys: mine.keys.map(({ hash, ...k }) => k), paused: !!mine.paused });
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
    const dev = typeof body.device === 'string' ? body.device.slice(0, 80) : null;
    try {
        if (body.action === 'propose') {
            if (!Array.isArray(body.ops) || !body.ops.length) return json({ ok: false, error: 'Nothing to send.' }, 400);
            const raw = JSON.stringify(body.ops);
            if (raw.length > 1_000_000) return json({ ok: false, error: 'Too many changes at once.' }, 413);
            const item = { id: randomUUID(), at: new Date().toISOString(), from: body.from === 'voice' ? 'voice' : 'pc', device: dev, deviceName: String(body.deviceName || '').slice(0, 40),
                kind: 'diff', summary: (Array.isArray(body.summary) ? body.summary : []).map(s => String(s).slice(0, 160)).slice(0, 12), ops: body.ops, base: typeof body.base === 'string' ? body.base.slice(0, 120) : null };
            await addToInbox(user.id, item);
            return json({ ok: true, id: item.id });
        }
        if (body.action === 'done') {
            const ids = (Array.isArray(body.ids) ? body.ids : []).filter(x => typeof x === 'string').slice(0, 500);
            return json({ ok: true, removed: await removeFromInbox(user.id, ids) });
        }
        if (body.action === 'set-main') {
            if (!dev) return json({ ok: false, error: 'No device.' }, 400);
            return json({ ok: true, main: await setMain(user.id, dev, body.deviceName) });
        }
        if (body.action === 'new-key') {
            if (mine.keys.length >= 5) return json({ ok: false, error: 'You have 5 keys. Revoke one first.' }, 409);
            const key = newKey(), hash = hashKey(key), scope = body.scope === 'read' ? 'read' : 'write';
            const rec = { prefix: key.slice(0, 10), scope, createdAt: new Date().toISOString(), lastUsed: null, hash };
            await ks.setJSON(`k/${hash}`, { userId: user.id, scope, prefix: rec.prefix });
            mine.keys.push(rec);
            await ks.setJSON(`u/${user.id}`, mine);
            return json({ ok: true, key, prefix: rec.prefix, scope });
        }
        if (body.action === 'revoke-key') {
            const k = mine.keys.find(x => x.prefix === body.prefix);
            if (!k) return json({ ok: false, error: 'No such key.' }, 404);
            await ks.delete(`k/${k.hash}`);
            mine.keys = mine.keys.filter(x => x !== k);
            await ks.setJSON(`u/${user.id}`, mine);
            return json({ ok: true });
        }
        if (body.action === 'pause') {
            mine.paused = !!body.paused;
            await ks.setJSON(`u/${user.id}`, mine);
            return json({ ok: true, paused: mine.paused });
        }
    } catch (e) { return json({ ok: false, error: e.message || 'Inbox unavailable' }, 503); }
    return json({ ok: false, error: 'Unknown action' }, 400);
};
export default withCors(handler);
