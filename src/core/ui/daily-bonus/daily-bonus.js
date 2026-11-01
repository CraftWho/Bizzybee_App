// Daily bonus pop-up (Nov 1 2026, Craft, approved demo option A "7-day comb").
// Shows once a day, after Start My Day. Logic: Vault.getDailyBonus /
// claimDailyBonus (db.js). Miss a day and the week starts again at day 1.
const DailyBonus = (() => {
    let scrim = null;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function close() { if (scrim) { scrim.remove(); scrim = null; } }
    function week(info, gotNow) {
        return info.week.map((r, k) => {
            const got = k < info.day || (gotNow && k === info.day);
            return `<div class="dbn-day${got ? ' got' : ''}${k === info.day ? ' today' : ''}${k === 6 ? ' big' : ''}"><span>D${k + 1}</span><i>${got ? '✓' : r.icon}</i><span>${got ? '' : '×' + r.qty}</span></div>`;
        }).join('');
    }
    function open() {
        const info = typeof Vault.getDailyBonus === 'function' ? Vault.getDailyBonus() : null;
        if (!info || info.claimed || scrim) return;
        const r = info.week[info.day];
        scrim = document.createElement('div');
        scrim.className = 'dbn-scrim';
        scrim.innerHTML = `<div class="dbn-pop" role="dialog" aria-modal="true" aria-labelledby="dbn-t">
            <h2 id="dbn-t">DAILY BONUS · DAY ${info.day + 1}</h2>
            <p>Come back each day to move along the week. Day 7 is the big one.</p>
            <div class="dbn-week">${week(info, false)}</div>
            <div class="dbn-got" aria-live="polite"></div>
            <button type="button" class="dbn-go">Claim ${r.icon} ${r.qty} ${esc(r.name)}</button>
        </div>`;
        document.body.appendChild(scrim);
        const go = scrim.querySelector('.dbn-go');
        go.focus({ preventScroll: true });
        go.addEventListener('click', () => {
            if (go.dataset.done) { close(); return; }
            const got = Vault.claimDailyBonus();
            if (!got) { close(); return; }
            scrim.querySelector('.dbn-week').innerHTML = week(info, true);
            scrim.querySelector('.dbn-got').textContent = `+${got.qty} ${got.icon} ${got.name}`;
            go.textContent = got.day === 6 ? 'Week done! Close' : `Close · day ${got.day + 2} tomorrow`;
            go.dataset.done = '1';
            if (typeof AppShell !== 'undefined' && AppShell.refresh) AppShell.refresh();
        });
    }
    return { open, close };
})();
