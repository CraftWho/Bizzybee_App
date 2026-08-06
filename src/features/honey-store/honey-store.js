console.log("/// HONEY STORE PROTOCOLS INITIALIZED ///");

// STORE_ITEM_CATALOG lives in db.js (17 'trait' items + 1 'identity' item -
// the Identity Card). Purchases spend materials (the same pool Collector
// bees/quests/level-ups already earn - see MATERIAL_CATALOG in db.js) and
// land in state.inventory.items, the exact same bucket a dropped Evolution
// Item lands in. Applying a purchased item to a bee happens from the
// Inventory roster's BeeCard (see bee-card.js) - this page is acquire-only,
// same "one job per page" split as the Pollination Chamber (acquire bees)
// vs. Inventory (manage/apply).

function renderWallet() {
    const panel = document.getElementById('store-wallet-panel');
    const materials = Vault.getMaterials();

    panel.innerHTML = `
        <h3>👛 Your Materials</h3>
        <div class="store-wallet-row">
            ${MATERIAL_CATALOG.map(mat => `
                <div class="store-wallet-chip">
                    <span class="store-wallet-icon">${mat.icon}</span>
                    <span class="store-wallet-label">${mat.label}</span>
                    <span class="store-wallet-count">${materials[mat.id] || 0}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function affordable(item) {
    const materials = Vault.getMaterials();
    return (materials[item.price.materialId] || 0) >= item.price.amount;
}

function handlePurchase(itemId) {
    const result = Vault.purchaseStoreItem(itemId);
    if (!result) {
        if (typeof Toast !== 'undefined') Toast.show(`Not enough materials for that yet.`, 'negative');
        return;
    }
    if (typeof Toast !== 'undefined') {
        Toast.show(`${result.item.icon} Bought ${result.item.label}! Apply it from a bee's card in Inventory.`, 'positive');
    }
    renderAll();
}

// Both grids below render via the shared ItemCard component
// (item-card.js) - same flip-for-more-info rectangular card the Inventory
// page's Materials/Evolution Items/Store Items grids use, just with a
// price + Buy button wired to Vault.purchaseStoreItem() since this page
// is acquire-only (applying a purchased item to a bee happens from the
// Inventory roster instead - see bee-card.js).
function storeEntryFor(item) {
    const mat = MATERIAL_CATALOG.find(m => m.id === item.price.materialId);
    return {
        id: item.id,
        icon: item.icon,
        label: item.label,
        description: item.description,
        rarity: item.rarity || null,
        count: Vault.getItems()[item.id] || 0,
        price: {
            materialId: item.price.materialId,
            amount: item.price.amount,
            icon: mat ? mat.icon : '',
            label: mat ? mat.label : item.price.materialId
        },
        affordable: affordable(item)
    };
}

function renderIdentityCard() {
    const item = STORE_ITEM_CATALOG.find(i => i.kind === 'identity');
    if (!item) return;

    document.getElementById('store-identity-desc').textContent = item.description;

    const row = document.getElementById('store-identity-row');
    row.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'store-identity-card';
    row.appendChild(card);
    ItemCard.render(card, storeEntryFor(item), { onBuy: handlePurchase });
}

function renderItemGrid() {
    const grid = document.getElementById('store-item-grid');
    const traitItems = STORE_ITEM_CATALOG.filter(i => i.kind === 'trait');

    grid.innerHTML = '';
    traitItems.forEach(item => {
        const card = document.createElement('div');
        grid.appendChild(card);
        ItemCard.render(card, storeEntryFor(item), { onBuy: handlePurchase });
    });
}

function renderAll() {
    renderWallet();
    renderIdentityCard();
    renderItemGrid();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderAll();

    HiveMind.setActions(baseHiveMindActions());
});
