// Egg Incubator (Oct 28 2026, approved demo). Oct 29: not a plugin any more;
// incubators are bought in the Honey Store. This page shows yours. The rules live in
// db.js (INCUBATORS, Vault.getIncubator / buyIncubator / incubatorAdd ...).
// This page draws the machine with your real eggs, today's progress, the
// eggs waiting in the Nursery, and the incubator store.
const isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nurses = () => (typeof Vault._workers === 'function' ? Vault._workers('nurse').length : 0);
const daysLeft = (bee) => (typeof broodDaysLeft === 'function' ? broodDaysLeft(bee, todayISO(), nurses()) : 0);
const eggArt = (bee) => (typeof EggDesign !== 'undefined' ? EggDesign.forBee(bee) : '🥚');
const PERKS = (T) => [
    `${T.slots} egg slot${T.slots > 1 ? 's' : ''}`,
    `1 day off per ${T.goal.toLocaleString()} steps`,
    `Up to ${T.cap} days off a day`,
    T.full && T.happy ? 'Hatchlings start happy and full' : T.full ? 'Hatchlings start full (no hunger)' : null,
    T.trait ? `+${Math.round(T.trait * 100)}% birth trait chance` : null,
].filter(Boolean);

function render() {
    if (typeof Vault.incubatorTick === 'function' && Vault.incubatorTick()) Vault.save();
    const I = Vault.getIncubator();
    const T = I.info, d = I.today;
    $('ic-coins').textContent = I.coins.toLocaleString();
    $('ic-steps').textContent = isApp ? (d.steps || 0).toLocaleString() : '—';
    $('ic-eggs').textContent = I.slots.length + I.waiting.length;

    // the machine
    $('ic-name').textContent = T ? T.label.toUpperCase() : 'NO INCUBATOR YET';
    $('ic-tier').textContent = T ? `${T.icon} TIER ${INCUBATOR_ORDER.indexOf(I.tier) + 1}` : '🔒 BUY ONE BELOW';
    const progress = !T ? 0 : d.off >= d.cap ? 1 : isApp ? (d.steps % T.goal) / T.goal : (d.dailies % INCUBATOR_DAILIES) / INCUBATOR_DAILIES;
    $('ic-machine').innerHTML = IncubatorArt.svg({ tier: I.tier, progress, eggs: I.slots.map(b => ({ bee: b, days: daysLeft(b) })) });

    // today
    const pct = Math.round(progress * 100);
    const ring = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="#2a2010" stroke-width="5"/><circle cx="20" cy="20" r="16" fill="none" stroke="${d.off >= d.cap && T ? '#3ddc84' : '#ffcc00'}" stroke-width="5" stroke-linecap="round" stroke-dasharray="100.5" stroke-dashoffset="${(100.5 * (1 - progress)).toFixed(1)}" transform="rotate(-90 20 20)"/><text x="20" y="24" text-anchor="middle" font-size="10" fill="#ffcc00" font-weight="800">${T ? `${d.off}/${d.cap}` : '–'}</text></svg>`;
    let text;
    if (!T) text = `<b>Get an incubator</b><small>Eggs take 7 days on their own. An incubator speeds them up with your steps.</small><small><a href="../honey-store/honey-store.html#incubators">Buy one in the Honey Store ›</a></small>`;
    else if (d.off >= d.cap) text = `<b class="ok">Done for today ✓</b><small>${d.cap} days off every egg inside. Come back tomorrow.</small>`;
    else if (isApp) text = `<b>${(d.steps || 0).toLocaleString()} steps today</b><small>${d.toNext.toLocaleString()} more steps for 1 day off every egg.</small><small>Or ${d.dailiesToNext} more finished ${d.dailiesToNext === 1 ? 'daily' : 'dailies'}.</small>`;
    else text = `<b>${d.dailies} ${d.dailies === 1 ? 'daily' : 'dailies'} done today</b><small>${d.dailiesToNext} more for 1 day off every egg.</small><small>The Android app adds your steps too.</small>`;
    $('ic-today').innerHTML = ring + `<div>${text}</div>`;

    // eggs waiting
    const free = T ? T.slots - I.slots.length : 0;
    $('ic-waiting').innerHTML = I.waiting.length ? I.waiting.map(b => {
        const n = daysLeft(b);
        return `<div class="ic-row"><span class="egg">${eggArt(b)}</span><span class="mid"><b>Unknown egg</b><small>Hatches ${n <= 0 ? 'tonight' : n === 1 ? 'tomorrow' : `in ${n} days`}</small></span>
            <button type="button" class="ic-btn gold" data-add="${esc(b.id)}" ${free > 0 ? '' : 'disabled'}>${T ? (free > 0 ? 'Put in' : 'Full') : 'No incubator'}</button></div>`;
    }).join('') : `<p class="ic-empty">No eggs waiting. New bees from pulls and level-ups start as eggs.</p>`;

    // store
    $('ic-shop').innerHTML = INCUBATOR_ORDER.map(id => {
        const t = INCUBATORS[id], own = I.owned.includes(id), use = I.tier === id;
        const btn = use ? '<button type="button" class="ic-btn" disabled>In use</button>'
            : own ? `<button type="button" class="ic-btn" data-use="${id}">Use this one</button>`
            : `<a class="ic-btn gold" href="../honey-store/honey-store.html#incubators">In the Honey Store</a>`;
        return `<div class="ic-item${own ? ' owned' : ''}${use ? ' in-use' : ''}">${IncubatorArt.svg({ tier: id, mini: true, eggs: [] })}
            <div><h3 style="color:${id === 'royal' ? '#ff8fa3' : '#ffcc00'}">${t.icon} ${esc(t.label.toUpperCase())}</h3>
            <ul>${PERKS(t).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
            <div class="row"><span class="ic-price">${own ? '✓ Owned' : `🪙 ${t.price.toLocaleString()}`}</span>${btn}</div></div></div>`;
    }).join('');
}

function sheet(bee) {
    const n = daysLeft(bee);
    $('ic-sheet-body').innerHTML = `<div class="egg">${eggArt(bee)}</div><h3>UNKNOWN EGG</h3>
        <p>${n <= 0 ? 'Ready. It hatches tonight.' : `Hatches in ${n} day${n === 1 ? '' : 's'}. Walk or finish dailies to speed it up.`}<br>What's inside stays a secret until it hatches.</p>
        <div class="btns">${n <= 0 && Vault.isEggReady(bee) ? `<button type="button" class="ic-btn gold" data-hatch="${esc(bee.id)}">🐣 Hatch it</button>` : `<button type="button" class="ic-btn red" data-out="${esc(bee.id)}">Take it out</button>`}<button type="button" class="ic-btn${n <= 0 ? '' : ' gold'}" data-close>Close</button></div>`;
    $('ic-sheet').hidden = false;
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    $('ic-main').hidden = false;
    // Fresh steps first (Android app).
    if (isApp) {
        let tries = 0;
        const steps = async () => {
            if (typeof BizzyPhone === 'undefined') { if (++tries < 40) setTimeout(steps, 150); return; }
            await BizzyPhone.Steps.sync().catch(() => null);
            render();
        };
        steps();
    }
    render();

    document.body.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add]'), buy = e.target.closest('[data-buy]'), use = e.target.closest('[data-use]'), out = e.target.closest('[data-out]');
        if (add) {
            const r = Vault.incubatorAdd(add.dataset.add);
            Toast.show(r.ok ? '🥚 Egg is in the incubator. Keep walking.' : r.error, r.ok ? 'positive' : 'negative');
            render(); return;
        }
        if (buy) {
            const t = INCUBATORS[buy.dataset.buy];
            if (!confirm(`Buy the ${t.label} for ${t.price} Honey coins?`)) return;
            const r = Vault.buyIncubator(buy.dataset.buy);
            Toast.show(r.ok ? `${t.icon} ${t.label} is in your Nursery.` : r.error, r.ok ? 'positive' : 'negative');
            render(); if (r.ok) window.scrollTo({ top: 0, behavior: 'smooth' }); return;
        }
        if (use) { Vault.useIncubator(use.dataset.use); Toast.show(`${INCUBATORS[use.dataset.use].icon} Switched incubators.`, 'positive'); render(); return; }
        const hatch = e.target.closest('[data-hatch]');
        if (hatch) { $('ic-sheet').hidden = true; AppShell.hatch(hatch.dataset.hatch, render); return; }
        if (out) { Vault.incubatorRemove(out.dataset.out); $('ic-sheet').hidden = true; Toast.show('Egg moved back to the Nursery.', 'neutral'); render(); return; }
        if (e.target.closest('[data-close]') || e.target === $('ic-sheet')) { $('ic-sheet').hidden = true; return; }
        // Tap an egg in the machine.
        if (e.target.closest('#ic-machine')) {
            const I = Vault.getIncubator();
            if (!I.info) { document.getElementById('store').scrollIntoView({ behavior: 'smooth' }); return; }
            if (I.slots.length === 1) sheet(I.slots[0]);
            else if (I.slots.length > 1) {
                const box = $('ic-machine').getBoundingClientRect();
                const i = Math.min(I.slots.length - 1, Math.max(0, Math.floor((e.clientX - box.left) / box.width * I.info.slots)));
                if (I.slots[i]) sheet(I.slots[i]);
            }
        }
    });
    window.addEventListener('vault-saved', () => render());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
    if (typeof Waggle !== 'undefined' && typeof baseWaggleActions === 'function') Waggle.setActions(baseWaggleActions());
});
