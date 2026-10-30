console.log("/// INVENTORY PROTOCOLS INITIALIZED ///");

// Inventory v2 (Oct 2026, approved demo). Same look as Settings
// (page-v2.css). Three tabs of hex tiles - Materials, Evolution and
// Store - and a bottom sheet with each item's details. Items are still
// used from a bee's card (Colony Bees page); this page only shows what you
// have. The old roster modal + Cover Flow moved out: Colony Bees is its
// own page now (../colony-bees/).
const INV_TABS = {
    materials: { label: 'Materials', hint: 'Foragers bring these back when you finish tasks and dailies. Quests give more.' },
    evolution: { label: 'Evolution', hint: "Rare finds from quests. Use them from a bee's card on the Colony Bees page." },
    store: { label: 'Store', hint: "Bought at the Honey Store. Tap one to use, sell or gift it. Faded = you have none." },
    // Oct 30 2026 (Craft): tickets as cards.
    tickets: { label: 'Tickets', hint: 'Spend tickets in the Pollination Chamber to pull new bees. You earn them by leveling up and from the Daily bonus.' }
};
const INV_TAB_KEY = 'bizzybee_inventory_tab';
let invTab = 'materials';
try { if (INV_TABS[localStorage.getItem(INV_TAB_KEY)]) invTab = localStorage.getItem(INV_TAB_KEY); } catch { /* storage off */ }

function invEntries(tab) {
    if (tab === 'materials') {
        const owned = Vault.getMaterials();
        return MATERIAL_CATALOG.map(e => ({ ...e, count: owned[e.id] || 0 }));
    }
    const items = Vault.getItems();
    if (tab === 'evolution') {
        const frags = Vault.getFragments();
        const need = typeof FRAGMENTS_REQUIRED !== 'undefined' ? FRAGMENTS_REQUIRED : 5;
        return EVOLUTION_ITEM_CATALOG.map(e => e.isFragment
            ? { ...e, count: frags[e.id] || 0, badge: `${frags[e.id] || 0}/${need}` }
            : { ...e, count: items[e.id] || 0 });
    }
    if (tab === 'tickets') {
        const n = Vault.getTicketCount ? Vault.getTicketCount() : 0;
        return [{ id: 'ticket', icon: '🎟️', label: 'Pollination ticket', rarity: 'Rare', count: n, ticket: true,
            description: `Pull a new bee in the Pollination Chamber. You have ${n}.` }];
    }
    return STORE_ITEM_CATALOG.map(e => ({ ...e, count: items[e.id] || 0 }));
}

function renderInventory() {
    const esc = PV2.esc;
    document.getElementById('inv-tabs').innerHTML = Object.entries(INV_TABS).map(([key, t]) => {
        const have = invEntries(key).filter(e => e.count > 0).length;
        return `<button type="button" class="chip" data-tab="${key}" aria-pressed="${key === invTab}">${t.label}<small>${have}</small></button>`;
    }).join('');
    const list = invEntries(invTab);
    if (invTab === 'tickets') {
        const n = list[0].count;
        document.getElementById('inv-grid').innerHTML = n ? Array.from({ length: Math.min(n, 12) }, (_, i) => `<button type="button" class="inv-ticket" data-i="0" style="--i:${i}" aria-label="Pollination ticket"><span>🎟️</span><b>POLLINATION</b><small>TICKET · ${String(i + 1).padStart(2, '0')}</small></button>`).join('')
            + (n > 12 ? `<p class="note">+ ${n - 12} more</p>` : '') : '<p class="note">No tickets right now.</p>';
        document.getElementById('inv-grid').className = 'inv-tickets';
        document.getElementById('inv-hint').textContent = INV_TABS[invTab].hint;
        return;
    }
    document.getElementById('inv-grid').className = 'tiles';
    document.getElementById('inv-grid').innerHTML = list.map((e, i) => `
        <button type="button" class="tile r-${esc(e.rarity || 'Common')}${e.count ? '' : ' zero'}" data-i="${i}" aria-label="${esc(e.label)}, you have ${e.badge || e.count}">
            <span class="n">${e.badge || '×' + e.count}</span><span class="hx">${e.icon}</span><b>${esc(e.label)}</b>
        </button>`).join('');
    document.getElementById('inv-hint').textContent = INV_TABS[invTab].hint;
}

