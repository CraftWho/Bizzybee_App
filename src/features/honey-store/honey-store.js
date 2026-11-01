console.log("/// HONEY STORE PROTOCOLS INITIALIZED ///");

// Honey Store v2 (Oct 2026, same look as Settings/Inventory - page-v2.css).
// STORE_ITEM_CATALOG lives in db.js (trait items + the Identity Card).
// Purchases spend materials and land in state.inventory.items. Items are
// used from a bee's card on the Hive Bees page - this page only sells.
// Tap an item for its details and the Buy button.

function hsMat(id) { return MATERIAL_CATALOG.find(m => m.id === id) || { icon: '', label: id }; }
// What an item costs and how much of that you have (materials, or Honey
// coins for the Streak Charm).
function hsPrice(item) {
    if (item.price.currency === 'coins') return { icon: '🪙', label: 'Honey coins', have: Vault.getCoins() };
    const m = hsMat(item.price.materialId);
    return { icon: m.icon, label: m.label, have: Vault.getMaterials()[item.price.materialId] || 0 };
}
function hsAffordable(item) { return hsPrice(item).have >= item.price.amount; }

function renderWallet() {
    const m = Vault.getMaterials();
    document.getElementById('store-wallet-panel').innerHTML = `<div class="hs-coins"><b>🪙 ${Vault.getCoins()}</b><small>Honey coins</small></div>` + MATERIAL_CATALOG
        .map(mat => `<div><b>${mat.icon} ${m[mat.id] || 0}</b><small>${PV2.esc(mat.label)}</small></div>`).join('');
}

function renderIdentityCard() {
    const host = document.getElementById('store-identity-row');
    const list = STORE_ITEM_CATALOG.filter(i => i.kind === 'identity' || i.kind === 'charm');
    if (!list.length) { host.hidden = true; return; }
    host.innerHTML = list.map(item => {
        const p = hsPrice(item);
        const owned = Vault.getItems()[item.id] || 0;
        return `<button type="button" class="row" data-item="${item.id}">
        <span class="hx big r-${PV2.esc(item.rarity || 'Rare')}">${item.icon}</span>
        <span class="mid"><b>${PV2.esc(item.label)}</b><small>${p.icon} ${item.price.amount} ${PV2.esc(p.label)}${owned ? ` · you have ${owned}` : ''}</small></span>
        <span class="chev">›</span></button>`;
    }).join('');
}

function renderItemGrid() {
    const items = Vault.getItems();
    const held = document.getElementById('store-held-grid');
    if (held) held.innerHTML = STORE_ITEM_CATALOG.filter(i => i.kind === 'held').map(item => {
        const mat = hsMat(item.price.materialId);
        return `<button type="button" class="tile r-${PV2.esc(item.rarity || 'Common')}${hsAffordable(item) ? '' : ' hs-cant'}" data-item="${item.id}" aria-label="${PV2.esc(item.label)}, costs ${item.price.amount} ${PV2.esc(mat.label)}">
            ${items[item.id] ? `<span class="n">×${items[item.id]}</span>` : ''}
            <span class="hx">${item.icon}</span><b>${PV2.esc(item.label)}</b><span class="hs-price">${mat.icon} ${item.price.amount}</span></button>`;
    }).join('');
    document.getElementById('store-item-grid').innerHTML = STORE_ITEM_CATALOG.filter(i => i.kind === 'trait').map(item => {
        const mat = hsMat(item.price.materialId);
        return `<button type="button" class="tile r-${PV2.esc(item.rarity || 'Common')}${hsAffordable(item) ? '' : ' hs-cant'}" data-item="${item.id}" aria-label="${PV2.esc(item.label)}, costs ${item.price.amount} ${PV2.esc(mat.label)}">
            ${items[item.id] ? `<span class="n">×${items[item.id]}</span>` : ''}
            <span class="hx">${item.icon}</span><b>${PV2.esc(item.label)}</b><span class="hs-price">${mat.icon} ${item.price.amount}</span></button>`;
    }).join('');
}

