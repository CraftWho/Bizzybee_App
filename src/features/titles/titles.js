// Titles page (Oct 31 2026, Craft, approved demo "BizzyBee Ranks & Titles").
// Logic: db.js (TITLES). Wear one and it shows next to your rank in the
// header. Titles you haven't earned show only "???": no name, rule or progress.
document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const render = () => {
        const T = Vault.getTitles(), rk = typeof Vault.getRank === 'function' ? Vault.getRank() : null;
        const rankName = rk ? rk.rank.name : 'Your rank';
        $('tt-now').innerHTML = `<small>You are</small><b>${esc(rankName)}${T.worn ? ` · ${esc(T.worn.name)}` : ''}</b><span>${T.worn ? esc(T.worn.how) : 'Rank only. Wear a title to show it next to your rank.'}</span>`;
        $('tt-lead').textContent = `Earn titles by doing things. ${T.earned.length} earned${T.locked ? `, ${T.locked} still a secret` : ''}.`;
        const row = (t) => {
            if (!t.earned) return '<div class="row tt-row locked"><span class="hx">?</span><span class="mid"><b>???</b><small>Not earned yet.</small></span></div>';
            const on = T.worn && T.worn.id === t.id;
            return `<div class="row tt-row"><span class="hx">${t.icon}</span><span class="mid"><b>${esc(t.name)}</b><small>${esc(t.how)}</small></span>
                ${on ? '<span class="tt-on">Wearing</span>' : `<button type="button" class="btn tt-wear" data-wear="${esc(t.id)}">Wear</button>`}</div>`;
        };
        $('tt-list').innerHTML = `<div class="row tt-row"><span class="hx">🎖️</span><span class="mid"><b>Rank only</b><small>Show just your rank.</small></span>
                ${T.worn ? '<button type="button" class="btn tt-wear" data-wear="">Wear</button>' : '<span class="tt-on">Wearing</span>'}</div>`
            + T.earned.map(row).join('') + T.all.filter(t => !t.earned).map(row).join('');
    };
    document.addEventListener('click', (e) => {
        const w = e.target.closest('[data-wear]');
        if (!w) return;
        const t = Vault.wearTitle(w.dataset.wear || null);
        if (t && typeof Toast !== 'undefined') Toast.show(w.dataset.wear ? `🏅 You are now ${t.name}.` : '🎖️ Showing your rank only.', 'positive');
        render();
        if (typeof AppShell !== 'undefined' && AppShell.refresh) AppShell.refresh();
    });
    render();
    if (typeof Waggle !== 'undefined') Waggle.setActions(typeof baseWaggleActions === 'function' ? baseWaggleActions() : []);
});
