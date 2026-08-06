console.log("/// HOME PROTOCOLS INITIALIZED ///");

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderStatus(user) {
    document.getElementById('home-user-name').textContent = user.name;
    document.getElementById('home-user-level').textContent = user.level;
}

// icon/label lookup for awarded materials - MATERIAL_CATALOG is a plain
// global from db.js (loaded before this file), same as Eevee/Vault.
function materialDisplay(materialId) {
    const material = (typeof MATERIAL_CATALOG !== 'undefined' ? MATERIAL_CATALOG : []).find(m => m.id === materialId);
    return material ? `${material.icon} ${material.label}` : materialId;
}

// Character leveling now uses the same shared, gated LevelBar as the
// Dashboard's Skill Mastery matrix (src/core/level-bar/) - one row, always
// - instead of its own bespoke fill/confetti system. The bar itself can run
// ahead of what's been "claimed" (see computeCharacterLevelBandState in
// db.js); the header's Level number above it still always shows your real,
// live level regardless of whether you've pressed Level Up yet.
function characterLevelBarToRows(bar) {
    return [{
        key: 'character',
        icon: '⚡',
        label: 'Character Level',
        levelBadge: `Lv. ${bar.level}`,
        dpIntoLevel: bar.dpIntoLevel,
        cap: bar.cap,
        percentage: bar.percentage,
        maxed: bar.maxed,
        gradient: 'linear-gradient(90deg, var(--gold-end), var(--gold-start))',
        shadow: '0 0 10px var(--gold-glow)'
    }];
}

// Vault.levelUpCharacterBar() already grants the bees/tickets/materials
// (via _syncLevelUpBees) and reports exactly what was granted - this just
// formats that into the celebration modal's { title, lines } shape.
function formatCharacterLevelReward(reward) {
    const lines = [];

    if (reward.awardedBees.length > 0) {
        const label = reward.awardedBees.length === 1 ? escapeHTML(reward.awardedBees[0].name) : `${reward.awardedBees.length} bees`;
        lines.push(`🐝 ${label} joined your colony!`);
    }
    if (reward.ticketsGranted > 0) {
        lines.push(`🎟️ +${reward.ticketsGranted} Gacha Ticket${reward.ticketsGranted === 1 ? '' : 's'}`);
    }
    if (reward.awardedMaterials.length > 0) {
        const counts = {};
        reward.awardedMaterials.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
        Object.entries(counts).forEach(([id, count]) => lines.push(`${materialDisplay(id)} +${count}`));
    }
    if (lines.length === 0) lines.push('Onward!');

    return { title: `Character reached Level ${reward.newLevel}!`, lines };
}

function renderCharacterLevelBar() {
    const container = document.getElementById('home-level-bar');
    if (!container) return;

    LevelBar.renderRows(container, {
        getRows: () => characterLevelBarToRows(Vault.getCharacterLevelBar()),
        onLevelUp: async () => {
            const reward = await Vault.levelUpCharacterBar();
            return reward ? formatCharacterLevelReward(reward) : null;
        }
    });
}

// Simplified on purpose - just the title and a plain checklist, no edit/
// remove icons or stat boxes. Full detail still lives on the Quests page.
function renderActiveQuest() {
    const container = document.getElementById('home-active-quest');
    const activeQuestId = Vault.getActiveQuestId();
    const quest = Vault.getQuests().find(q => q.id === activeQuestId);

    if (!quest) {
        container.innerHTML = `<p class="quest-empty-state">No active quest selected yet - pick one from the Quests page.</p>`;
        return;
    }

    container.innerHTML = `
        <p class="home-active-quest-title">${escapeHTML(quest.title)}</p>
        <ul class="task-list" id="home-active-quest-tasks"></ul>
    `;

    const tasks = quest.tasks || [];
    const list = document.getElementById('home-active-quest-tasks');
    list.innerHTML = tasks.map(task => `
        <li data-task-id="${task.id}">
            <input type="checkbox" data-role="toggle" ${task.completed ? 'checked' : ''}>
            <span class="home-task-label${task.completed ? ' home-task-label--done' : ''}">${escapeHTML(task.label)}</span>
            <small class="quest-task-dp">+${task.dp} DP</small>
        </li>
    `).join('');

    tasks.forEach(task => {
        const row = list.querySelector(`[data-task-id="${task.id}"]`);
        row.querySelector('[data-role="toggle"]').addEventListener('change', () => {
            const willComplete = !task.completed;
            Vault.toggleTask(quest.id, task.id);

            // No instant "LEVEL UP!" toast any more - the character-level
            // bar (see renderCharacterLevelBar) shakes and offers its own
            // Level Up button once it's actually maxed, same ritual as
            // Skill Mastery, instead of announcing it the moment DP crosses
            // the threshold.
            Toast.show(willComplete ? `🐝 +${task.dp} DP` : `➖ ${task.dp} DP`, willComplete ? 'positive' : 'negative');

            renderHome();
        });
    });
}

