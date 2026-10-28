// Weather scene (Oct 28 2026, Craft). Live sky for the Hive Mind page:
//   - the sky follows the real time of day: night, dawn, day, dusk
//     (sunrise/sunset from the weather service, or 6:30 / 18:30 without it)
//   - sun or moon on an arc, twinkling stars at night
//   - drifting clouds, and rain / drizzle / snow / fog / storms with
//     lightning, from the weather in Settings › Weather
// Two canvases: one behind the hive (sky, sun, moon, stars, clouds) and one
// in front (rain, snow, fog, night shade, lightning). Pauses when the page is
// hidden. With "reduce motion" on, it draws one still frame.
const WeatherFX = (() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
    const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const rand = (a, b) => a + Math.random() * (b - a);

    // Sky colours: [top, middle, horizon]
    const SKY = {
        night: ['#050a1c', '#0d1733', '#1c2950'].map(hex),
        twilight: ['#1f2350', '#6b3f6e', '#e08a5c'].map(hex),
        day: ['#2f6fc0', '#6fb0e6', '#c9e6f8'].map(hex),
        grey: ['#4b5560', '#6f7a86', '#9aa4ae'].map(hex),
        storm: ['#1d2229', '#2f3740', '#4a535d'].map(hex),
    };
    // How covered the sky is, and what falls from it.
    const KINDS = {
        clear: { cover: 0, clouds: 1 }, mostly: { cover: .12, clouds: 3 }, partly: { cover: .3, clouds: 6 },
        cloudy: { cover: .72, clouds: 11 }, fog: { cover: .8, clouds: 6, fog: 1 },
        drizzle: { cover: .7, clouds: 10, rain: .35 }, rain: { cover: .8, clouds: 12, rain: 1 },
        heavy: { cover: .9, clouds: 14, rain: 1.9 }, snow: { cover: .75, clouds: 10, snow: 1 },
        storm: { cover: 1, clouds: 15, rain: 2.2, storm: true },
    };

    function mount(skyHost, frontHost) {
        const sky = document.createElement('canvas'), front = document.createElement('canvas');
        sky.className = 'wxfx wxfx-sky'; front.className = 'wxfx wxfx-front';
        sky.setAttribute('aria-hidden', 'true'); front.setAttribute('aria-hidden', 'true');
        skyHost.prepend(sky); frontHost.appendChild(front);
        const S = sky.getContext('2d'), F = front.getContext('2d');
        let W = 0, H = 0, dpr = 1, raf = 0, last = 0, alive = true;
        let state = { kind: 'clear', wind: 8, sunrise: null, sunset: null, offset: 0 };
        let stars = [], clouds = [], drops = [], flakes = [], splashes = [], fogBands = [], sprites = null;
        let flash = 0, nextBolt = 0, bolt = null;

        function size() {
            dpr = Math.min(1.5, window.devicePixelRatio || 1);
            const r = skyHost.getBoundingClientRect();
            W = Math.max(1, r.width); H = Math.max(1, r.height);
            [sky, front].forEach(c => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
            S.setTransform(dpr, 0, 0, dpr, 0, 0); F.setTransform(dpr, 0, 0, dpr, 0, 0);
            build();
        }

        // ---- time of day ----
        function sunTimes(now) {
            const d = (h, m) => { const x = new Date(now); x.setHours(h, m, 0, 0); return x.getTime(); };
            const same = (t) => t && new Date(t).toDateString() === new Date(now).toDateString();
            return { rise: same(state.sunrise) ? state.sunrise : d(6, 30), set: same(state.sunset) ? state.sunset : d(18, 30) };
        }
        // e: sun height, 1 = noon, 0 = horizon, below 0 = night.
        function sunInfo(now) {
            const { rise, set } = sunTimes(now);
            if (now >= rise && now <= set) { const p = (now - rise) / (set - rise); return { e: Math.sin(Math.PI * p), p, day: true }; }
            const nightLen = 86400000 - (set - rise);
            const since = now > set ? now - set : now + 86400000 - set;
            const p = clamp(since / nightLen);
            return { e: -Math.sin(Math.PI * p) * .6 - .02, p, day: false };
        }
        function skyColors(e, cover, storm) {
            let c;
            if (e <= -.12) c = SKY.night;
            else if (e < .02) { const t = (e + .12) / .14; c = SKY.night.map((v, i) => mix(v, SKY.twilight[i], t)); }
            else if (e < .25) { const t = (e - .02) / .23; c = SKY.twilight.map((v, i) => mix(v, SKY.day[i], t)); }
            else c = SKY.day;
            const g = storm ? SKY.storm : SKY.grey;
            const light = clamp((e + .15) / .5);   // grey clouds are dark at night
            const grey = g.map(v => mix(SKY.night[0], v, .35 + light * .65));
            return c.map((v, i) => mix(v, grey[i], cover * .85));
        }

        // ---- build particles for this size / weather ----
        function cloudSprite(w, h, tint, shade) {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const g = c.getContext('2d');
            const puffs = 14 + Math.floor(Math.random() * 8);
            for (let i = 0; i < puffs; i++) {
                const x = rand(w * .18, w * .82), y = rand(h * .38, h * .7), r = rand(h * .18, h * .36) * (1 - Math.abs(x - w / 2) / w);
                const rg = g.createRadialGradient(x, y - r * .3, r * .1, x, y, r);
                rg.addColorStop(0, rgb(tint, .95)); rg.addColorStop(.6, rgb(tint, .55)); rg.addColorStop(1, rgb(tint, 0));
                g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            }
            // darker belly
            g.globalCompositeOperation = 'source-atop';
            const lg = g.createLinearGradient(0, h * .3, 0, h);
            lg.addColorStop(0, rgb(shade, 0)); lg.addColorStop(1, rgb(shade, .75));
            g.fillStyle = lg; g.fillRect(0, 0, w, h);
            return c;
        }
        function build() {
            const k = KINDS[state.kind] || KINDS.clear;
            const area = (W * H) / (420 * 820);
            stars = Array.from({ length: Math.round(140 * Math.max(.6, area)) }, () => ({ x: Math.random() * W, y: Math.random() * H * .7, r: rand(.4, 1.5), tw: rand(0, Math.PI * 2), sp: rand(.6, 2.2) }));
            const now = Date.now() + (state.offset || 0), e = sunInfo(now).e, light = clamp((e + .1) / .4);
            const white = mix(hex('#5a6478'), hex('#ffffff'), light), stormy = mix(hex('#20262e'), hex('#7a838c'), light);
            const base = k.storm ? stormy : mix(white, stormy, clamp(k.cover - .3));
            const shade = mix(base, hex('#1a1f28'), .55);
            sprites = Array.from({ length: 5 }, () => cloudSprite(360, 150, base, shade));
            clouds = Array.from({ length: k.clouds }, (_, i) => {
                const layer = i % 3, s = (.55 + layer * .3) * Math.max(.7, Math.min(1.6, W / 500));
                return { x: rand(-200, W), y: rand(H * .02, H * (.28 + layer * .08)), s, layer, a: (.55 + layer * .2) * (k.cover > .6 ? 1 : .85), img: sprites[i % sprites.length] };
            });
            const rainN = Math.round((k.rain || 0) * 260 * Math.max(.5, area));
            drops = Array.from({ length: rainN }, () => newDrop(true));
            flakes = Array.from({ length: k.snow ? Math.round(160 * Math.max(.5, area)) : 0 }, () => newFlake(true));
            fogBands = k.fog ? Array.from({ length: 5 }, (_, i) => ({ y: H * (.35 + i * .14), h: rand(H * .12, H * .22), x: rand(0, W), sp: rand(4, 12) * (i % 2 ? 1 : -1), a: rand(.12, .22) })) : [];
            splashes = [];
            nextBolt = performance.now() + rand(3000, 8000);
        }
        function newDrop(any) {
            const layer = Math.random() < .35 ? 2 : Math.random() < .6 ? 1 : 0;
            const drizzle = state.kind === 'drizzle';
            return { x: rand(-W * .2, W * 1.1), y: any ? rand(-H, H) : rand(-120, -10), layer,
                len: (drizzle ? 6 : 14) + layer * (drizzle ? 3 : 9) + rand(0, 8), sp: (drizzle ? 380 : 700) + layer * 260 + rand(0, 160), a: .18 + layer * .14 };
        }
        function newFlake(any) {
            const layer = Math.random() < .3 ? 2 : Math.random() < .55 ? 1 : 0;
            return { x: rand(0, W), y: any ? rand(-H, H) : rand(-40, -5), r: .9 + layer * 1.1 + rand(0, .8), sp: 26 + layer * 22 + rand(0, 14), ph: rand(0, 6.28), sw: rand(.6, 1.6), layer };
        }

        // ---- drawing ----
        function drawSky(t, now) {
            const k = KINDS[state.kind] || KINDS.clear;
            const { e, p, day } = sunInfo(now);
            const c = skyColors(e, k.cover, k.storm);
            const g = S.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, rgb(c[0])); g.addColorStop(.55, rgb(c[1])); g.addColorStop(1, rgb(c[2]));
            S.fillStyle = g; S.fillRect(0, 0, W, H);
            // stars
            const starA = clamp((-e - .02) / .2) * (1 - k.cover * .95);
            if (starA > .01) {
                stars.forEach(s => {
                    const tw = reduce ? .8 : .55 + .45 * Math.sin(s.tw + t / 1000 * s.sp);
                    S.fillStyle = `rgba(255,250,235,${(starA * tw).toFixed(3)})`;
                    S.beginPath(); S.arc(s.x, s.y, s.r, 0, Math.PI * 2); S.fill();
                });
            }
            // sun or moon on an arc
            const horizon = H * .9, arcH = H * .5;
            const x = W * (.08 + .84 * p), y = horizon - Math.abs(Math.sin(Math.PI * p)) * arcH;
            const vis = Math.pow(1 - k.cover, 1.5) * .95 + .02;
            if (day) {
                const r = Math.max(18, Math.min(W, H) * .045);
                const warm = clamp(1 - e * 2.2);   // redder near the horizon
                const core = mix(hex('#fff7d6'), hex('#ffb35c'), warm), halo = mix(hex('#ffe9a8'), hex('#ff7a3c'), warm);
                const glow = S.createRadialGradient(x, y, r * .6, x, y, r * 9);
                glow.addColorStop(0, rgb(halo, .55 * vis)); glow.addColorStop(.35, rgb(halo, .16 * vis)); glow.addColorStop(1, rgb(halo, 0));
                S.fillStyle = glow; S.fillRect(0, 0, W, H);
                S.fillStyle = rgb(core, .95 * clamp(vis + .1));
                S.beginPath(); S.arc(x, y, r, 0, Math.PI * 2); S.fill();
            } else {
                const r = Math.max(14, Math.min(W, H) * .035);
                const glow = S.createRadialGradient(x, y, r, x, y, r * 7);
                glow.addColorStop(0, `rgba(200,215,255,${(.28 * vis).toFixed(3)})`); glow.addColorStop(1, 'rgba(200,215,255,0)');
                S.fillStyle = glow; S.fillRect(0, 0, W, H);
                const mg = S.createRadialGradient(x - r * .3, y - r * .3, r * .2, x, y, r);
                mg.addColorStop(0, `rgba(250,248,236,${vis})`); mg.addColorStop(1, `rgba(206,208,214,${vis})`);
                S.fillStyle = mg; S.beginPath(); S.arc(x, y, r, 0, Math.PI * 2); S.fill();
                S.fillStyle = `rgba(150,152,165,${(.35 * vis).toFixed(3)})`;
                [[-.3, -.15, .22], [.25, .2, .16], [.05, .42, .12], [.35, -.35, .1]].forEach(([dx, dy, rr]) => { S.beginPath(); S.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); S.fill(); });
            }
            // lightning bolt behind the clouds
            if (bolt && t < bolt.until) {
                S.save(); S.strokeStyle = 'rgba(235,240,255,.95)'; S.lineWidth = 2.2; S.shadowColor = 'rgba(170,190,255,1)'; S.shadowBlur = 18;
                S.beginPath(); bolt.pts.forEach(([bx, by], i) => i ? S.lineTo(bx, by) : S.moveTo(bx, by)); S.stroke(); S.restore();
            }
            // clouds
            const dt = reduce ? 0 : 1;
            clouds.forEach(cl => {
                const w = cl.img.width * cl.s, h = cl.img.height * cl.s;
                cl.x += dt * (state.wind / 60) * (.25 + cl.layer * .25);
                if (cl.x > W + 40) { cl.x = -w - rand(0, 200); cl.y = rand(H * .02, H * (.28 + cl.layer * .08)); }
                S.globalAlpha = cl.a; S.drawImage(cl.img, cl.x, cl.y, w, h); S.globalAlpha = 1;
            });
            return e;
        }
        function drawFront(t, dt, e) {
            F.clearRect(0, 0, W, H);
            const k = KINDS[state.kind] || KINDS.clear;
            // night shade over the hive
            const night = clamp((-e + .05) / .25) * .42 + (k.storm ? .18 : k.cover * .1);
            if (night > .01) { F.fillStyle = `rgba(8,14,38,${night.toFixed(3)})`; F.fillRect(0, 0, W, H); }
            // fog
            fogBands.forEach(b => {
                b.x += b.sp * dt; if (b.x > W) b.x -= W; if (b.x < 0) b.x += W;
                const g = F.createLinearGradient(0, b.y - b.h / 2, 0, b.y + b.h / 2);
                g.addColorStop(0, 'rgba(210,215,222,0)'); g.addColorStop(.5, `rgba(210,215,222,${b.a})`); g.addColorStop(1, 'rgba(210,215,222,0)');
                F.fillStyle = g; F.fillRect(0, b.y - b.h / 2, W, b.h);
            });
            // rain
            if (drops.length) {
                const ang = clamp(state.wind / 60, .03, .35);
                const tone = e > 0 ? '205,215,232' : '160,175,205';
                F.lineCap = 'round';
                [0, 1, 2].forEach(layer => {
                    F.lineWidth = .7 + layer * .45;
                    F.beginPath();
                    drops.forEach(d => {
                        if (d.layer !== layer) return;
                        if (!reduce) { d.y += d.sp * dt; d.x += d.sp * ang * dt; }
                        if (d.y > H) {
                            if (layer === 2 && splashes.length < 90) splashes.push({ x: d.x, y: H - rand(2, H * .1), r: 0, a: .5 });
                            Object.assign(d, newDrop(false));
                        }
                        F.moveTo(d.x, d.y); F.lineTo(d.x - d.len * ang, d.y - d.len);
                    });
                    F.strokeStyle = `rgba(${tone},${(.2 + layer * .14).toFixed(2)})`;
                    F.stroke();
                });
                splashes = splashes.filter(s => {
                    s.r += 28 * dt; s.a -= 1.6 * dt;
                    if (s.a <= 0) return false;
                    F.strokeStyle = `rgba(${tone},${s.a.toFixed(2)})`; F.lineWidth = .8;
                    F.beginPath(); F.ellipse(s.x, s.y, s.r, s.r * .32, 0, Math.PI, Math.PI * 2); F.stroke();
                    return true;
                });
            }
            // snow
            flakes.forEach(f => {
                if (!reduce) { f.y += f.sp * dt; f.ph += dt * f.sw; f.x += Math.sin(f.ph) * .4 + state.wind / 120; }
                if (f.y > H + 5 || f.x > W + 10) Object.assign(f, newFlake(false));
                F.fillStyle = `rgba(255,255,255,${(.55 + f.layer * .18).toFixed(2)})`;
                F.beginPath(); F.arc(f.x, f.y, f.r, 0, Math.PI * 2); F.fill();
            });
            // storm: lightning flash
            if (k.storm && !reduce) {
                if (t > nextBolt) {
                    flash = 1;
                    const pts = []; let bx = rand(W * .15, W * .85), by = 0;
                    while (by < H * .55) { pts.push([bx, by]); bx += rand(-28, 28); by += rand(18, 42); }
                    bolt = { pts, until: t + 160 };
                    nextBolt = t + rand(5000, 13000);
                    setTimeout(() => { flash = .7; }, 120);
                }
                if (flash > 0) { F.fillStyle = `rgba(225,232,255,${(flash * .45).toFixed(3)})`; F.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 3.2); }
            }
        }
        function frame(t) {
            if (!alive) return;
            const dt = last ? Math.min(.05, (t - last) / 1000) : .016;
            last = t;
            const e = drawSky(t, Date.now() + (state.offset || 0));
            drawFront(t, dt, e);
            if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
        }
        function go() { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame); }

        const ro = new ResizeObserver(() => { size(); if (reduce) frame(performance.now()); });
        ro.observe(skyHost);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
        size(); go();

        return {
            set(next) { state = { ...state, ...next }; build(); if (reduce) frame(performance.now()); },
            get kind() { return state.kind; },
            destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); sky.remove(); front.remove(); },
        };
    }

    // Weather code (Open-Meteo / WMO) -> scene kind.
    function kindOf(code) {
        if (code == null) return 'clear';
        if (code === 0) return 'clear';
        if (code === 1) return 'mostly';
        if (code === 2) return 'partly';
        if (code === 3) return 'cloudy';
        if (code === 45 || code === 48) return 'fog';
        if (code >= 51 && code <= 57) return 'drizzle';
        if (code === 65 || code === 82 || code === 67) return 'heavy';
        if ((code >= 61 && code <= 66) || code === 80 || code === 81) return 'rain';
        if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
        if (code >= 95) return 'storm';
        return 'cloudy';
    }

    return { mount, kindOf, KINDS };
})();
