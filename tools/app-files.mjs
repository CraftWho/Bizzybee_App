// Nov 1 2026 (Craft): which files make up the app, with a fingerprint
// (sha256) of each. The Android app keeps its own copy of these files and,
// on each deploy, downloads only the ones whose fingerprint changed.
// Never included: personal data, private files, server code, tests, tools.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

export const ROOT_FILES = ['index.html', '404.html', 'manifest.json', 'favicon.ico'];
const NEVER = [
    /^src\/core\/data\.personal\.json$/,
    /^src\/assets\/images\/me\.jpg$/,
    /(^|\/)\.[^/]+/,              // dot files (.DS_Store, .gitkeep...)
    /\.md$/i,
    /(^|\/)(save-files|workshop|private|local-save-backups)(\/|$)/,
    /^src\/features\/quests\/logs\//          // personal quest logs
];

export function listAppFiles(root) {
    const out = [];
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            const rel = relative(root, full).split(sep).join('/');
            if (NEVER.some(re => re.test(rel))) continue;
            const st = statSync(full);
            if (st.isDirectory()) walk(full); else out.push(rel);
        }
    };
    for (const f of ROOT_FILES) { try { if (statSync(join(root, f)).isFile()) out.push(f); } catch { /* missing is fine */ } }
    walk(join(root, 'src'));
    return out.sort();
}

// { version, files: { "src/core/app.js": ["<sha256>", <bytes>] } }
export function buildManifest(root, version) {
    const files = {};
    for (const rel of listAppFiles(root)) {
        const buf = readFileSync(join(root, rel));
        files[rel] = [createHash('sha256').update(buf).digest('hex'), buf.length];
    }
    return { version: String(version), files };
}
