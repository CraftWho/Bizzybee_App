// EggDesign - every egg gets its own gold-and-black pattern, made from a
// number (the "seed"). Same seed = same egg, always. Give each egg a seed
// (e.g. from the account id + egg number) and the design is automatic.
//
//   EggDesign.svg(seed, { style, id })  -> full <svg> string for the egg
//   EggDesign.parts(seed, { style, id }) -> { defs, base, ink, shade, style, name }
//   EggDesign.STYLES                     -> list of style keys
//   EggDesign.seedFrom('any text')       -> a seed from a string
//
// Styles (inspired by the reference eggs): hex (first egg - honeycomb with
// zigzag or chevron trim), waves, zebra, maze, starwave, dots, terrazzo,
// brush, chevron. Patterns are drawn on a flat "map" and wrapped onto the
// egg's curve, so they bend and pinch toward the tips like a real egg.
const EggDesign = (() => {
    const VB_W = 120, VB_H = 150;
    const CX = 60, TOP = 4, BOT = 146, WY = 86, RMAX = 54;
    const HALF = Math.PI / 2;
    const XMAX = RMAX * HALF;          // map X range: -XMAX..XMAX is the front

    const f = v => (+v).toFixed(2);

    function rng(seed) {
        let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
        return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    }
    function seedFrom(str) {
        let h = 2166136261;
        for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
        return (h >>> 0) % 2147483646 + 1;
    }

    // Egg radius at height y (taller top half, rounder bottom).
    function R(y) {
        if (y <= TOP || y >= BOT) return 0;
        const t = y < WY ? (WY - y) / (WY - TOP) : (y - WY) / (BOT - WY);
        return RMAX * Math.sqrt(Math.max(0, 1 - t * t));
    }
    function proj(X, Y) {
        const th = Math.max(-HALF, Math.min(HALF, X / RMAX));
        return [CX + R(Y) * Math.sin(th), Y];
    }
    // Map points -> projected path, with extra points so edges curve.
    function path(pts, closed) {
        const out = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            out.push(proj(a[0], a[1]));
            if (!closed && i === pts.length - 1) break;
            const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3);
            for (let k = 1; k < n; k++) out.push(proj(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
        }
        return 'M' + out.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + (closed ? 'Z' : '');
    }
    const fillP = (pts) => `<path d="${path(pts, true)}" stroke="none"/>`;
    const strokeP = (pts, w) => `<path d="${path(pts, false)}" fill="none" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    // ribbon: a filled band along a centre line with varying half-width
    function ribbon(center, hw) {
        const L = [], Rr = [];
        for (let i = 0; i < center.length; i++) {
            const p = center[i], q = center[Math.min(center.length - 1, i + 1)], o = center[Math.max(0, i - 1)];
            let dx = q[0] - o[0], dy = q[1] - o[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
            const w = hw(i / (center.length - 1));
            L.push([p[0] - dy * w, p[1] + dx * w]); Rr.push([p[0] + dy * w, p[1] - dx * w]);
        }
        return fillP(L.concat(Rr.reverse()));
    }
    function star(cx, cy, r) {
        const pts = [];
        for (let i = 0; i < 10; i++) { const a = -HALF + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
        return fillP(pts);
    }
    function dot(cx, cy, r) {
        const [x, y] = proj(cx, cy);
        const th = Math.min(HALF, Math.abs(cx / RMAX));
        const sx = Math.max(.12, Math.cos(th)) * Math.max(.3, R(cy) / RMAX * 1.15);
        return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * Math.min(1, sx))}" ry="${f(r)}" stroke="none"/>`;
    }
    const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i + Math.PI / 6; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

    // ---------------- styles ----------------
    const S = {};

    // First egg: honeycomb + playful trim (WWW zigzag or >>> <<< chevrons).
    S.hex = (r) => {
        let s = '';
        const hr = 8 + r() * 1.5, w = Math.sqrt(3) * hr, h = 1.5 * hr;
        const trim = r() < .5 ? 'zigzag' : 'chevron';
        const bandY = 98 + r() * 6, band2 = 30 + r() * 6;
        const fillRate = .12 + r() * .14;
        for (let row = -1; row * h < VB_H + hr; row++) {
            for (let col = -Math.ceil(XMAX / w) - 1; col * w < XMAX + w; col++) {
                const x = col * w + (row % 2 ? w / 2 : 0), y = row * h;
                if (Math.abs(y - bandY) < 9 || Math.abs(y - band2) < 6) continue;
                const pts = hexPts(x, y, hr * .86);
                s += r() < fillRate ? fillP(pts) : `<path d="${path(pts, true)}" fill="none" stroke-width=".9"/>`;
            }
        }
        // trim bands
        const zig = (y, amp, step, w2) => { const pts = []; let up = true; for (let x = -XMAX - step; x <= XMAX + step; x += step) { pts.push([x, y + (up ? -amp : amp)]); up = !up; } return strokeP(pts, w2); };
        const line = (y, w2) => strokeP([[-XMAX - 4, y], [XMAX + 4, y]], w2);
        s += line(bandY - 7.5, 1.1) + line(bandY + 7.5, 1.1);
        if (trim === 'zigzag') { s += zig(bandY, 4, 5, 2.2); s += zig(band2, 2.6, 4, 1.6); }
        else {
            // >>>> <<<< meeting at the front
            for (let x = 4; x < XMAX; x += 7) {
                s += strokeP([[x - 3, bandY - 4], [x + 1.5, bandY], [x - 3, bandY + 4]], 2);
                s += strokeP([[-x + 3, bandY - 4], [-x - 1.5, bandY], [-x + 3, bandY + 4]], 2);
            }
            s += zig(band2, 2.4, 4, 1.5);
        }
        return { ink: s, base: 'black', name: trim === 'zigzag' ? 'Honeycomb · zigzag' : 'Honeycomb · chevrons' };
    };

    S.waves = (r) => {
        let s = ''; const gap = 7 + r() * 3, amp = 3 + r() * 5, fr = .05 + r() * .05, slope = (r() - .5) * .9;
        for (let y0 = -60; y0 < VB_H + 60; y0 += gap) {
            const pts = []; for (let x = -XMAX - 5; x <= XMAX + 5; x += 3) pts.push([x, y0 + amp * Math.sin(x * fr + y0 * .05) + slope * x]);
            s += strokeP(pts, gap * (.36 + r() * .14));
        }
        return { ink: s, base: r() < .5 ? 'black' : 'gold', name: 'Waves' };
    };

    S.zebra = (r) => {
        let s = ''; const gap = 9 + r() * 4, fr = .04 + r() * .04, ph = r() * 6;
        for (let y0 = -40; y0 < VB_H + 40; y0 += gap) {
            const pts = []; for (let x = -XMAX - 5; x <= XMAX + 5; x += 3) pts.push([x, y0 + 7 * Math.sin(x * fr + ph) + 5 * Math.sin(x * fr * 2.3 + y0 * .11)]);
            const k = y0 * .37;
            s += ribbon(pts, t => gap * (.12 + .26 * Math.abs(Math.sin(t * 3.2 + k))));
        }
        return { ink: s, base: 'gold', name: 'Zebra' };
    };

    S.maze = (r) => {
        let s = ''; const n = 170 + Math.floor(r() * 40), w = 2.6 + r() * .8;
        for (let i = 0; i < n; i++) {
            let x = (r() * 2 - 1) * (XMAX + 6), y = r() * VB_H, a = r() * Math.PI * 2, turn = (r() - .5) * .5;
            const pts = [[x, y]]; const len = 6 + Math.floor(r() * 14);
            for (let k = 0; k < len; k++) { if (r() < .2) turn = (r() - .5) * 1.1; a += turn; x += Math.cos(a) * 2.2; y += Math.sin(a) * 2.2; pts.push([x, y]); }
            s += strokeP(pts, w);
        }
        return { ink: s, base: r() < .5 ? 'gold' : 'black', name: 'Maze' };
    };

    S.starwave = (r) => {
        let s = ''; const gap = 16 + r() * 4, tilt = .45 + r() * .3;
        for (let y0 = -70; y0 < VB_H + 70; y0 += gap) {
            const pts = []; for (let x = -XMAX - 5; x <= XMAX + 5; x += 2.5) pts.push([x, y0 + 2.6 * Math.sin(x * .35) + tilt * x]);
            s += strokeP(pts, 1.7);
            for (let x = -XMAX; x <= XMAX; x += 11 + r() * 4) s += star(x, y0 + gap / 2 + tilt * x, 2.4 + r() * 1.4);
        }
        return { ink: s, base: 'black', name: 'Stars & waves' };
    };

    S.dots = (r) => {
        let s = ''; const bow = 8 + r() * 10, fy = .15 + r() * .12;
        // rows of dots that bow like rings around the egg, sizes pulsing
        for (let y0 = -14; y0 < VB_H + 14; y0 += 6) {
            const step = 4.5 + 2.5 * Math.abs(Math.sin(y0 * .09));
            for (let x = -XMAX; x <= XMAX; x += step) {
                const y = y0 + bow * Math.cos(x / XMAX * Math.PI * .9) * (y0 < WY ? -1 : 1) * .5;
                if (y < 3 || y > VB_H - 3 || r() > .85) continue;
                s += dot(x, y, Math.max(.35, 1 + .8 * Math.sin(y0 * fy + x * .05)) * (.75 + r() * .4));
            }
        }
        return { ink: s, base: 'black', name: 'Dots' };
    };

    S.terrazzo = (r) => {
        let s = '';
        for (let i = 0; i < 150; i++) {
            const cx = (r() * 2 - 1) * XMAX, cy = r() * VB_H, sz = r() < .25 ? 4 + r() * 6 : 1 + r() * 2.5;
            const k = 4 + Math.floor(r() * 4), a0 = r() * 6; const pts = [];
            for (let j = 0; j < k; j++) { const a = a0 + j / k * Math.PI * 2, rr = sz * (.6 + r() * .6); pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
            s += fillP(pts);
        }
        return { ink: s, base: 'black', name: 'Terrazzo' };
    };

    S.brush = (r) => {
        let s = ''; const n = 6 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) {
            const y0 = 6 + i * (VB_H / n) + r() * 8, x0 = -XMAX - 10 + r() * 20, x1 = XMAX * (.1 + r() * 1.1);
            const bend = (r() - .5) * 60, tilt = (r() - .3) * 30, pts = [];
            for (let t = 0; t <= 1.001; t += .04) pts.push([x0 + (x1 - x0) * t, y0 + bend * Math.sin(t * Math.PI) + tilt * t + (r() - .5) * 1.2]);
            const W = 6 + r() * 8;
            s += ribbon(pts, t => W * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), .6) * (.8 + .2 * Math.sin(t * 20)));
            if (r() < .7) { const hp = pts.map(p => [p[0], p[1] + W * 1.3]); s += strokeP(hp, .35); }
        }
        for (let i = 0; i < 24; i++) s += dot((r() * 2 - 1) * XMAX, r() * VB_H, .3 + r() * .7);
        return { ink: s, base: 'gold', name: 'Brush marble' };
    };

    S.chevron = (r) => {
        let s = ''; const gap = 9 + r() * 3, amp = 5 + r() * 4, step = 7 + r() * 4;
        for (let y0 = -10; y0 < VB_H + 10; y0 += gap) {
            const pts = []; let up = r() < .5;
            for (let x = -XMAX - step; x <= XMAX + step; x += step) { pts.push([x, y0 + (up ? -amp / 2 : amp / 2)]); up = !up; }
            s += strokeP(pts, gap * .32);
        }
        return { ink: s, base: r() < .5 ? 'black' : 'gold', name: 'Zigzag' };
    };

    const STYLES = Object.keys(S);

    function eggOutline() {
        const L = [], Rr = [];
        for (let y = TOP; y <= BOT; y += 1) { const rr = R(y); L.push([CX - rr, y]); Rr.push([CX + rr, y]); }
        const pts = [[CX, TOP]].concat(Rr, [[CX, BOT]], L.reverse());
        return 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
    }
    const OUTLINE = eggOutline();

    function parts(seed, { style, id = 'egg' } = {}) {
        const r = rng(seed);
        const key = style || STYLES[1 + Math.floor(r() * (STYLES.length - 1))];   // random eggs skip 'hex' (first egg)
        const res = S[key](r);
        const gold = `url(#${id}-gold)`, black = '#0b0b0c';
        const baseFill = res.base === 'gold' ? gold : black;
        const inkFill = res.base === 'gold' ? black : gold;
        const defs = `<linearGradient id="${id}-gold" gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="110" y2="140"><stop offset="0" stop-color="#f7dc8a"/><stop offset=".25" stop-color="#c99a2e"/><stop offset=".5" stop-color="#fff0b8"/><stop offset=".72" stop-color="#b8861e"/><stop offset="1" stop-color="#6e4806"/></linearGradient>
<radialGradient id="${id}-shade" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></radialGradient>
<clipPath id="${id}-clip"><path d="${OUTLINE}"/></clipPath>`;
        return {
            style: key, name: res.name, defs, outline: OUTLINE,
            base: `<path d="${OUTLINE}" fill="${baseFill}"/>`,
            ink: res.ink, inkFill,
            shade: `<path d="${OUTLINE}" fill="url(#${id}-shade)"/><ellipse cx="42" cy="38" rx="9" ry="16" fill="#fff" opacity=".22" transform="rotate(22 42 38)" filter="url(#${id}-blur)"/>`,
            blur: `<filter id="${id}-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>`
        };
    }

    // A complete standalone egg (for galleries / thumbnails).
    function svg(seed, opts = {}) {
        const id = opts.id || ('e' + seed);
        const p = parts(seed, { ...opts, id });
        return `<svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg"><defs>${p.defs}${p.blur}</defs>
<ellipse cx="60" cy="148" rx="38" ry="4" fill="#000" opacity=".5"/>
<g clip-path="url(#${id}-clip)">${p.base}<g fill="${p.inkFill}" stroke="${p.inkFill}">${p.ink}</g>${p.shade}</g></svg>`;
    }

    // A hive bee's egg (Oct 2026): random from the collection, but always
    // the same egg for the same bee (seeded from its id).
    function forBee(bee) {
        const seed = seedFrom((bee && bee.id) || 'egg');
        return svg(seed, { id: 'be' + seed });
    }

    return { parts, svg, forBee, seedFrom, STYLES, VB_W, VB_H };
})();
if (typeof module !== 'undefined') module.exports = EggDesign;
