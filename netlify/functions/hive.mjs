// Friends' hives (Oct 29 2026). One small "hive card" per player: level,
// bee names, rarity and look, eggs and the Queen. Never quests, tasks, jobs,
// vitals or when you last played. Visits are look only.
// POST { action, ... } with the cloud sign-in token:
//   code                      -> { code }            your hive code
//   publish  { card }         -> { code }            upload your card (app: at most hourly)
//   sharing  { on }           -> { sharing }
//   add      { code }         -> { friend }          add a friend's code
//   remove   { code }         -> { ok }
//   friends                   -> { friends: [...] }  (app: at most hourly)
import { getStore } from '@netlify/blobs';
import { randomInt } from 'node:crypto';
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';

const hives = () => getStore({ name: 'bizzybee-hives', consistency: 'strong' });
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I/L mix-ups
const RARITY = ['Common', 'Rare', 'Epic', 'Legendary', 'Named'];
const ELEMENT = /^[a-z]{1,12}$/;
const MAX_FRIENDS = 50;
const clean = (t, n) => String(t ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
export const normCode = (c) => { const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^BEE/, ''); return /^[A-Z0-9]{4}$/.test(s) ? `BEE-${s}` : null; };

// Only these fields ever leave a player's phone.
export function cleanCard(card) {
    const c = card && typeof card === 'object' ? card : {};
    const bees = (Array.isArray(c.bees) ? c.bees : []).slice(0, 200).map(b => ({
        n: clean(b && b.n, 24) || 'Bee',
        r: RARITY.includes(b && b.r) ? b.r : 'Common',
        e: ELEMENT.test(String(b && b.e)) ? b.e : 'earth',
        ...(b && b.egg ? { egg: true } : {}),
    }));
    const q = c.queen && typeof c.queen === 'object' ? { name: clean(c.queen.name, 24) || 'Queen', king: !!c.queen.king } : null;
    return { owner: clean(c.owner, 24) || 'A beekeeper', level: Math.max(1, Math.min(999, Math.floor(Number(c.level) || 1))), bees, queen: q };
}

async function mine(store, id) { return (await store.get(`u:${id}`, { type: 'json' })) || null; }
async function ensure(store, id) {
    let me = await mine(store, id);
    if (me && me.code) return me;
    for (let i = 0; i < 12; i++) {
        const code = 'BEE-' + Array.from({ length: 4 }, () => ABC[randomInt(ABC.length)]).join('');
        const r = await store.setJSON(`c:${code}`, { id }, { onlyIfNew: true });
        if (r.modified) {
            me = { code, sharing: true, friends: [], card: null, updatedAt: null, ...(me || {}), };
            me.code = code;
            await store.setJSON(`u:${id}`, me);
            return me;
        }
    }
    throw new Error('Could not make a hive code. Try again.');
}

export default async (req) => {
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Sign-in is unavailable. Try again.' }, 503); }
    if (!user) return json({ ok: false, error: 'Sign in to Cloud sync to connect hives.' }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
    if (JSON.stringify(body || {}).length > 60000) return json({ ok: false, error: 'Hive card too big.' }, 413);
    const store = hives();
    try {
        const me = await ensure(store, user.id);
        const save = () => store.setJSON(`u:${user.id}`, me);
        switch (body.action) {
            case 'code': return json({ ok: true, code: me.code, sharing: me.sharing !== false });
            case 'publish': {
                me.card = cleanCard(body.card); me.updatedAt = new Date().toISOString();
                await save(); return json({ ok: true, code: me.code });
            }
            case 'sharing': { me.sharing = !!body.on; await save(); return json({ ok: true, sharing: me.sharing }); }
            case 'add': {
                const code = normCode(body.code);
                if (!code) return json({ ok: false, error: 'That code doesn\'t look right. It looks like BEE-7KQ2.' }, 400);
                if (code === me.code) return json({ ok: false, error: 'That\'s your own code.' }, 400);
                const owner = await store.get(`c:${code}`, { type: 'json' });
                if (!owner) return json({ ok: false, error: 'No hive has that code.' }, 404);
                if (!me.friends.includes(code)) { if (me.friends.length >= MAX_FRIENDS) return json({ ok: false, error: 'You have the most friends allowed.' }, 400); me.friends.push(code); await save(); }
                // Connect from a creator's letter: that letter shared this code
                // with everyone, so the creator's side is added too.
                let mutual = false;
                if (body.letter) {
                    const letters = (await getStore({ name: 'bizzybee-mail', consistency: 'strong' }).get('letters', { type: 'json' })) || [];
                    if (letters.some(l => l.id === body.letter && l.hive === code)) {
                        const them = await mine(store, owner.id);
                        if (them && !(them.friends || []).includes(me.code)) { them.friends = [...(them.friends || []), me.code]; await store.setJSON(`u:${owner.id}`, them); }
                        mutual = true;
                    }
                }
                return json({ ok: true, friend: code, mutual });
            }
            case 'remove': {
                const code = normCode(body.code);
                me.friends = me.friends.filter(c => c !== code); await save(); return json({ ok: true });
            }
            case 'friends': {
                const out = [];
                for (const code of me.friends) {
                    const ref = await store.get(`c:${code}`, { type: 'json' });
                    const them = ref && await mine(store, ref.id);
                    if (!them) { out.push({ code, status: 'gone' }); continue; }
                    const mutual = (them.friends || []).includes(me.code);
                    if (!mutual) { out.push({ code, status: 'pending' }); continue; }
                    if (them.sharing === false || !them.card) { out.push({ code, status: 'hidden', name: them.card?.owner || null }); continue; }
                    out.push({ code, status: 'ok', card: them.card });
                }
                return json({ ok: true, code: me.code, sharing: me.sharing !== false, friends: out });
            }
            default: return json({ ok: false, error: 'Unknown action.' }, 400);
        }
    } catch (error) {
        return json({ ok: false, error: error.message || 'Hive service failed.' }, 503);
    }
};