function openStoreItem(id) {
    const item = STORE_ITEM_CATALOG.find(i => i.id === id);
    if (!item) return;
    const mat = hsPrice(item);
    const have = mat.have;
    const owned = Vault.getItems()[item.id] || 0;
    const ok = hsAffordable(item);
    const box = PV2.sheet(`
        <div class="head"><span class="hx big r-${PV2.esc(item.rarity || 'Common')}">${item.icon}</span>
            <div><h2>${PV2.esc(item.label)}</h2><small style="color:var(--${PV2.esc(item.rarity || 'Common')})">${PV2.esc(item.rarity || '')}</small> <small>· you have ${owned}</small></div>
            <button type="button" class="x" data-close aria-label="Close">×</button></div>
        <p>${PV2.esc(item.description)}</p>
        <p>Costs ${mat.icon} <b style="color:var(--ink)">${item.price.amount} ${PV2.esc(mat.label)}</b>. You have ${have}.</p>
        <div class="btns"><button type="button" class="btn solid" data-buy${ok ? '' : ' disabled'}>Buy</button>
            ${owned && item.kind !== 'charm' ? '<a class="btn" href="../hive-bees/hive-bees.html">🐝 Use on a bee…</a>' : ''}</div>
        ${ok ? '' : `<p>You need ${item.price.amount - have} more ${PV2.esc(mat.label)}. ${item.price.currency === 'coins' ? 'Every task you finish earns coins.' : 'Foragers bring materials back when you finish tasks.'}</p>`}`, item.label);
    const buy = box.querySelector('[data-buy]');
    if (buy) buy.addEventListener('click', () => handlePurchase(item.id));
}

function handlePurchase(itemId) {
    const result = Vault.purchaseStoreItem(itemId);
    if (!result) {
        if (typeof Toast !== 'undefined') Toast.show('Not enough materials for that yet.', 'negative');
        return;
    }
    if (typeof Toast !== 'undefined') Toast.show(result.item.kind === 'charm' ? `🎁 Bought a Streak Charm! It's used automatically on a missed streak.` : result.item.kind === 'held' ? `${result.item.icon} Made a ${result.item.label}! Give it to a Rare-or-better bee from its card.` : `${result.item.icon} Bought ${result.item.label}! Use it from a bee's card on Hive Bees.`, 'positive');
    renderAll();
    openStoreItem(itemId);
}

// Oct 31 2026 (Craft, from 1.0.7): Egg incubators, bought here with Honey coins.
// Buying one also turns the Egg Incubator page on (menu and Home).
function renderIncubators() {
    const host = document.getElementById('store-incubators');
    if (!host || typeof INCUBATORS === 'undefined' || typeof Vault.getIncubator !== 'function') return;
    const I = Vault.getIncubator();
    host.innerHTML = INCUBATOR_ORDER.map(id => {
        const t = INCUBATORS[id], own = I.owned.includes(id), use = I.tier === id, can = I.coins >= t.price;
        const perks = [`${t.slots} egg slot${t.slots > 1 ? 's' : ''}`, `1 day off per ${t.goal.toLocaleString()} steps`, `Up to ${t.cap} days off a day`,
            t.full && t.happy ? 'Hatchlings start happy and full' : t.full ? 'Hatchlings start full' : null, t.trait ? `+${Math.round(t.trait * 100)}% birth trait chance` : null].filter(Boolean);
        const btn = use ? '<a class="hs-inc-btn" href="../../plugins/incubator/incubator.html">In use · Open</a>'
            : own ? '<a class="hs-inc-btn" href="../../plugins/incubator/incubator.html">Owned · Open</a>'
            : `<button type="button" class="hs-inc-btn gold" data-inc="${id}" ${can ? '' : 'disabled'}>${can ? `Buy · 🪙 ${t.price.toLocaleString()}` : `🪙 ${t.price.toLocaleString()}`}</button>`;
        return `<div class="hs-inc-card${own ? ' owned' : ''}">${typeof IncubatorArt !== 'undefined' ? IncubatorArt.svg({ tier: id, mini: true, eggs: [] }) : '🥚'}
            <div class="mid"><b>${t.icon} ${t.label}</b><ul>${perks.map(x => `<li>${x}</li>`).join('')}</ul>${btn}</div></div>`;
    }).join('');
    host.onclick = (e) => {
        const b = e.target.closest('[data-inc]'); if (!b) return;
        const t = INCUBATORS[b.dataset.inc];
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = `Tap again to buy`; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; renderIncubators(); } }, 3000); return; }
        const r = Vault.buyIncubator(b.dataset.inc);
        if (r.ok && typeof Vault.setPluginEnabled === 'function' && !Vault.isPluginEnabled('incubator')) Vault.setPluginEnabled('incubator', true);
        Toast.show(r.ok ? `${t.icon} ${t.label} bought! Open it to put eggs inside.` : r.error, r.ok ? 'positive' : 'negative');
        renderAll();
    };
}

function renderAll() {
    renderIncubators();   // Oct 31 2026 (Craft)
    renderWallet();
    renderIdentityCard();
    renderItemGrid();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    renderAll();
    document.querySelector('.hs2').addEventListener('click', (e) => {
        const t = e.target.closest('[data-item]');
        if (t) openStoreItem(t.dataset.item);
    });
    Waggle.setActions(baseWaggleActions());
});
