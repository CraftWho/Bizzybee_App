// Guide (Oct 28 2026). Eve explains every feature. The list lives in
// core/ui/hints/hints.js (Hints.GUIDE); add an entry there for each new feature.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Oct 31 2026 (Craft): the Guide covers every feature and mechanic, so it
// is grouped by topic (each entry's `cat`). Search still looks at everything.
const CATS = ['Getting started', 'Tasks', 'XP & levels', 'Skills', 'Bees & eggs', 'Hive Mind', 'Store & items', 'Social', 'Plugins', 'App & settings', 'Account & saves'];
const item = (g, seen) => `<div class="gd-item"><span class="gd-ic" aria-hidden="true">${g.icon}</span>
        <span class="gd-mid"><b>${esc(g.title)}${g.intro && !seen.includes(g.id) ? '<span class="gd-new">NEW</span>' : read(g) ? '<span class="gd-read" title="You\'ve seen this">✓</span>' : ''}</b><small>${esc(g.text)} · v${esc(g.v)}</small></span>
        ${g.page ? `<a class="btn" href="${location.origin}${g.page}?guide=${encodeURIComponent(g.id)}">Show me</a>` : ''}</div>`;
// Nov 1 2026 (Craft): ✓ on features you've already been shown (Eve's intro,
// or that page's tips marked "Don't show again").
const read = (g) => Hints.seenGuide().includes(g.id) && (g.intro || (!!g.page && Vault.hintSeen(g.page.split('/').pop().replace('.html', ''))));
function render() {
    const q = (document.getElementById('gd-q').value || '').toLowerCase();
    const seen = Hints.seenGuide();
    const list = Hints.GUIDE.filter(g => (g.title + ' ' + g.text + ' ' + (g.cat || '')).toLowerCase().includes(q));
    const groups = [...CATS, ...new Set(list.map(g => g.cat || 'More').filter(c => !CATS.includes(c)))]
        .map(c => [c, list.filter(g => (g.cat || 'More') === c)]).filter(([, l]) => l.length);
    document.getElementById('gd-list').innerHTML = groups.length
        ? groups.map(([c, l]) => `<h2 class="gd-cat">${esc(c)} <small>${l.length}</small></h2>${l.map(g => item(g, seen)).join('')}`).join('')
        : '<p class="gd-empty">Nothing matches. Try another word.</p>';
}
// Tutorials (Nov 23 2026, Craft): finish a walk-through for a small reward, once.
function renderTuts(tries = 0) {
    const host = document.getElementById('gd-tuts');
    if (typeof ItemIntro === 'undefined') { if (tries < 40) setTimeout(() => renderTuts(tries + 1), 150); else host.closest('main').querySelectorAll('#gd-tuts, .gd-tuts-h').forEach(x => x.remove()); return; }
    const all = ItemIntro.list();
    const done = all.filter(t => t.done).length;
    document.getElementById('gd-tuts-n').textContent = `${done} of ${all.length} done`;
    const prize = (r) => [r.coins ? `${r.coins} coins` : '', r.pollen ? `${r.pollen} Pollen` : ''].filter(Boolean).join(' + ');
    host.innerHTML = all.map(t => `<div class="gd-item gd-tut${t.done ? ' done' : ''}"><span class="gd-ic" aria-hidden="true">${t.icon}</span>
        <span class="gd-mid"><b>${esc(t.title)}${t.done ? ' <span class="gd-read" title="Done">✓</span>' : ''}</b><small>${esc(t.tip || t.what || '')}</small><small class="gd-prize">🎁 ${t.done ? 'Reward collected' : prize(t.reward)}</small></span>
        ${t.done ? `<button type="button" class="btn" data-tut="${esc(t.id)}">Again</button>` : t.ready ? `<button type="button" class="btn gd-go" data-tut="${esc(t.id)}">Start</button>` : '<span class="gd-locked">Not yet</span>'}</div>`).join('');
    host.onclick = (e) => { const b = e.target.closest('[data-tut]'); if (b) ItemIntro.go(b.dataset.tut); };
}
async function start(tries = 0) {
    if (typeof Hints === 'undefined') { if (tries < 60) setTimeout(() => start(tries + 1), 100); return; }
    await Vault.init();
    render();
    renderTuts();
    document.getElementById('gd-q').addEventListener('input', render);
}
document.addEventListener('DOMContentLoaded', () => start());
