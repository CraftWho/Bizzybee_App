// Steam Deck companion (Nov 11 2026, Craft). Links a Decky plugin to your account with a QR code.
//
// Pairing, no typing on the Deck:
//   Deck   POST {action:'start'}                 -> { code, pollKey }   (the plugin shows `code` as a QR)
//   Phone  POST {action:'approve', code}         -> signed in, scans the QR and taps Link
//   Deck   POST {action:'poll', code, pollKey}   -> { pending:true } until approved, then { token } (once)
// After that the Deck sends `Authorization: Device <token>` for:
//   snapshot   today's dailies, to-dos and habits (the app keeps this fresh)
//   complete   a check-off; it waits in an inbox until the app applies it
//   games      hours played + achievements read on the Deck
// The signed-in app (Bearer token) uses: push-snapshot, inbox, ack, devices, unlink.
import { createHash, randomBytes } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';
import { withCors } from '../lib/cors.mjs';

export const PAIR_MINUTES = 10;
export const MAX_INBOX = 100;
const store = () => getStore({ name: 'bizzybee-deck', consistency: 'strong' });
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const hex = (n) => randomBytes(n).toString('hex');
const okCode = (c) => typeof c === 'string' && /^[a-f0-9]{24}$/.test(c);
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

// Keep a snapshot small and plain: only what the Deck shows.
export function cleanSnapshot(s) {
    const list = (a, f) => (Array.isArray(a) ? a : []).slice(0, 60).map(f).filter(x => x.id);
    return {
        level: Number(s && s.level) || 1,
        xpToNext: Number(s && s.xpToNext) || 0,
        updatedAt: Date.now(),
        dailies: list(s && s.dailies, d => ({ id: clip(d.id, 80), title: clip(d.title, 120), done: !!d.done })),
        todos: list(s && s.todos, d => ({ id: clip(d.id, 80), title: clip(d.title, 120), done: !!d.done, due: clip(d.due, 10) })),
        habits: list(s && s.habits, d => ({ id: clip(d.id, 80), title: clip(d.title, 120), positive: d.positive !== false }))
    };
}
export function cleanGames(g) {
    return (Array.isArray(g) ? g : []).slice(0, 300).map(x => ({
        appid: clip(x.appid, 20).replace(/\D/g, ''), name: clip(x.name, 80),
        minutes: Math.max(0, Math.floor(Number(x.minutes) || 0)),
        ach: Math.max(0, Math.floor(Number(x.ach) || 0)), achTotal: Math.max(0, Math.floor(Number(x.achTotal) || 0)),
        lastPlayed: Math.max(0, Math.floor(Number(x.lastPlayed) || 0))
    })).filter(x => x.appid);
}

