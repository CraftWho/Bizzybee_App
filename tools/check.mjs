import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function walk(path) {
    return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
        if (['assets', 'vendor'].includes(entry.name)) return [];
        const file = join(path, entry.name);
        return entry.isDirectory() ? walk(file) : /\.(js|mjs)$/.test(file) ? [file] : [];
    });
}
for (const file of [...walk('src'), ...walk('netlify'), 'login.js', 'reset-password.js']) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
}
const html = readFileSync('src/features/settings/settings.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate Settings IDs.');
for (const file of ['settings.js', 'cloud-controls.js', 'local-cloud-download.js']) {
    const source = readFileSync('src/features/settings/' + file, 'utf8');
    for (const match of source.matchAll(/getElementById\('([^']+)'\)/g)) {
        if (!ids.includes(match[1])) throw new Error(`Missing Settings control: ${match[1]}`);
    }
}
console.log('JavaScript syntax and Settings control wiring passed.');
const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--test', ...readdirSync('tests').filter(name => name.endsWith('.test.mjs')).map(name => join('tests', name))], { stdio: 'inherit' });
process.exit(result.status ?? 1);