function renderInventoryTop() {
    const m = Vault.getMaterials();
    const tickets = Vault.getTicketCount ? Vault.getTicketCount() : 0;
    document.getElementById('inv-stats').innerHTML = `
        <div><b>🌼 ${m.pollen || 0}</b><small>Pollen</small></div>
        <div><b>🍯 ${m['honey-drop'] || 0}</b><small>Honey Drops</small></div>
        <div><b>🎟️ ${tickets}</b><small>Tickets</small></div>`;
    const bees = Vault.getColonyBees();
    const eggs = bees.filter(b => typeof beeIsBrood === 'function' && beeIsBrood(b)).length;
    const idle = bees.filter(b => b.rarity !== 'Royal' && !b.class && !(typeof beeIsBrood === 'function' && beeIsBrood(b))).length;
    document.getElementById('inv-bee-summary').textContent = [
        `${bees.length - eggs} bee${bees.length - eggs === 1 ? '' : 's'}`,
        eggs ? `${eggs} egg${eggs === 1 ? '' : 's'}` : '',
        idle ? `${idle} need${idle === 1 ? 's' : ''} a job` : ''
    ].filter(Boolean).join(' · ');
}

// Oct 30 2026 (Craft): sell (half price) and gift (held items, to friends).
function invSellBox(entry, qty) {
    const each = Vault.sellValue(entry.id);
    if (!each || !entry.count || entry.kind === 'identity') return '';
    const n = Math.max(1, Math.min(qty, entry.count));
    return `<div class="inv-sell"><b>Sell</b><div class="hs-qty" role="group" aria-label="How many to sell">
        <button type="button" data-sq="-1" ${n <= 1 ? 'disabled' : ''} aria-label="One less">−</button>
        <output><b>${n}</b><small>of ${entry.count}</small></output>
        <button type="button" data-sq="1" ${n >= entry.count ? 'disabled' : ''} aria-label="One more">＋</button></div>
        <button type="button" class="btn" data-sell="${n}">Sell for 🪙 ${each * n}</button></div>`;
}
function invGiftBox(entry) {
    if (entry.kind !== 'held' || !entry.count) return '';
    const fr = (typeof Social !== 'undefined' && Social.cachedFriends && (Social.cachedFriends() || {}).list) || [];
    const ok = fr.filter(f => f.status === 'ok');
    return `<div class="inv-gift"><b>🎁 Gift one to a friend</b>${ok.length
        ? `<div class="chips">${ok.map(f => `<button type="button" class="chip" data-gift="${PV2.esc(f.code)}">${PV2.esc((f.card && f.card.owner) || f.code)}</button>`).join('')}</div>`
        : `<small>Add friends in <a href="../friends/friends.html">Friends' hives</a> to send gifts.</small>`}</div>`;
}
function openInventoryItem(entry, sellQty = 1) {
    if (entry.ticket) { location.href = '../gacha/gacha.html'; return; }
    const esc = PV2.esc;
    const color = `var(--${entry.rarity || 'Common'})`;
    const actions = invTab === 'materials' || entry.kind === 'charm' ? ''
        : `<div class="btns">
            <a class="btn solid" href="../colony-bees/colony-bees.html">🐝 Use on a bee…</a>
            ${invTab === 'store' ? '<a class="btn" href="../honey-store/honey-store.html">🛒 Honey Store</a>' : ''}
          </div>`;
    PV2.sheet(`
        <div class="head"><span class="hx big r-${esc(entry.rarity || 'Common')}">${entry.icon}</span>
            <div><h2>${esc(entry.label)}</h2><small style="color:${color}">${esc(entry.rarity || '')}</small> <small>· you have ${entry.badge || entry.count}</small></div>
            <button type="button" class="x" data-close aria-label="Close">×</button></div>
        <p>${esc(entry.description)}</p>
        ${entry.price ? `<p>Costs ${entry.price.amount} ${entry.price.currency === 'coins' ? '🪙 Honey coins' : esc((MATERIAL_CATALOG.find(m => m.id === entry.price.materialId) || {}).label || entry.price.materialId)} at the Honey Store.</p>` : ''}
        ${invTab === 'evolution' ? "<p>Open a bee's card and tap its item buttons to use this.</p>" : ''}
        ${actions}${invSellBox(entry, sellQty)}${invGiftBox(entry)}`, entry.label);
    const box = document.querySelector('.pv2-sheet');
    if (!box) return;
    box.querySelectorAll('[data-sq]').forEach(b => b.addEventListener('click', () => openInventoryItem(entry, sellQty + Number(b.dataset.sq))));
    const sell = box.querySelector('[data-sell]');
    if (sell) sell.addEventListener('click', () => {
        if (sell.dataset.armed !== '1') { sell.dataset.armed = '1'; sell.textContent = 'Tap again to sell'; return; }
        const r = Vault.sellOwned(entry.id, Number(sell.dataset.sell));
        if (r) Toast.show(`🪙 Sold ${r.n} ${entry.label} for ${r.coins} coins.`, 'positive');
        PV2.close(); renderInventoryTop(); renderInventory();
    });
    box.querySelectorAll('[data-gift]').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await Social.gift(b.dataset.gift, entry.id); Toast.show(`🎁 Sent a ${entry.label} to ${b.textContent}!`, 'positive'); PV2.close(); }
        catch (e) { Toast.show(e.message || 'That gift didn\'t send.', 'negative'); b.disabled = false; }
        renderInventory();
    }));
}

