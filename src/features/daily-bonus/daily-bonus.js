// Daily bonus page (Oct 30 2026, Craft). Logic lives in db.js (DAILY BONUS).
document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const render = () => {
        const b = Vault.getDailyBonus();
        const chestsReady = b.chests.filter(c => c.ready).length;
        $('dbn-sub').textContent = `Day ${b.streak} of 7 in a row · ${b.got} claimed this month`;
        $('dbn-today').innerHTML = b.claimedToday
            ? `<span class="big">✓ Today's bonus is claimed</span><small>Come back tomorrow for day ${b.streak % 7 + 1}: ${esc(b.cycle[b.streak % 7].text)}</small>${chestsReady ? '<button type="button" class="btn dbn-claim" id="dbn-all">Claim all</button>' : ''}`
            : `<small>Day ${b.streak} reward</small><span class="big">${esc(b.rewardText)}</span><button type="button" class="btn dbn-claim" id="dbn-all">${chestsReady || b.chests.some(c => !c.taken && !c.lost && b.got + 1 >= c.need) ? 'Claim all' : 'Claim'}</button>`;
        const first = new Date(b.month + '-01T12:00:00').getDay();
        $('dbn-month').textContent = new Date(b.month + '-01T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        $('dbn-cal').innerHTML = '<span></span>'.repeat(first) + b.cells.map(c => `<span class="dbn-cell ${c.state}" title="${c.iso}${c.state === 'cracked' ? ' · missed' : ''}">${c.day}</span>`).join('');
        $('dbn-chests').innerHTML = b.chests.map(c => `<div class="row"><span class="hx">${c.taken ? '✅' : c.lost ? '💔' : '🧰'}</span><span class="mid"><b>${esc(c.label)}</b><small>${esc(c.text)}${c.lost ? ' · not this month' : ''}</small>
            ${!c.taken && !c.lost ? `<div class="dbn-bar"><i style="width:${Math.min(100, Math.round(c.have / c.need * 100))}%"></i></div>` : ''}</span>
            ${c.ready ? `<button type="button" class="btn" data-chest="${c.id}">Open</button>` : `<span class="chev">${c.taken ? '' : `${c.have}/${c.need}`}</span>`}</div>`).join('');
        $('dbn-cycle').innerHTML = b.cycle.map(r => `<li class="${!b.claimedToday && r.i === b.step ? 'now' : ''}"><b>DAY ${r.i + 1}</b>${esc(r.text)}</li>`).join('');
    };
    document.addEventListener('click', (e) => {
        if (e.target.closest('#dbn-all')) {
            const got = Vault.claimAllBonus();
            if (got.length && typeof Toast !== 'undefined') Toast.show(`🎁 ${got.join('  +  ')}`, 'positive');
            render(); window.dispatchEvent(new Event('daily-bonus-claimed'));
        }
        const c = e.target.closest('[data-chest]');
        if (c) { const r = Vault.claimBonusChest(c.dataset.chest); if (r && typeof Toast !== 'undefined') Toast.show(`🧰 ${r.label}: ${r.text}`, 'positive'); render(); }
    });
    render();
    if (typeof Waggle !== 'undefined') Waggle.setActions(typeof baseWaggleActions === 'function' ? baseWaggleActions() : []);
});
