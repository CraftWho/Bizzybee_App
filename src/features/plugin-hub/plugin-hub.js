console.log("/// PLUGIN HUB PROTOCOLS INITIALIZED ///");

// How long the fake "downloading" animation plays before an install
// actually lands - purely cosmetic (the toggle itself is instant), just
// gives Install a real sense of weight instead of flipping state the
// instant you click it. Uninstalling stays instant - no animation needed
// to take something away.
const PLUGIN_INSTALL_ANIMATION_MS = 900;

// Renders straight from PLUGIN_CATALOG (plugins.js) - a plugin only needs
// to be added there to show up here, no page changes needed. 'available'
// plugins (like Calendar) get a real Install/Installed control; anything
// still 'coming-soon' keeps the locked badge and a disabled button -
// Plugins.toggle() itself would also reject a coming-soon id, but
// disabling the control here means it's obvious up front rather than
// silently doing nothing on click.
function renderPluginGrid() {
    const grid = document.getElementById('plugin-grid');
    const catalog = Plugins.getCatalog();

    grid.innerHTML = catalog.map(entry => {
        const isComingSoon = entry.status !== 'available';
        const installed = !isComingSoon && Plugins.isEnabled(entry.id);

        const statusBadge = isComingSoon
            ? `<span class="plugin-status-badge plugin-status-badge--coming-soon">🔒 Coming Soon</span>`
            : installed
                ? `<span class="plugin-status-badge plugin-status-badge--enabled">✅ Installed</span>`
                : `<span class="plugin-status-badge plugin-status-badge--disabled">⭕ Not Installed</span>`;

        const toggleLabel = isComingSoon ? 'Coming Soon' : (installed ? '✅ Installed' : '⬇️ Install');

        return `
            <div class="plugin-card${isComingSoon ? ' plugin-card--coming-soon' : ''}">
                <div class="plugin-card-top-row">
                    <span class="plugin-card-icon">${entry.icon}</span>
                    <span class="plugin-card-label">${entry.label}</span>
                    ${statusBadge}
                </div>
                <p class="plugin-card-desc">${entry.description}</p>
                <button class="plugin-toggle-btn${installed ? ' plugin-toggle-btn--active' : ''}" data-plugin-id="${entry.id}" ${isComingSoon ? 'disabled' : ''}>
                    <span class="plugin-toggle-btn-label">${toggleLabel}</span>
                    <span class="plugin-toggle-btn-progress"></span>
                </button>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.plugin-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pluginId = btn.dataset.pluginId;
            const entry = Plugins.getEntry(pluginId);
            if (!entry) return;

            const alreadyInstalled = Plugins.isEnabled(pluginId);

            // Uninstalling is instant - only installing gets the download
            // animation, since that's the moment worth making feel real.
            if (alreadyInstalled) {
                const result = Plugins.toggle(pluginId);
                if (result === null) return;
                if (typeof Toast !== 'undefined') Toast.show(`${entry.icon} ${entry.label} uninstalled.`, 'negative');
                renderPluginGrid();
                return;
            }

            btn.disabled = true;
            btn.classList.add('plugin-toggle-btn--installing');
            btn.querySelector('.plugin-toggle-btn-label').textContent = '⬇️ Installing...';

            setTimeout(() => {
                const result = Plugins.toggle(pluginId);
                if (result === null) return;
                if (typeof Toast !== 'undefined') Toast.show(`${entry.icon} ${entry.label} installed!`, 'positive');
                renderPluginGrid();
            }, PLUGIN_INSTALL_ANIMATION_MS);
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderPluginGrid();

    HiveMind.setActions(baseHiveMindActions());
});
