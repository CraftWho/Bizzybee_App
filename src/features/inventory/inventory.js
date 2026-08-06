console.log("/// INVENTORY PROTOCOLS INITIALIZED ///");

// BEE_RARITIES, BEE_CLASSES, MATERIAL_CATALOG all live in db.js - same
// globals the Pollination Chamber renders from, so a bee/material looks
// identical here. Bee cards themselves are rendered via the shared
// BeeCard component (bee-card.js). Materials/Evolution Items/Store Items
// below render via the shared ItemCard component (item-card.js) instead -
// same flip-for-more-info idea, just a rectangular card instead of a
// bee-shaped one, since these are inert collectibles, not creatures.

// Shared by the Materials and Evolution Items grids below - both are the
// same "list the full catalog, grey out anything at 0" pattern, just
// reading from a different catalog/owned-counts pair. Evolution Items'
// fragment entries (isFragment: true) read from `fragments` instead of
// `owned` and render as an X/5 progress badge rather than a plain count -
// see FRAGMENTS_REQUIRED/_addFragment in db.js.
function renderCatalogGrid(gridId, catalog, owned, fragments) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.innerHTML = '';
    catalog.forEach(entry => {
        const card = document.createElement('div');
        grid.appendChild(card);

        const isFragment = !!(fragments && entry.isFragment);
        ItemCard.render(card, {
            id: entry.id,
            icon: entry.icon,
            label: entry.label,
            description: entry.description,
            rarity: entry.rarity || null,
            count: owned[entry.id] || 0,
            fragmentProgress: isFragment
                ? { current: fragments[entry.id] || 0, required: typeof FRAGMENTS_REQUIRED !== 'undefined' ? FRAGMENTS_REQUIRED : 5 }
                : null
        });
    });
}

function renderMaterialsGrid() {
    renderCatalogGrid('inventory-materials-grid', MATERIAL_CATALOG, Vault.getMaterials());
}

// Evolution Items - see EVOLUTION_ITEM_CATALOG/evolveBee/applyTraitItem in
// db.js. Actually spending one happens from the bee roster below (each
// BeeCard offers Evolve/Rebirth/Apply Item buttons in editable mode when
// eligible) - this grid is purely "what do I currently have," including
// in-progress fragment counts.
function renderItemsGrid() {
    renderCatalogGrid('inventory-items-grid', EVOLUTION_ITEM_CATALOG, Vault.getItems(), Vault.getFragments());
}

// Honey Store purchases - see STORE_ITEM_CATALOG/purchaseStoreItem in
// db.js. Shares the same state.inventory.items pool as Evolution Items
// (a purchased item and a dropped item are identical once owned), so this
// is purely "what did I buy" - the actual purchase happens on the Honey
// Store page, applying a bee-side effect happens from the roster below.
function renderStoreItemsGrid() {
    renderCatalogGrid('inventory-store-items-grid', STORE_ITEM_CATALOG, Vault.getItems());
}

// Editable roster - bee management (rename, assign work) lives here now;
// the Pollination Chamber is exclusively acquire (pollinate/tickets) and
// refine (destroy/combine) territory, see gacha.js. Cards are the same
// shared BeeCard component both pages use (see bee-card.js) - tap still
// flips a card to see stats, same as everywhere else it's rendered.
function openBeeRosterModal() {
    const bees = Vault.getColonyBees();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-box inventory-roster-modal">
            <div class="modal-header">
                <span class="modal-title">🐝 Colony Bees (${bees.length})</span>
                <button class="modal-close" aria-label="Close">✕</button>
            </div>
            <div class="modal-body">
                ${bees.length === 0
                    ? `<p class="empty-state">No bees yet - visit the Pollination Chamber to pull your first one.</p>`
                    : `<div class="inventory-roster-grid bee-card-grid" id="inventory-roster-grid"></div>`}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) overlay.remove();
    });
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());

    if (bees.length === 0) return;

    const grid = overlay.querySelector('#inventory-roster-grid');
    renderRosterGrid(grid);
}

// Rebuilds every card in the roster grid from scratch - needed (not just
// a bee-count text update) because Evolve/Apply Item consume a shared,
// limited-count item (see BeeCard's showEvolveAction/showTraitAction):
// using the last Evolution Stone on one bee should make that action
// disappear from every OTHER Common bee's card too, not just update the
// one card that was actually clicked.
function renderRosterGrid(grid) {
    const bees = Vault.getColonyBees().slice().reverse();

    grid.innerHTML = '';
    bees.forEach(bee => {
        const card = document.createElement('div');
        grid.appendChild(card);
        BeeCard.render(card, bee, {
            editable: true,
            onChange: () => {
                document.getElementById('inventory-bee-roster-count').textContent = `${Vault.getColonyBees().length} bees`;
                renderItemsGrid();
                renderStoreItemsGrid();
                renderRosterGrid(grid);
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderMaterialsGrid();
    renderItemsGrid();
    renderStoreItemsGrid();
    document.getElementById('inventory-bee-roster-count').textContent = `${Vault.getColonyBees().length} bees`;
    document.getElementById('inventory-bee-roster-btn').addEventListener('click', openBeeRosterModal);

    HiveMind.setActions(baseHiveMindActions());
});
