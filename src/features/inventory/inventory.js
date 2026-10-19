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
    store: { label: 'Store', hint: "Bought at the Honey Store. Each gives a bee a trait. Faded = you have none." }
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
    return STORE_ITEM_CATALOG.map(e => ({ ...e, count: items[e.id] || 0 }));
}

function renderInventory() {
    const esc = PV2.esc;
    document.getElementById('inv-tabs').innerHTML = Object.entries(INV_TABS).map(([key, t]) => {
        const have = invEntries(key).filter(e => e.count > 0).length;
        return `<button type="button" class="chip" data-tab="${key}" aria-pressed="${key === invTab}">${t.label}<small>${have}</small></button>`;
    }).join('');
    const list = invEntries(invTab);
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

function openInventoryItem(entry) {
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
        ${actions}`, entry.label);
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
