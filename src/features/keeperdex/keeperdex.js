console.log("/// KEEPERDEX PROTOCOLS INITIALIZED ///");

// Renders every KEEPERDEX_ENTRIES row (db.js) as a KeeperDexCard
// (keeperdex-card.js), locked or not based on whether the Vault's owned
// bees include a match for that entry's rarity+element pair (see
// isKeeperDexEntryObtained, db.js). Pure display - no editing, no
// filters, always lists the full 20-entry catalog regardless of what you
// own, same "list the full catalog either way" spirit MATERIAL_CATALOG
// already uses on the Inventory page.
function renderKeeperDex() {
    const grid = document.getElementById('keeperdex-grid');
    if (!grid) return;

    const bees = Vault.getColonyBees();
    grid.innerHTML = '';

    let obtainedCount = 0;
    KEEPERDEX_ENTRIES.forEach(entry => {
        const obtained = isKeeperDexEntryObtained(entry, bees);
        if (obtained) obtainedCount++;

        const card = document.createElement('div');
        grid.appendChild(card);
        KeeperDexCard.render(card, entry, { obtained });
    });

    const progressText = document.getElementById('keeperdex-progress-text');
    const progressFill = document.getElementById('keeperdex-progress-fill');
    const pct = Math.round((obtainedCount / KEEPERDEX_ENTRIES.length) * 100);
    if (progressText) progressText.textContent = `${obtainedCount} / ${KEEPERDEX_ENTRIES.length} discovered (${pct}%)`;
    if (progressFill) progressFill.style.width = `${pct}%`;
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderKeeperDex();

    HiveMind.setActions(baseHiveMindActions());
});
