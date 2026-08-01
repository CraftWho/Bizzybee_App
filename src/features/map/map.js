console.log("/// MAP PROTOCOLS INITIALIZED ///");

// Not the same escapeHTML/escapeAttr as quests.js - kept private to this
// file, same reasoning as llm-engine.js's escapeChatHTML.
function escapeMapAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// First-pass visualization: quests plotted in order between a start and
// finish flag, real Vault data driving which marker each one gets. No
// interactivity yet (clicking through to individual quests) - that's the
// natural next step once this basic layout is confirmed to feel right.
function renderMap() {
    const quests = Vault.getQuests();
    const path = document.getElementById('map-path');

    const markers = quests.map(quest => {
        const completed = quest.status === 'completed';
        const icon = completed ? '🏅' : '📍';
        const cls = completed ? 'map-marker--completed' : 'map-marker--active';
        const statusLabel = completed ? 'Completed' : 'In Progress';
        return `<div class="map-marker ${cls}" title="${escapeMapAttr(quest.title)} (${statusLabel})">${icon}</div>`;
    }).join('');

    path.innerHTML = `
        <div class="map-flag map-flag--start" title="Start">🏁</div>
        ${markers}
        <div class="map-flag map-flag--finish" title="Finish">🏆</div>
    `;
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    renderMap();
    HiveMind.setActions(baseHiveMindActions());
});
