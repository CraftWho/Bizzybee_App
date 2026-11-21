// Terminal access: grants, expiry, owners and request limits (pure helpers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { activeLevel, makeGrant, addRequest, addLog, isOwnerEmail, validEmail, OWNER_HASHES, cleanEmail } from '../netlify/lib/terminal-access.mjs';

test('terminal: users get 48 hours, moderators until revoked', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');
    const u = makeGrant('user', {}, now);
    assert.equal(u.expiresAt, '2026-10-21T12:00:00.000Z');
    assert.equal(activeLevel(u, now + 47 * 3600000), 'user');
    assert.equal(activeLevel(u, now + 49 * 3600000), null);
    const m = makeGrant('moderator', { hours: 5 }, now);
    assert.equal(m.expiresAt, null);
    assert.equal(activeLevel(m, now + 365 * 86400000), 'moderator');
    assert.throws(() => makeGrant('owner'));
    assert.equal(activeLevel({ level: 'owner' }), null);
});

test('terminal: owners by email hash, request limits and logs', () => {
    // Nov 21 2026: the owner's real address never goes in the repo, only its fingerprint (hash).
    assert.ok(OWNER_HASHES.length >= 1 && OWNER_HASHES.every(h => /^[0-9a-f]{64}$/.test(h)));
    assert.equal(cleanEmail('  Some.One@Example.COM '), 'some.one@example.com');
    const sha = (e) => createHash('sha256').update(cleanEmail(e)).digest('hex');
    assert.equal(isOwnerEmail('x@example.com'), OWNER_HASHES.includes(sha('x@example.com')));
    assert.equal(isOwnerEmail('someone@else.com'), false);
    assert.equal(validEmail('a@b.co'), true);
    assert.equal(validEmail('nope'), false);
    let list = [];
    for (let i = 0; i < 3; i++) list = addRequest(list, 'a@b.co', 'my level reset');
    assert.throws(() => addRequest(list, 'a@b.co', 'again'), /3 requests/);
    assert.throws(() => addRequest([], 'c@d.co', 'x'), /Tell us/);
    assert.equal(addRequest(list, 'c@d.co', 'bees missing').length, 4);
    assert.equal(addLog([], 'a@b.co', 'fix xp', true)[0].cmd, 'fix xp');
});
