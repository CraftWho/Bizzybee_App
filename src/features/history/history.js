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
// ---- Archive + Change log (Nov 7 2026, Craft; approved demo v2) ----
const KIND = { daily: ['🔁', 'Daily'], habit: ['➕', 'Habit'], todo: ['☑️', 'To-Do'], quest: ['🗺️', 'Quest'], task: ['📌', 'Quest task'] };
const shortDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const mins = (m) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
function archiveHistory(a) {
    const it = a.item, rows = [];
    if (a.kind === 'daily') (it.completedDates || []).slice().sort().reverse().forEach(d => rows.push(`${shortDate(d + 'T12:00')} · ${(it.minutesLog || {})[d] ? mins(it.minutesLog[d]) : 'done'}`));
    else if (a.kind === 'habit') (it.history || []).slice().reverse().forEach(h => rows.push(`${shortDate((h.date || '') + 'T12:00')} · ${h.direction === 'positive' ? '+1' : '−1'}${h.minutes ? ' · ' + mins(h.minutes) : ''}`));
    else if (a.kind === 'quest') (it.tasks || []).forEach(t => rows.push(`${t.completed ? '✔' : '○'} ${esc(t.label)}${t.minutesSpent ? ' · ' + mins(t.minutesSpent) : ''}`));
    else rows.push(`${it.completed ? '✔ Done' : '○ Not done'}${it.minutesSpent ? ' · ' + mins(it.minutesSpent) : ''}`);
    return rows.slice(0, 60).map(r => `<span>· ${r}</span>`).join('') || '<span>· No history</span>';
}
function renderArchive() {
    const list = Vault.getArchive();
    document.getElementById('hi-arc-n').textContent = list.length ? list.length : '';
    document.getElementById('hi-archive').innerHTML = list.length ? list.map(a => {
        const [ic, name] = KIND[a.kind] || ['🗂️', a.kind];
        const real = a.kind === 'quest' ? (a.item.tasks || []).reduce((n, t) => n + Vault.realMinutesFor(t.id), 0) : Vault.realMinutesFor(a.item.id);
        return `<div class="hi-arc" data-arc="${esc(a.id)}"><div class="hi-arc-top"><span class="mid"><b>${ic} ${esc(a.item.label || a.item.title)}</b><small>${name}${a.questTitle ? ' in ' + esc(a.questTitle) : ''} · deleted ${shortDate(a.deletedAt)} · ${mins(real)} real time</small></span><button type="button" data-view="${esc(a.id)}">View</button><button type="button" data-restore="${esc(a.id)}">Restore</button></div><div class="hi-arc-hist" hidden>${archiveHistory(a)}</div></div>`;
    }).join('') : '<p class="hi-empty">Nothing deleted yet.</p>';
}
// Nov 21 2026 (Craft): one change log, shared with Settings (core/ui/change-log).
let logView = null;
function renderLog() {
    if (typeof ChangeLog === 'undefined') return;
    if (!logView) logView = ChangeLog.mount(document.getElementById('hi-log'), { limit: 40 });
    else logView.draw();
}
function showTab(tab) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    ['days', 'archive', 'log'].forEach(t => { document.getElementById('hi-v-' + t).hidden = t !== tab; });
    if (tab === 'archive') renderArchive();
    if (tab === 'log') renderLog();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const q = new URLSearchParams(location.search).get('day');
    if (/^\d{4}-\d{2}-\d{2}$/.test(q || '')) day = q;
    render();
    document.getElementById('hi-prev').addEventListener('click', () => { day = shiftISODate(day, -1); render(); });
    document.getElementById('hi-next').addEventListener('click', () => { if (day < todayISO()) { day = shiftISODate(day, 1); render(); } });
    renderArchive();
    document.querySelector('.hi-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
    document.getElementById('hi-archive').addEventListener('click', (e) => {
        const v = e.target.closest('[data-view]'), r = e.target.closest('[data-restore]');
        if (v) { const box = v.closest('.hi-arc'); box.classList.toggle('open'); box.querySelector('.hi-arc-hist').hidden = !box.classList.contains('open'); }
        if (r) {
            const res = Vault.restoreArchived(r.dataset.restore);
            if (typeof Toast !== 'undefined') Toast.show(res.ok ? '♻️ Restored to your lists.' : res.error, res.ok ? 'positive' : 'negative');
            renderArchive(); render();
        }
    });
    if (location.hash === '#archive' || location.hash === '#log') showTab(location.hash.slice(1));
    if (typeof Waggle !== 'undefined') Waggle.setActions(baseWaggleActions());
});
