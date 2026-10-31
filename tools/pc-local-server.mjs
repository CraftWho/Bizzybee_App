// Oct 31 2026 (Craft): PC LOCAL server for "Start PC Local.bat".
// Serves this project on http://127.0.0.1:5501 (this computer only), then
// opens it in your browser. No internet, no installs, no cloud: the app sees
// a local address and opens the PC LOCAL test account (see src/core/db.js).
// Close the window (or Ctrl+C) to stop.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5501;
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8'
};

createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = normalize(join(ROOT, path));
        if (!file.startsWith(normalize(ROOT)) || file.split(sep).includes('.git')) { res.writeHead(403).end(); return; }
        const info = await stat(file);
        if (!info.isFile()) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(await readFile(file));
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
}).listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}/`;
    console.log(`BizzyBee PC LOCAL is running at ${url}`);
    console.log('Close this window to stop.');
    const open = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(open);
}).on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Is PC Local already running? Open http://127.0.0.1:${PORT}/` : error.message);
});
