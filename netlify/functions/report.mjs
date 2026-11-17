// "Report a problem" (Nov 2026, Craft). The app sends a short message and, if you allow it,
// its recent error log. It goes to the developer's Discord (a webhook, see lib/discord.mjs),
// not into Netlify storage. Keys, tokens and emails are blanked before it leaves.
//   POST { kind, message, page, app, logs }  -> { ok }
// One report every 2 minutes per person (or per network address when signed out).
import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { authenticatedUser } from '../lib/auth.mjs';
import { json } from '../lib/cloud-store.mjs';
import { withCors } from '../lib/cors.mjs';
import { notify, webhookFor } from '../lib/discord.mjs';

export const WAIT_MS = 120000;
const KINDS = { bug: ['🐞 Something is broken', 0xdc143c], idea: ['💡 Idea or request', 0x4aa3ff], other: ['💬 Other', 0xffcc00] };
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const store = () => getStore({ name: 'bizzybee-reports', consistency: 'strong' });

export async function handle(req, { s = store(), user = null, now = Date.now(), env = process.env, fetchImpl = fetch } = {}) {
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
    if (!webhookFor('reports', env)) return json({ ok: false, error: 'Reports are not set up yet.' }, 503);
    const message = clip(body.message, 3000).trim();
    if (!message) return json({ ok: false, error: 'Tell us what happened first.' }, 400);
    const who = user ? `u/${user.id}` : `ip/${createHash('sha256').update(req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'unknown').digest('hex').slice(0, 24)}`;
    const last = await s.get(who, { type: 'json' });
    if (last && now - last.at < WAIT_MS) return json({ ok: false, error: 'Wait a couple of minutes before sending another.' }, 429);
    await s.setJSON(who, { at: now });
    const [label, color] = KINDS[body.kind] || KINDS.other;
    const logs = clip(Array.isArray(body.logs) ? body.logs.slice(-80).join('\n') : body.logs, 60000);
    const ok = await notify('reports', {
        title: label, text: message, color,
        fields: [['App', clip(body.app, 80) || 'unknown'], ['Page', clip(body.page, 60) || 'unknown'], ['Signed in', user ? 'yes' : 'no'], ['Logs', logs ? 'attached' : 'not sent']],
        file: logs ? { name: 'recent-log.txt', text: logs } : null
    }, { env, fetchImpl });
    return ok ? json({ ok: true }) : json({ ok: false, error: 'Could not send. Try again later.' }, 502);
}

const handler = async (req) => {
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let user = null;
    if (/^Bearer /i.test(req.headers.get('authorization') || '')) { try { user = await authenticatedUser(req); } catch { /* send as signed out */ } }
    try { return await handle(req, { user }); } catch { return json({ ok: false, error: 'Try again in a minute.' }, 500); }
};
export default withCors(handler);
