// Mailbox (Oct 29 2026). Letters from the creator to every player. One-way:
// players read and react 👍 / 👎. Only the creator sends and sees totals.
// The creator is the cloud account whose email matches the site's
// BIZZYBEE_CREATOR_EMAIL setting (Netlify › Site configuration › Environment variables).
// POST { action } with the cloud sign-in token:
//   list                          -> { letters, creator, totals? }   (app: at most hourly)
//   react { id, value }           -> { ok }   value: 'up' | 'down' | null
//   send  { title, body, hive }   -> { letter }   creator only
//   delete { id }                 -> { ok }        creator only
import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';
import { withCors } from '../lib/cors.mjs';   // Nov 1 2026 (Craft): the Android app's own copy calls in

const mail = () => getStore({ name: 'bizzybee-mail', consistency: 'strong' });
const clean = (t, n) => String(t ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);
const isCreator = (user) => {
    const want = String(process.env.BIZZYBEE_CREATOR_EMAIL || '').trim().toLowerCase();
    return !!want && String(user.email || '').toLowerCase() === want;
};

// Small read-modify-write with a retry, so two reactions at once both count.
async function update(store, key, fn, fallback) {
    for (let i = 0; i < 5; i++) {
        const cur = await store.getWithMetadata(key, { type: 'json' });
        const next = fn(cur ? cur.data : fallback);
        const r = await store.setJSON(key, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
        if (r.modified) return next;
    }
    throw new Error('Busy. Try again.');
}

const handler = async (req) => {
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Sign-in is unavailable. Try again.' }, 503); }
    if (!user) return json({ ok: false, error: 'Sign in to Cloud sync to get mail.' }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
    const store = mail(), creator = isCreator(user);
    try {
        switch (body.action) {
            case 'list': {
                const letters = (await store.get('letters', { type: 'json' })) || [];
                const out = [];
                for (const l of letters.slice(0, 50)) {
                    const r = (await store.get(`r:${l.id}`, { type: 'json' })) || {};
                    const item = { ...l, mine: r[user.id] || null };
                    if (creator) { const v = Object.values(r); item.totals = { up: v.filter(x => x === 'up').length, down: v.filter(x => x === 'down').length }; }
                    out.push(item);
                }
                return json({ ok: true, creator, letters: out });
            }
            case 'react': {
                const id = clean(body.id, 64), value = ['up', 'down'].includes(body.value) ? body.value : null;
                const letters = (await store.get('letters', { type: 'json' })) || [];
                if (!letters.some(l => l.id === id)) return json({ ok: false, error: 'That letter is gone.' }, 404);
                await update(store, `r:${id}`, (r) => { const n = { ...r }; if (value) n[user.id] = value; else delete n[user.id]; return n; }, {});
                return json({ ok: true });
            }
            case 'send': {
                if (!creator) return json({ ok: false, error: 'Only the creator can send letters.' }, 403);
                const title = clean(body.title, 80), text = clean(body.body, 4000);
                if (!title || !text) return json({ ok: false, error: 'Add a title and a message.' }, 400);
                const hive = /^BEE-[A-Z0-9]{4}$/.test(String(body.hive || '')) ? body.hive : null;
                const letter = { id: randomUUID(), title, body: text, from: clean(body.from, 40) || 'The creator', hive, at: new Date().toISOString() };
                await update(store, 'letters', (list) => [letter, ...(list || [])].slice(0, 100), []);
                return json({ ok: true, letter });
            }
            case 'delete': {
                if (!creator) return json({ ok: false, error: 'Only the creator can delete letters.' }, 403);
                const id = clean(body.id, 64);
                await update(store, 'letters', (list) => (list || []).filter(l => l.id !== id), []);
                await store.delete(`r:${id}`);
                return json({ ok: true });
            }
            default: return json({ ok: false, error: 'Unknown action.' }, 400);
        }
    } catch (error) {
        return json({ ok: false, error: error.message || 'Mail service failed.' }, 503);
    }
};
export default withCors(handler);
