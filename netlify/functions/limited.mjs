// Limited editions (Oct 29 2026, Craft; back Nov 1 2026). The official list
// of numbered bees: serial -> account. 50 per edition; #001 is the creator's
// (BIZZYBEE_CREATOR_EMAIL). Nov 9 2026 (Craft): the claim reopened for friends:
// anyone signed in can claim one until Nov 16 (end of day Eastern), or until all
// 50 are taken. The creator's claim always takes #001.
// Nov 1 2026 (Craft): the creator can also send a numbered card as a GIFT,
// with a letter, to someone's sign-in email. They get it the next time they
// open BizzyBee (and in their Mailbox until they add it to their hive).
// POST { action } with the cloud sign-in token:
//   status { edition }                       -> { left, mine, open, until }
//   claim  { edition, day }                  -> { serial, left }
//   gift   { edition, email, serial, letter } -> { ok }            (creator only)
//   gifts                                     -> { creator, sent: [...] } (creator only)
//   inbox                                     -> { gifts: [{ edition, serial, letter, from, at }] }
//   accept { edition }                        -> { serial }
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';
import { withCors } from '../lib/cors.mjs';
import { notify } from '../lib/discord.mjs';

// Nov 9 2026 (Craft): open from Oct 30 until Nov 16 end of day Eastern (05:00 UTC Nov 17).
export const EDITIONS = {
    'grimzy-2026': { of: 50, from: Date.parse('2026-10-30T10:00:00Z'), to: Date.parse('2026-11-17T05:00:00Z') }
};
const store = () => getStore({ name: 'bizzybee-limited', consistency: 'strong' });
export const cleanEmail = (e) => String(e || '').trim().toLowerCase();
export const emailKey = (e) => createHash('sha256').update(cleanEmail(e)).digest('hex').slice(0, 32);
const pad = (n) => String(n).padStart(3, '0');
const isCreator = (user) => {
    const want = cleanEmail(process.env.BIZZYBEE_CREATOR_EMAIL);
    return !!want && cleanEmail(user.email) === want;
};

async function countTaken(s, edition) {
    let n = 0;
    for await (const page of s.list({ prefix: `${edition}/serial/`, paginate: true })) n += page.blobs.length;
    return n;
}

