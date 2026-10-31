// Oct 31 2026 (Craft): brought back from 1.0.6 (Batch 6).
// History (Oct 29 2026): everything you finished on a day (Vault.doneOn),
// with the time and a link to the task. ‹ › step through the days.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let day = todayISO();

function href(x) {
    if (typeof BizzyNotify === 'undefined') return null;
    try { return BizzyNotify.urlFor(x.kind, x.id, x.extra); } catch { return null; }
}
function render() {
    const list = Vault.doneOn(day), total = list.reduce((n, x) => n + x.xp, 0), today = todayISO();
    const d = new Date(day + 'T12:00');
    document.getElementById('hi-date').textContent = day === today ? 'Today' : day === shiftISODate(today, -1) ? 'Yesterday'
        : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    document.getElementById('hi-total').textContent = `${list.length} done · ${total > 0 ? '+' : ''}${total} XP`;
    document.getElementById('hi-next').disabled = day >= today;
    document.getElementById('hi-list').innerHTML = list.length ? list.map(x => {
        const when = x.t ? new Date(x.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        const inner = `<span class="hi-ic" aria-hidden="true">${x.icon}</span><span class="hi-txt"><b>${esc(x.label)}</b><small>${esc(x.what)}${when ? ' · ' + when : ''}</small></span><span class="hi-xp${x.xp < 0 ? ' neg' : ''}">${x.xp > 0 ? '+' : ''}${x.xp}</span>`;
        const h = href(x);
        return `<li>${h ? `<a class="hi-row" href="${esc(h)}">${inner}</a>` : `<span class="hi-row">${inner}</span>`}</li>`;
    }).join('') : '<li class="hi-empty">Nothing finished on this day.</li>';
}
document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const q = new URLSearchParams(location.search).get('day');
    if (/^\d{4}-\d{2}-\d{2}$/.test(q || '')) day = q;
    render();
    document.getElementById('hi-prev').addEventListener('click', () => { day = shiftISODate(day, -1); render(); });
    document.getElementById('hi-next').addEventListener('click', () => { if (day < todayISO()) { day = shiftISODate(day, 1); render(); } });
    if (typeof Waggle !== 'undefined') Waggle.setActions(baseWaggleActions());
});
