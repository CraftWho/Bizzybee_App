// Nov 21 2026 (Craft; approved): PHONE IS MAIN. One device (the phone) writes the cloud save. Every other way in
// (the PC copy, Claude through the API, Bixby/voice later) sends CHANGES to an inbox. The main device picks them up:
// Claude's apply by themselves (logged, undoable), the PC's wait for Accept / Reject on the phone.
import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';

export const inbox = () => getStore({ name: 'bizzybee-inbox', consistency: 'strong' });
export const keys = () => getStore({ name: 'bizzybee-api-keys', consistency: 'strong' });
export const MAX_ITEMS = 200;
export const hashKey = (k) => createHash('sha256').update(String(k)).digest('hex');
export const newKey = () => 'bbk_' + randomBytes(24).toString('base64url');
export const validKey = (k) => typeof k === 'string' && /^bbk_[A-Za-z0-9_-]{32}$/.test(k);

// The things the API (and voice) may ask for. Anything else is refused.
export const OPS = ['add', 'complete', 'uncomplete', 'remove', 'update', 'habit'];
export const KINDS = ['daily', 'todo', 'habit', 'quest-task'];
const str = (v, n = 200) => typeof v === 'string' ? v.slice(0, n).trim() : undefined;
export function cleanOp(o) {
    if (!o || typeof o !== 'object' || !OPS.includes(o.op)) return null;
    const kind = o.op === 'habit' ? 'habit' : o.kind;
    if (!KINDS.includes(kind)) return null;
    const out = { op: o.op, kind };
    for (const k of ['id', 'label', 'notes', 'difficulty', 'dueDate', 'questId', 'questTitle']) { const v = str(o[k], k === 'notes' ? 2000 : 200); if (v) out[k] = v; }
    if (o.minutes != null && Number.isFinite(Number(o.minutes))) out.minutes = Math.max(1, Math.min(600, Math.round(Number(o.minutes))));
    if (o.op === 'habit') out.dir = o.dir === '-' || o.dir === 'down' ? '-' : '+';
    if (o.op === 'update' && o.fields && typeof o.fields === 'object') {
        out.fields = {};
        for (const k of ['label', 'notes', 'difficulty', 'dueDate']) { const v = str(o.fields[k], k === 'notes' ? 2000 : 200); if (v !== undefined) out.fields[k] = v; }
        if (o.fields.minutes != null && Number.isFinite(Number(o.fields.minutes))) out.fields.minutes = Math.max(1, Math.min(600, Math.round(Number(o.fields.minutes))));
    }
    if (!out.id && !out.label) return null;
    return out;
}
export async function readInbox(userId) { return (await inbox().get(`u/${userId}`, { type: 'json' })) || { items: [] }; }
export async function addToInbox(userId, item) {
    const store = inbox();
    for (let i = 0; i < 3; i++) {
        const cur = await store.getWithMetadata(`u/${userId}`, { type: 'json' });
        const box = cur ? cur.data : { items: [] };
        box.items = [...(box.items || []), item].slice(-MAX_ITEMS);
        const r = await store.setJSON(`u/${userId}`, box, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
        if (r.modified) return item;
    }
    throw new Error('Inbox busy. Try again.');
}
export async function removeFromInbox(userId, ids) {
    const store = inbox();
    const drop = new Set(ids);
    for (let i = 0; i < 3; i++) {
        const cur = await store.getWithMetadata(`u/${userId}`, { type: 'json' });
        if (!cur) return 0;
        const before = (cur.data.items || []).length;
        const items = (cur.data.items || []).filter(x => !drop.has(x.id));
        const r = await store.setJSON(`u/${userId}`, { ...cur.data, items }, { onlyIfMatch: cur.etag });
        if (r.modified) return before - items.length;
    }
    throw new Error('Inbox busy. Try again.');
}
// Which device is main (the only one that writes the save). Kept with the inbox.
export async function getMain(userId) { return (await inbox().get(`main/${userId}`, { type: 'json' })) || null; }
export async function setMain(userId, device, name) { const m = { device, name: String(name || '').slice(0, 40), at: new Date().toISOString() }; await inbox().setJSON(`main/${userId}`, m); return m; }