export async function handle(req, { s = store(), user = null, now = Date.now() } = {}) {
    let body = {};
    if (req.method === 'POST') { try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); } }
    const a = body.action;
    const auth = req.headers.get('authorization') || '';

    // ----- Deck (no account yet): start + poll -----
    if (a === 'start') {
        const code = hex(12), pollKey = hex(16);
        await s.setJSON(`pending/${code}`, { pollKey: sha(pollKey), at: now, userId: null });
        return json({ ok: true, code, pollKey, expiresInMinutes: PAIR_MINUTES });
    }
    if (a === 'poll') {
        if (!okCode(body.code)) return json({ ok: false, error: 'Bad code.' }, 400);
        const p = await s.get(`pending/${body.code}`, { type: 'json' });
        if (!p || now - p.at > PAIR_MINUTES * 60000 || p.pollKey !== sha(body.pollKey)) return json({ ok: false, error: 'This code expired. Start again.' }, 410);
        if (!p.userId) return json({ ok: true, pending: true });
        const token = hex(32);
        await s.setJSON(`dev/${sha(token)}`, { userId: p.userId, name: p.name, at: now });
        const list = (await s.get(`devices/${p.userId}`, { type: 'json' })) || [];
        list.push({ id: sha(token).slice(0, 12), h: sha(token), name: p.name, at: now });
        await s.setJSON(`devices/${p.userId}`, list.slice(-10));
        await s.setJSON(`pending/${body.code}`, { ...p, pollKey: '', at: 0 });   // one use
        return json({ ok: true, token });
    }

    // ----- Deck (linked): Authorization: Device <token> -----
    const dm = /^Device ([a-f0-9]{64})$/.exec(auth);
    if (dm) {
        const dev = await s.get(`dev/${sha(dm[1])}`, { type: 'json' });
        if (!dev) return json({ ok: false, error: 'This Deck is not linked any more.' }, 401);
        const uid = dev.userId;
        if (a === 'snapshot' || req.method === 'GET') return json({ ok: true, snapshot: (await s.get(`snap/${uid}`, { type: 'json' })) || null });
        if (a === 'complete') {
            const kind = ['daily', 'todo', 'habit'].includes(body.kind) ? body.kind : null;
            if (!kind || typeof body.id !== 'string' || !body.id) return json({ ok: false, error: 'Bad task.' }, 400);
            const inbox = (await s.get(`inbox/${uid}`, { type: 'json' })) || [];
            inbox.push({ eid: hex(6), kind, id: clip(body.id, 80), at: now });
            await s.setJSON(`inbox/${uid}`, inbox.slice(-MAX_INBOX));
            // Show it done on the Deck right away; the app makes it official.
            const snap = await s.get(`snap/${uid}`, { type: 'json' });
            if (snap && kind !== 'habit') { for (const t of (kind === 'daily' ? snap.dailies : snap.todos) || []) if (t.id === body.id) t.done = true; await s.setJSON(`snap/${uid}`, snap); }
            return json({ ok: true });
        }
        if (a === 'games') { await s.setJSON(`games/${uid}`, { at: now, games: cleanGames(body.games) }); return json({ ok: true }); }
        return json({ ok: false, error: 'Unknown action.' }, 400);
    }

    // ----- App (signed in): Bearer token -----
    if (!user) return json({ ok: false, error: 'Sign in to your cloud account first.' }, 401);
    if (a === 'approve') {
        if (!okCode(body.code)) return json({ ok: false, error: 'Bad code.' }, 400);
        const p = await s.get(`pending/${body.code}`, { type: 'json' });
        if (!p || !p.pollKey || now - p.at > PAIR_MINUTES * 60000) return json({ ok: false, error: 'This code expired. Show a new one on the Deck.' }, 410);
        await s.setJSON(`pending/${body.code}`, { ...p, userId: user.id, name: clip(body.name, 40) || 'Steam Deck' });
        return json({ ok: true });
    }
    if (a === 'push-snapshot') { await s.setJSON(`snap/${user.id}`, cleanSnapshot(body.snapshot)); return json({ ok: true }); }
    if (a === 'inbox') {
        const g = await s.get(`games/${user.id}`, { type: 'json' });
        return json({ ok: true, events: (await s.get(`inbox/${user.id}`, { type: 'json' })) || [], games: g || null });
    }
    if (a === 'ack') {
        const done = new Set(Array.isArray(body.eids) ? body.eids : []);
        const inbox = ((await s.get(`inbox/${user.id}`, { type: 'json' })) || []).filter(e => !done.has(e.eid));
        await s.setJSON(`inbox/${user.id}`, inbox);
        return json({ ok: true });
    }
    if (a === 'devices') return json({ ok: true, devices: ((await s.get(`devices/${user.id}`, { type: 'json' })) || []).map(({ id, name, at }) => ({ id, name, at })) });
    if (a === 'unlink') {   // removes every linked Deck (simple and safe)
        const list = (await s.get(`devices/${user.id}`, { type: 'json' })) || [];
        for (const d of list) if (d.h) await s.delete(`dev/${d.h}`);
        await s.setJSON(`devices/${user.id}`, []);
        return json({ ok: true });
    }
    return json({ ok: false, error: 'Unknown action.' }, 400);
}

const handler = async (req) => {
    if (!['POST', 'GET'].includes(req.method)) return json({ ok: false, error: 'Method not allowed' }, 405);
    let user = null;
    if (/^Bearer /i.test(req.headers.get('authorization') || '')) {
        try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Sign-in is unavailable. Try again.' }, 503); }
    }
    try { return await handle(req, { user }); }
    catch { return json({ ok: false, error: 'Try again in a minute.' }, 500); }
};
export default withCors(handler);
