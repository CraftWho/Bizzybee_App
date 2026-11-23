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
    // Nov 23 2026 (Craft): batch numbers stopped at 24, so About was stuck on "Batch 24".
    // The label is now the newest What's New version (e.g. "Version 1.1.0"). The field keeps
    // its old name, because app copies already installed read `batch`.
    const ver = src.match(/\{ id: '[^']+', version: '([^']+)'/);
    if (ver) batch = 'Version ' + ver[1];
} catch { /* no label, fine */ }
// Nov 21 2026 (Craft): the Updates page in the app lists what's new, from the newest What's New entry.
let notes = [];
try {
    const src = readFileSync(new URL('../src/core/ui/updates/updates.js', import.meta.url), 'utf8');
    const start = src.indexOf("{ id: '");
    const next = src.indexOf("{ id: '", start + 5);
    const block = src.slice(start, next > 0 ? next : undefined);
    notes = [...block.matchAll(/title: '((?:[^'\\]|\\.)*)', text: '((?:[^'\\]|\\.)*)'/g)].map(m => `${m[1]}: ${m[2]}`.replace(/\\'/g, "'")).slice(0, 12);
} catch { /* no notes, fine */ }
try {
    writeFileSync(new URL('../version.json', import.meta.url), JSON.stringify({ version, commit: process.env.COMMIT_REF || null, batch, builtAt: new Date().toISOString(), notes }) + '\n');
    console.log('version.json:', version);
} catch (error) { console.log('version.json not written:', error.message); }
try {
    const m = buildManifest(root, version);
    writeFileSync(new URL('../app-files.json', import.meta.url), JSON.stringify(m));
    console.log('app-files.json:', Object.keys(m.files).length, 'files');
} catch (error) { console.log('app-files.json not written:', error.message); }
