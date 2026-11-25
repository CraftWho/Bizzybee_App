// Thumb pad (Nov 1 2026, Craft; from 1.0.7, approved demo): "a gem in a mold". Press and hold the
// gold ＋ in the dock to pull it out as a see-through pad you can put
// anywhere your thumb rests. Around the gem: Back, Home, Dailies, To-Dos,
// Habits and New. Tap the gem to fold the pad; drag it to move it.
// Triple-tap the gem (or tap the empty mold in the dock) to put it back.
// Remembered on this device (bizzybee_thumbpad).
(() => {
    const KEY = 'bizzybee_thumbpad';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
    const write = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* storage off */ } };
    let pad = null, justPulled = false;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const go = (href) => { if (typeof AppShell !== 'undefined' && AppShell.url) location.href = AppShell.url(href); };
    const ACTIONS = [
        { k: 'back', ic: '←', label: 'Back', run: () => typeof BBNav !== 'undefined' ? BBNav.back() : history.length > 1 ? history.back() : go('src/features/home/home.html') },   // Nov 24 2026 (Craft): one back rule (BBNav in app.js)
        { k: 'home', ic: '🏠', label: 'Home', run: () => go('src/features/home/home.html') },
        { k: 'dailies', ic: '☀️', label: 'Dailies', run: () => go('src/features/dailies/dailies.html') },
        { k: 'new', ic: '＋', label: 'New', run: () => { const a = document.querySelector('.app-dock .dk-add'); if (a) { document.body.classList.remove('tp-out'); a.click(); document.body.classList.add('tp-out'); } } },
        { k: 'todos', ic: '✅', label: 'To-Dos', run: () => go('src/features/todos/todos.html') },
        { k: 'habits', ic: '🔁', label: 'Habits', run: () => go('src/features/habits/habits.html') }
    ];

    function place(x, y) {
        const r = 92;   // keep the petals on screen
        x = clamp(x, r, innerWidth - r); y = clamp(y, r + 40, innerHeight - r);
        pad.style.left = x + 'px'; pad.style.top = y + 'px';
        return { x, y };
    }
    function show(state) {
        if (pad) pad.remove();
        pad = document.createElement('div');
        pad.className = 'tp-pad' + (state.folded ? ' folded' : '');
        pad.setAttribute('role', 'toolbar');
        pad.setAttribute('aria-label', 'Thumb pad');
        pad.innerHTML = ACTIONS.map((a, i) => `<button type="button" class="tp-petal" data-k="${a.k}" style="--a:${i * 60 - 90}deg" aria-label="${a.label}"><span>${a.ic}</span></button>`).join('')
            + '<button type="button" class="tp-gem" aria-label="Thumb pad. Tap to fold, drag to move, triple-tap to put back."><i></i></button>';
        document.body.appendChild(pad);
        document.body.classList.add('tp-out');
        place(state.x, state.y);
        pad.addEventListener('click', (e) => {
            const p = e.target.closest('.tp-petal');
            if (p) { const a = ACTIONS.find(x => x.k === p.dataset.k); if (a) a.run(); }
        });
        const gem = pad.querySelector('.tp-gem');
        let drag = null, taps = 0, tapTimer = null;
        gem.addEventListener('pointerdown', (e) => { drag = { x0: e.clientX, y0: e.clientY, moved: false }; try { gem.setPointerCapture(e.pointerId); } catch { /* old browser */ } });
        gem.addEventListener('pointermove', (e) => {
            if (!drag) return;
            if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
            drag.moved = true; pad.classList.add('dragging');
            place(e.clientX, e.clientY);
        });
        gem.addEventListener('pointerup', (e) => {
            if (!drag) return;
            const moved = drag.moved; drag = null; pad.classList.remove('dragging');
            if (moved) { const s = read() || {}; Object.assign(s, place(e.clientX, e.clientY)); write(s); return; }
            taps++;
            clearTimeout(tapTimer);
            if (taps >= 3) { taps = 0; putBack(); return; }
            tapTimer = setTimeout(() => {
                if (taps === 1) { pad.classList.toggle('folded'); const s = read() || {}; s.folded = pad.classList.contains('folded'); write(s); }
                taps = 0;
            }, 320);
        });
        gem.addEventListener('pointercancel', () => { drag = null; pad.classList.remove('dragging'); });
    }
    function putBack() {
        const add = document.querySelector('.app-dock .dk-add');
        if (pad && add) {
            const b = add.getBoundingClientRect();
            pad.classList.add('going-home');
            pad.style.left = (b.left + b.width / 2) + 'px'; pad.style.top = (b.top + b.height / 2) + 'px';
            const old = pad; pad = null;
            setTimeout(() => old.remove(), 380);
        } else if (pad) { pad.remove(); pad = null; }
        document.body.classList.remove('tp-out');
        write(null);
        if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
    }

    function hook(add) {
        let timer = null, start = null;
        add.addEventListener('pointerdown', (e) => {
            if (document.body.classList.contains('tp-out')) return;
            start = { x: e.clientX, y: e.clientY };
            timer = setTimeout(() => {
                timer = null; justPulled = true;
                if (navigator.vibrate) navigator.vibrate(25);
                const b = add.getBoundingClientRect();
                const s = { x: b.left + b.width / 2, y: b.top - 110, folded: false };
                show(s); write(Object.assign(s, place(s.x, s.y)));
            }, 600);
        });
        const cancel = (e) => { if (timer && (e.type !== 'pointermove' || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8)) { clearTimeout(timer); timer = null; } };
        ['pointermove', 'pointerup', 'pointercancel'].forEach(t => add.addEventListener(t, cancel));
        // The empty mold: tap it to put the pad back.
        add.addEventListener('click', (e) => { if (document.body.classList.contains('tp-out')) { e.preventDefault(); e.stopImmediatePropagation(); putBack(); } }, true);
    }
    // A pull-out must not also open "Create new".
    document.addEventListener('click', (e) => { if (justPulled && e.target.closest('.dk-add')) { e.preventDefault(); e.stopImmediatePropagation(); justPulled = false; } }, true);
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.dk-add')) justPulled = false; }, true);

    function start(tries = 0) {
        const add = document.querySelector('.app-dock .dk-add');
        if (!add) { if (tries < 40) setTimeout(() => start(tries + 1), 150); return; }
        hook(add);
        const s = read();
        if (s && typeof s.x === 'number') show(s);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start());
    else start();
    window.ThumbPad = { putBack, isOut: () => !!pad };
})();
