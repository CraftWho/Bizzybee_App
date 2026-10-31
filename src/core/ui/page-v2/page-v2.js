// Page v2 bottom sheet (Oct 2026) - shared by Inventory and Hive Bees.
// PV2.sheet(html) opens (or refreshes) one sheet; [data-close] or a tap
// outside closes it; Escape too. PV2.close() closes it from code.
const PV2 = (() => {
    let scrim = null, lastFocus = null;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    function close() {
        if (!scrim) return;
        scrim.remove(); scrim = null;
        document.removeEventListener('keydown', onKey);
        if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
    }
    function sheet(html, label = '') {
        const fresh = !scrim;
        if (fresh) {
            lastFocus = document.activeElement;
            scrim = document.createElement('div');
            scrim.className = 'pv2 pv2-scrim';
            scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
            document.body.appendChild(scrim);
            document.addEventListener('keydown', onKey);
        }
        const keep = scrim.querySelector('.pv2-sheet');
        const top = keep ? keep.scrollTop : 0;
        scrim.innerHTML = `<div class="pv2-sheet" role="dialog" aria-modal="true" aria-label="${label.replace(/"/g, '&quot;')}">${html}</div>`;
        const box = scrim.firstElementChild;
        box.scrollTop = top;
        if (!fresh) box.style.animation = 'none';
        else { const x = box.querySelector('[data-close]'); if (x) x.focus({ preventScroll: true }); }
        return box;
    }
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return { sheet, close, esc, isOpen: () => !!scrim };
})();
