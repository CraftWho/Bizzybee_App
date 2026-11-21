// Privacy guard (Nov 21 2026, Craft): the repo is public, so personal info
// must never be committed. This fails if any tracked file, or any commit not
// yet pushed, has:
//   - a private word (name, username, email, place...). Only their
//     fingerprints are kept, in privacy-terms.json; add one with
//     node tools/privacy-add.mjs "word"
//   - an email address that isn't a known test/example address
//   - a real-looking key or token, or a private key
//   - a Windows user folder other than the "me" placeholder
//   - a phone number
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); } catch { return null; } };
const TEXT = /\.(js|mjs|cjs|ts|tsx|jsx|html|css|json|md|txt|yml|yaml|toml|py|sh|svg|xml|webmanifest)$|^[^.]+$/i;
const SKIP = /(^|\/)(package-lock\.json|privacy-terms\.json|privacy\.test\.mjs)$/;   // this file holds fake samples to test the checker
const HASHES = new Set(JSON.parse(readFileSync(new URL('./privacy-terms.json', import.meta.url), 'utf8')).hashes);
const sha = (w) => createHash('sha256').update(w).digest('hex');
const OK_EMAIL = /^(noreply@anthropic\.com|actions@github\.com|craft@bizzybee\.hive|[a-z0-9._-]+@(example\.(com|org|net)|x\.com|b\.co|d\.co|else\.com|test\.com|users\.noreply\.github\.com))$/i;

function problems(text) {
    const out = [];
    for (const w of text.toLowerCase().match(/[a-z0-9_.@+-]{3,}/g) || []) {
        const parts = [w, ...w.split(/[._@+-]+/)];
        for (const p of parts) if (p.length >= 3 && HASHES.has(sha(p))) { out.push('a private word'); break; }
    }
    for (const e of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}/g) || []) if (!OK_EMAIL.test(e)) out.push(`email ${e.replace(/^(.).*(@.*)$/, '$1…$2')}`);
    if (/\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|bbk_[A-Za-z0-9]{24,})/.test(text)) out.push('a key or token');
    if (/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) out.push('a private key');
    if (/[A-Za-z]:\\{1,2}Users\\{1,2}(?!me\\)[A-Za-z0-9_.-]+/.test(text)) out.push('a Windows user folder');
    if (/(?<![\d-])\(?[2-9]\d{2}\)?[ .-]\d{3}[ .-]\d{4}(?![\d-])/.test(text)) out.push('a phone number');
    return [...new Set(out)];
}

test('privacy: the checker catches what it should', () => {
    assert.deepEqual(problems('per our rules'), []);
    assert.ok(problems('mail someone@gmail.com').some(x => x.startsWith('email')));
    assert.deepEqual(problems('use you@example.com or a@b.co'), []);
    assert.ok(problems('C:\\Users\\bob\\Desktop').includes('a Windows user folder'));
    assert.deepEqual(problems('C:\\Users\\me\\Desktop'), []);
    assert.ok(problems('call 305-555-1234').includes('a phone number'));
    assert.deepEqual(problems('2026-11-21 and 1,251 steps'), []);
    assert.ok(problems('token ghp_' + 'a'.repeat(30)).includes('a key or token'));
    HASHES.add(sha('zzprivatezz'));
    assert.ok(problems('hello ZZPrivateZZ there').includes('a private word'));
    assert.ok(problems("it's zzprivatezz's call").includes('a private word'));
    HASHES.delete(sha('zzprivatezz'));
});

test('privacy: no personal info in any tracked file', (t) => {
    const files = git('ls-files');
    if (files == null) { t.skip('git not available'); return; }
    const bad = [];
    for (const f of files.split('\n').filter(Boolean)) {
        if (!TEXT.test(f) || SKIP.test(f)) continue;
        const p = ROOT + f;
        if (!existsSync(p) || statSync(p).size > 4 << 20) continue;
        const found = problems(readFileSync(p, 'utf8'));
        if (found.length) bad.push(`${f}: ${found.join(', ')}`);
    }
    assert.deepEqual(bad, [], 'Personal info found. Remove it before committing:\n' + bad.join('\n'));
});

test('privacy: no personal info in commits not pushed yet', (t) => {
    const branch = (git('rev-parse --abbrev-ref HEAD') || '').trim();
    const up = git('rev-parse --abbrev-ref --symbolic-full-name @{u}') || (git(`rev-parse --verify -q origin/${branch}`) ? `origin/${branch}` : git('rev-parse --verify -q origin/main') ? 'origin/main' : null);
    if (!up) { t.skip('no online copy to compare with'); return; }
    const log = git(`log ${up.trim()}..HEAD --format=%an%n%ae%n%B`) || '';
    const found = problems(log);
    assert.deepEqual(found, [], 'Personal info in a commit message or author: ' + found.join(', '));
});
