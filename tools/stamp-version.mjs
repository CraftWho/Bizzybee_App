// Oct 31 2026 (Craft): Netlify's build step (netlify.toml [build]). Writes
// version.json with this deploy's id. sw.js checks it to know when a new
// version is live and swaps its cached copy of the app. Never fails the deploy.
// Nov 1 2026 (Craft): also writes app-files.json, the file list + fingerprints
// the Android app's own copy uses to download only what changed.
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './app-files.mjs';
const version = process.env.DEPLOY_ID || process.env.COMMIT_REF || String(Date.now());
const root = fileURLToPath(new URL('..', import.meta.url));
// Nov 2 2026 (Craft): the newest batch named in What's New (its dev notes),
// shown in Settings › About next to the deploy date and commit.
let batch = null;
try {
    const src = readFileSync(new URL('../src/core/ui/updates/updates.js', import.meta.url), 'utf8');
    const nums = [...src.matchAll(/Batch (\d+)/g)].map(m => Number(m[1]));
    if (nums.length) batch = 'Batch ' + Math.max(...nums);
} catch { /* no batch, fine */ }
try {
    writeFileSync(new URL('../version.json', import.meta.url), JSON.stringify({ version, commit: process.env.COMMIT_REF || null, batch, builtAt: new Date().toISOString() }) + '\n');
    console.log('version.json:', version);
} catch (error) { console.log('version.json not written:', error.message); }
try {
    const m = buildManifest(root, version);
    writeFileSync(new URL('../app-files.json', import.meta.url), JSON.stringify(m));
    console.log('app-files.json:', Object.keys(m.files).length, 'files');
} catch (error) { console.log('app-files.json not written:', error.message); }
