// Theme check (Nov 21 2026, Craft): opens every page at phone size and lists
// text on the honeycomb, see-through boxes and font mix-ups (docs/THEME-RULES.md).
// Needs Playwright and the app served locally, e.g. npx http-server -p 8124
// Usage: node tools/theme-check.mjs [http://localhost:8124]
import fs from 'node:fs'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');   // installed globally or in the project
const BASE = process.argv[2] || 'http://localhost:8124';
(async () => {
  const pages = ['features', 'plugins'].flatMap(d => fs.readdirSync('src/' + d).flatMap(x => { try { return fs.readdirSync(`src/${d}/${x}`).filter(f => f.endsWith('.html') && !/test|dev/.test(f)).map(f => `/src/${d}/${x}/${f}`); } catch { return []; } }));
  const b = await chromium.launch(); const out = {};
  const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, userAgent: 'Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36' });
  await ctx.addInitScript(() => {
    const App = { addListener: () => Promise.resolve({ remove() {} }) };
    const stub = new Proxy({}, { get: (t, k) => k === 'then' ? undefined : async () => ({}) });
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: new Proxy({ App }, { get: (t, k) => t[k] || stub }) };
  });
  // turn on the plugins so their pages render
  const p0 = await ctx.newPage(); await p0.goto(BASE + '/src/features/home/home.html'); await p0.waitForTimeout(1500);
  await p0.evaluate(() => { try { ['incubator','calendar','dictionary','study','terminal'].forEach(id => { if (Plugins.getEntry(id) && !Plugins.isEnabled(id)) Plugins.toggle(id); }); Vault.save(); } catch (e) {} }); await p0.close();
  for (const pg of pages) {
    const p = await ctx.newPage();
    try {
      await p.goto(BASE + pg, { waitUntil: 'load', timeout: 15000 }); await p.waitForTimeout(1800);
      await p.evaluate(() => document.querySelectorAll('[class$="-scrim"],.hn-tip,.hn-eve-pop').forEach(x => x.remove()));
      out[pg] = await p.evaluate(() => {
        const alpha = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c === 'transparent' ? 0 : 1; const v = m[1].split(',').map(s => parseFloat(s)); return v.length > 3 ? v[3] : 1; };
        const hasImg = (cs) => cs.backgroundImage && cs.backgroundImage !== 'none';
        const desc = (el) => { const c = (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''); return (el.id ? '#' + el.id : el.tagName.toLowerCase() + c) + ' "' + (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40) + '"'; };
        const chrome = (el) => el.closest('.ah, .app-header, header, .dk, nav, .dock, #bb-dock, [class^="dk-"], .hn-ask, .ah-wrap, .bb-badge, .pc-badge, #ii-scrim, .toast, [class*="toast"]');
        const fixedAncestor = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
        // what's behind an element: first ancestor with a solid-ish background
        const behind = (el) => { let a = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { if (e === document.body) return { body: true }; const cs = getComputedStyle(e); const al = alpha(cs.backgroundColor); if (hasImg(cs) && !/url\(/.test(cs.backgroundImage)) return { el: e, al: 1 }; if (al >= 0.85) return { el: e, al }; if (al > 0.02) a = Math.min(a, al); if (al > 0.02) return { el: e, al, thin: true }; } return { body: true }; };
        const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.1 && r.bottom > 0; };
        const bare = [], thin = new Map(), fonts = { mono: 0, sans: 0, serif: 0 }, monoBody = [], sansTitle = [];
        const texts = [...document.querySelectorAll('body *')].filter(el => !chrome(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1) && vis(el));
        for (const el of texts) {
          const cs = getComputedStyle(el); const f = cs.fontFamily.toLowerCase();
          const kind = /courier|consolas|monospace/.test(f) ? 'mono' : /georgia|serif/.test(f) && !/sans/.test(f) ? 'serif' : 'sans';
          fonts[kind]++;
          const txt = (el.innerText || '').trim(); const isTitle = /^H[1-6]$/.test(el.tagName) || el.tagName === 'BUTTON' || el.closest('button') || cs.textTransform === 'uppercase' || parseFloat(cs.fontWeight) >= 700;
          if (!isTitle && txt.length > 50 && kind === 'mono' && monoBody.length < 4) monoBody.push(desc(el));
          if (isTitle && kind === 'sans' && /^H[1-6]$/.test(el.tagName) && sansTitle.length < 4) sansTitle.push(desc(el));
          if (fixedAncestor(el)) continue;
          const bh = behind(el);
          if (bh.body && bare.length < 6) bare.push(desc(el));
          else if (bh.thin) { const k = bh.el; if (!thin.has(k) && thin.size < 6) thin.set(k, `${desc(k)} bg ${Math.round(bh.al * 100)}%`); }
        }
        // pop-ups / sheets present in the page CSS
        return { bare, thin: [...thin.values()], fonts, monoBody, sansTitle };
      });
    } catch (e) { out[pg] = { err: e.message.slice(0, 80) }; }
    await p.close();
  }
  let n = 0;
  for (const [pg, v] of Object.entries(out)) { const list = [...(v.bare || []).map(x => 'on honeycomb: ' + x), ...(v.thin || []).map(x => 'see-through: ' + x), ...(v.monoBody || []).map(x => 'reading text in title font: ' + x)]; if (v.err) list.push('error: ' + v.err); if (list.length) { console.log(pg); list.forEach(x => console.log('  ' + x)); n += list.length; } }
  console.log(n ? n + ' to check (inside bee card art and code/Terminal text are fine)' : 'All pages follow the theme rules.'); await b.close();
})();
