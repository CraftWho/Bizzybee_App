console.log("/// DAILIES PROTOCOLS INITIALIZED ///");

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function checklistProgressHTML(checklist) {
    if (!checklist || checklist.length === 0) return '';
    const done = checklist.filter(item => item.done).length;
    return `<small class="quest-task-checklist-badge">✅ ${done}/${checklist.length}</small>`;
}

function tagsHTML(tags) {
    if (!tags || tags.length === 0) return '';
    return `<span class="quest-task-tags">${tags.map(tag => `<span class="quest-task-tag">${escapeHTML(tag)}</span>`).join('')}</span>`;
}

// Maps this page's difficulty vocabulary onto the shared StatusDot palette
// (src/core/status-dot/) - same mapping quests.js uses for its own task
// difficulty badge, so "hard" reads as the same red dot everywhere.
const DIFFICULTY_DOT_COLOR = { easy: 'green', medium: 'yellow', hard: 'red' };

// Adding/editing now happens on its own full page (create-daily.html) -
// see openAddDailyForm/renderDailyEditForm's removal below - so this list
// just renders + toggles + removes, plus surfaces the extra info that page
// collects (checklist progress, tags, and whether today is even a
// scheduled day for a given daily per its own repeats settings).
function renderDailyTasks() {
    const list = document.getElementById('daily-task-list');
    const tasks = Vault.getDailyTasks();

    list.innerHTML = tasks.length > 0
        ? tasks.map(task => `
            <li class="quest-task-item${task.completedToday ? ' quest-task-item--done' : ''}${task.dueToday === false ? ' quest-task-item--not-due' : ''}" data-daily-id="${task.id}">
                <div class="quest-task-accent quest-task-accent--${DIFFICULTY_DOT_COLOR[(task.difficulty || '').toLowerCase()] || 'gray'}"></div>
                <div class="quest-task-body">
                    <div class="quest-task-top">
                        <input type="checkbox" class="quest-task-checkbox" data-role="toggle" ${task.completedToday ? 'checked' : ''}>
                        <span class="quest-task-label">${escapeHTML(task.label)}</span>
                        <button class="quest-task-more-btn" data-role="more" aria-label="More actions">⋯</button>
                    </div>
                    <div class="quest-task-meta">
                        <small class="quest-task-dp">+${task.dp} DP</small>
                        ${task.difficulty ? `<small class="quest-task-difficulty quest-task-difficulty--${escapeAttr(task.difficulty.toLowerCase())}">${StatusDot.html(DIFFICULTY_DOT_COLOR[task.difficulty.toLowerCase()] || 'gray')}${escapeHTML(task.difficulty)}</small>` : ''}
                        ${checklistProgressHTML(task.checklist)}
                        ${tagsHTML(task.tags)}
                        ${task.dueToday === false ? '<small class="quest-task-not-due-badge">Not scheduled today</small>' : ''}
                    </div>
                </div>
                <div class="quest-task-more-menu" data-role="more-menu">
                    <button type="button" data-role="edit">✏️ Edit</button>
                    <button type="button" data-role="remove">🗑️ Remove</button>
                </div>
            </li>
        `).join('')
        : `<p class="quest-empty-state">No daily tasks yet - use the honeycomb button below to add one.</p>`;

    tasks.forEach(task => {
        const row = list.querySelector(`[data-daily-id="${task.id}"]`);

        row.querySelector('[data-role="toggle"]').addEventListener('change', () => {
            const willComplete = !task.completedToday;
            const levelBefore = Vault.getUser().level;
            Vault.toggleDailyTask(task.id);
            const levelAfter = Vault.getUser().level;

            Toast.show(willComplete ? `🐝 +${task.dp} DP` : `➖ ${task.dp} DP`, willComplete ? 'positive' : 'negative');
            if (levelAfter > levelBefore) Toast.show(`🎉 LEVEL UP! Lv. ${levelAfter}`, 'positive');

            renderDailyTasks();
        });

        row.querySelector('[data-role="more"]').addEventListener('click', (event) => {
            event.stopPropagation();
            const menu = row.querySelector('[data-role="more-menu"]');
            const willOpen = !menu.classList.contains('quest-task-more-menu--open');
            document.querySelectorAll('.quest-task-more-menu--open').forEach(m => m.classList.remove('quest-task-more-menu--open'));
            if (willOpen) menu.classList.add('quest-task-more-menu--open');
        });

        row.querySelector('[data-role="edit"]').addEventListener('click', () => {
            window.location.href = `./create-daily.html?id=${encodeURIComponent(task.id)}`;
        });

        row.querySelector('[data-role="remove"]').addEventListener('click', () => {
            if (!confirm(`Remove daily "${task.label}"?`)) return;
            if (Vault.removeDailyTask(task.id)) renderDailyTasks();
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    renderDailyTasks();

    document.addEventListener('click', () => {
        document.querySelectorAll('.quest-task-more-menu--open').forEach(m => m.classList.remove('quest-task-more-menu--open'));
    });

    Waggle.setActions([
        {
            icon: '➕',
            label: 'Add Daily',
            onClick: () => { window.location.href = './create-daily.html'; }
        },
        ...baseWaggleActions()
    ]);
});
