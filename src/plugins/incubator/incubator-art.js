// Egg Incubator art (Oct 28 2026, Craft: black, white, red and gold).
// IncubatorArt.svg({ tier, eggs, progress, mini }) -> <svg> string.
//   tier     'basic' | 'warm' | 'honey' | 'royal'   (null = not bought yet: dimmed)
//   eggs     [{ bee, days }] one per porthole (missing = empty porthole)
//   progress 0..1 toward the next day off (front panel bar + gauge)
//   mini     true for the small store pictures (no labels, no panel text)
// The eggs are the real eggs (EggDesign.forBee). Animations live in incubator.css.
const IncubatorArt = (() => {
    const SLOTS = { basic: 1, warm: 2, honey: 3, royal: 3 };
    const GLASS = {
        basic: ['#ffd27a', '#c77a1c', '#2a1404'],
        warm: ['#ffb35c', '#c3401e', '#2a0804'],
        honey: ['#ffe27a', '#d89a12', '#2a1a02'],
        royal: ['#ff7a8a', '#9a0a24', '#1e0208'],
    };
    const f = (v) => (+v).toFixed(1);
    const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i; return f(cx + r * Math.cos(a)) + ',' + f(cy + r * Math.sin(a)); }).join(' ');
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let n = 0;

    function eggSVG(bee, x, y, w, h) {
        const src = typeof EggDesign !== 'undefined' ? EggDesign.forBee(bee) : null;
        if (!src) return `<ellipse cx="${f(x + w / 2)}" cy="${f(y + h * .55)}" rx="${f(w * .38)}" ry="${f(h * .45)}" fill="#f0d9a8"/>`;
        return src.replace('<svg ', `<svg x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="xMidYMid meet" `);
    }

    function svg({ tier = null, eggs = [], progress = 0, mini = false } = {}) {
        const u = 'ia' + (++n);
        const t = tier || 'warm';
        const slots = SLOTS[t];
        const royal = t === 'royal';
        const g = GLASS[t];
        const r = slots === 1 ? 54 : slots === 2 ? 46 : 40;
        const gap = 2 * (r + 9) + (slots === 3 ? 4 : 12);
        const bodyW = slots === 1 ? 210 : slots === 2 ? 270 : 324;
        const W = 360, by = 52;
        const cy = by + 18 + (r + 10) * .866;
        const lab = cy + (r + 10) * .866 + 7;     // the "3 DAYS" pill
        const fy = lab + 25;                      // front panel
        const bh = fy + 26 + 24 - by;
        const H = by + bh + 34;
        const bx = (W - bodyW) / 2;
        const cx0 = W / 2 - (slots - 1) * gap / 2;
        const strip = royal ? '#ffcc00' : '#ff2a3c';
        const p = Math.max(0, Math.min(1, progress || 0));

        let s = `<svg class="ia${tier ? '' : ' ia-off'}${mini ? ' ia-mini' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tier ? t + ' incubator' : 'Incubator')}"><defs>
<linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2722"/><stop offset=".45" stop-color="#15110d"/><stop offset="1" stop-color="#060403"/></linearGradient>
<linearGradient id="${u}w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#ebe7df"/><stop offset="1" stop-color="#a9a399"/></linearGradient>
<linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".4" stop-color="#ffcc00"/><stop offset=".7" stop-color="#b8861e"/><stop offset="1" stop-color="#6e4806"/></linearGradient>
<radialGradient id="${u}l" cx="50%" cy="72%" r="72%"><stop offset="0" stop-color="${g[0]}"/><stop offset=".5" stop-color="${g[1]}"/><stop offset="1" stop-color="${g[2]}"/></radialGradient>
<linearGradient id="${u}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity=".55"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient>
<linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/></linearGradient>
<pattern id="${u}m" width="14" height="24.2" patternUnits="userSpaceOnUse"><path d="M7 0 14 4 14 12.1 7 16.1 0 12.1 0 4z M7 16.1 7 24.2" fill="none" stroke="#fff" stroke-width=".6"/></pattern>
<pattern id="${u}h" width="10" height="17.3" patternUnits="userSpaceOnUse"><path d="M5 0 10 2.9 10 8.7 5 11.6 0 8.7 0 2.9z" fill="none" stroke="${g[0]}" stroke-width=".7"/></pattern>
</defs>`;
        // floor shadow + underglow
        s += `<ellipse cx="${W / 2}" cy="${H - 8}" rx="${bodyW / 2 + 6}" ry="9" fill="#000" opacity=".55"/>`;
        s += `<ellipse class="ia-glow" cx="${W / 2}" cy="${H - 12}" rx="${bodyW / 2 - 20}" ry="6" fill="${strip}" opacity=".35"/>`;
        // legs
        [bx + 26, bx + bodyW - 26].forEach(lx => {
            s += `<path d="M${lx - 22} ${by + bh - 4} h44 l-6 ${H - 22 - (by + bh - 4)} h-32z" fill="#0b0806" stroke="url(#${u}g)" stroke-width="1.6"/>`;
            s += `<rect class="ia-glow" x="${lx - 13}" y="${H - 30}" width="26" height="3" rx="1.5" fill="${strip}"/>`;
        });
        // chassis
        s += `<rect x="${bx}" y="${by}" width="${bodyW}" height="${bh}" rx="28" fill="url(#${u}b)" stroke="url(#${u}g)" stroke-width="3"/>`;
        s += `<rect x="${bx}" y="${by}" width="${bodyW}" height="${bh}" rx="28" fill="url(#${u}m)" opacity=".05"/>`;
        s += `<rect x="${bx + 7}" y="${by + 7}" width="${bodyW - 14}" height="${bh - 14}" rx="22" fill="none" stroke="#fff" stroke-opacity=".07"/>`;
        // gold corner brackets + rivets
        [[bx + 14, by + 14, 1, 1], [bx + bodyW - 14, by + 14, -1, 1], [bx + 14, by + bh - 14, 1, -1], [bx + bodyW - 14, by + bh - 14, -1, -1]].forEach(([x, y, dx, dy]) => {
            s += `<path d="M${x} ${y + dy * 16} V${y} H${x + dx * 16}" fill="none" stroke="url(#${u}g)" stroke-width="2.4" stroke-linecap="round"/><circle cx="${x + dx * 5}" cy="${y + dy * 5}" r="1.8" fill="#ffcc00"/>`;
        });
        // white side pods with red light strips
        [[bx - 12, 1], [bx + bodyW - 16, -1]].forEach(([px]) => {
            s += `<rect x="${px}" y="${by + 26}" width="28" height="${bh - 52}" rx="14" fill="url(#${u}w)" stroke="#6b665d" stroke-width="1"/>`;
            s += `<rect class="ia-strip" x="${px + 11}" y="${by + 42}" width="6" height="${bh - 84}" rx="3" fill="${strip}"/>`;
            for (let i = 0; i < 3; i++) s += `<rect x="${px + 8}" y="${by + bh - 46 + i * 5}" width="12" height="2" rx="1" fill="#8d877c"/>`;
        });
        // top deck
        const dw = bodyW * .62, dx = W / 2 - dw / 2;
        s += `<rect x="${dx}" y="${by - 24}" width="${dw}" height="30" rx="12" fill="#0b0806" stroke="url(#${u}g)" stroke-width="2"/>`;
        for (let i = 0; i < 6; i++) s += `<rect x="${W / 2 - 39 + i * 13}" y="${by - 15}" width="9" height="12" rx="2" fill="#241d16" stroke="#000" stroke-width=".6"/>`;
        s += `<circle class="ia-led" cx="${dx + dw - 16}" cy="${by - 9}" r="4" fill="#ff2a3c"/><circle cx="${dx + 16}" cy="${by - 9}" r="4" fill="#3ddc84" opacity="${tier ? .9 : .25}"/>`;
        if (royal) s += `<path d="M${W / 2 - 30} ${by - 24} l9-20 l11 12 l10-18 l10 18 l11-12 l9 20z" fill="url(#${u}g)" stroke="#6e4806" stroke-width="1"/><circle cx="${W / 2}" cy="${by - 46}" r="3.6" fill="#ff2a3c"/><circle cx="${W / 2 - 21}" cy="${by - 40}" r="2.4" fill="#ff2a3c"/><circle cx="${W / 2 + 21}" cy="${by - 40}" r="2.4" fill="#ff2a3c"/>`;

        // portholes
        for (let i = 0; i < slots; i++) {
            const cx = cx0 + i * gap, e = eggs[i];
            s += `<polygon points="${hex(cx, cy, r + 10)}" fill="url(#${u}g)"/>`;
            s += `<polygon points="${hex(cx, cy, r + 6)}" fill="#0b0806"/>`;
            for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; s += `<circle cx="${f(cx + (r + 8) * Math.cos(a))}" cy="${f(cy + (r + 8) * Math.sin(a))}" r="1.9" fill="#3a2a08" stroke="#fff2b0" stroke-width=".5"/>`; }
            s += `<g clip-path="url(#${u}k${i})"><clipPath id="${u}k${i}"><polygon points="${hex(cx, cy, r)}"/></clipPath>`;
            s += `<polygon class="ia-glass" points="${hex(cx, cy, r)}" fill="url(#${u}l)"/>`;
            s += `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="url(#${u}h)" opacity=".18"/>`;
            s += `<path d="M${cx - r * .18} ${cy - r} L${cx - r * .62} ${cy + r} L${cx + r * .62} ${cy + r} L${cx + r * .18} ${cy - r}z" fill="url(#${u}c)" opacity=".55"/>`;
            s += `<rect x="${cx - r * .22}" y="${cy - r + 1}" width="${r * .44}" height="5" rx="2.5" fill="#fff2b0" opacity=".9"/>`;
            // pedestal
            const py = cy + r * .62;
            s += `<ellipse class="ia-glow" cx="${cx}" cy="${py}" rx="${r * .52}" ry="${r * .13}" fill="${g[0]}" opacity=".55"/>`;
            s += `<ellipse cx="${cx}" cy="${py}" rx="${r * .44}" ry="${r * .1}" fill="none" stroke="url(#${u}g)" stroke-width="2"/>`;
            if (e && e.bee) {
                const eh = r * 1.08, ew = eh * .8;
                s += `<g class="ia-egg${e.days === 0 ? ' ia-ready' : ''}" style="animation-delay:${-i * .9}s">${eggSVG(e.bee, cx - ew / 2, py - eh + 3, ew, eh)}</g>`;
                for (const k of [1, 2, 3]) s += `<circle class="ia-steam s${k}" cx="${f(cx - 12 + k * 6)}" cy="${f(cy - r * .2)}" r="${2 + k * .7}" fill="#fff"/>`;
            } else {
                s += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${r * .45}" font-weight="300" fill="${g[0]}" opacity=".7">+</text>`;
            }
            s += `<polygon points="${hex(cx, cy, r)}" fill="url(#${u}s)"/>`;
            s += `<path d="M${cx + r * .3} ${cy - r * .7} q${r * .35} ${r * .25} ${r * .42} ${r * .7}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2.5" stroke-linecap="round"/>`;
            s += '</g>';
            if (!mini) {
                const label = !tier ? 'LOCKED' : !e ? 'EMPTY' : e.days === 0 ? 'READY' : `${e.days} DAY${e.days > 1 ? 'S' : ''}`;
                const col = !e || !tier ? '#7d6d4d' : e.days === 0 ? '#3ddc84' : '#ffcc00';
                s += `<rect x="${cx - 32}" y="${lab}" width="64" height="18" rx="9" fill="#0b0806" stroke="#3a2a0a"/><text x="${cx}" y="${lab + 13}" text-anchor="middle" font-family="ui-monospace,monospace" font-weight="800" font-size="10" fill="${col}">${label}</text>`;
            }
        }

        // front panel: gauge, step bar, temperature, nameplate
        if (!mini) {
            const pw = Math.min(bodyW - 60, 250), px = W / 2 - pw / 2;
            s += `<rect x="${px}" y="${fy}" width="${pw}" height="26" rx="8" fill="#050403" stroke="url(#${u}g)" stroke-width="1.2"/>`;
            // gauge
            const gx = px + 15, gy = fy + 13, ang = Math.PI * (1 + p);
            s += `<circle cx="${gx}" cy="${gy}" r="9" fill="#120d06" stroke="#3a2a0a"/><path d="M${gx - 7} ${gy} A7 7 0 0 1 ${gx + 7} ${gy}" fill="none" stroke="#3a2a0a" stroke-width="2"/>`;
            s += `<line x1="${gx}" y1="${gy}" x2="${f(gx + 7 * Math.cos(ang))}" y2="${f(gy + 7 * Math.sin(ang))}" stroke="#ff2a3c" stroke-width="1.6" stroke-linecap="round"/><circle cx="${gx}" cy="${gy}" r="1.6" fill="#ffcc00"/>`;
            // segmented bar
            const segs = 10, sx = px + 32, sw = pw - 92, seg = sw / segs;
            for (let k = 0; k < segs; k++) s += `<rect x="${f(sx + k * seg + 1)}" y="${fy + 8}" width="${f(seg - 2)}" height="10" rx="1.5" fill="${k < Math.round(p * segs) ? (k >= segs - 2 ? '#ff2a3c' : '#ffcc00') : '#1f180e'}"/>`;
            s += `<text x="${px + pw - 30}" y="${fy + 17}" text-anchor="middle" font-family="ui-monospace,monospace" font-weight="800" font-size="10" fill="#3ddc84">37.5°</text>`;
        }
        s += `<rect x="${W / 2 - 46}" y="${by + bh - 13}" width="92" height="11" rx="3" fill="url(#${u}g)"/><text x="${W / 2}" y="${by + bh - 4.5}" text-anchor="middle" font-family="ui-monospace,monospace" font-weight="900" font-size="7.5" letter-spacing="1.5" fill="#1a1000">BIZZYBEE</text>`;
        s += '</svg>';
        return s;
    }
    return { svg, SLOTS };
})();
