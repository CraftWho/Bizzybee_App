// Nov 1 2026 (Craft): builds the copy of the app that goes INSIDE the APK
// (Capacitor's webDir). Run by the Android build: node ../tools/make-app-copy.mjs www
// Copies the app files and writes app-files.json + version.json for them, so
// the first update after installing only downloads what changed since.
import { mkdirSync, copyFileSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAppFiles, buildManifest } from './app-files.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(process.argv[2] || 'www');
const version = 'apk-' + (process.env.GITHUB_SHA || process.env.COMMIT_REF || Date.now()).toString().slice(0, 12);
rmSync(out, { recursive: true, force: true });
for (const rel of listAppFiles(root)) {
    const to = join(out, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(root, rel), to);
}
// Nov 2 2026 (Craft): BizzyBee Dev (your own APK) flips the BB_PERSONAL flag in
// its copy. Owner tools are on and it never takes the live site's files.
if (process.env.BB_PERSONAL === '1') {
    for (const f of ['src/core/boot.js', 'src/core/site.js']) {
        const p = join(out, f), txt = readFileSync(p, 'utf8');
        if (!txt.includes('window.BB_PERSONAL = false;')) throw new Error('BB_PERSONAL marker missing in ' + f);
        writeFileSync(p, txt.replace('window.BB_PERSONAL = false;', 'window.BB_PERSONAL = true;'));
    }
    console.log('BizzyBee Dev: BB_PERSONAL on');
}
writeFileSync(join(out, 'app-files.json'), JSON.stringify(buildManifest(out, version)));
// Nov 6 2026 (Craft): same fields as the website's version.json (tools/stamp-version.mjs),
// so Settings › About shows date · batch · commit in a fresh install too.
let batch = null;
try {
    const nums = [...readFileSync(join(root, 'src/core/ui/updates/updates.js'), 'utf8').matchAll(/Batch (\d+)/g)].map(m => Number(m[1]));
    if (nums.length) batch = 'Batch ' + Math.max(...nums);
} catch { /* no batch, fine */ }
writeFileSync(join(out, 'version.json'), JSON.stringify({ version, commit: process.env.GITHUB_SHA || null, batch, builtAt: new Date().toISOString() }) + '\n');
console.log('App copy:', out, version);
