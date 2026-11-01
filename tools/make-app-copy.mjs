// Nov 1 2026 (Craft): builds the copy of the app that goes INSIDE the APK
// (Capacitor's webDir). Run by the Android build: node ../tools/make-app-copy.mjs www
// Copies the app files and writes app-files.json + version.json for them, so
// the first update after installing only downloads what changed since.
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
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
writeFileSync(join(out, 'app-files.json'), JSON.stringify(buildManifest(out, version)));
writeFileSync(join(out, 'version.json'), JSON.stringify({ version, builtAt: new Date().toISOString() }) + '\n');
console.log('App copy:', out, version);
