// Discord notes (Nov 2026, Craft). Reports and logs go to Discord through webhooks, so
// they stop using Netlify storage. A webhook can only post (it can't be read back), and
// its address is a secret: it lives in Netlify environment variables, never in the repo
// or in app code. Same idea as Deck Mods (feedback.py).
//   DISCORD_WEBHOOK_REPORTS   bug and feedback reports
//   DISCORD_WEBHOOK_LOGS      Deck links and Grimzy claims
//   DISCORD_WEBHOOK_EVENTS    promotions and events
//   DISCORD_WEBHOOK_URL       one fallback for any channel that has no address of its own
// With no address set, notify() quietly does nothing.
export const WEBHOOK_RE = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
export const CHANNELS = ['reports', 'logs', 'events'];

// Keys, tokens, emails and webhook addresses never leave the app.
export function redact(text) {
    return String(text == null ? '' : text)
        .replace(/https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\S+/gi, '[webhook]')
        .replace(/\b(Bearer|Device|Basic)\s+[\w.~+\/=-]{8,}/gi, '$1 [hidden]')
        .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g, '[token]')
        .replace(/("?(?:token|key|secret|password|pass|authorization|api[_-]?key|pollKey)"?\s*[:=]\s*)"?[^\s",;}&]{4,}"?/gi, '$1[hidden]')
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
        .replace(/\b[a-f0-9]{32,}\b/gi, '[id]')
        .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[long-id]');
}
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export function webhookFor(channel, env = process.env) {
    const url = (env && (env[`DISCORD_WEBHOOK_${String(channel).toUpperCase()}`] || env.DISCORD_WEBHOOK_URL)) || '';
    return WEBHOOK_RE.test(url) ? url : '';
}

// Post one message. `fields` = [[name, value]], `file` = { name, text } (attached as a text file).
// Best effort: returns true/false and never throws, so a Discord hiccup can't break a request.
export async function notify(channel, { title, text, fields = [], color = 0xffcc00, file = null } = {}, { env = process.env, fetchImpl = fetch } = {}) {
    const url = webhookFor(channel, env);
    if (!url) return false;
    const embed = {
        title: clip(redact(title), 250), description: clip(redact(text), 3500), color,
        fields: fields.slice(0, 10).map(([n, v]) => ({ name: clip(redact(n), 250), value: clip(redact(v) || '-', 1000), inline: true })),
        timestamp: new Date().toISOString()
    };
    try {
        let init;
        if (file && file.text) {
            const form = new FormData();
            form.append('payload_json', JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }));
            form.append('files[0]', new Blob([clip(redact(file.text), 200000)], { type: 'text/plain' }), clip(file.name || 'log.txt', 60).replace(/[^\w.-]/g, '_'));
            init = { method: 'POST', body: form };
        } else {
            init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }) };
        }
        const r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(4000) });
        return !!(r && r.ok);
    } catch { return false; }
}
