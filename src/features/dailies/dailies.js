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

// Same anchors as quests.js's DIFFICULTY_DP_SUGGESTIONS - duplicated rather
// than shared, matching this codebase's existing convention of each feature
// owning its own small helpers (see escapeHTML above) instead of a shared
// utility file for a few lines of logic.
const DIFFICULTY_DP_SUGGESTIONS = { Easy: 20, Medium: 60, Hard: 120 };

function difficultySelectHTML(selected) {
    const options = ['', 'Easy', 'Medium', 'Hard'].map(level => {
        const label = level || 'No difficulty';
        return `<option value="${level}"${level === (selected || '') ? ' selected' : ''}>${label}</option>`;
    }).join('');
    return `<select class="quest-task-form-difficulty">${options}</select>`;
}

function wireDifficultyAutoFill(form) {
    const select = form.querySelector('.quest-task-form-difficulty');
    const dpInput = form.querySelector('.quest-task-form-dp');
    select.addEventListener('change', () => {
        if (DIFFICULTY_DP_SUGGESTIONS[select.value] !== undefined) {
            dpInput.value = DIFFICULTY_DP_SUGGESTIONS[select.value];
        }
    });
}

function renderDailyTasks() {
    const list = document.getElementById('daily-task-list');
    const tasks = Vault.getDailyTasks();

    list.innerHTML = tasks.length > 0
        ? tasks.map(task => `
            <li class="quest-task-item${task.completedToday ? ' quest-task-item--done' : ''}" data-daily-id="${task.id}">
                <input type="checkbox" data-role="toggle" ${task.completedToday ? 'checked' : ''}>
                <span class="quest-task-label">${escapeHTML(task.label)}</span>
                ${task.difficulty ? `<small class="quest-task-difficulty quest-task-difficulty--${escapeAttr(task.difficulty.toLowerCase())}">${escapeHTML(task.difficulty)}</small>` : ''}
                <small class="quest-task-dp">+${task.dp} DP</small>
                <button class="quest-task-icon-btn" data-role="edit" aria-label="Edit daily">✏️</button>
                <button class="quest-task-icon-btn quest-task-icon-btn--remove" data-role="remove" aria-label="Remove daily">🗑️</button>
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

        row.querySelector('[data-role="edit"]').addEventListener('click', () => {
            renderDailyEditForm(row, task);
        });

        row.querySelector('[data-role="remove"]').addEventListener('click', () => {
            if (!confirm(`Remove daily "${task.label}"?`)) return;
            if (Vault.removeDailyTask(task.id)) renderDailyTasks();
        });
    });
}

function renderDailyEditForm(row, task) {
    row.innerHTML = `
        <input type="text" class="quest-task-form-label" value="${escapeAttr(task.label)}">
        ${difficultySelectHTML(task.difficulty)}
        <input type="number" class="quest-task-form-dp" value="${task.dp}" min="0">
        <button class="quest-task-form-save">Save</button>
        <button class="quest-task-form-cancel">Cancel</button>
    `;
    wireDifficultyAutoFill(row);

    row.querySelector('.quest-task-form-save').addEventListener('click', () => {
        const label = row.querySelector('.quest-task-form-label').value.trim();
        const dp = row.querySelector('.quest-task-form-dp').value;
        const difficulty = row.querySelector('.quest-task-form-difficulty').value;
        if (!label) return;

        if (Vault.updateDailyTask(task.id, { label, dp, difficulty })) renderDailyTasks();
    });

    row.querySelector('.quest-task-form-cancel').addEventListener('click', () => renderDailyTasks());
}

// Triggered from the honeycomb "➕ Add Daily" action (see the HiveMind
// action registered below) rather than an on-page button, per Leo's
// request - prepends the add form directly into the list.
function openAddDailyForm() {
    const list = document.getElementById('daily-task-list');
    if (list.querySelector('.quest-task-form')) return;

    list.insertAdjacentHTML('afterbegin', `
        <li class="quest-task-form">
            <input type="text" class="quest-task-form-label" placeholder="Daily task name">
            ${difficultySelectHTML(null)}
            <input type="number" class="quest-task-form-dp" placeholder="DP" min="0">
            <button class="quest-task-form-save">Save</button>
            <button class="quest-task-form-cancel">Cancel</button>
        </li>
    `);

    const form = list.querySelector('.quest-task-form');
    wireDifficultyAutoFill(form);

    form.querySelector('.quest-task-form-save').addEventListener('click', () => {
        const label = form.querySelector('.quest-task-form-label').value.trim();
        const dp = form.querySelector('.quest-task-form-dp').value;
        const difficulty = form.querySelector('.quest-task-form-difficulty').value;
        if (!label) return;

        Vault.addDailyTask({ label, dp, difficulty });
        renderDailyTasks();
        Toast.show(`☀️ New daily added: ${label}`, 'positive');
    });

    form.querySelector('.quest-task-form-cancel').addEventListener('click', () => form.remove());
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    renderDailyTasks();

    HiveMind.setActions([
        {
            icon: '➕',
            label: 'Add Daily',
            onClick: openAddDailyForm
        },
        ...baseHiveMindActions()
    ]);
});
