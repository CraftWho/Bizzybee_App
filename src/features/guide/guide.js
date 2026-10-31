// Guide (Oct 28 2026). Eve explains every feature. The list lives in
// core/ui/hints/hints.js (Hints.GUIDE); add an entry there for each new feature.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function render() {
    const q = (document.getElementById('gd-q').value || '').toLowerCase();
    const seen = Hints.seenGuide();
    const list = Hints.GUIDE.filter(g => (g.title + ' ' + g.text).toLowerCase().includes(q));
    document.getElementById('gd-list').innerHTML = list.length ? list.map(g => `<div class="gd-item"><span class="gd-ic" aria-hidden="true">${g.icon}</span>
        <span class="gd-mid"><b>${esc(g.title)}${g.intro && !seen.includes(g.id) ? '<span class="gd-new">NEW</span>' : ''}</b><small>${esc(g.text)} · v${esc(g.v)}</small></span>
        <a class="btn" href="${location.origin}${g.page}?guide=${encodeURIComponent(g.id)}">Show me</a></div>`).join('') : '<p class="gd-empty">Nothing matches. Try another word.</p>';
}
async function start(tries = 0) {
    if (typeof Hints === 'undefined') { if (tries < 60) setTimeout(() => start(tries + 1), 100); return; }
    await Vault.init();
    render();
    document.getElementById('gd-q').addEventListener('input', render);
}
document.addEventListener('DOMContentLoaded', () => start());
