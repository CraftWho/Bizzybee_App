console.log("/// INVENTORY PROTOCOLS INITIALIZED ///");

// BEE_RARITIES, BEE_CLASSES, MATERIAL_CATALOG all live in db.js - same
// globals the Pollination Chamber renders from, so a bee/material looks
// identical here. Bee cards themselves are rendered via the shared
// BeeCard component (bee-card.js), which already looks up rarity color.

function renderMaterialsGrid() {
    const grid = document.getElementById('inventory-materials-grid');
    const owned = Vault.getMaterials();

    grid.innerHTML = MATERIAL_CATALOG.map(material => {
        const count = owned[material.id] || 0;
        return `
            <div class="inventory-material-card${count === 0 ? ' inventory-material-card--unowned' : ''}">
                <span class="inventory-material-icon">${material.icon}</span>
                <div class="inventory-material-body">
                    <div class="inventory-material-header-row">
                        <span class="inventory-material-label">${material.label}</span>
                        <span class="inventory-material-count">x${count}</span>
                    </div>
                    <p class="inventory-material-desc">${material.description}</p>
                </div>
            </div>
        `;
    }).join('');
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
    const ordered = bees.slice().reverse();

    ordered.forEach(bee => {
        const card = document.createElement('div');
        grid.appendChild(card);
        BeeCard.render(card, bee, {
            editable: true,
            onChange: () => {
                document.getElementById('inventory-bee-roster-count').textContent = `${Vault.getColonyBees().length} bees`;
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderMaterialsGrid();
    document.getElementById('inventory-bee-roster-count').textContent = `${Vault.getColonyBees().length} bees`;
    document.getElementById('inventory-bee-roster-btn').addEventListener('click', openBeeRosterModal);

    HiveMind.setActions(baseHiveMindActions());
});
