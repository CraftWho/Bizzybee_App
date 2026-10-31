console.log("/// HIVE INTERIOR ONLINE ///");

// ColonyInterior - the inside of the colony hive (approved on the
// hive-interior concept page, Oct 2026). One full-screen SVG honeycomb:
//
//   lit cells      glowing honey. How many = the colony's honey (hive-mind.js:
//                  cards earned + level XP). Light spreads from the centre.
//   brood cells    one per bee - a wax-capped cell with an element-coloured
//                  ring. Tap one to open that bee's card. A bee with no job
//                  (idleBees) sits still inside its OPEN cell - no animation.
//   royal cell     the centre cell, crimson-capped. Tap = Queen summary.
//   decayed cells  missed dailies, overdue to-dos and bad habits hollow out
//                  random lit cells (cracked, crimson embers). They heal
//                  when the lapse is older than the decay window.
//   dark cells     everything else - barely visible under fog.
//
// Worker bees (MechBee art) crawl in the light, each with its name, and face
// the way they walk. The Queen (3 image layers, wings flap) wanders and
// faces where she flies. New bees hatch out of their brood cell.
//
// Usage:
//   const hive = ColonyInterior.mount(stageEl, {
//       honey: { lit, capacity, decay, lapseIds },
//       broodBees,            // bees that get a brood cell (all, newest last)
//       crawlers,             // bees crawling inside (busy bees)
//       idleBees,             // bees resting in their open cell
//       lightY: 0.55,         // light centre, fraction of stage height
//       assetBase: '../../assets/bees/queen/',
//       royal: { kind: 'queen'|'king', name },   // optional: the player's royal
//       onBeeClick(bee), onQueenClick()
//   });
//   hive.hatch(bee, { joinCrawl: true })  -> Promise
//   hive.destroy()

