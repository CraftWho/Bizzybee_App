// Nov 21 2026 (Craft; approved option 1): THE BIZZYBEE API, for Claude. Auth: "Authorization: Bearer bbk_..."
// (a key made in Settings › API on the phone; only its hash is stored). Every call is logged on the phone.
//  GET  /.netlify/functions/api            -> a read-only summary of the save (level, XP, dailies, To-Dos, habits, quests)
//  POST /.netlify/functions/api { ops: [...] }  (key scope "write")  -> queued; the phone applies them by itself,
//       logs them with Claude as the source, and you can undo any of them from the change log.
// ops: { op: 'add', kind: 'daily'|'todo'|'habit', label, minutes?, difficulty?, notes?, dueDate? }
//      { op: 'complete' | 'uncomplete' | 'remove', kind, id | label }
//      { op: 'update', kind, id | label, fields: { label?, notes?, minutes?, difficulty?, dueDate? } }
//      { op: 'habit', id | label, dir: '+' | '-' }
import { randomUUID } from 'node:crypto';
import { json, readLatest, plain } from '../lib/cloud-store.mjs';
import { keys, hashKey, validKey, cleanOp, addToInbox, readInbox } from '../lib/inbox.mjs';

const rate = new Map();   // per key, per warm instance: max 30 writes a minute
function limited(prefix) {
    const now = Date.now(), list = (rate.get(prefix) || []).filter(t => now - t < 60000);
    if (list.length >= 30) return true;
    list.push(now); rate.set(prefix, list); return false;
}
const today = () => new Date().toISOString().slice(0, 10);
export function summarize(state) {
    const day = today();
    const pick = (t) => ({ id: t.id, label: t.label || t.title || '', difficulty: t.difficulty || null, minutes: t.minutes || null });
    const xp = [...(state.bonusXP || [])].reduce((n, b) => n + (Number(b.xp) || 0), 0);
    return {
        name: (state.user && state.user.name) || null,
        level: state.characterLevelBar && state.characterLevelBar.acknowledgedLevel || null,
        bonusXP: xp,
        dailies: (state.dailyTasks || []).map(t => ({ ...pick(t), doneToday: (t.completedDates || []).includes(day) })),
        todos: (state.todos || []).filter(t => !t.completed).map(t => ({ ...pick(t), dueDate: t.dueDate || null })),
        habits: (state.habits || []).map(h => ({ ...pick(h), up: h.positive !== false, down: !!h.negative })),
        quests: (state.quests || []).map(q => ({ id: q.id, title: q.title || q.name || '', open: (q.tasks || []).filter(t => !t.completed).length, done: (q.tasks || []).filter(t => t.completed).length })),
        updatedAt: state.updatedAt || null,
    };
}
export default async (req) => {
    const auth = req.headers.get('authorization') || '';
    const key = auth.replace(/^Bearer\s+/i, '');
    if (!validKey(key)) return json({ ok: false, error: 'Missing or bad API key.' }, 401);
    const ks = keys();
    const link = await ks.get(`k/${hashKey(key)}`, { type: 'json' });
    if (!link) return json({ ok: false, error: 'Unknown or revoked API key.' }, 401);
    const acct = (await ks.get(`u/${link.userId}`, { type: 'json' })) || { keys: [] };
    if (acct.paused) return json({ ok: false, error: 'The API is paused in Settings.' }, 423);
    const rec = acct.keys.find(k => k.prefix === link.prefix);
    if (rec) { rec.lastUsed = new Date().toISOString(); try { await ks.setJSON(`u/${link.userId}`, acct); } catch { /* not critical */ } }
    try {
        if (req.method === 'GET') {
            const entry = await readLatest(link.userId);
            if (!entry) return json({ ok: true, save: null });
            const pending = ((await readInbox(link.userId)).items || []).filter(i => i.from === 'claude').length;
            return json({ ok: true, save: summarize(JSON.parse(plain(entry.data, link.userId))), pendingFromClaude: pending, note: 'Changes are applied when the phone opens BizzyBee.' });
        }
        if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
        if (link.scope !== 'write') return json({ ok: false, error: 'This key can only read.' }, 403);
        if (limited(link.prefix)) return json({ ok: false, error: 'Too many changes. Wait a minute.' }, 429);
        let body;
        try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
        const raw = Array.isArray(body.ops) ? body.ops.slice(0, 25) : [];
        const ops = raw.map(cleanOp);
        const bad = ops.findIndex(o => !o);
        if (!ops.length || bad >= 0) return json({ ok: false, error: bad >= 0 ? `Change #${bad + 1} is not allowed or is missing a label/id.` : 'No changes sent.' }, 400);
        const item = { id: randomUUID(), at: new Date().toISOString(), from: 'claude', kind: 'ops', key: link.prefix, ops, note: typeof body.note === 'string' ? body.note.slice(0, 160) : '' };
        await addToInbox(link.userId, item);
        return json({ ok: true, queued: ops.length, id: item.id, note: 'Queued. The phone applies it next time BizzyBee is open, and logs it as Claude.' });
    } catch (e) { return json({ ok: false, error: 'API unavailable. Try again.' }, 503); }
};
