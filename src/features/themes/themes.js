// Themes page (Oct 28 2026). The rules live in core/ui/themes/themes.js.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderThemes() {
    const pick = Themes.pick(), now = Themes.current();
    document.getElementById('th-grid').innerHTML = Themes.list().map(t => {
        const sub = t.id === 'auto' ? `${t.note}. Now: ${now === 'halloween' ? '🎃 Halloween' : '🐝 BizzyBee'}` : t.note;
        return `<button type="button" class="th-card" role="radio" aria-checked="${t.id === pick}" data-theme="${esc(t.id)}">
            <span class="th-pv" style="background:linear-gradient(135deg,${t.bg[0]},${t.bg[1]})">${t.colors.map(c => `<i style="background:${c}"></i>`).join('')}</span>
            <span><b>${t.icon} ${esc(t.label)}</b><span class="th-on">✓ ON</span><small>${esc(sub)}</small></span></button>`;
    }).join('');
}
document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    if (typeof Waggle !== 'undefined' && typeof baseWaggleActions === 'function') Waggle.setActions(baseWaggleActions());
    renderThemes();
    document.getElementById('th-grid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-theme]');
        if (!b) return;
        Themes.set(b.dataset.theme);
        renderThemes();
        if (typeof Toast !== 'undefined') Toast.show(`${Themes.list().find(t => t.id === b.dataset.theme).icon} Theme changed.`, 'positive');
    });
    window.addEventListener('theme-changed', renderThemes);
});
