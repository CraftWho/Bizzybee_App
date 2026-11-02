// Pull to refresh (Oct 27 2026). Pull down at the top of any page: sends
// this device's unsaved changes, loads a newer cloud copy if there is one,
// then reloads the page. Loaded on every app page by app.js.
(() => {
    const MAX = 110, GO = 72;
    const NO_PULL = '.no-pull, [data-no-pull], .cf-stage, .cf-wheel, .cf-scrub, .app-dock, .tp-pad, .dev-fab';   // Nov 1 2026 (Craft)
    let startY = null, pull = 0, busy = false;
    const el = document.createElement('div');
    el.className = 'ptr';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="hx"></span><b>↓</b><small>Pull to refresh</small>';
    document.body.appendChild(el);
    const label = el.querySelector('small'), icon = el.querySelector('b');

    // Don't start inside things that scroll on their own, or with a sheet/dialog open.
    function blocked(target) {
        if (window.scrollY > 0 || document.scrollingElement.scrollTop > 0) return true;
        if (document.querySelector('.lvr, .gfx.on, dialog[open], .hn-tip, [role="dialog"]:not([hidden])')) return true;
        // Nov 1 2026 (Craft): anything marked .no-pull (or data-no-pull) never
        // starts a refresh: Cover Flow, the click wheel, the dock ＋, the thumb
        // pad, dev buttons. Add the class to any new swipe/drag control.
        if (target && target.closest && target.closest(NO_PULL)) return true;
        for (let n = target; n && n !== document.body; n = n.parentElement) {
            if (n.scrollTop > 0) return true;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)) return true;
        }
        return false;
    }
    function draw() {
        const y = Math.min(MAX, pull) - 80 + 10;
        el.style.transform = `translate(-50%, ${y}px)`;
        el.style.opacity = Math.min(1, pull / GO);
        el.classList.toggle('ready', pull >= GO);
        label.textContent = pull >= GO ? 'Let go to refresh' : 'Pull to refresh';
    }
    function reset() { pull = 0; startY = null; el.classList.remove('drag', 'ready'); el.style.transform = ''; el.style.opacity = ''; }

    document.addEventListener('touchstart', e => {
        if (busy || e.touches.length !== 1 || blocked(e.target)) { startY = null; return; }
        startY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchmove', e => {
        if (startY === null || busy) return;
        const dy = e.touches[0].clientY - startY;
        if (dy <= 0 || window.scrollY > 0) { if (pull) reset(); return; }
        pull = dy * 0.55;
        el.classList.add('drag');
        draw();
    }, { passive: true });
    document.addEventListener('touchend', async () => {
        if (startY === null || busy) return;
        el.classList.remove('drag');
        if (pull < GO) { reset(); return; }
        busy = true;
        el.classList.remove('ready'); el.classList.add('spin');
        icon.textContent = '🐝'; label.textContent = 'Syncing…';
        el.style.transform = 'translate(-50%, 10px)'; el.style.opacity = 1;
        try {
            if (typeof CloudSyncAuto !== 'undefined' && CloudSyncAuto.refreshFromCloud) {
                await Promise.race([CloudSyncAuto.refreshFromCloud(), new Promise(r => setTimeout(r, 8000))]);
            }
        } catch {}
        window.location.reload();
    });
})();
