// Calendar feed link. Public GET ?t=<token> returns the .ics file.
// Signed-in GET returns this account's feed settings; signed-in POST
// { action: 'enable' | 'rotate' | 'disable' | 'items', items } changes them.
import { authenticatedUser } from '../lib/auth.mjs';
import { json, readLatest, plain } from '../lib/cloud-store.mjs';
import { feeds, newToken, validToken, cleanItems, buildIcs } from '../lib/feed.mjs';
import { withCors } from '../lib/cors.mjs';   // Nov 1 2026 (Craft): the Android app's own copy calls in

const feedUrl = (req, token) => new URL(`/.netlify/functions/calendar-feed?t=${token}`, req.url).href;

const handler = async (req) => {
    const url = new URL(req.url);
    const token = url.searchParams.get('t');
    if (req.method === 'GET' && token !== null) {
        if (!validToken(token)) return new Response('Not found', { status: 404 });
        try {
            const link = await feeds().get(`t/${token}`, { type: 'json' });
            if (!link) return new Response('Not found', { status: 404 });
            const entry = await readLatest(link.userId);
            const state = entry ? JSON.parse(plain(entry.data, link.userId)) : {};
            return new Response(buildIcs(state, link.items), { headers: {
                'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900',
                'Content-Disposition': 'inline; filename="bizzybee.ics"', 'X-Content-Type-Options': 'nosniff' } });
        } catch { return new Response('Feed unavailable', { status: 503 }); }
    }

    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Identity is unavailable. Please retry.' }, 503); }
    if (!user) return json({ ok: false, error: 'Not signed in' }, 401);
    const store = feeds();
    const mine = await store.get(`u/${user.id}`, { type: 'json' });

    if (req.method === 'GET') {
        return json({ ok: true, enabled: !!mine, url: mine ? feedUrl(req, mine.token) : null, items: cleanItems(mine && mine.items) });
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
    const items = cleanItems(body.items || (mine && mine.items));

    if (body.action === 'disable') {
        if (mine) { await store.delete(`t/${mine.token}`); await store.delete(`u/${user.id}`); }
        return json({ ok: true, enabled: false, url: null, items });
    }
    if (body.action === 'enable' || body.action === 'rotate' || body.action === 'items') {
        if (body.action === 'items' && !mine) return json({ ok: false, error: 'The feed is off.' }, 409);
        let tok = mine ? mine.token : null;
        if (!tok || body.action === 'rotate') {
            if (tok) await store.delete(`t/${tok}`);
            tok = newToken();
        }
        await store.setJSON(`t/${tok}`, { userId: user.id, items });
        await store.setJSON(`u/${user.id}`, { token: tok, items });
        return json({ ok: true, enabled: true, url: feedUrl(req, tok), items });
    }
    return json({ ok: false, error: 'Unknown action' }, 400);
};
export default withCors(handler);
