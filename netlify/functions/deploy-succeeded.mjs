import { getStore } from '@netlify/blobs';
// Nov 23 2026 (Craft): version.json's label is now the version ("Version 1.1.0"), not a batch
// number, so this posts once per VERSION, not once per deploy.
// Nov 12 2026 (Craft): posts "BizzyBee Batch NN is live!" in the Discord's
// #announcements when a live deploy of main finishes. Netlify runs a function
// with this file name by itself after every successful deploy (no URL; outside
// callers are blocked). Branch deploys and previews are skipped. The batch
// number comes from the deploy's version.json (tools/stamp-version.mjs).
// Posts once per batch: the last batch posted is kept in Blobs, so redeploys
// of the same batch stay quiet. The webhook address lives only in Netlify's
// environment variables (BIZZYBEE_ANNOUNCE_WEBHOOK, scope Functions); missing
// or not a Discord webhook = do nothing. Never throws, so it can't upset a deploy.
const SITE = 'https://bizzybeee.netlify.app';
const store = () => getStore({ name: 'bizzybee-announce', consistency: 'strong' });

export function cleanWebhook(value) {
    const url = String(value || '').replace(/[\s"]/g, '');
    return /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url) ? url : null;
}

export function message(batch, site = SITE) {
    return {
        username: 'BizzyBee',
        allowed_mentions: { parse: [] },   // never pings @everyone
        content: `🐝 **BizzyBee ${batch} is live!** Open the app to see What's New.\n${site}`,
    };
}

// The work, with its outside pieces passed in (so it can be tried locally).
export async function announce({ payload, webhook, fetchFn = fetch, lastBatch, saveBatch }) {
    if (!payload || payload.context !== 'production') return 'skip: not a live deploy';
    const url = cleanWebhook(webhook);
    if (!url) return 'skip: no announcement webhook';
    const site = payload.ssl_url || payload.url || SITE;
    const version = await fetchFn(`${site}/version.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    const batch = version && version.batch;
    if (!batch) return 'skip: no batch in version.json';
    if ((await lastBatch()) === batch) return `skip: ${batch} already announced`;
    const sent = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message(batch, SITE)) });
    if (!sent.ok) return `failed: Discord answered ${sent.status}`;
    await saveBatch(batch);
    return `announced ${batch}`;
}

export default async (req) => {
    try {
        const { payload } = await req.json();
        const result = await announce({
            payload,
            webhook: Netlify.env.get('BIZZYBEE_ANNOUNCE_WEBHOOK'),
            lastBatch: () => store().get('last-batch').catch(() => null),
            saveBatch: batch => store().set('last-batch', batch),
        });
        console.log('Discord announcement:', result);
    } catch (error) { console.log('Discord announcement failed:', error.message); }
};
