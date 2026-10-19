// Terminal access (Oct 2026). The Bizzybee Terminal is a support tool: it
// stays locked until an owner grants access.
//   user      - repair commands on their own real save, 48 hours
//   moderator - user commands + Test Mode and test commands, until revoked
//   owner     - everything, plus grant / revoke / requests / logs
// Owners are matched by a SHA-256 of their email (same list as the 🛠 panel
// in src/core/dev-tools/dev-tools.js), so no address is written here.
import { getStore } from '@netlify/blobs';
import { createHash, randomUUID } from 'node:crypto';

export const termStore = () => getStore({ name: 'bizzybee-terminal', consistency: 'strong' });
export const OWNER_HASHES = [
    'cca1eb9e16323922a118e89aca369781ed00e145a60855b83b0c37398b70f10d',
    '0fb7061c0faa822f969cf19e1e1e96f9abd3ea14b0c3e232f80b25eea65b374f'
];
export const USER_HOURS = 48;
export const LEVELS = ['user', 'moderator'];
export const MAX_REQUESTS = 50, MAX_LOG = 300, REQUESTS_PER_DAY = 3;

export const cleanEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
export const isOwnerEmail = (email) => OWNER_HASHES.includes(createHash('sha256').update(cleanEmail(email)).digest('hex'));

// A grant record -> the level that applies right now (null when expired).
export function activeLevel(grant, now = Date.now()) {
    if (!grant || !LEVELS.includes(grant.level)) return null;
    if (grant.expiresAt && Date.parse(grant.expiresAt) <= now) return null;
    return grant.level;
}

export function makeGrant(level, { hours, by, note } = {}, now = Date.now()) {
    if (!LEVELS.includes(level)) throw new Error('Level must be user or moderator.');
    const h = level === 'moderator' ? null : Math.max(1, Math.min(24 * 30, Number(hours) || USER_HOURS));
    return { level, grantedAt: new Date(now).toISOString(), expiresAt: h ? new Date(now + h * 3600000).toISOString() : null, by: by || null, note: String(note || '').slice(0, 200) };
}

export function addRequest(list, email, message, now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10);
    const mine = (list || []).filter(r => r.email === email && r.at.slice(0, 10) === today);
    if (mine.length >= REQUESTS_PER_DAY) throw new Error('You already sent 3 requests today. The team will get back to you.');
    const text = String(message || '').trim().slice(0, 500);
    if (text.length < 3) throw new Error('Tell us what went wrong, e.g. request my level reset after the update');
    return [{ id: randomUUID(), email, message: text, at: new Date(now).toISOString() }, ...(list || [])].slice(0, MAX_REQUESTS);
}

export function addLog(list, email, cmd, ok, now = Date.now()) {
    return [{ at: new Date(now).toISOString(), email, cmd: String(cmd || '').slice(0, 120), ok: !!ok }, ...(list || [])].slice(0, MAX_LOG);
}
