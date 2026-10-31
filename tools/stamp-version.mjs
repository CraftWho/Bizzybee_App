// Oct 31 2026 (Craft): Netlify's build step (netlify.toml [build]). Writes
// version.json with this deploy's id. sw.js checks it to know when a new
// version is live and swaps its cached copy of the app. Never fails the deploy.
import { writeFileSync } from 'node:fs';
const version = process.env.DEPLOY_ID || process.env.COMMIT_REF || String(Date.now());
try {
    writeFileSync(new URL('../version.json', import.meta.url), JSON.stringify({ version, commit: process.env.COMMIT_REF || null, builtAt: new Date().toISOString() }) + '\n');
    console.log('version.json:', version);
} catch (error) { console.log('version.json not written:', error.message); }
