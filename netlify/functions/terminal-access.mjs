// Terminal access - see netlify/lib/terminal-access.mjs.
// GET: your level. POST { action }: request | log (anyone signed in / granted),
// grant | revoke | requests | grants | logs | dismiss (owners only).
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';
import { termStore, isOwnerEmail, activeLevel, makeGrant, addRequest, addLog, cleanEmail, validEmail } from '../lib/terminal-access.mjs';

export default async (req) => {
    if (!['GET', 'POST'].includes(req.method)) return json({ ok: false, error: 'Method not allowed' }, 405);
    let user;
    try { user = await authenticatedUser(req); } catch { return json({ ok: false, error: 'Identity is unavailable. Please retry.' }, 503); }
    if (!user || !user.email) return json({ ok: false, error: 'Sign in to your cloud account first.' }, 401);
    const email = cleanEmail(user.email);
    const owner = isOwnerEmail(email);
    const store = termStore();
    try {
        const grant = await store.get(`g/${email}`, { type: 'json' });
        const level = owner ? 'owner' : activeLevel(grant);
        if (req.method === 'GET') return json({ ok: true, level, expiresAt: level && !owner ? grant.expiresAt : null });

        let body;
        try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
        const a = body.action;
        if (a === 'request') {
            const list = addRequest(await store.get('requests', { type: 'json' }), email, body.message);
            await store.setJSON('requests', list);
            return json({ ok: true });
        }
        if (a === 'log') {
            if (!level) return json({ ok: false, error: 'No access.' }, 403);
            await store.setJSON('log', addLog(await store.get('log', { type: 'json' }), email, body.cmd, body.ok !== false));
            return json({ ok: true });
        }
        if (!owner) return json({ ok: false, error: 'Owners only.' }, 403);
        if (a === 'grant') {
            const who = cleanEmail(body.email);
            if (!validEmail(who)) return json({ ok: false, error: 'That email doesn\'t look right.' }, 400);
            const g = makeGrant(body.level === 'moderator' ? 'moderator' : 'user', { hours: body.hours, by: email, note: body.note });
            await store.setJSON(`g/${who}`, g);
            await store.setJSON('log', addLog(await store.get('log', { type: 'json' }), email, `grant ${who} ${g.level}`, true));
            return json({ ok: true, email: who, grant: g });
        }
        if (a === 'revoke') {
            const who = cleanEmail(body.email);
            await store.delete(`g/${who}`);
            await store.setJSON('log', addLog(await store.get('log', { type: 'json' }), email, `revoke ${who}`, true));
            return json({ ok: true });
        }
        if (a === 'requests') return json({ ok: true, requests: (await store.get('requests', { type: 'json' })) || [] });
        if (a === 'dismiss') {
            const list = ((await store.get('requests', { type: 'json' })) || []).filter(r => r.id !== body.id && r.email !== cleanEmail(body.email));
            await store.setJSON('requests', list);
            return json({ ok: true });
        }
        if (a === 'grants') {
            const { blobs } = await store.list({ prefix: 'g/' });
            const out = [];
            for (const b of blobs) { const g = await store.get(b.key, { type: 'json' }); if (activeLevel(g)) out.push({ email: b.key.slice(2), ...g }); }
            return json({ ok: true, grants: out });
        }
        if (a === 'logs') return json({ ok: true, log: ((await store.get('log', { type: 'json' })) || []).slice(0, Number(body.limit) || 30) });
        return json({ ok: false, error: 'Unknown action' }, 400);
    } catch (error) {
        return json({ ok: false, error: error.message && /request|already|Tell us|Level/.test(error.message) ? error.message : 'Terminal access is unavailable right now.' }, error.message && /request|already|Tell us/.test(error.message) ? 400 : 503);
    }
};
