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

// Confetti palette matches the app's own gold/crimson language rather than
// generic rainbow confetti, so it reads as part of the theme, not a
// bolted-on effect.
const CONFETTI_COLORS = ['#FFD700', '#DC143C', '#FFF8B0', '#996515'];
const DP_FILL_DURATION_MS = 2200;

function spawnConfetti(anchor) {
    for (let i = 0; i < 24; i++) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';

        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 55;
        piece.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
        piece.style.setProperty('--ty', `${Math.sin(angle) * distance - 25}px`);
        piece.style.setProperty('--rot', `${Math.random() * 360}deg`);
        piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
        piece.style.animationDelay = `${Math.random() * 120}ms`;

        anchor.appendChild(piece);
        setTimeout(() => piece.remove(), 1300);
    }
}

// animate=true (initial page load only) resets the bar to 0% and lets the
// slow CSS transition carry it up to the real percentage, popping confetti
// once it lands. Re-renders after checking a task (animate=false) just
// update the width directly - the CSS transition still animates the change
// smoothly, but skips the 0%-reset/confetti replay so ticking a checkbox
// doesn't retrigger the whole "grand entrance" every time.
function renderDPProgress(user, animate) {
    const fill = document.getElementById('home-dp-fill');
    const anchor = document.getElementById('home-confetti-anchor');
    const text = document.getElementById('home-dp-progress-text');

    const percentage = Math.min(100, (user.currentXP / user.nextLevelXP) * 100);
    text.textContent = `${user.currentXP.toLocaleString()} / ${user.nextLevelXP.toLocaleString()} DP`;
    anchor.style.left = `${percentage}%`;

    if (!animate) {
        fill.style.width = `${percentage}%`;
        return;
    }

    fill.style.width = '0%';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            fill.style.width = `${percentage}%`;
        });
    });

    setTimeout(() => spawnConfetti(anchor), DP_FILL_DURATION_MS);
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
            const levelBefore = Vault.getUser().level;
            Vault.toggleTask(quest.id, task.id);
            const levelAfter = Vault.getUser().level;

            Toast.show(willComplete ? `🐝 +${task.dp} DP` : `➖ ${task.dp} DP`, willComplete ? 'positive' : 'negative');
            if (levelAfter > levelBefore) Toast.show(`🎉 LEVEL UP! Lv. ${levelAfter}`, 'positive');

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
            const levelBefore = Vault.getUser().level;
            Vault.toggleDailyTask(task.id);
            const levelAfter = Vault.getUser().level;

            Toast.show(willComplete ? `🐝 +${task.dp} DP` : `➖ ${task.dp} DP`, willComplete ? 'positive' : 'negative');
            if (levelAfter > levelBefore) Toast.show(`🎉 LEVEL UP! Lv. ${levelAfter}`, 'positive');

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

function renderAppGrid() {
    const grid = document.getElementById('home-app-grid');

    grid.innerHTML = HOME_APP_DESTINATIONS.map(item => `
        <a class="home-app-icon" href="./src/features/${item.key}/${item.key}.html">
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

function renderHome(animateDP) {
    const user = Vault.getUser();
    if (!user) return;

    renderStatus(user);
    renderDPProgress(user, animateDP);
    renderActiveQuest();
    renderDailyTasks();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderHome(true);
    renderAppGrid();
    setupHomeCollapsibles();

    HiveMind.setActions(baseHiveMindActions());
});
