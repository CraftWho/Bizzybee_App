// Test the app on your phone with no deploy (Nov 15 2026, Craft). Run: npm run phone
// Serves this folder on your Wi-Fi. Open the printed address in your phone's browser.
// The app sees a local network address and uses the PC LOCAL test save, so it never
// touches your real data. Cloud features (sign-in, Deck, reports) don't work here;
// for those use `npm run dev` (netlify dev, also free).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 8123;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' };

createServer(async (req, res) => {
    try {
        let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
        let file = join(ROOT, p);
        if (!file.startsWith(ROOT) || /(^|[/\\])(\.|node_modules|netlify|tests|save-files|private)/.test(p)) { res.writeHead(403).end('No'); return; }
        if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end('Not found'); }
}).listen(PORT, '0.0.0.0', () => {
    const ips = Object.values(networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
    console.log('BizzyBee test copy is running.');
    console.log(`  This computer:  http://localhost:${PORT}/`);
    ips.forEach(ip => console.log(`  Your phone:     http://${ip}:${PORT}/   (same Wi-Fi)`));
});