// Gifts waiting for you (checked at most every 15 min, needs the cloud account).
async function renderGifts(force) {
    const el = document.getElementById('inv-gifts');
    if (!el || typeof Social === 'undefined' || !Social.gifts) return;
    let list = null;
    try { const c = JSON.parse(sessionStorage.getItem('bizzybee_gifts') || 'null'); if (!force && c && Date.now() - c.at < 15 * 60000) list = c.list; } catch { /* storage off */ }
    if (!list) {
        try { list = await Social.gifts(); sessionStorage.setItem('bizzybee_gifts', JSON.stringify({ at: Date.now(), list })); } catch { el.hidden = true; return; }
    }
    el.hidden = !list.length;
    el.innerHTML = list.map(g => { const it = STORE_ITEM_CATALOG.find(i => i.id === g.item) || { icon: '🎁', label: g.item };
        return `<div class="row"><span class="hx">${it.icon}</span><span class="mid"><b>${PV2.esc(it.label)}</b><small>A gift from ${PV2.esc(g.from)}</small></span><button type="button" class="btn" data-accept="${PV2.esc(g.id)}">Accept</button></div>`; }).join('');
    el.onclick = async (e) => {
        const b = e.target.closest('[data-accept]'); if (!b) return;
        b.disabled = true;
        try { const r = await Social.acceptGift(b.dataset.accept); Toast.show(`🎁 Got a gift from ${r.from}!`, 'positive'); }
        catch (x) { Toast.show(x.message, 'negative'); }
        try { sessionStorage.removeItem('bizzybee_gifts'); } catch { /* storage off */ }
        renderGifts(true); renderInventory();
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    // Old links (Waggle, Hive Mind) pointed at #colony-bees here.
    if (window.location.hash === '#colony-bees') {
        window.location.replace('../colony-bees/colony-bees.html');
        return;
    }

    renderInventoryTop();
    renderInventory();
    setTimeout(renderGifts, 1500);   // Oct 30 2026 (Craft): after cloud sign-in is ready
    document.getElementById('inv-tabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]');
        if (!b) return;
        invTab = b.dataset.tab;
        try { localStorage.setItem(INV_TAB_KEY, invTab); } catch { /* storage off */ }
        renderInventory();
    });
    document.getElementById('inv-grid').addEventListener('click', (e) => {
        const t = e.target.closest('[data-i]');
        if (t) openInventoryItem(invEntries(invTab)[Number(t.dataset.i)]);
    });

    Waggle.setActions(baseWaggleActions());
});
