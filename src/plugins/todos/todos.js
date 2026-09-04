console.log("/// TO-DOS PLUGIN PROTOCOLS INITIALIZED ///");

function escapeTodoHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function escapeTodoAttr(str) {
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
    return `<span class="quest-task-tags">${tags.map(tag => `<span class="quest-task-tag">${escapeTodoHTML(tag)}</span>`).join('')}</span>`;
}

// Same mapping dailies.js/quests.js use for their own difficulty badge.
const TODO_DIFFICULTY_DOT_COLOR = { trivial: 'gray', easy: 'green', medium: 'yellow', hard: 'red' };

// Local YYYY-MM-DD "today", same reasoning as create-daily.js's
// todayISOLocal - a native <input type="date"> and any local-date
// comparison need this, not Vault's UTC-based todayISO().
function todayISOLocal() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDueDate(dueDate) {
    if (!dueDate) return '';
    const [y, m, d] = dueDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dueBadgeHTML(todo) {
    if (!todo.dueDate) return '';
    const overdue = !todo.completed && todo.dueDate < todayISOLocal();
    return `<small class="quest-task-due-badge${overdue ? ' quest-task-due-badge--overdue' : ''}">${overdue ? '⚠️ Overdue' : '📅'} ${escapeTodoHTML(formatDueDate(todo.dueDate))}</small>`;
}

function todoRowHTML(todo) {
    return `
        <li class="quest-task-item${todo.completed ? ' quest-task-item--done' : ''}" data-todo-id="${todo.id}">
            <input type="checkbox" data-role="toggle" ${todo.completed ? 'checked' : ''}>
            <span class="quest-task-label">${escapeTodoHTML(todo.label)}</span>
            ${dueBadgeHTML(todo)}
            ${checklistProgressHTML(todo.checklist)}
            ${tagsHTML(todo.tags)}
            ${todo.difficulty ? `<small class="quest-task-difficulty quest-task-difficulty--${escapeTodoAttr(todo.difficulty.toLowerCase())}">${StatusDot.html(TODO_DIFFICULTY_DOT_COLOR[todo.difficulty.toLowerCase()] || 'gray')}${escapeTodoHTML(todo.difficulty)}</small>` : ''}
            <small class="quest-task-dp">+${todo.dp} DP</small>
            ${todo.completed ? '' : '<button class="quest-task-icon-btn" data-role="edit" aria-label="Edit to-do">✏️</button>'}
            <button class="quest-task-icon-btn quest-task-icon-btn--remove" data-role="remove" aria-label="Remove to-do">🗑️</button>
        </li>
    `;
}

function renderTodos() {
    const allTodos = Vault.getTodos();
    const active = allTodos.filter(t => !t.completed);
    const completed = allTodos.filter(t => t.completed);

    const activeList = document.getElementById('todo-task-list');
    activeList.innerHTML = active.length > 0
        ? active.map(todoRowHTML).join('')
        : `<p class="quest-empty-state">No to-dos yet - use the honeycomb button below to add one.</p>`;

    const completedList = document.getElementById('todo-completed-list');
    completedList.innerHTML = completed.map(todoRowHTML).join('');
    document.getElementById('todos-completed-heading').textContent = `✅ Completed (${completed.length})`;
    document.getElementById('todos-completed-section').hidden = completed.length === 0;

    [...active, ...completed].forEach(todo => {
        const row = activeList.querySelector(`[data-todo-id="${todo.id}"]`) || completedList.querySelector(`[data-todo-id="${todo.id}"]`);
        if (!row) return;

        row.querySelector('[data-role="toggle"]').addEventListener('change', () => {
            const willComplete = !todo.completed;
            const levelBefore = Vault.getUser().level;
            Vault.toggleTodoComplete(todo.id);
            const levelAfter = Vault.getUser().level;

            Toast.show(willComplete ? `🐝 +${todo.dp} DP` : `➖ ${todo.dp} DP`, willComplete ? 'positive' : 'negative');
            if (levelAfter > levelBefore) Toast.show(`🎉 LEVEL UP! Lv. ${levelAfter}`, 'positive');

            renderTodos();
        });

        const editBtn = row.querySelector('[data-role="edit"]');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                window.location.href = `./create-todo.html?id=${encodeURIComponent(todo.id)}`;
            });
        }

        row.querySelector('[data-role="remove"]').addEventListener('click', () => {
            if (!confirm(`Remove to-do "${todo.label}"?`)) return;
            if (Vault.removeTodo(todo.id)) renderTodos();
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('todos');
    document.getElementById('todos-not-installed').hidden = installed;
    document.getElementById('todos-app').hidden = !installed;

    if (!installed) return;

    renderTodos();

    document.getElementById('todos-completed-toggle').addEventListener('click', () => {
        const section = document.getElementById('todos-completed-section');
        const isCollapsed = section.classList.toggle('todos-completed-section--collapsed');
        document.getElementById('todos-completed-toggle').setAttribute('aria-expanded', String(!isCollapsed));
    });

    Waggle.setActions([
        {
            icon: '➕',
            label: 'Add To-Do',
            onClick: () => { window.location.href = './create-todo.html'; }
        },
        ...baseWaggleActions()
    ]);
});
