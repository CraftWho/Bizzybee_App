console.log("/// HONEY STORE PROTOCOLS INITIALIZED ///");

// Honey Store v3 (Oct 30 2026, Craft). Same page-v2 look.
// - Currencies stay in the header; tabs (Held / Gear / Special / Incubators); search.
// - Items are rectangles (icon, name, what it does, price, how many you have).
// - Tap one: pick how many with − / ＋. It can't go past what you can afford.
// - Price table at the bottom, with what each sells for (Inventory sells at half).
// STORE_ITEM_CATALOG, buyStoreItems, maxAffordable, sellValue live in db.js.
const HS_TABS = {
    held: { label: 'Bees hold', icon: '🍯', hint: 'Rare and Epic bees hold 1 item, Legendary and Named hold 2. Give one from a bee\'s card on Colony Bees.', kinds: ['held'] },
    gear: { label: 'Trait gear', icon: '🧬', hint: 'Each gives a bee a trait, and a Common or Rare bee a shot at Epic.', kinds: ['trait'] },
    special: { label: 'Special', icon: '✨', hint: 'One-of-a-kind items.', kinds: ['identity', 'charm'] },
    incubators: { label: 'Incubators', icon: '🥚', hint: 'Eggs hatch faster inside, as you walk or finish dailies.', kinds: [] }
};
const HS_TAB_KEY = 'bizzybee_store_tab';
let hsTab = 'held';
try { if (HS_TABS[localStorage.getItem(HS_TAB_KEY)]) hsTab = localStorage.getItem(HS_TAB_KEY); } catch { /* storage off */ }

function hsMat(id) { return MATERIAL_CATALOG.find(m => m.id === id) || { icon: '', label: id }; }
function hsPrice(item) {
    if (item.price.currency === 'coins') return { icon: '🪙', label: 'Honey coins', have: Vault.getCoins() };
    const m = hsMat(item.price.materialId);
    return { icon: m.icon, label: m.label, have: Vault.getMaterials()[item.price.materialId] || 0 };
}
const hsShort = (t) => { const s = String(t || '').replace(/^Held\.\s*/, '').split(/(?<=[.!])\s/)[0]; return s.length > 90 ? s.slice(0, 88) + '…' : s; };

function renderWallet() {
    const m = Vault.getMaterials();
    document.getElementById('store-wallet-panel').innerHTML = `<span class="hs-cur gold">🪙 <b>${Vault.getCoins()}</b></span>` + MATERIAL_CATALOG
        .map(mat => `<span class="hs-cur" title="${PV2.esc(mat.label)}">${mat.icon} <b>${m[mat.id] || 0}</b></span>`).join('')
        + `<span class="hs-cur" title="Tickets">🎟️ <b>${Vault.getTicketCount ? Vault.getTicketCount() : 0}</b></span>`;
}

function renderList() {
    const q = (document.getElementById('hs-q').value || '').trim().toLowerCase();
    const items = Vault.getItems();
    // Searching looks through every tab.
    const list = STORE_ITEM_CATALOG.filter(i => q ? (i.label + ' ' + i.description).toLowerCase().includes(q) : HS_TABS[hsTab].kinds.includes(i.kind));
    document.getElementById('hs-tabs').innerHTML = Object.entries(HS_TABS).map(([k, t]) => `<button type="button" class="chip" data-tab="${k}" aria-pressed="${!q && k === hsTab}">${t.icon} ${t.label}</button>`).join('');
    document.getElementById('hs-hint').textContent = q ? `${list.length} match${list.length === 1 ? '' : 'es'} for "${q}"` : HS_TABS[hsTab].hint;
    document.getElementById('hs-inc-wrap').hidden = !!q || hsTab !== 'incubators';
    document.getElementById('hs-list').innerHTML = list.map(item => {
        const p = hsPrice(item), max = Vault.maxAffordable(item.id), own = items[item.id] || 0;
        return `<button type="button" class="hs-card r-${PV2.esc(item.rarity || 'Common')}${max ? '' : ' cant'}" data-item="${item.id}">
            <span class="hs-ic">${item.icon}</span>
            <span class="hs-mid"><b>${PV2.esc(item.label)}</b><small>${PV2.esc(hsShort(item.description))}</small>
                <span class="hs-meta"><i style="color:var(--${PV2.esc(item.rarity || 'Common')})">${PV2.esc(item.rarity || '')}</i>${own ? ` · you have ${own}` : ''}</span></span>
            <span class="hs-cost">${p.icon} ${item.price.amount}</span></button>`;
    }).join('') || (hsTab === 'incubators' && !q ? '' : '<p class="note">Nothing here. Try another word.</p>');
}

function renderPriceTable() {
    document.getElementById('hs-price-table').innerHTML = `<table class="hs-table"><thead><tr><th>Item</th><th>Costs</th><th>Sells for</th></tr></thead><tbody>${STORE_ITEM_CATALOG.map(i => {
        const p = hsPrice(i);
        return `<tr><td>${i.icon} ${PV2.esc(i.label)}</td><td>${p.icon} ${i.price.amount}</td><td>🪙 ${Vault.sellValue(i.id)}</td></tr>`;
    }).join('')}${MATERIAL_CATALOG.filter(m => Vault.sellValue(m.id)).map(m => `<tr class="mat"><td>${m.icon} ${PV2.esc(m.label)}</td><td>—</td><td>🪙 ${Vault.sellValue(m.id)}</td></tr>`).join('')}</tbody></table>
        <p class="note">Sell from your Inventory. Things sell for half what they're worth.</p>`;
}

