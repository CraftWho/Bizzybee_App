// Explicitly verify the bearer token with this site's Identity service.
// Do not depend on framework-specific ambient Identity context.
export async function authenticatedUser(req) {
    const authorization = req.headers.get('authorization');
    if (!authorization || !/^Bearer \S+$/i.test(authorization)) return null;
    const response = await fetch(new URL('/.netlify/identity/user', req.url), {
        headers: { Authorization: authorization }, signal: AbortSignal.timeout(10000), redirect: 'error'
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(user.id) ? user : null;
}