const ColonyInterior = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    const R = 15;                       // cell radius, SVG units
    const CW = Math.sqrt(3) * R;
    const CH = 1.5 * R;
    const ELEMENT = { fire: '#ff5a1f', water: '#2f9bff', earth: '#4fb83a', wind: '#5fe0cc' };
    const RARITY = { Common: '#c9c9c9', Rare: '#4aa3ff', Epic: '#b06bff', Legendary: '#ffd700', Named: '#d42a1e' };
    const LABEL = { Common: '#d4d4d4', Rare: '#7fc0ff', Epic: '#c99bff', Legendary: '#ffd700', Named: '#ff6a5a' };
    const CRIMSON = '#d42a1e';

    const f = v => (+v).toFixed(1);
    const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 3 * i - Math.PI / 2;
        return f(cx + r * Math.cos(a)) + ',' + f(cy + r * Math.sin(a));
    }).join(' ');

    // Small stable hash + seeded random, so the comb looks the same on
    // every visit (a cell doesn't jump around between renders).
    function hash(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function seeded(seed) {
        let s = (seed % 2147483646) + 1;
        return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    }

    function defs() {
        return `<defs>
  <linearGradient id="ci-wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe2a0"/><stop offset=".5" stop-color="#e6ad55"/><stop offset="1" stop-color="#b8742a"/></linearGradient>
  <linearGradient id="ci-cavity" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#3a1803"/><stop offset=".45" stop-color="#7a3a06"/><stop offset="1" stop-color="#d27a16"/></linearGradient>
  <radialGradient id="ci-honey" cx="60%" cy="65%" r="70%"><stop offset="0" stop-color="#ffc44a" stop-opacity=".95"/><stop offset=".5" stop-color="#e2850f" stop-opacity=".9"/><stop offset="1" stop-color="#8a3c04" stop-opacity=".85"/></radialGradient>
  <radialGradient id="ci-cap" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#fff2c4"/><stop offset=".6" stop-color="#f0cf7e"/><stop offset="1" stop-color="#c9953f"/></radialGradient>
  <radialGradient id="ci-royal" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#ff8a70"/><stop offset=".55" stop-color="${CRIMSON}"/><stop offset="1" stop-color="#5c0905"/></radialGradient>
  <linearGradient id="ci-dead" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a4630"/><stop offset=".6" stop-color="#2e2214"/><stop offset="1" stop-color="#1a120a"/></linearGradient>
  <filter id="ci-fog" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="ci-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
</defs>`;
    }

    // ---------- one cell, by kind ----------
    function darkCell(c) {
        return `<polygon points="${hexPts(c.x, c.y, R - .3)}" fill="#120b05"/><polygon points="${hexPts(c.x, c.y, R - 2.4)}" fill="#040201"/>`;
    }
    function honeyBody(c, rnd) {
        const level = .55 + rnd() * .4;
        return `<polygon points="${hexPts(c.x, c.y, R - .3)}" fill="url(#ci-wall)"/>
<polygon points="${hexPts(c.x, c.y, R - 2.4)}" fill="url(#ci-cavity)"/>
<polygon points="${hexPts(c.x + .6, c.y + .8, (R - 3.2) * level)}" fill="url(#ci-honey)"/>
<path d="M${f(c.x - 6)} ${f(c.y - 3)} q3 -4 8 -4" stroke="#fff8e0" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".8"/>
<circle cx="${f(c.x + 4)}" cy="${f(c.y + 5)}" r=".9" fill="#fff6d0" opacity=".7"/>`;
    }
    function litCell(c, rnd, full) {
        let s = honeyBody(c, rnd);
        if (full && rnd() < .45) s += `<polygon points="${hexPts(c.x, c.y, R - 2.4)}" fill="url(#ci-cap)" opacity=".95"/>`;
        if (rnd() < .12) {
            s += `<polygon class="ci-glow" points="${hexPts(c.x, c.y, R - 3)}" fill="#ffcf5a" opacity=".18" style="--d:${f(3 + rnd() * 3)}s;--dl:${f(-rnd() * 5)}s"/>`;
        }
        return s;
    }
    // Open cell with the bee resting inside, head out. Static.
    function idleCell(c, bee) {
        const col = ELEMENT[bee.element] || '#e0b02a';
        const art = typeof MechBee !== 'undefined' ? MechBee.markup({ scale: .5, stripe: col }) : '';
        return `<polygon points="${hexPts(c.x, c.y, R - .3)}" fill="url(#ci-wall)"/>
<polygon points="${hexPts(c.x, c.y, R - 2.4)}" fill="url(#ci-cavity)"/>
<polygon points="${hexPts(c.x, c.y, R - 4.2)}" fill="none" stroke="${col}" stroke-width="1.2" opacity=".55"/>
<g class="ci-idle-bee" transform="translate(${f(c.x)} ${f(c.y + 1)}) rotate(${hash(bee.id || bee.name) % 2 ? -18 : 18})">${art}</g>`;
    }
    function broodCell(c, bee) {
        const col = ELEMENT[bee.element] || '#e0b02a';
        return `<polygon points="${hexPts(c.x, c.y, R - .3)}" fill="url(#ci-wall)"/>
<polygon class="ci-cap" points="${hexPts(c.x, c.y, R - 2.4)}" fill="url(#ci-cap)"/>
<polygon class="ci-brood-ring" points="${hexPts(c.x, c.y, R - 4.2)}" fill="none" stroke="${col}" stroke-width="1.6" style="--d:${f(2.6 + (hash(bee.id || bee.name) % 20) / 10)}s"/>
<circle cx="${f(c.x)}" cy="${f(c.y)}" r="1.6" fill="${RARITY[bee.rarity] || '#fff'}" opacity=".9"/>`;
    }
    function royalCell(c) {
        return `<polygon points="${hexPts(c.x, c.y, R - .3)}" fill="url(#ci-wall)"/>
<polygon points="${hexPts(c.x, c.y, R - 2.4)}" fill="url(#ci-royal)"/>
<polygon points="${hexPts(c.x, c.y, R - 4.4)}" fill="none" stroke="#ffd700" stroke-width="1" opacity=".85"/>
<polygon class="ci-royal-glow" points="${hexPts(c.x, c.y, R - 1)}" fill="none" stroke="${CRIMSON}" stroke-width="2.2" filter="url(#ci-soft)"/>`;
    }
    function decayedCell(c, rnd) {
        // Hollow: grey-brown dead wax, black cavity, cracks, a broken
        // corner, and faint crimson embers along the rim.
        const a = Math.floor(rnd() * 6);
        const p = i => { const t = Math.PI / 3 * ((a + i) % 6) - Math.PI / 2; return [c.x + (R - .3) * Math.cos(t), c.y + (R - .3) * Math.sin(t)]; };
        const [x1, y1] = p(0), [x2, y2] = p(1);
        const crack = (sx, sy) => {
            let d = `M${f(sx)} ${f(sy)}`, x = sx, y = sy;
            for (let i = 0; i < 3; i++) { x += (c.x - x) * .35 + (rnd() - .5) * 4; y += (c.y - y) * .35 + (rnd() - .5) * 4; d += ` L${f(x)} ${f(y)}`; }
            return `<path d="${d}" stroke="#000" stroke-width=".9" fill="none" opacity=".85"/>`;
        };
        return `<polygon points="${hexPts(c.x, c.y, R - .3)}" fill="url(#ci-dead)"/>
<polygon points="${hexPts(c.x + .3, c.y + .4, R - 2.6)}" fill="#030201"/>
<path d="M${f(c.x - 5)} ${f(c.y + 6)} q2 3 1 6" stroke="#5a3006" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".7"/>
${crack(x1, y1)}${crack(...p(3))}
<polygon points="${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f((x1 + x2) / 2 + (c.x - (x1 + x2) / 2) * .3)},${f((y1 + y2) / 2 + (c.y - (y1 + y2) / 2) * .3)}" fill="#020100"/>
<polygon class="ci-ember" points="${hexPts(c.x, c.y, R - 1.2)}" fill="none" stroke="#ff3a24" stroke-width="1.7" stroke-dasharray="${f(3 + rnd() * 5)} ${f(4 + rnd() * 6)}" style="--d:${f(2.4 + rnd() * 2.4)}s;--dl:${f(-rnd() * 4)}s"/>`;
    }

    function esc(t) {
        return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function mount(stage, opts) {
        const o = Object.assign({ lightY: .55, crawlers: [], idleBees: [], broodBees: [], honey: { lit: 0, capacity: 1, decay: 0, lapseIds: [] } }, opts);
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let raf = 0, destroyed = false, last = performance.now();
        let W, H, LX, LY, svg, cells, lightR, queenEl, beesG, fxG;
        const crawl = [];        // { bee, actor, x, y, ang, sp, turn, pause }
        const brood = new Map(); // bee id -> cell
        const q = { x: 0, y: 0, vx: 0, vy: 0, sp: 26, tx: 0, ty: 0, wait: 0 };

        function build() {
            const box = stage.getBoundingClientRect();
            const px = box.width < 600 ? 19 : 24;          // on-screen cell radius
            const k = px / R;
            W = Math.max(200, box.width / k);
            H = Math.max(260, box.height / k);
            LX = W / 2;
            LY = H * o.lightY;

            // ---- grid, ranked by distance from the light (plus a little noise) ----
            const rnd = seeded(11);
            cells = [];
            for (let row = -1; row * CH < H + R; row++) {
                for (let col = -1; col * CW < W + CW; col++) {
                    const x = col * CW + (row % 2 ? CW / 2 : 0), y = row * CH;
                    cells.push({ x, y, i: cells.length, d: Math.hypot(x - LX, (y - LY) * 1.15) + rnd() * 26 });
                }
            }
            const order = [...cells].sort((a, b) => a.d - b.d);
            order.forEach((c, i) => { c.rank = i; c.kind = 'dark'; });

            // Honey is measured against a fixed hive capacity, so the same
            // progress lights the same share of the comb on any screen.
            const per = cells.length / Math.max(1, o.honey.capacity);
            const litN = Math.min(cells.length, Math.max(1, Math.round(o.honey.lit * per)));
            const lit = order.slice(0, litN);
            lit.forEach(c => { c.kind = 'lit'; });
            const full = o.honey.lit >= o.honey.capacity;

            // Royal cell = the one nearest the light centre.
            lit[0].kind = 'royal';

            // Brood cells: one per bee, newest bees closest to the centre.
            brood.clear();
            const free = () => lit.filter(c => c.kind === 'lit');
            const bees = o.broodBees.slice(-Math.max(0, litN - 1)).reverse();
            bees.forEach((bee) => {
                const pool = free();
                if (!pool.length) return;
                const span = Math.min(pool.length, 8 + Math.round(pool.length * .5));
                const c = pool[hash(String(bee.id || bee.name)) % span];
                c.kind = 'brood'; c.bee = bee; brood.set(bee.id || bee.name, c);
            });

            // Decay: each lapse hollows one lit cell (stable per lapse).
            [...o.honey.lapseIds].sort().slice(0, o.honey.decay).forEach(id => {
                const pool = free();
                if (!pool.length) return;
                pool[hash(id) % pool.length].kind = 'decayed';
            });

            lightR = R * Math.sqrt(litN * 2.6 / Math.PI) * 1.15 + 34;

            // ---- markup ----
            const idleIds = new Set(o.idleBees.map(b => b.id || b.name));
            let s = `<svg class="ci-svg" viewBox="0 0 ${f(W)} ${f(H)}" preserveAspectRatio="xMidYMid slice" xmlns="${NS}">${defs()}
<radialGradient id="ci-warm" gradientUnits="userSpaceOnUse" cx="${f(LX)}" cy="${f(LY)}" r="${f(lightR * 1.4)}"><stop offset="0" stop-color="#ffcf6a" stop-opacity=".42"/><stop offset=".7" stop-color="#ff9a3a" stop-opacity=".12"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient>
<rect x="-10" y="-10" width="${f(W + 20)}" height="${f(H + 20)}" fill="#0d0804"/>`;
            cells.forEach(c => {
                const r2 = seeded(c.i * 7 + 3);
                let body = darkCell(c);
                if (c.kind === 'lit') body += `<g class="ci-lit">${litCell(c, r2, full)}</g>`;
                else if (c.kind === 'brood' && idleIds.has(c.bee.id || c.bee.name)) body += `<g class="ci-lit">${idleCell(c, c.bee)}</g>`;
                else if (c.kind === 'brood') body += `<g class="ci-lit">${broodCell(c, c.bee)}</g>`;
                else if (c.kind === 'royal') body += `<g class="ci-lit">${royalCell(c)}</g>`;
                else if (c.kind === 'decayed') body += `<g class="ci-lit">${decayedCell(c, r2)}</g>`;
                const delay = c.kind === 'dark' ? 0 : (c.rank / Math.max(1, litN)) * 1.3;
                s += `<g class="ci-cell ci-${c.kind}" data-cell="${c.i}" style="--rk:${f(delay)}s">${body}</g>`;
            });
            // Warm light (very lightly tinted), then the darkness with a hole
            // where the light is. Fog drifts in the dark.
            s += `<rect class="ci-warm" x="0" y="0" width="${f(W)}" height="${f(H)}" fill="url(#ci-warm)"/>
<mask id="ci-mask"><rect x="-10" y="-10" width="${f(W + 20)}" height="${f(H + 20)}" fill="#fff"/><circle cx="${f(LX)}" cy="${f(LY)}" r="${f(lightR)}" fill="#000" filter="url(#ci-fog)"/></mask>
<g mask="url(#ci-mask)" pointer-events="none"><rect x="-10" y="-10" width="${f(W + 20)}" height="${f(H + 20)}" fill="#020100" opacity=".94"/>`;
            const fr = seeded(5);
            // Fog is static: blurred shapes that move get re-blurred every frame.
            for (let i = 0; i < 5; i++) {
                s += `<ellipse class="ci-fog" cx="${f(fr() * W)}" cy="${f(fr() * H)}" rx="${f(70 + fr() * 90)}" ry="${f(40 + fr() * 50)}" fill="#3e4048" opacity="${f(.04 + fr() * .06)}" filter="url(#ci-fog)" style="--d:${f(9 + fr() * 8)}s;--dl:${f(-fr() * 9)}s;--fx:${f(fr() * 60 - 30)}px;--fy:${f(fr() * 30 - 15)}px"/>`;
            }
            s += `</g><g class="ci-dust" pointer-events="none">`;
            // Dust motes in the light: mostly gold, a few hive-blue and crimson sparks.
            const dr = seeded(23);
            const motes = Math.round(6 + Math.min(1, litN / 120) * 8);
            for (let i = 0; i < motes; i++) {
                const t = dr(), col = t < .14 ? '#5fd6ff' : t < .26 ? '#ff5a4a' : '#fff1c0';
                const a = dr() * Math.PI * 2, rr = Math.sqrt(dr()) * lightR * .9;
                s += `<circle class="ci-mote" cx="${f(LX + Math.cos(a) * rr)}" cy="${f(LY + Math.sin(a) * rr)}" r="${f(.6 + dr())}" fill="${col}" style="--d:${f(5 + dr() * 6)}s;--dl:${f(-dr() * 8)}s"/>`;
            }
            s += `</g><g class="ci-fx" pointer-events="none"></g><g class="ci-bees"></g></svg>`;

            const qw = 52 / W * 100;  // queen width, as % of the stage
            const qb = o.assetBase || '../../assets/bees/queen/';
            // The player's own royal (from the egg), or the generic Queen.
            const roy = o.royal || null;
            const isKing = !!(roy && roy.kind === 'king');
            const rTitle = isKing ? 'King' : 'Queen';
            const rName = roy && roy.name ? esc(roy.name) : rTitle + ' Bee';
            const kb = qb + '../king/';
            const layers = isKing
                ? `<img class="ci-q-body" src="${kb}king-body.webp" alt="King bee" draggable="false">
    <img class="ci-q-layer ci-q-wing ci-q-wing-front" src="${kb}king-wings.webp" alt="" draggable="false">`
                : `<img class="ci-q-layer ci-q-wing ci-q-wing-back" src="${qb}queen-wing-back.webp" alt="" draggable="false">
    <img class="ci-q-body" src="${qb}queen-body.webp" alt="Queen bee" draggable="false">
    <img class="ci-q-layer ci-q-wing ci-q-wing-front" src="${qb}queen-wing-front.webp" alt="" draggable="false">`;
            s += `<div class="ci-queen${isKing ? ' is-king' : ''}" role="button" tabindex="0" aria-label="${rName}" style="width:${f(qw)}%">
  <span class="ci-queen-name">👑 ${rName}</span>
  <div class="ci-queen-flip"><div class="ci-queen-bob">
    ${layers}
  </div></div></div>`;

            stage.innerHTML = s;
            svg = stage.querySelector('svg');
            beesG = svg.querySelector('.ci-bees');
            fxG = svg.querySelector('.ci-fx');
            queenEl = stage.querySelector('.ci-queen');

            // Light spreads from the centre on arrival.
            stage.classList.add('ci-arriving');
            requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('ci-arriving')));

            // Taps: brood cell -> that bee's card; royal cell / queen -> summary.
            svg.querySelectorAll('.ci-brood, .ci-royal').forEach(g => {
                g.style.cursor = 'pointer';
                g.addEventListener('click', () => {
                    const c = cells[+g.dataset.cell];
                    if (c.kind === 'royal') o.onQueenClick && o.onQueenClick();
                    else if (c.bee) o.onBeeClick && o.onBeeClick(c.bee);
                });
            });
            const qClick = () => o.onQueenClick && o.onQueenClick();
            queenEl.addEventListener('click', qClick);
            queenEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); qClick(); } });

            // Crawlers start spread through the light.
            crawl.length = 0;
            const cr = seeded(31);
            o.crawlers.forEach(bee => addCrawler(bee, null, cr));
            q.x = LX; q.y = LY - 10; q.tx = 0;
            placeQueen();
            if (reduce) frame(performance.now());
        }

        function crawlRadius() { return Math.max(22, lightR * .72); }

        function addCrawler(bee, at, r = Math.random) {
            const actor = MechBee.create(beesG, {
                bee: { scale: .75, stripe: ELEMENT[bee.element] || '#e0b02a' },
                label: bee.name,
                labelColor: LABEL[bee.rarity] || '#fff',
                onClick: () => o.onBeeClick && o.onBeeClick(bee)
            });
            const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * crawlRadius();
            const b = {
                bee, actor,
                x: at ? at.x : LX + Math.cos(a) * rr,
                y: at ? at.y : LY + Math.sin(a) * rr,
                ang: r() * Math.PI * 2, sp: 6 + r() * 10, turn: 0, pause: 0
            };
            crawl.push(b);
            MechBee.place(actor, b.x, b.y, { faceRight: Math.cos(b.ang) > 0 });
            return b;
        }

        function placeQueen() {
            queenEl.style.left = (q.x / W * 100) + '%';
            queenEl.style.top = (q.y / H * 100) + '%';
        }

        function frame(now) {
            if (destroyed) return;
            const dt = Math.min(.05, (now - last) / 1000); last = now;
            const lim = crawlRadius();
            crawl.forEach(b => {
                if (b.frozen) return;
                b.turn -= dt;
                if (b.turn < 0) { b.ang += (Math.random() - .5) * 2.2; b.turn = .6 + Math.random() * 1.8; b.pause = Math.random() < .25 ? .4 + Math.random() : 0; }
                if (b.pause > 0) b.pause -= dt;
                else { b.x += Math.cos(b.ang) * b.sp * dt; b.y += Math.sin(b.ang) * b.sp * dt; }
                const dx = b.x - LX, dy = b.y - LY;
                if (Math.hypot(dx, dy) > lim) b.ang = Math.atan2(-dy, -dx) + (Math.random() - .5) * .6;
                const right = Math.cos(b.ang) > 0;
                MechBee.place(b.actor, b.x, b.y, { faceRight: right, tilt: Math.sin(b.ang) * 35 * (right ? 1 : -1) });
            });
            // Queen: wanders around the light; the art faces right.
            if (!q.tx || Math.hypot(q.tx - q.x, q.ty - q.y) < 6) {
                const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * Math.max(18, lightR * .5);
                q.tx = LX + Math.cos(a) * rr; q.ty = LY - 8 + Math.sin(a) * rr * .8; q.wait = .6 + Math.random() * 1.4;
            }
            if (q.wait > 0) q.wait -= dt;
            else {
                const dx = q.tx - q.x, dy = q.ty - q.y, d = Math.hypot(dx, dy) || 1;
                q.vx += (dx / d * q.sp - q.vx) * Math.min(1, dt * 2);
                q.vy += (dy / d * q.sp - q.vy) * Math.min(1, dt * 2);
            }
            q.vx *= .985; q.vy *= .985; q.x += q.vx * dt; q.y += q.vy * dt;
            if (Math.abs(q.vx) > 2) queenEl.classList.toggle('face-left', q.vx < 0);
            placeQueen();
            if (!reduce) raf = requestAnimationFrame(frame);
        }

        // ---- hatching: the bee breaks out of its brood cell ----
        const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
        async function hatch(bee, { joinCrawl = true } = {}) {
            if (destroyed) return;
            const c = brood.get(bee.id || bee.name);
            if (!c) return;
            const g = svg.querySelector(`[data-cell="${c.i}"]`);
            const col = RARITY[bee.rarity] || '#ffd700';
            g.style.setProperty('--hc', col);
            g.classList.add('ci-hatching');                 // shake + rarity glow
            const ring = document.createElementNS(NS, 'polygon');
            ring.setAttribute('points', hexPts(c.x, c.y, R + 1));
            ring.setAttribute('class', 'ci-hatch-ring');
            ring.setAttribute('stroke', col);
            fxG.appendChild(ring);
            await wait(1100);
            if (destroyed) return;
            g.classList.add('ci-hatched');                  // wax lid pops off
            for (let i = 0; i < 12; i++) {
                const a = Math.PI * 2 * i / 12 + Math.random() * .3, d = 14 + Math.random() * 16;
                const p = document.createElementNS(NS, 'circle');
                p.setAttribute('cx', f(c.x)); p.setAttribute('cy', f(c.y));
                p.setAttribute('r', f(1 + Math.random() * 1.4));
                p.setAttribute('fill', i % 3 ? '#ffe6a0' : col);
                p.setAttribute('class', 'ci-burst');
                p.style.setProperty('--dx', f(Math.cos(a) * d) + 'px');
                p.style.setProperty('--dy', f(Math.sin(a) * d) + 'px');
                fxG.appendChild(p);
            }
            // The bee grows out of the cell, then flies off.
            const b = addCrawler(bee, { x: c.x, y: c.y });
            b.frozen = true;
            const t0 = performance.now();
            await new Promise(res => {
                const step = now => {
                    if (destroyed) return res();
                    const t = Math.min(1, (now - t0) / (reduce ? 1 : 700));
                    MechBee.place(b.actor, c.x, c.y - t * 6, { scale: .2 + t * .8, tilt: Math.sin(t * 12) * 12 * (1 - t), opacity: t });
                    t < 1 ? requestAnimationFrame(step) : res();
                };
                requestAnimationFrame(step);
            });
            setTimeout(() => { ring.remove(); fxG.querySelectorAll('.ci-burst').forEach(p => p.remove()); }, 900);
            if (joinCrawl) { b.ang = -Math.PI / 2 + (Math.random() - .5); b.frozen = false; return; }
            // No job yet: settles back into its now-open cell and waits.
            await wait(500);
            if (destroyed) return;
            b.actor.wrap.remove();
            crawl.splice(crawl.indexOf(b), 1);
            g.querySelector('.ci-lit').innerHTML = idleCell(c, bee);
            g.classList.remove('ci-hatching', 'ci-hatched');
        }

        let resizeT = 0;
        const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!destroyed) build(); }, 200); };
        window.addEventListener('resize', onResize);

        build();
        if (!reduce) raf = requestAnimationFrame(frame);

        return {
            hatch,
            hasBrood: bee => brood.has(bee.id || bee.name),
            destroy() {
                destroyed = true;
                cancelAnimationFrame(raf);
                window.removeEventListener('resize', onResize);
                stage.innerHTML = '';
            }
        };
    }

    return { mount, ELEMENT, RARITY };
})();