function openStoreItem(id, qty = 1) {
    const item = STORE_ITEM_CATALOG.find(i => i.id === id);
    if (!item) return;
    const p = hsPrice(item), max = Vault.maxAffordable(id), own = Vault.getItems()[id] || 0;
    const n = Math.max(1, Math.min(qty, Math.max(1, max)));
    const box = PV2.sheet(`
        <div class="head"><span class="hx big r-${PV2.esc(item.rarity || 'Common')}">${item.icon}</span>
            <div><h2>${PV2.esc(item.label)}</h2><small style="color:var(--${PV2.esc(item.rarity || 'Common')})">${PV2.esc(item.rarity || '')}</small> <small>· you have ${own}</small></div>
            <button type="button" class="x" data-close aria-label="Close">×</button></div>
        <p>${PV2.esc(item.description)}</p>
        ${max ? `<div class="hs-qty" role="group" aria-label="How many">
            <button type="button" data-q="-1" ${n <= 1 ? 'disabled' : ''} aria-label="One less">−</button>
            <output aria-live="polite"><b>${n}</b><small>of ${max} you can afford</small></output>
            <button type="button" data-q="1" ${n >= max ? 'disabled' : ''} aria-label="One more">＋</button></div>
            <p class="hs-total">Total ${p.icon} <b>${item.price.amount * n} ${PV2.esc(p.label)}</b> · you have ${p.have}</p>` : ''}
        <div class="btns"><button type="button" class="btn solid" data-buy ${max ? '' : 'disabled'}>${max ? `Buy ${n}` : 'Can\'t afford yet'}</button>
            ${own && item.kind !== 'charm' ? '<a class="btn" href="../colony-bees/colony-bees.html">🐝 Use on a bee…</a>' : ''}</div>
        ${max ? '' : `<p>You need ${item.price.amount - p.have} more ${PV2.esc(p.label)}. ${item.price.currency === 'coins' ? 'Every task you finish earns coins.' : 'Foragers bring materials back when you finish tasks.'}</p>`}`, item.label);
    box.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => openStoreItem(id, n + Number(b.dataset.q))));
    const buy = box.querySelector('[data-buy]');
    if (buy && max) buy.addEventListener('click', () => {
        const r = Vault.buyStoreItems(id, n);
        if (!r) { Toast.show('Not enough for that yet.', 'negative'); return; }
        Toast.show(`${item.icon} Bought ${r.count} ${item.label}${r.count > 1 ? 's' : ''}!${item.kind === 'held' ? ' Give it to a Rare-or-better bee from its card.' : item.kind === 'charm' ? ' It\'s used automatically on a missed streak.' : ''}`, 'positive');
        renderAll(); openStoreItem(id, 1);
    });
}

// Egg incubators (Oct 29 2026): bought here with Honey coins (not a plugin).
function renderIncubators() {
    const host = document.getElementById('store-incubators');
    if (!host || typeof INCUBATORS === 'undefined' || typeof Vault.getIncubator !== 'function') return;
    const I = Vault.getIncubator();
    host.innerHTML = INCUBATOR_ORDER.map(id => {
        const t = INCUBATORS[id], own = I.owned.includes(id), use = I.tier === id, can = I.coins >= t.price;
        const perks = [`${t.slots} egg slot${t.slots > 1 ? 's' : ''}`, `1 day off per ${t.goal.toLocaleString()} steps`, `Up to ${t.cap} days off a day`,
            t.full && t.happy ? 'Hatchlings start happy and full' : t.full ? 'Hatchlings start full' : null, t.trait ? `+${Math.round(t.trait * 100)}% birth trait chance` : null].filter(Boolean);
        const btn = use ? '<a class="hs-inc-btn" href="../incubator/incubator.html">In use · Open</a>'
            : own ? '<a class="hs-inc-btn" href="../incubator/incubator.html">Owned · Open</a>'
            : `<button type="button" class="hs-inc-btn gold" data-inc="${id}" ${can ? '' : 'disabled'}>${can ? `Buy · 🪙 ${t.price.toLocaleString()}` : `🪙 ${t.price.toLocaleString()}`}</button>`;
        return `<div class="hs-inc-card${own ? ' owned' : ''}">${typeof IncubatorArt !== 'undefined' ? IncubatorArt.svg({ tier: id, mini: true, eggs: [] }) : '🥚'}
            <div class="mid"><b>${t.icon} ${t.label}</b><ul>${perks.map(x => `<li>${x}</li>`).join('')}</ul>${btn}</div></div>`;
    }).join('');
    host.onclick = (e) => {
        const b = e.target.closest('[data-inc]'); if (!b) return;
        const t = INCUBATORS[b.dataset.inc];
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = `Tap again to buy`; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; renderIncubators(); } }, 3000); return; }
        const r = Vault.buyIncubator(b.dataset.inc);
        Toast.show(r.ok ? `${t.icon} ${t.label} bought! Open it to put eggs inside.` : r.error, r.ok ? 'positive' : 'negative');
        renderAll();
    };
}

function renderAll() {
    renderWallet();
    renderList();
    renderIncubators();
    renderPriceTable();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    // Old links: #incubators opens that tab.
    if (location.hash === '#incubators') hsTab = 'incubators';
    renderAll();
    document.getElementById('hs-q').addEventListener('input', renderList);
    document.querySelector('.hs2').addEventListener('click', (e) => {
        const tb = e.target.closest('#hs-tabs [data-tab]');
        if (tb) { hsTab = tb.dataset.tab; document.getElementById('hs-q').value = ''; try { localStorage.setItem(HS_TAB_KEY, hsTab); } catch { /* storage off */ } renderList(); return; }
        const t = e.target.closest('[data-item]');
        if (t) openStoreItem(t.dataset.item);
    });
    Waggle.setActions(baseWaggleActions());
});
