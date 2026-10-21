// Pollination Chamber effects (Oct 2026, approved demo + "more effects,
// a space tornado, a couple of seconds longer"). Full-screen scenes:
//   GachaFX.pull(bee)                         -> Promise (pull reveal)
//   GachaFX.destroy(bee, lootIds)             -> Promise
//   GachaFX.combine(beeA, beeB, newBee, up)   -> Promise
// Each scene: a starfield warp, a SPACE TORNADO (a funnel of stars and
// nebula dust spinning up), honeycomb hexes, pollen, lightning for Epic and
// up, shockwaves, light rays and a pillar in the rarity colour, then the real
// bee card (bee-card.js) flips in. Tap anywhere to skip to the end; it ends
// by itself a moment after the reveal. Reduced motion = a short fade.
const GachaFX = (() => {
    const RC = { Common: '#d8d8d8', Rare: '#5aa9ff', Epic: '#b77bff', Legendary: '#ffd23f', Named: '#ff6a5a', Royal: '#ffcc00' };
    const LVL = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Named: 3, Royal: 3 };
    const NEBULA = ['#7b5cff', '#4fc3ff', '#ff7ad9', '#ffcc00', '#ffffff', '#9fe8ff'];
    const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- the stage ----------------------------------------------------------
    let root, cv, cx, W = 0, H = 0, raf = null, last = 0;
    let parts = [], waves = [], bolts = [], tornado = null, rays = null, pillar = null, warp = 0, shakeT = 0, flashA = 0;
    let timers = [], skipFn = null, doneFn = null, finished = false;

    function build() {
        root = document.createElement('div');
        root.className = 'gfx';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Pollination');
        root.innerHTML = `<canvas class="gfx-cv"></canvas><div class="gfx-hexes"></div><div class="gfx-center"></div>
            <div class="gfx-msg" aria-live="polite"></div><button type="button" class="gfx-go">Continue</button><p class="gfx-skip">Tap to skip</p>`;
        document.body.appendChild(root);
        cv = root.querySelector('.gfx-cv');
        cx = cv.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
        root.addEventListener('click', (e) => {
            if (e.target.closest('.gfx-go')) { end(); return; }
            if (!finished && skipFn) { clearTimers(); const f = skipFn; skipFn = null; f(); }
        });
    }
    function resize() {
        if (!cv) return;
        const d = Math.min(2, window.devicePixelRatio || 1);
        W = window.innerWidth; H = window.innerHeight;
        cv.width = W * d; cv.height = H * d;
        cx.setTransform(d, 0, 0, d, 0, 0);
    }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    function open(color) {
        if (!root) build();
        clearTimers();
        parts = []; waves = []; bolts = []; tornado = null; rays = null; pillar = null; warp = 0; shakeT = 0; flashA = 0;
        finished = false; skipFn = null;
        root.style.setProperty('--rc', color);
        root.className = 'gfx on';
        root.querySelector('.gfx-hexes').innerHTML = '';
        root.querySelector('.gfx-center').innerHTML = '';
        root.querySelector('.gfx-msg').textContent = '';
        root.querySelector('.gfx-msg').className = 'gfx-msg';
        document.body.classList.add('gfx-open');
        stars(160);
        last = performance.now();
        if (!raf) raf = requestAnimationFrame(loop);
        return new Promise(res => { doneFn = res; });
    }
    function finish(holdMs = 1800) {
        finished = true;
        root.classList.add('done');
        at(holdMs, end);
    }
    function end() {
        if (!root || !root.classList.contains('on')) return;
        clearTimers();
        root.className = 'gfx';
        document.body.classList.remove('gfx-open');
        cancelAnimationFrame(raf); raf = null;
        parts = []; waves = []; bolts = [];
        const f = doneFn; doneFn = null;
        if (f) f();
    }
    function msg(text, cls = '') {
        const m = root.querySelector('.gfx-msg');
        m.textContent = text;
        m.className = 'gfx-msg show ' + cls;
    }

    // ---- particles ------------------------------------------------------------
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (l) => l[Math.floor(Math.random() * l.length)];
    function stars(n) {
        for (let i = 0; i < n; i++) parts.push({ k: 'star', x: rnd(-W, W), y: rnd(-H, H), z: rnd(.1, 1), c: Math.random() < .15 ? pick(NEBULA) : '#fff' });
    }
    function swirl(n, color) {
        for (let i = 0; i < n; i++) {
            const a = rnd(0, 7), d = rnd(Math.min(W, H) * .45, Math.min(W, H) * .8);
            parts.push({ k: 'pull', x: W / 2 + Math.cos(a) * d, y: H / 2 + Math.sin(a) * d, vx: Math.sin(a) * 3.2, vy: -Math.cos(a) * 3.2, r: rnd(1, 2.8), c: color === 'mix' ? pick(NEBULA) : color, life: rnd(70, 110), max: 110 });
        }
    }
    function burst(n, color, x = W / 2, y = H / 2, sp = 9, grav = .09) {
        for (let i = 0; i < n; i++) {
            const a = rnd(0, 7), s = rnd(2, sp);
            parts.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(1, 3.2), c: color === 'mix' ? pick(NEBULA) : color, life: rnd(50, 110), max: 110, g: grav });
        }
    }
    function confetti(n, color) {
        for (let i = 0; i < n; i++) {
            const a = rnd(0, 7), s = rnd(3, 11);
            parts.push({ k: 'hex', x: W / 2, y: H / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3, r: rnd(4, 8), rot: rnd(0, 6), vr: rnd(-.3, .3), c: Math.random() < .5 ? color : '#ffcc00', life: rnd(80, 140), max: 140, g: .14 });
        }
    }
    function rain(n, color) {
        for (let i = 0; i < n; i++) parts.push({ k: 'spark', x: rnd(0, W), y: rnd(-H * .6, 0), vx: rnd(-.6, .6), vy: rnd(2, 5), r: rnd(1, 2.6), c: color, life: rnd(120, 200), max: 200, g: .03 });
    }
    function wave(color, speed = 9, width = 6) { waves.push({ r: 10, c: color, s: speed, w: width, a: 1 }); }
    function bolt(color) {
        const a = rnd(0, 7), d = Math.min(W, H) * rnd(.25, .42);
        const pts = []; const n = 9;
        for (let i = 0; i <= n; i++) {
            const t = i / n, jit = (1 - Math.abs(t - .5) * 2) * 26;
            pts.push([W / 2 + Math.cos(a) * d * t + rnd(-jit, jit), H / 2 + Math.sin(a) * d * t + rnd(-jit, jit)]);
        }
        bolts.push({ pts, c: color, life: 9 });
    }

    // The space tornado: stars + nebula dust on a spinning funnel. power 0..1
    // grows it; collapse() pulls it into the centre.
    function startTornado(color, opts = {}) {
        tornado = { power: 0, target: opts.power || 1, spin: 0, collapse: 0, hue: color, tilt: .26, items: [], y: opts.y || H / 2, height: opts.height || Math.min(H * .78, 620), width: opts.width || Math.min(W * .58, 320) };
        const n = opts.count || 520;
        for (let i = 0; i < n; i++) tornado.items.push({ a: rnd(0, 7), h: Math.random(), sp: rnd(.6, 1.4), r: rnd(.6, 2.4), c: Math.random() < .35 ? color : pick(NEBULA), j: rnd(-1, 1) });
    }

    function loop(now) {
        const dt = Math.min(2.2, (now - last) / 16.7); last = now;
        const ox = shakeT > 0 ? rnd(-1, 1) * shakeT * 9 : 0, oy = shakeT > 0 ? rnd(-1, 1) * shakeT * 9 : 0;
        if (shakeT > 0) shakeT = Math.max(0, shakeT - .03 * dt);
        cx.save();
        cx.clearRect(0, 0, W, H);
        // deep space
        const g = cx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * .75);
        g.addColorStop(0, '#1a1033'); g.addColorStop(.45, '#0b0718'); g.addColorStop(1, '#000');
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
        cx.translate(ox, oy);
        // stars (warp streaks while warp > 0)
        parts.forEach(p => {
            if (p.k !== 'star') return;
            const zp = p.z;
            p.z -= (.0016 + warp * .02) * dt;
            if (p.z <= .02) { p.z = 1; p.x = rnd(-W, W); p.y = rnd(-H, H); }
            const sx = W / 2 + p.x / p.z * .5, sy = H / 2 + p.y / p.z * .5;
            const px = W / 2 + p.x / zp * .5, py = H / 2 + p.y / zp * .5;
            cx.globalAlpha = Math.min(1, (1 - p.z) * 1.4);
            cx.strokeStyle = p.c; cx.lineWidth = Math.max(.6, (1 - p.z) * 2.2);
            cx.beginPath(); cx.moveTo(px, py); cx.lineTo(sx + (sx - px) * warp * 3, sy + (sy - py) * warp * 3); cx.stroke();
        });
        // light rays behind the card
        if (rays) {
            rays.rot += .004 * dt; rays.a = Math.min(rays.max, rays.a + .02 * dt);
            cx.save(); cx.translate(W / 2, H / 2); cx.rotate(rays.rot);
            for (let i = 0; i < 14; i++) {
                cx.rotate(Math.PI * 2 / 14);
                const gr = cx.createLinearGradient(0, 0, 0, -Math.max(W, H));
                gr.addColorStop(0, rays.c); gr.addColorStop(1, 'transparent');
                cx.globalAlpha = rays.a * (i % 2 ? .35 : .6);
                cx.fillStyle = gr;
                cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(-26, -Math.max(W, H)); cx.lineTo(26, -Math.max(W, H)); cx.fill();
            }
            cx.restore();
        }
        // pillar of light
        if (pillar) {
            pillar.a = Math.min(.85, pillar.a + .04 * dt); pillar.w = Math.min(1, pillar.w + .05 * dt);
            const pw = 150 * pillar.w;
            const gr = cx.createLinearGradient(W / 2 - pw, 0, W / 2 + pw, 0);
            gr.addColorStop(0, 'transparent'); gr.addColorStop(.5, pillar.c); gr.addColorStop(1, 'transparent');
            cx.globalAlpha = pillar.a; cx.fillStyle = gr; cx.fillRect(W / 2 - pw, 0, pw * 2, H);
        }
        // the space tornado
        if (tornado) {
            const T = tornado;
            T.power += (T.target - T.power) * .02 * dt;
            T.spin = .02 + T.power * .07;
            if (T.collapse > 0) T.collapse = Math.min(1, T.collapse + .035 * dt);
            const shrink = 1 - T.collapse;
            T.items.forEach(it => {
                it.a += T.spin * it.sp * (1.4 - it.h * .6) * dt;
                it.h += (.0025 + T.power * .004) * it.sp * dt;
                if (it.h > 1) { it.h = 0; it.a = rnd(0, 7); }
                const rad = (10 + Math.pow(it.h, 1.5) * T.width) * T.power * shrink + it.j * 4;
                const y = T.y + (T.height / 2) * shrink - it.h * T.height * shrink;
                const x = W / 2 + Math.cos(it.a) * rad;
                const depth = Math.sin(it.a);
                cx.globalAlpha = (.35 + (depth + 1) * .32) * Math.min(1, T.power * 1.6) * (1 - T.collapse * .6);
                cx.fillStyle = it.c;
                cx.beginPath(); cx.arc(x, y + depth * rad * T.tilt, it.r * (1 + (depth + 1) * .35), 0, 7); cx.fill();
            });
            // glowing core
            cx.globalAlpha = .25 * T.power * shrink;
            const cg = cx.createRadialGradient(W / 2, T.y, 0, W / 2, T.y, 120);
            cg.addColorStop(0, T.hue); cg.addColorStop(1, 'transparent');
            cx.fillStyle = cg; cx.fillRect(W / 2 - 120, T.y - 120, 240, 240);
            if (T.collapse >= 1) tornado = null;
        }
        // shockwaves
        waves = waves.filter(w => w.a > 0);
        waves.forEach(w => {
            w.r += w.s * dt; w.a -= .018 * dt;
            cx.globalAlpha = Math.max(0, w.a); cx.strokeStyle = w.c; cx.lineWidth = w.w * w.a + 1;
            cx.beginPath(); cx.arc(W / 2, H / 2, w.r, 0, 7); cx.stroke();
        });
        // lightning
        bolts = bolts.filter(b => b.life > 0);
        bolts.forEach(b => {
            b.life -= dt;
            cx.globalAlpha = Math.min(1, b.life / 5); cx.strokeStyle = b.c; cx.lineWidth = 2.4; cx.shadowColor = b.c; cx.shadowBlur = 14;
            cx.beginPath(); b.pts.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); cx.stroke();
            cx.strokeStyle = '#fff'; cx.lineWidth = 1; cx.stroke();
            cx.shadowBlur = 0;
        });
        // pollen, sparks, hex confetti
        parts = parts.filter(p => p.k === 'star' || p.life > 0);
        parts.forEach(p => {
            if (p.k === 'star') return;
            p.life -= dt;
            if (p.k === 'pull') {
                const dx = W / 2 - p.x, dy = H / 2 - p.y;
                p.vx += dx * .004 * dt; p.vy += dy * .004 * dt; p.vx *= .955; p.vy *= .955;
            } else { p.vy += (p.g || 0) * dt; p.vx *= .988; p.vy *= .988; }
            p.x += p.vx * dt; p.y += p.vy * dt;
            cx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.6));
            cx.fillStyle = p.c;
            if (p.k === 'hex') {
                p.rot += p.vr * dt;
                cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.beginPath();
                for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; cx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * p.r, Math.sin(a) * p.r); }
                cx.fill(); cx.restore();
            } else { cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill(); }
        });
        cx.restore();
        // flash
        if (flashA > 0) { cx.globalAlpha = flashA; cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H); flashA = Math.max(0, flashA - .05 * dt); }
        cx.globalAlpha = 1;
        if (root && root.classList.contains('on')) raf = requestAnimationFrame(loop); else raf = null;
    }

    // ---- DOM pieces ------------------------------------------------------------
    function hexRing(n = 12, radius = 118) {
        const host = root.querySelector('.gfx-hexes');
        host.innerHTML = '';
        for (let i = 0; i < n; i++) {
            const h = document.createElement('i');
            const a = i / n * Math.PI * 2;
            h.animate([
                { opacity: 0, transform: `translate(${Math.cos(a) * 300}px,${Math.sin(a) * 300}px) rotate(220deg) scale(.2)` },
                { opacity: 1, transform: `translate(${Math.cos(a) * radius}px,${Math.sin(a) * radius}px) rotate(0) scale(1)` }
            ], { duration: 620, delay: i * 55, fill: 'forwards', easing: 'cubic-bezier(.2,1.3,.4,1)' });
            host.appendChild(h);
        }
        return host;
    }
    // A flip card: the real card back, the real bee card on the front.
    function card(bee, { scale = .74, faceUp = false, cls = '' } = {}) {
        const el = document.createElement('div');
        el.className = `gfx-card ${cls}${faceUp ? ' flip' : ''}`;
        el.style.setProperty('--rc', RC[bee.rarity] || '#ffcc00');
        el.innerHTML = `<div class="gfx-in"><div class="gfx-face gfx-back"><div class="gfx-host gfx-bhost"></div></div><div class="gfx-face gfx-front"><div class="gfx-host"></div></div></div>`;
        const host = el.querySelector('.gfx-front .gfx-host');
        const bhost = el.querySelector('.gfx-bhost');
        if (typeof BeeCard !== 'undefined') {
            BeeCard.render(host, bee, { editable: false });
            // The back is the real card back (BizzyBee badge).
            BeeCard.render(bhost, bee, { editable: false });
            bhost.classList.add('is-flipped');
            bhost.style.transform = `scale(${scale})`;
        }
        else host.innerHTML = `<div style="padding:40px;text-align:center;color:#fff">🐝<br>${bee.name}</div>`;
        host.style.transform = `scale(${scale})`;
        el.style.width = `${260 * scale}px`;
        el.style.height = `${370 * scale}px`;
        requestAnimationFrame(() => { const h = host.offsetHeight; if (h) el.style.height = `${h * scale}px`; });
        return el;
    }

    // ---- PULL --------------------------------------------------------------------
    function pull(bee) {
        const rc = RC[bee.rarity] || '#ffcc00', lvl = LVL[bee.rarity] || 0;
        const p = open(rc);
        const center = root.querySelector('.gfx-center');
        const c = card(bee);
        c.style.opacity = '0';
        center.appendChild(c);
        const label = bee.rarity === 'Legendary' ? '✦ LEGENDARY ✦' : bee.rarity === 'Named' ? '✦ NAMED BEAST ✦' : bee.rarity === 'Common' ? 'A new bee!' : `${bee.rarity}!`;
        const reveal = () => {
            c.style.opacity = '1'; c.classList.add('flip');
            rays = { rot: 0, a: .5, max: .5 + lvl * .12, c: rc }; pillar = pillar || { a: .7, w: 1, c: rc };
            tornado = null; warp = 0;
            msg(label, 'lvl' + lvl); finish();
        };
        if (reduce()) { reveal(); return p; }
        skipFn = reveal;
        const flipAt = 6200 + (lvl >= 2 ? 1100 : 0) + (lvl >= 3 ? 500 : 0);
        // 0-1.6s: warp through space
        warp = 1;
        at(1500, () => { warp = .15; });
        // 0.8s: the space tornado forms and spins up
        at(700, () => startTornado(lvl ? rc : '#ffcc00', { power: .55 }));
        at(2600, () => { if (tornado) tornado.target = 1; });
        // 1.2s: honeycomb ring locks in, then spins
        at(1200, () => hexRing());
        at(2100, () => root.querySelector('.gfx-hexes').animate([{ transform: 'translate(-50%,-50%) rotate(0)' }, { transform: 'translate(-50%,-50%) rotate(540deg)' }], { duration: 3000, easing: 'cubic-bezier(.5,0,.4,1)' }));
        // pollen pours in; the rarity colour shows late
        at(2200, () => swirl(110, '#ffcc00'));
        at(3400, () => swirl(80 + lvl * 50, lvl ? rc : 'mix'));
        at(4100, () => swirl(60, 'mix'));
        // lightning for Epic and up
        if (lvl >= 2) for (let i = 0; i < 8 + lvl * 3; i++) at(3600 + i * 170, () => bolt(i % 3 ? rc : '#ffffff'));
        // 4.8s: everything collapses - flash, shockwave, pillar, card rises
        at(4800, () => {
            if (tornado) tornado.collapse = .01;
            root.querySelector('.gfx-hexes').querySelectorAll('i').forEach(h => h.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(0,0) scale(.1)' }], { duration: 380, fill: 'forwards' }));
        });
        at(5200, () => {
            flashA = .9; wave(rc, 10, 8); wave('#ffffff', 7, 4); shakeT = .4 + lvl * .15;
            pillar = { a: 0, w: 0, c: rc };
            c.animate([{ opacity: 0, transform: 'translateY(80px) scale(.5)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 750, fill: 'forwards', easing: 'cubic-bezier(.2,1.3,.4,1)' });
        });
        // suspense for Epic+
        if (lvl >= 2) {
            at(6100, () => { c.classList.add('shake'); burst(30, rc, W / 2, H / 2, 4, 0); bolt(rc); });
            at(6700, () => { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); bolt('#fff'); bolt(rc); });
        }
        // the reveal
        at(flipAt, () => {
            c.style.opacity = '1';
            c.classList.add('flip');
            rays = { rot: 0, a: 0, max: .45 + lvl * .14, c: rc };
            burst(80 + lvl * 80, rc); confetti(24 + lvl * 16, rc); wave(rc, 11, 7);
            if (lvl >= 3) { flashA = .7; shakeT = 1; at(300, () => { burst(160, '#ffffff'); wave('#ffffff', 13, 6); }); at(600, () => rain(220, rc)); }
        });
        at(flipAt + 450, () => msg(label, 'lvl' + lvl));
        at(flipAt + 800, () => finish(2600));
        return p;
    }

    // ---- DESTROY -----------------------------------------------------------------
    function destroy(bee, lootIds = []) {
        const p = open('#ff6a3d');
        const center = root.querySelector('.gfx-center');
        const c = card(bee, { faceUp: true, scale: .62 });
        center.appendChild(c);
        const icons = lootIds.map(id => { const m = (typeof MATERIAL_CATALOG !== 'undefined' ? MATERIAL_CATALOG : []).find(x => x.id === id); return m ? m.icon : '🌼'; });
        const counts = {};
        lootIds.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
        const text = Object.entries(counts).map(([id, n]) => { const m = (typeof MATERIAL_CATALOG !== 'undefined' ? MATERIAL_CATALOG : []).find(x => x.id === id); return `+${n} ${m ? m.icon : id}`; }).join('  ') || 'Broken down';
        const done = () => { c.style.opacity = '0'; tornado = null; msg(text, 'lvl1'); finish(1600); };
        if (reduce()) { done(); return p; }
        skipFn = done;
        c.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 500, fill: 'forwards', easing: 'cubic-bezier(.2,1.3,.4,1)' });
        at(500, () => startTornado('#ff6a3d', { power: .7, count: 300, width: Math.min(W * .4, 200) }));
        at(900, () => c.classList.add('tremble'));
        at(1700, () => { c.classList.add('cracked'); swirl(70, '#ff9a4a'); });
        at(2500, () => { c.classList.add('hot'); bolt('#ff6a3d'); bolt('#ffcc00'); if (tornado) tornado.target = 1.2; });
        at(3200, () => { bolt('#ffffff'); bolt('#ff6a3d'); });
        at(3700, () => {
            const r = c.getBoundingClientRect();
            c.style.opacity = '0';
            flashA = .8; shakeT = .8; wave('#ff6a3d', 11, 8); wave('#ffcc00', 8, 4);
            if (tornado) tornado.collapse = .01;
            burst(140, '#ff9a4a', r.left + r.width / 2, r.top + r.height / 2, 10);
            for (let i = 0; i < 22; i++) {
                const s = document.createElement('div');
                s.className = 'gfx-shard';
                s.style.background = i % 3 ? '#8a6a1e' : (i % 2 ? '#ffcc00' : '#ff6a3d');
                s.style.left = `${r.left + r.width / 2 - 13}px`; s.style.top = `${r.top + r.height / 2 - 15}px`;
                root.appendChild(s);
                const a = rnd(0, 7), d = rnd(130, 300);
                s.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 160}px) rotate(${rnd(-900, 900)}deg)`, opacity: 0 }], { duration: 1500, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
                at(1600, () => s.remove());
            }
            icons.forEach((ic, i) => {
                const l = document.createElement('div');
                l.className = 'gfx-loot'; l.textContent = ic;
                l.style.left = `${r.left + r.width / 2 - 14}px`; l.style.top = `${r.top + r.height / 2}px`;
                root.appendChild(l);
                const x = (i - (icons.length - 1) / 2) * 56;
                l.animate([{ transform: 'translate(0,0) scale(.2)', opacity: 0 }, { transform: `translate(${x}px,-110px) scale(1.5)`, opacity: 1, offset: .45 }, { transform: `translate(${x}px,-110px) scale(1.2)`, opacity: 1, offset: .75 }, { transform: `translate(${x}px,-${H * .4}px) scale(.7)`, opacity: 0 }], { duration: 2200, delay: 300 + i * 140, fill: 'forwards' });
                at(2800, () => l.remove());
            });
        });
        at(4400, () => msg(text, 'lvl1'));
        at(4900, () => finish(1800));
        return p;
    }

    // ---- COMBINE -----------------------------------------------------------------
    function combine(beeA, beeB, newBee, upgraded) {
        const rc = RC[newBee.rarity] || '#5aa9ff', lvl = LVL[newBee.rarity] || 0;
        const p = open(rc);
        const center = root.querySelector('.gfx-center');
        const a = card(beeA, { faceUp: true, scale: .5, cls: 'gfx-orb' });
        const b = card(beeB, { faceUp: true, scale: .5, cls: 'gfx-orb' });
        center.append(a, b);
        const nc = card(newBee);
        nc.style.opacity = '0';
        const label = upgraded ? `RANKED UP → ${String(newBee.rarity).toUpperCase()}!` : `${newBee.name} grew stronger!`;
        const reveal = () => {
            a.remove(); b.remove();
            if (!nc.isConnected) center.appendChild(nc);
            nc.style.opacity = '1'; nc.classList.add('flip');
            tornado = null; rays = { rot: 0, a: .5, max: .5, c: rc };
            if (upgraded) pillar = { a: .7, w: 1, c: rc };
            msg(label, 'lvl' + (upgraded ? 3 : 1)); finish();
        };
        if (reduce()) { reveal(); return p; }
        skipFn = reveal;
        // cards orbit the tornado, faster and closer, then merge
        let orbitStart = 0, orbitRaf = null;
        const orbit = (now) => {
            if (!orbitStart) orbitStart = now;
            const t = (now - orbitStart) / 3200;
            const k = Math.min(1, t);
            const ang = Math.pow(k, 1.8) * Math.PI * 7;
            const rad = 120 * (1 - Math.pow(k, 2.2));
            [[a, 0], [b, Math.PI]].forEach(([el, off]) => {
                const x = Math.cos(ang + off) * rad, z = Math.sin(ang + off);
                el.style.transform = `translate(${x}px, ${z * rad * .25}px) scale(${.8 + z * .2}) rotate(${ang * 40}deg)`;
                el.style.zIndex = z > 0 ? 3 : 1;
                el.style.opacity = String(1 - Math.pow(k, 6));
            });
            if (k < 1 && root.classList.contains('on')) orbitRaf = requestAnimationFrame(orbit);
        };
        a.style.transform = 'translateX(-140px)'; b.style.transform = 'translateX(140px)';
        a.animate([{ opacity: 0, transform: 'translateX(-260px)' }, { opacity: 1, transform: 'translateX(-140px)' }], { duration: 600, fill: 'forwards' });
        b.animate([{ opacity: 0, transform: 'translateX(260px)' }, { opacity: 1, transform: 'translateX(140px)' }], { duration: 600, fill: 'forwards' });
        at(700, () => startTornado('#5aa9ff', { power: .6 }));
        at(1300, () => { a.getAnimations().forEach(x => x.cancel()); b.getAnimations().forEach(x => x.cancel()); orbitRaf = requestAnimationFrame(orbit); swirl(90, 'mix'); if (tornado) tornado.target = 1.1; });
        for (let i = 0; i < 10; i++) at(2000 + i * 220, () => bolt(i % 2 ? '#5aa9ff' : '#ffffff'));
        at(2800, () => swirl(80, rc));
        at(4500, () => {
            cancelAnimationFrame(orbitRaf);
            a.remove(); b.remove();
            flashA = 1; shakeT = .7; wave('#ffffff', 12, 8); wave(rc, 8, 6);
            if (tornado) tornado.collapse = .01;
            burst(120, '#ffffff'); burst(80, 'mix');
        });
        at(4900, () => {
            center.appendChild(nc);
            nc.animate([{ opacity: 0, transform: 'scale(.3) rotate(-40deg)' }, { opacity: 1, transform: 'scale(1) rotate(0)' }], { duration: 800, fill: 'forwards', easing: 'cubic-bezier(.2,1.4,.4,1)' });
        });
        if (upgraded) {
            at(5800, () => { nc.classList.add('shake'); bolt(rc); bolt('#fff'); burst(30, rc, W / 2, H / 2, 4, 0); });
            at(6400, () => { nc.classList.remove('shake'); void nc.offsetWidth; nc.classList.add('shake'); bolt(rc); });
        }
        const flipAt = upgraded ? 7000 : 6000;
        at(flipAt, () => {
            nc.classList.add('flip');
            rays = { rot: 0, a: 0, max: .5 + (upgraded ? .2 : 0), c: rc };
            burst(upgraded ? 220 : 100, rc); confetti(upgraded ? 50 : 26, rc); wave(rc, 11, 7);
            if (upgraded) { pillar = { a: 0, w: 0, c: rc }; shakeT = 1; flashA = .6; at(500, () => rain(200, rc)); }
        });
        at(flipAt + 450, () => msg(label, 'lvl' + (upgraded ? Math.max(2, lvl) : 1)));
        at(flipAt + 800, () => finish(2600));
        return p;
    }

    return { pull, destroy, combine, end };
})();
