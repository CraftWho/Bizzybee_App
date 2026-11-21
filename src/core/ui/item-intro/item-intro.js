// New item intros (Nov 21 2026, Craft: "no guide or tutorial popped up after
// purchase or pressing it. It should introduce new items to the user and how
// to use it").
// - Buy something with an intro below: a card says what it is and how to use it.
//   "Show me" opens its page and Eve points at each part, one by one.
// - Open that page for the first time while owning it (even if it was bought
//   before this update) and the walk-through starts by itself, once.
// - Seen intros live in the save (hints.items), so they show once per hive.
// Loaded on every app page next to hints.js (app.js loadHints).
// To add one: an entry in INTROS (page = file name without .html, tour = steps).
const ItemIntro = (() => {
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const base = () => { const i = location.pathname.indexOf('/src/'); return i >= 0 ? location.pathname.slice(0, i) : ''; };
    const INTROS = {
        incubator: {
            icon: '🥚', title: 'Egg Incubator', owned: () => Vault.isPluginEnabled && Vault.isPluginEnabled('incubator'),
            what: 'Eggs inside hatch faster as you walk. It also opens your Steps page.',
            how: ['Put eggs in: open the incubator and tap Put in next to an egg.', 'Walk. Each step goal takes a day off every egg inside, up to a cap each day.', 'Finished dailies count too: every 4 take a day off.', 'Tap Steps on Home anytime to check on it and see your Step stats.'],
            page: 'incubator', href: 'src/plugins/incubator/incubator.html',
            tour: [
                { sel: '#ic-machine', text: 'Your incubator. Eggs inside hatch faster. Tap an egg to see its days left or take it out.' },
                { sel: '#ic-today', text: 'Today\'s progress. Each step goal takes 1 day off every egg inside. 4 finished dailies count as 1 too.' },
                { sel: '#ic-waiting', text: 'Eggs from pulls and level-ups wait here. Tap Put in to move one into a free slot.' },
                { sel: '#ic-strip', text: 'Your steps today, your goal streak and the XP your walking earned.' },
                { sel: '#steps summary', text: 'Open Step stats for today by hour, your streak calendar, history, records and your step goal.' },
                { sel: '#ic-shop', text: 'Better incubators hold more eggs and give hatchlings a head start. You keep every one you buy.' },
            ] },
        'queens-whistle': {
            icon: '📯', title: "Queen's Whistle", owned: () => Vault.ownsUnlock && Vault.ownsUnlock('queens-whistle'),
            what: 'Auto-swap: your hive swaps tired bees out and rested bees back in by itself.',
            how: ['Open Hive Life.', 'Turn on Auto-swap at the top.', 'Set Swap below and Return at with the sliders.'],
            page: 'hive-mind', href: 'src/features/hive-mind/hive-mind.html',
            tour: [{ sel: '.hl-auto', text: 'Auto-swap lives here. Turn it on, then set when bees swap out and when they come back.' }] },
        'honey-balm': {
            icon: '🍯', title: 'Honey Balm', owned: () => Vault.ownsUnlock && Vault.ownsUnlock('honey-balm'),
            what: 'A one-time rescue for your whole hive.',
            how: ['Nothing to do. It waits in your hive.', 'The first time any bee or your Queen would faint, it heals everyone to full.'] },
        held: {
            icon: '🎒', title: 'Items bees hold',
            what: 'Rare and better bees can hold one item. Food and healing get used when needed. Gear stays on.',
            how: ['Open Hive Bees and tap a Rare or better bee.', 'Tap Give and pick the item.'],
            page: 'hive-bees', href: 'src/features/hive-bees/hive-bees.html',
            tour: [{ sel: '.cb-tile, .row[data-bee]', text: 'Tap a Rare or better bee, then Give to hand it an item.' }] },
    };
    const seen = () => { const h = Vault.state.hints || (Vault.state.hints = {}); if (!h.items || typeof h.items !== 'object') h.items = {}; return h.items; };
    const pageName = () => (location.pathname.split('/').pop() || '').replace('.html', '');
    // Other pop-ups first (Start My Day, What's New, daily bonus, permission cards...): wait until they close.
    const BUSY = '.ds-scrim, .wn-scrim, .ss-scrim, .pm-scrim, .dbn-scrim, .lvr, .gfx.on, dialog[open]';
    const whenClear = (fn, tries = 0) => { if (document.querySelector(BUSY) && tries < 400) setTimeout(() => whenClear(fn, tries + 1), 700); else fn(); };

    function bubble(html, buttons) {
        document.querySelectorAll('.hn-eve-pop').forEach(x => x.remove());
        const b = document.createElement('div');
        b.className = 'hn-eve-pop';
        b.innerHTML = `<span class="hn-eve-hex" aria-hidden="true">👑</span><div><b class="hn-eve">EVE</b><p>${html}</p><div class="hn-eve-btns">${buttons.map(([k, t, gold]) => `<button type="button" data-k="${k}"${gold ? ' class="gold"' : ''}>${esc(t)}</button>`).join('')}</div></div>`;
        document.body.appendChild(b);
        return b;
    }

    // The "you got something new" card.
    function card(id, opts = {}) {
        if (document.querySelector(BUSY)) { whenClear(() => card(id, opts)); return; }
        const { after } = opts;
        const I = INTROS[id]; if (!I) return;
        document.querySelectorAll('.ii-scrim').forEach(x => x.remove());
        const s = document.createElement('div');
        s.className = 'ii-scrim';
        s.innerHTML = `<div class="ii-card" role="dialog" aria-modal="true" aria-labelledby="ii-t">
            <div class="ii-ic" aria-hidden="true">${I.icon}</div><small class="ii-new">NEW</small><h3 id="ii-t">${esc(I.title)}</h3>
            <p>${esc(I.what)}</p><b class="ii-how">How to use it</b><ol>${I.how.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
            <div class="ii-btns">${I.page ? '<button type="button" data-k="later">Later</button><button type="button" class="gold" data-k="show">Show me</button>' : '<button type="button" class="gold" data-k="ok">Got it</button>'}</div></div>`;
        document.body.appendChild(s);
        const done = () => { s.remove(); if (after) after(); };
        s.onclick = (e) => {
            const k = e.target.closest('[data-k]'); if (!k) return;
            seen()[id] = 'card'; Vault.save();
            if (k.dataset.k === 'show') { location.href = `${base()}/${I.href}?intro=${encodeURIComponent(id)}`; return; }
            if (k.dataset.k === 'later' && typeof Toast !== 'undefined') Toast.show('📘 Its page shows you around the first time you open it.', 'neutral');
            done();
        };
        const first = s.querySelector('.gold'); if (first) first.focus();
    }

    // Eve walks through the page, pointing at each part.
    function tour(id) {
        const I = INTROS[id]; if (!I || !I.tour) return;
        const steps = I.tour.slice();
        let i = 0;
        const next = () => {
            const st = steps[i];
            if (!st) return;
            if (document.querySelector(BUSY)) { whenClear(next); return; }
            document.querySelectorAll('.hn-tip').forEach(x => x.remove());
            const el = document.querySelector(st.sel);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('bb-focus'); void el.offsetWidth; el.classList.add('bb-focus'); }
            const last = i === steps.length - 1;
            const b = bubble(`<b>${esc(I.title)}</b> · ${i + 1} of ${steps.length}<br>${esc(st.text)}`, last ? [['ok', 'Got it', true]] : [['skip', 'Skip'], ['next', 'Next', true]]);
            b.onclick = (e) => {
                const k = e.target.closest('[data-k]'); if (!k) return;
                b.remove(); if (el) el.classList.remove('bb-focus');
                if (k.dataset.k === 'next') { i++; next(); return; }
                if (k.dataset.k === 'skip' && typeof Toast !== 'undefined') Toast.show('📘 It\'s in the Guide whenever you want it.', 'neutral');
            };
        };
        seen()[id] = 'tour'; Vault.save();
        document.querySelectorAll('.hn-tip').forEach(x => x.remove());   // the page's own tips wait
        setTimeout(next, 700);
    }

    // Call after a purchase. Shows the card once per hive.
    function bought(id, opts) {
        if (!INTROS[id] || !Vault.state || seen()[id]) { if (opts && opts.after) opts.after(); return false; }
        card(id, opts);
        return true;
    }

    async function start() {
        if (typeof Vault === 'undefined') return;
        await Vault.init();
        if (!Vault.state || document.body.classList.contains('ob-mode')) return;
        const q = new URLSearchParams(location.search).get('intro');
        if (q && INTROS[q] && INTROS[q].page === pageName()) { setTimeout(() => tour(q), 600); return; }
        // First visit to an owned item's page (also for things bought before this update).
        const id = Object.keys(INTROS).find(k => INTROS[k].page === pageName() && INTROS[k].tour && INTROS[k].owned && INTROS[k].owned() && seen()[k] !== 'tour');
        if (id && Vault.hintsOn && Vault.hintsOn()) setTimeout(() => tour(id), 1200);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    return { bought, card, tour, INTROS };
})();
if (typeof globalThis !== 'undefined') globalThis.ItemIntro = ItemIntro;
