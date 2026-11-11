// Gaming (Nov 11 2026, Craft): what your Steam Deck sends. Hours played and achievements
// turn into XP (see GAME_XP in db.js). Linking and unlinking happen here.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const body = document.getElementById('gm-body');
const hrs = (m) => (m < 600 ? (m / 60).toFixed(1) : Math.round(m / 60)) + ' h';

function render() {
    const G = Vault.getGaming(), games = Object.values(G.games || {}).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    document.getElementById('gm-xp').textContent = G.xp || 0;
    const linked = Vault.deckLinked();
    document.getElementById('gm-sub').textContent = linked ? 'Steam Deck linked. Play, and BizzyBee notices.' : 'Not linked yet.';
    const how = `<section class="card"><h2>Link your Deck</h2><ol>
        <li>On the Deck, install the BizzyBee plugin in Decky.</li>
        <li>Open it and tap Link. A QR code shows.</li>
        <li>Scan it with this phone. Tap Link it.</li></ol></section>`;
    const rules = `<section class="card"><h2>How XP works</h2><p class="sub">2 XP per 30 minutes played (up to 20 a day). 10 XP per achievement (up to 50 a day). Hours from before you linked do not count.</p>
        ${linked ? '<button type="button" class="btn danger" id="gm-unlink">Unlink Deck</button>' : ''}</section>`;
    const list = games.length ? `<section class="card"><h2>Games</h2>${games.map(g => {
        const pct = g.achTotal ? Math.round(g.ach / g.achTotal * 100) : 0;
        return `<div class="game"><b>${esc(g.name)}</b><span class="hrs">${hrs(g.minutes || 0)}</span>${g.achTotal ? `<div class="bar"><i style="width:${pct}%"></i></div><small>🏆 ${g.ach}/${g.achTotal}</small>` : ''}</div>`;
    }).join('')}</section>` : (linked ? '<section class="card"><p class="sub">No games yet. They show up after the Deck syncs.</p></section>' : '');
    body.innerHTML = (linked ? '' : how) + list + rules;
    const u = document.getElementById('gm-unlink');
    if (u) u.onclick = async () => {
        if (u.dataset.sure !== '1') { u.dataset.sure = '1'; u.textContent = 'Tap again to unlink'; return; }
        try { await CloudSyncAuto.request('deck', { action: 'unlink' }); } catch {}
        Vault.setDeckLinked(false); render();
    };
}
const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('gaming');
document.getElementById('gm-not-installed').hidden = installed;
document.getElementById('gm-main').hidden = !installed;
if (installed) { render(); window.addEventListener('vault-saved', render); }