function renderDailyTasks() {
    const list = document.getElementById('home-daily-task-list');
    const tasks = Vault.getDailyTasks();

    if (tasks.length === 0) {
        list.innerHTML = `<li class="quest-empty-state">No daily tasks set up yet.</li>`;
        return;
    }

    list.innerHTML = tasks.map(task => `
        <li data-task-id="${task.id}">
            <input type="checkbox" data-role="toggle" ${task.completedToday ? 'checked' : ''}>
            <span class="home-task-label${task.completedToday ? ' home-task-label--done' : ''}">${escapeHTML(task.label)}</span>
            <small class="quest-task-dp">+${task.dp} DP</small>
        </li>
    `).join('');

    tasks.forEach(task => {
        const row = list.querySelector(`[data-task-id="${task.id}"]`);
        row.querySelector('[data-role="toggle"]').addEventListener('change', () => {
            const willComplete = !task.completedToday;
            Vault.toggleDailyTask(task.id);

            Toast.show(willComplete ? `🐝 +${task.dp} DP` : `➖ ${task.dp} DP`, willComplete ? 'positive' : 'negative');

            renderHome();
        });
    });
}

// "More apps" launcher for destinations that live outside the header entirely.
// Dailies and Map graduated INTO the header nav itself; Skills, Dictionary,
// and Profile moved the other way (out of the header, into here) to keep
// the header short - see app.js's NAV_ITEMS/EXTRA_PAGE_META. Colony,
// Pollination Chamber (gacha), and Inventory are deliberately NOT here -
// that trio is reached exclusively through the Hive Mind FAB menu (see
// HIVE_MIND_NAV_PAGES in llm-engine.js) as its own cohesive "system",
// same as Colony always has been.
const HOME_APP_DESTINATIONS = [
    { key: 'skills', icon: '🌿', label: 'Skills' },
    { key: 'dictionary', icon: '📖', label: 'Dictionary' },
    { key: 'profile', icon: '🧘🏾', label: 'Profile' },
    { key: 'honey-store', icon: '🍯', label: 'Honey Store' },
    { key: 'plugin-hub', icon: '🧩', label: 'Plugins' },
    { key: 'hive-archive', icon: '📚', label: 'The Hive Archive' },
    { key: 'settings', icon: '⚙️', label: 'Settings' }
];

// Installed plugins (see Plugins.isEnabled/PLUGIN_CATALOG in plugins.js)
// join the static destinations above dynamically - a plugin only needs
// its status flipped to 'available' and to be installed from Plugin Hub
// to show up here, no index.html/index.js changes needed per plugin.
// Lives under src/plugins/<id>/<id>.html instead of src/features/, so it
// gets its own tiny map function rather than reusing HOME_APP_DESTINATIONS'
// hardcoded features/ path.
function installedPluginDestinations() {
    if (typeof Plugins === 'undefined') return [];
    return Plugins.getCatalog()
        .filter(entry => Plugins.isEnabled(entry.id))
        .map(entry => ({ key: entry.id, icon: entry.icon, label: entry.label, base: 'plugins' }));
}

function renderAppGrid() {
    const grid = document.getElementById('home-app-grid');

    const destinations = [
        ...HOME_APP_DESTINATIONS.map(item => ({ ...item, base: 'features' })),
        ...installedPluginDestinations()
    ];

    grid.innerHTML = destinations.map(item => `
        <a class="home-app-icon" href="./src/${item.base}/${item.key}/${item.key}.html">
            <span class="home-app-icon-emoji">${item.icon}</span>
            <span class="home-app-icon-label">${item.label}</span>
        </a>
    `).join('');
}

// Active Quest and Daily Tasks start collapsed (see the --collapsed class
// already in index.html) so the app icon grid isn't buried below them -
// this just wires the chevron/click toggle, matching quests.js's pattern.
function setupHomeCollapsibles() {
    document.querySelectorAll('.home-collapsible .home-section-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const section = toggle.closest('.home-collapsible');
            const isCollapsed = section.classList.toggle('home-collapsible--collapsed');
            toggle.setAttribute('aria-expanded', String(!isCollapsed));
        });
    });
}

function renderHome() {
    const user = Vault.getUser();
    if (!user) return;

    renderStatus(user);
    renderCharacterLevelBar();
    renderActiveQuest();
    renderDailyTasks();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderHome();
    renderAppGrid();
    setupHomeCollapsibles();

    HiveMind.setActions(baseHiveMindActions());
});
