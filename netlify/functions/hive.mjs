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
//   gift     { code, item, note } -> { ok }          send a held item to a friend (Nov 1 2026)
//   gifts                     -> { gifts: [...] }    gifts waiting for you (shown in the Mailbox)
//   accept   { id }           -> { item, n }         take one (removes it from the list)
import { getStore } from '@netlify/blobs';
import { randomInt } from 'node:crypto';
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';
import { withCors } from '../lib/cors.mjs';   // Nov 1 2026 (Craft): the Android app's own copy calls in

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

const handler = async (req) => {
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
            // Nov 1 2026 (Craft; from 1.0.7): gifts of held items between friends
            // (both must have added each other), with a short note. They arrive
            // in the friend's Mailbox. Up to 50 waiting per player.
            case 'gift': {
                const code = normCode(body.code), item = String(body.item || '');
                if (!code || !/^[a-z0-9-]{2,40}$/.test(item)) return json({ ok: false, error: 'Bad gift.' }, 400);
                if (!me.friends.includes(code)) return json({ ok: false, error: 'Add them as a friend first.' }, 403);
                const ref = await store.get(`c:${code}`, { type: 'json' });
                const them = ref && await mine(store, ref.id);
                if (!them || !(them.friends || []).includes(me.code)) return json({ ok: false, error: 'They need to add you back first.' }, 403);
                const key = `g:${ref.id}`;
                const box = (await store.get(key, { type: 'json' })) || [];
                if (box.length >= 50) return json({ ok: false, error: 'Their gift box is full.' }, 409);
                box.push({ id: `${Date.now().toString(36)}${randomInt(1e6).toString(36)}`, item, n: 1, note: clean(body.note, 200), from: (me.card && me.card.owner) || me.code, fromCode: me.code, at: new Date().toISOString() });
                await store.setJSON(key, box);
                return json({ ok: true });
            }
            case 'gifts': return json({ ok: true, gifts: (await store.get(`g:${user.id}`, { type: 'json' })) || [] });
            case 'accept': {
                const key = `g:${user.id}`;
                const box = (await store.get(key, { type: 'json' })) || [];
                const g = box.find(x => x.id === body.id);
                if (!g) return json({ ok: false, error: 'That gift is gone.' }, 404);
                await store.setJSON(key, box.filter(x => x.id !== body.id));
                return json({ ok: true, item: g.item, n: g.n || 1, from: g.from });
            }
            default: return json({ ok: false, error: 'Unknown action.' }, 400);
        }
    } catch (error) {
        return json({ ok: false, error: error.message || 'Hive service failed.' }, 503);
    }
};
export default withCors(handler);
