// Tap to hatch (Oct 28 2026, Craft). A ready egg waits for you. Tap it to
// crack it open (the same cracks, glow, shake and buzz as your first egg in
// onboarding), then the shell breaks and the new bee's card appears.
//   EggHatch.open(beeId, { onDone })
// Needs EggDesign (egg-designs.js), BeeCard (bee-card.js) and BeeName
// (bee-name.js). AppShell.hatch() loads them all.
const EggHatch = (() => {
    const TAPS = 8;
    const canBuzz = !!navigator.vibrate;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const RARITY_COLOR = { Common: '#c9c9c9', Rare: '#4fb3ff', Epic: '#b36bff', Legendary: '#ffb000', Named: '#ff2a3c' };

    // ---- the same growing cracks as onboarding.js ----
    function crackWeb(seed, n, inside, startPt, scale = 1) {
        let x = seed % 2147483646 + 1; const r = () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
        const lines = [], pts = [startPt];
        for (let i = 0; i < n; i++) {
            let from, a;
            if (i % 3 === 0) { from = startPt; a = i * 2.4 + r() * .6; }
            else { from = pts[pts.length - 1 - Math.floor(r() * Math.min(pts.length - 1, 5))]; a = Math.atan2(from[1] - startPt[1], from[0] - startPt[0]) + (r() - .5) * 1.8; }
            let cx = from[0], cy = from[1];
            const d = [[cx, cy]];
            const steps = 4 + Math.floor(r() * 3);
            for (let k = 0; k < steps; k++) {
                a += (r() - .5) * 1.1; const len = scale * (6 + r() * 6);
                const nx = cx + Math.cos(a) * len, ny = cy + Math.sin(a) * len;
                if (!inside(nx, ny)) { a += Math.PI * .7; continue; }
                cx = nx; cy = ny; d.push([cx, cy]); pts.push([cx, cy]);
            }
            lines.push('M' + d.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'));
        }
        return lines;
    }
    const inEgg = (px, py) => { if (py < 12 || py > 140) return false; const t = py < 86 ? (86 - py) / 80 : (py - 86) / 58; return Math.abs(px - 60) < 48 * Math.sqrt(Math.max(0, 1 - t * t)); };
    function drawCracks(g, lines, n, max) {
        const k = n / max;
        g.innerHTML = lines.map(d => `<path d="${d}" stroke="#ff8a3a" stroke-width="${(2.2 + k * 2.6).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#ehSoft)" opacity="${(.55 + k * .45).toFixed(2)}"/>`).join('')
            + lines.map(d => `<path d="${d}" stroke="#fff6d8" stroke-width="${(.7 + k * .7).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    }

    function open(beeId, { onDone } = {}) {
        if (typeof Vault === 'undefined' || document.querySelector('.eh-scrim')) return;
        const bee = Vault.getColonyBees().find(b => b.id === beeId);
        if (!bee || !Vault.isEggReady(bee)) { if (typeof Toast !== 'undefined') Toast.show('That egg isn\'t ready yet.', 'neutral'); return; }
        const seed = typeof EggDesign !== 'undefined' ? EggDesign.seedFrom(bee.id) : 7;
        const eggHTML = typeof EggDesign !== 'undefined' ? EggDesign.forBee(bee) : '<svg viewBox="0 0 120 150"><ellipse cx="60" cy="80" rx="48" ry="64" fill="#f0d9a8"/></svg>';
        const s = document.createElement('div');
        s.className = 'eh-scrim';
        s.innerHTML = `<button type="button" class="eh-x" aria-label="Not now">×</button>
            <div class="eh-aura"></div><div class="eh-flash"></div><div class="eh-beam"></div>
            <div class="eh-stage">
                <div class="eh-egg" role="button" aria-label="Tap the egg to hatch it">${eggHTML}<div class="eh-halves"></div></div>
                <p class="eh-hint">TAP TO HATCH</p>
                <div class="eh-taps">${'<i></i>'.repeat(TAPS)}</div>
            </div>
            <div class="eh-reveal" hidden></div>`;
        document.body.appendChild(s);
        const egg = s.querySelector('.eh-egg'), svg = egg.querySelector('svg'), aura = s.querySelector('.eh-aura');
        svg.insertAdjacentHTML('afterbegin', '<defs><filter id="ehSoft"><feGaussianBlur stdDeviation="1.2"/></filter></defs>');
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        svg.appendChild(g);
        let taps = 0, done = false;
        const close = () => { s.remove(); if (onDone) onDone(); };
        s.querySelector('.eh-x').onclick = () => { if (!done) s.remove(); else close(); };

        egg.addEventListener('click', () => {
            if (done || taps >= TAPS) return;
            taps++;
            drawCracks(g, crackWeb(seed * 7 + 3, taps, inEgg, [60, 70]), taps, TAPS);
            const k = taps / TAPS, amp = 2 + k * 7;
            egg.animate([{ transform: 'rotate(0)' }, { transform: `rotate(${-amp}deg) scale(${1 + k * .03})` }, { transform: `rotate(${amp * .8}deg)` }, { transform: `rotate(${-amp * .4}deg)` }, { transform: 'rotate(0)' }], { duration: 300 + k * 200 });
            if (canBuzz) navigator.vibrate(Math.round(25 + k * 160));
            aura.style.opacity = (.35 + k * .55).toFixed(2);
            aura.style.transform = `translate(-50%,-50%) scale(${(.3 + k * .45).toFixed(3)})`;
            s.querySelectorAll('.eh-taps i')[taps - 1].classList.add('on');
            if (taps >= TAPS) setTimeout(breakOpen, 250);
        });

        function breakOpen() {
            done = true;
            const hatched = Vault.hatchEgg(bee.id);
            if (!hatched) { close(); return; }
            const color = RARITY_COLOR[hatched.rarity] || '#ffcc00';
            s.style.setProperty('--rc', color);
            // Same break as onboarding: the shell splits and flies apart.
            const shell = svg.outerHTML;
            svg.style.visibility = 'hidden';
            egg.querySelector('.eh-halves').innerHTML = `<div class="eh-half-top">${shell}</div><div class="eh-half-bot">${shell}</div>`;
            s.querySelector('.eh-flash').classList.add('go');
            s.querySelector('.eh-beam').classList.add('go');
            s.querySelector('.eh-hint').hidden = true;
            s.querySelector('.eh-taps').hidden = true;
            if (canBuzz) navigator.vibrate([80, 50, 160]);
            setTimeout(() => showCard(hatched, color), 1100);
        }

        function showCard(b, color) {
            s.querySelector('.eh-stage').hidden = true;
            const r = s.querySelector('.eh-reveal');
            r.hidden = false;
            r.innerHTML = `<p class="eh-title" style="color:${color}">${esc(b.rarity.toUpperCase())}!</p>
                <div class="eh-card"></div>
                <div class="eh-name"></div>
                <div class="eh-btns"><a class="eh-btn" href="${location.origin}/src/features/hive-bees/hive-bees.html?bee=${encodeURIComponent(b.id)}">Pick a job</a><button type="button" class="eh-btn gold" data-done>Done</button></div>`;
            if (typeof BeeCard !== 'undefined') BeeCard.render(r.querySelector('.eh-card'), b, { editable: false });
            if (typeof BeeName !== 'undefined') BeeName.mount(r.querySelector('.eh-name'), b, { onSaved: () => {} });
            r.querySelector('[data-done]').onclick = close;
            requestAnimationFrame(() => r.classList.add('on'));
        }
    }
    return { open };
})();
