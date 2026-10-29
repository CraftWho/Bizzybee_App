// Limited editions (Oct 29 2026, Craft). The official list of numbered bees:
// serial -> account. 50 per edition; #001 is the creator's
// (BIZZYBEE_CREATOR_EMAIL). Claimable only on the event day (any time zone),
// except by the creator, who can test any time.
// POST { action } with the cloud sign-in token:
//   status { edition }        -> { left, mine }   mine = your serial or null
//   claim  { edition, day }   -> { serial, left } same serial if you already have one
import { getStore } from '@netlify/blobs';
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';

// The day is Oct 31 somewhere on Earth: 10:00 UTC Oct 30 to 12:00 UTC Nov 1.
const EDITIONS = {
    'grimzy-2026': { of: 50, from: Date.parse('2026-10-30T10:00:00Z'), to: Date.parse('2026-11-01T12:00:00Z'), day: '2026-10-31' }
};
const store = () => getStore({ name: 'bizzybee-limited', consistency: 'strong' });
const isCreator = (user) => {
    const want = String(process.env.BIZZYBEE_CREATOR_EMAIL || '').trim().toLowerCase();
    return !!want && String(user.email || '').toLowerCase() === want;
};

async function countTaken(s, edition) {
    let n = 0;
    for await (const page of s.list({ prefix: `${edition}/serial/`, paginate: true })) n += page.blobs.length;
    return n;
}

export default async (req) => {
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Sign-in is unavailable. Try again.' }, 503); }
    if (!user) return json({ ok: false, error: 'Sign in to Cloud sync to claim it.' }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
    const ed = EDITIONS[body.edition];
    if (!ed) return json({ ok: false, error: 'Unknown edition.' }, 404);
    const s = store(), mineKey = `${body.edition}/owner/${user.id}`;
    try {
        const mine = await s.get(mineKey, { type: 'json' });
        if (body.action === 'status') {
            return json({ ok: true, left: Math.max(0, ed.of - await countTaken(s, body.edition)), mine: mine ? mine.serial : null });
        }
        if (body.action !== 'claim') return json({ ok: false, error: 'Unknown action.' }, 400);
        if (mine) return json({ ok: true, serial: mine.serial, left: Math.max(0, ed.of - await countTaken(s, body.edition)) });
        const creator = isCreator(user), now = Date.now();
        if (!creator && (now < ed.from || now > ed.to || body.day !== ed.day)) return json({ ok: false, error: 'This bee can only be claimed on Halloween.' }, 403);
        // #001 is held for the creator; everyone else takes the next free number.
        const tryTake = async (n) => {
            const r = await s.setJSON(`${body.edition}/serial/${String(n).padStart(3, '0')}`, { user: user.id, at: new Date(now).toISOString() }, { onlyIfNew: true });
            return r.modified;
        };
        let serial = null;
        if (creator) { if (await tryTake(1)) serial = 1; }
        else for (let n = 2; n <= ed.of && !serial; n++) if (await tryTake(n)) serial = n;
        if (!serial) return json({ ok: false, error: 'All 50 have been claimed.', left: 0 }, 410);
        await s.setJSON(mineKey, { serial, at: new Date(now).toISOString() });
        return json({ ok: true, serial, left: Math.max(0, ed.of - await countTaken(s, body.edition)) });
    } catch (e) {
        return json({ ok: false, error: 'Try again in a minute.' }, 500);
    }
};
