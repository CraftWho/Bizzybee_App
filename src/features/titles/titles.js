// Titles page (Oct 30 2026, Craft). Logic: db.js (TITLES).
document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const LEAD = {
        special: 'Earned for what you do. Wear one to get its perk on every Daily bonus.',
        level: 'These come by themselves as you level up. Wearing one follows your level.',
        quest: 'Earned by finishing parts of your quests. For honor.'
    };
    let tab = 'special';
    const render = () => {
        const T = Vault.getTitles();
        $('tt-now').innerHTML = `<small>You are</small><b>${T.worn.kind === 'special' ? T.worn.icon + ' ' : ''}${esc(T.worn.name)}</b><span>${T.worn.kind === 'special' ? esc(T.worn.perkText) : T.worn.kind === 'level' ? `Level title · ${esc(T.worn.how)}` : esc(T.worn.how)}</span>`;
        document.querySelectorAll('.tt-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
        $('tt-lead').textContent = LEAD[tab];
        const list = tab === 'special' ? T.special : tab === 'level' ? T.ladder : T.quest;
        const wornId = T.worn.kind === 'level' ? 'lvl-auto' : T.worn.id;
        $('tt-list').innerHTML = list.length ? list.map(t => {
            const on = t.id === wornId || (t.kind === 'level' && T.worn.kind === 'level' && t.id === T.levelNow.id);
            return `<div class="row tt-row${t.earned ? '' : ' locked'}"><span class="hx">${t.earned ? t.icon : '🔒'}</span><span class="mid"><b>${esc(t.name)}</b>
                <small>${esc(t.how)}</small>${t.perkText ? `<small class="perk">${esc(t.perkText)}</small>` : ''}
                ${t.kind === 'special' && !t.earned ? `<div class="bar"><i style="width:${Math.round(t.have / t.need * 100)}%"></i></div><small>${t.have} / ${t.need}</small>` : ''}</span>
                ${on ? '<span class="tt-on">Wearing</span>' : t.earned && (t.kind !== 'level' || t.id === T.levelNow.id) ? `<button type="button" class="btn tt-wear" data-wear="${esc(t.id)}">Wear</button>` : ''}</div>`;
        }).join('') : '<p class="tt-lead" style="padding:12px 0">No quest titles yet. Some quests give one when you finish a part of them.</p>';
    };
    document.addEventListener('click', (e) => {
        const tb = e.target.closest('.tt-tabs [data-tab]');
        if (tb) { tab = tb.dataset.tab; render(); return; }
        const w = e.target.closest('[data-wear]');
        if (w) {
            const t = Vault.wearTitle(w.dataset.wear);
            if (t && typeof Toast !== 'undefined') Toast.show(`🏅 You are now ${t.name}.`, 'positive');
            render();
            if (typeof AppShell !== 'undefined' && AppShell.refresh) AppShell.refresh();
        }
    });
    render();
    if (typeof Waggle !== 'undefined') Waggle.setActions(typeof baseWaggleActions === 'function' ? baseWaggleActions() : []);
});