export async function handle(req, { s = store(), user, creator = isCreator(user), now = Date.now(), env = process.env, fetchImpl = fetch } = {}) {
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
    const action = body.action;
    const mailKey = `gift-to/${emailKey(user.email)}/`;

    if (action === 'inbox') {
        const gifts = [];
        for await (const page of s.list({ prefix: mailKey, paginate: true })) {
            for (const b of page.blobs) {
                const g = await s.get(b.key, { type: 'json' });
                if (g && !g.acceptedAt) gifts.push({ edition: g.edition, serial: g.serial, of: (EDITIONS[g.edition] || {}).of || 50, letter: g.letter, from: g.from, at: g.at });
            }
        }
        return json({ ok: true, gifts });
    }
    if (action === 'gifts') {
        if (!creator) return json({ ok: false, error: 'Only the creator can send gifts.' }, 403);
        const sent = [];
        for await (const page of s.list({ prefix: 'gift-log/', paginate: true })) {
            for (const b of page.blobs) { const g = await s.get(b.key, { type: 'json' }); if (g) sent.push(g); }
        }
        return json({ ok: true, creator: true, sent });
    }

    const ed = EDITIONS[body.edition];
    if (!ed) return json({ ok: false, error: 'Unknown edition.' }, 404);
    const mineKey = `${body.edition}/owner/${user.id}`;
    const mine = await s.get(mineKey, { type: 'json' });

    if (action === 'status') {
        // #001 is the creator's, so friends can only take 2..50: count what is left for THEM.
        const taken = await countTaken(s, body.edition);
        const first = await s.get(`${body.edition}/serial/${pad(1)}`, { type: 'json' });
        const left = Math.max(0, ed.of - 1 - (taken - (first ? 1 : 0)));
        return json({ ok: true, left, mine: mine ? mine.serial : null, open: now >= ed.from && now <= ed.to && left > 0, until: new Date(ed.to).toISOString() });
    }

    if (action === 'claim') {
        if (mine) return json({ ok: true, serial: mine.serial, left: Math.max(0, ed.of - await countTaken(s, body.edition)) });
        if (!creator && (now < ed.from || now > ed.to)) return json({ ok: false, error: 'The Grimzy claim has closed.' }, 403);
        const tryTake = async (n) => (await s.setJSON(`${body.edition}/serial/${pad(n)}`, { user: user.id, at: new Date(now).toISOString() }, { onlyIfNew: true })).modified;
        let serial = null;
        if (creator) { if (await tryTake(1)) serial = 1; }
        else for (let n = 2; n <= ed.of && !serial; n++) if (await tryTake(n)) serial = n;
        if (!serial) return json({ ok: false, error: `All ${ed.of} have been claimed.`, left: 0 }, 410);
        await s.setJSON(mineKey, { serial, at: new Date(now).toISOString() });
        const left = Math.max(0, ed.of - await countTaken(s, body.edition));
        await notify('logs', { title: '🐝 Grimzy claimed', text: `#${pad(serial)} of ${ed.of}${creator ? ' (creator)' : ''}. ${left} left.`, fields: [['Account', String(user.id).slice(0, 8)]], color: 0xff2d78 }, { env, fetchImpl });
        return json({ ok: true, serial, left: Math.max(0, ed.of - await countTaken(s, body.edition)) });
    }

    if (action === 'gift') {
        if (!creator) return json({ ok: false, error: 'Only the creator can send gifts.' }, 403);
        const to = cleanEmail(body.email);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ ok: false, error: 'That email doesn\'t look right.' }, 400);
        const serial = Number(body.serial);
        if (!Number.isInteger(serial) || serial < 1 || serial > ed.of) return json({ ok: false, error: `Pick a number from 1 to ${ed.of}.` }, 400);
        const letter = String(body.letter || '').slice(0, 2000);
        const giftKey = `gift-to/${emailKey(to)}/${body.edition}`;
        if (await s.get(giftKey, { type: 'json' })) return json({ ok: false, error: 'They already have a gift of this bee.' }, 409);
        const at = new Date(now).toISOString();
        // The number is taken the moment it's sent, so it can't go to two people.
        const took = (await s.setJSON(`${body.edition}/serial/${pad(serial)}`, { gift: emailKey(to), at }, { onlyIfNew: true })).modified;
        if (!took) {
            // Your own number (you claimed it before) can still come with a letter.
            const held = await s.get(`${body.edition}/serial/${pad(serial)}`, { type: 'json' });
            const self = held && held.user === user.id && cleanEmail(user.email) === to;
            if (!self) return json({ ok: false, error: `#${pad(serial)} is already taken.` }, 409);
        }
        await s.setJSON(giftKey, { edition: body.edition, serial, letter, from: 'Craft', at, to: emailKey(to) });
        await s.setJSON(`gift-log/${body.edition}-${pad(serial)}`, { edition: body.edition, serial, to, at });
        return json({ ok: true, serial });
    }

    if (action === 'accept') {
        const giftKey = mailKey + body.edition;
        const g = await s.get(giftKey, { type: 'json' });
        if (!g) return json({ ok: false, error: 'No gift found.' }, 404);
        if (mine) {   // already holds one: keep theirs, mark the gift done
            await s.setJSON(giftKey, { ...g, acceptedAt: new Date(now).toISOString(), keptSerial: mine.serial });
            return json({ ok: true, serial: mine.serial });
        }
        const at = new Date(now).toISOString();
        await s.setJSON(`${body.edition}/serial/${pad(g.serial)}`, { user: user.id, at, gift: true });
        await s.setJSON(mineKey, { serial: g.serial, at, gift: true });
        await s.setJSON(giftKey, { ...g, acceptedAt: at });
        return json({ ok: true, serial: g.serial });
    }
    return json({ ok: false, error: 'Unknown action.' }, 400);
}

const handler = async (req) => {
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Sign-in is unavailable. Try again.' }, 503); }
    if (!user) return json({ ok: false, error: 'Sign in to Cloud sync first.' }, 401);
    try { return await handle(req, { user }); }
    catch { return json({ ok: false, error: 'Try again in a minute.' }, 500); }
};
export default withCors(handler);
