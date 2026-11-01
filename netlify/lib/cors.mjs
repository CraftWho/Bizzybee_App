// Nov 1 2026 (Craft): the Android app now runs its own copy of the app
// (origin https://localhost) and calls these functions on the live site.
// Browsers only allow that when the function says so (CORS). Only the app's
// origin is allowed; the website itself is same-origin and needs nothing.
// Sign-in uses a Bearer token, never cookies, so no credentials are allowed.
export const APP_ORIGINS = ['https://localhost'];

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin'
    };
}

// Wraps a function handler: answers the browser's OPTIONS check, and adds
// the CORS headers to every reply sent to the app.
export function withCors(handler) {
    return async (req, context) => {
        const origin = req.headers.get('origin');
        const allowed = origin && APP_ORIGINS.includes(origin);
        if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? corsHeaders(origin) : {} });
        const res = await handler(req, context);
        if (!allowed || !res) return res;
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    };
}
