console.log("/// QUEST BOARD PROTOCOLS INITIALIZED ///");

const QUEST_STATUS_LABELS = {
    active: '🔄 In Progress',
    completed: '✅ Completed',
    optional: '🔓 Optional'
};

// Task labels are user-editable text rendered via innerHTML - escape them so
// a label containing '<' or '"' can't break the markup on re-render.
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderQuestCard(quest) {
    const statusLabel = QUEST_STATUS_LABELS[quest.status] || quest.status;
    const completedClass = quest.status === 'completed' ? ' quest-card--completed' : '';

    const logButtonHTML = quest.logFile
        ? `<button class="quest-view-intel-btn" data-quest-id="${quest.id}">View Intel</button>`
        : '';

    return `
        <div class="panel quest-card${completedClass}">
            <h3 class="quest-card-title">${escapeHTML(quest.title)}</h3>
            <hr class="quest-card-divider">
            <p class="quest-meta"><strong>ID:</strong> ${quest.id}</p>
            <p class="quest-meta"><strong>Status:</strong> ${statusLabel}</p>
            <p class="quest-meta"><strong>Reward:</strong> +${quest.reward} DP</p>
            ${logButtonHTML}
        </div>
    `;
}

function renderQuestList(containerId, quests, emptyMessage) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = quests.length > 0
        ? quests.map(renderQuestCard).join('')
        : `<p class="quest-empty-state">${emptyMessage}</p>`;
}

// Renders the live checkbox checklist (plus add/edit/remove controls) into
// MDViewer's generic mountExtra slot. Checking a task awards its DP
// immediately via Vault.toggleTask (which also auto-completes the quest
// once every task is done), and every mutation refreshes both this panel
// and the quest board behind the modal.
function renderTaskChecklist(container, quest) {
    if (!quest.tasks) quest.tasks = [];

    const totalDP = quest.tasks.reduce((sum, t) => sum + t.dp, 0);
    const earnedDP = quest.tasks.filter(t => t.completed).reduce((sum, t) => sum + t.dp, 0);

    container.innerHTML = `
        <div class="quest-task-panel">
            <div class="quest-task-header">
                <h3>📋 Tasks</h3>
                <span class="quest-task-progress">${earnedDP} / ${totalDP} DP</span>
            </div>
            <ul class="task-list quest-task-list">
                ${quest.tasks.map(task => `
                    <li class="quest-task-item${task.completed ? ' quest-task-item--done' : ''}" data-task-id="${task.id}">
                        <input type="checkbox" data-role="toggle" ${task.completed ? 'checked' : ''}>
                        <span class="quest-task-label">${escapeHTML(task.label)}</span>
                        <small class="quest-task-dp">+${task.dp} DP</small>
                        <button class="quest-task-icon-btn" data-role="edit" aria-label="Edit task">✏️</button>
                        <button class="quest-task-icon-btn quest-task-icon-btn--remove" data-role="remove" aria-label="Remove task">🗑️</button>
                    </li>
                `).join('')}
            </ul>
            <button class="quest-task-add-btn">➕ Add Task</button>
        </div>
    `;

    quest.tasks.forEach(task => {
        const row = container.querySelector(`[data-task-id="${task.id}"]`);

        row.querySelector('[data-role="toggle"]').addEventListener('change', () => {
            const willComplete = !task.completed;
            const levelBefore = Vault.getUser().level;
            const updated = Vault.toggleTask(quest.id, task.id);
            if (!updated) return;

            const levelAfter = Vault.getUser().level;
            Toast.show(willComplete ? `🐝 +${task.dp} DP` : `➖ ${task.dp} DP`, willComplete ? 'positive' : 'negative');
            if (levelAfter > levelBefore) Toast.show(`🎉 LEVEL UP! Lv. ${levelAfter}`, 'positive');

            renderTaskChecklist(container, quest);
            renderQuestsPage();
        });

        row.querySelector('[data-role="edit"]').addEventListener('click', () => {
            renderTaskEditForm(container, quest, task);
        });

        row.querySelector('[data-role="remove"]').addEventListener('click', () => {
            if (!confirm(`Remove task "${task.label}"?`)) return;
            if (Vault.removeTask(quest.id, task.id)) {
                renderTaskChecklist(container, quest);
                renderQuestsPage();
            }
        });
    });

    container.querySelector('.quest-task-add-btn').addEventListener('click', () => {
        renderTaskAddForm(container, quest);
    });
}

// Swaps a task row for an inline label/DP edit form.
function renderTaskEditForm(container, quest, task) {
    const row = container.querySelector(`[data-task-id="${task.id}"]`);
    row.innerHTML = `
        <input type="text" class="quest-task-form-label" value="${escapeHTML(task.label)}">
        <input type="number" class="quest-task-form-dp" value="${task.dp}" min="0">
        <button class="quest-task-form-save">Save</button>
        <button class="quest-task-form-cancel">Cancel</button>
    `;

    row.querySelector('.quest-task-form-save').addEventListener('click', () => {
        const label = row.querySelector('.quest-task-form-label').value.trim();
        const dp = row.querySelector('.quest-task-form-dp').value;
        if (!label) return;

        if (Vault.updateTask(quest.id, task.id, { label, dp })) {
            renderTaskChecklist(container, quest);
            renderQuestsPage();
        }
    });

    row.querySelector('.quest-task-form-cancel').addEventListener('click', () => renderTaskChecklist(container, quest));
}

// Reveals an inline "new task" form in place of the Add Task button.
function renderTaskAddForm(container, quest) {
    const panel = container.querySelector('.quest-task-panel');
    const addBtn = panel.querySelector('.quest-task-add-btn');

    addBtn.insertAdjacentHTML('beforebegin', `
        <div class="quest-task-form">
            <input type="text" class="quest-task-form-label" placeholder="Task name">
            <input type="number" class="quest-task-form-dp" placeholder="DP" min="0">
            <button class="quest-task-form-save">Save</button>
            <button class="quest-task-form-cancel">Cancel</button>
        </div>
    `);
    addBtn.style.display = 'none';

    const form = panel.querySelector('.quest-task-form');
    form.querySelector('.quest-task-form-save').addEventListener('click', () => {
        const label = form.querySelector('.quest-task-form-label').value.trim();
        const dp = form.querySelector('.quest-task-form-dp').value;
        if (!label) return;

        if (Vault.addTask(quest.id, { label, dp })) {
            renderTaskChecklist(container, quest);
            renderQuestsPage();
        }
    });

    form.querySelector('.quest-task-form-cancel').addEventListener('click', () => renderTaskChecklist(container, quest));
}

// Opens a quest's log in the shared markdown viewer and hands it a task
// checklist and a "Make Active" button - MDViewer itself has no idea what
// either of those mean, it just mounts them and calls closures when clicked.
function openQuestIntel(quest) {
    MDViewer.open({
        title: quest.title,
        filePath: quest.logFile ? `./logs/${quest.logFile}` : null,
        storageKey: quest.logFile ? `bizzybee_quest_log_${quest.id}` : null,
        mountExtra: (container) => renderTaskChecklist(container, quest),
        actions: [
            {
                label: '🎯 Make Active',
                onClick: () => {
                    Vault.setActiveQuestId(quest.id);
                    MDViewer.close();
                    renderQuestsPage();
                }
            }
        ]
    });
}

function renderQuestsPage() {
    const quests = Vault.getQuests();
    const activeQuestId = Vault.getActiveQuestId();
    const activeQuest = quests.find(q => q.id === activeQuestId) || null;

    renderQuestList(
        'active-quest-list',
        activeQuest ? [activeQuest] : [],
        'No active quest selected. Open a quest below and click "Make Active" to focus your work.'
    );

    const notCompleted = q => q.status !== 'completed';

    renderQuestList('main-quest-list', quests.filter(q => q.category === 'main' && notCompleted(q)), 'No active campaigns. 🎉');

    const sideQuests = quests.filter(q => q.category === 'side' && notCompleted(q));
    const sideSection = document.getElementById('side-quest-section');
    sideSection.style.display = sideQuests.length === 0 ? 'none' : '';
    renderQuestList('side-quest-list', sideQuests, '');

    // Completed quests pool here regardless of category, so Main Campaign and
    // Side Operations only show what's still actionable.
    const completedQuests = quests.filter(q => q.status === 'completed');
    const completedSection = document.getElementById('completed-quest-section');
    completedSection.style.display = completedQuests.length === 0 ? 'none' : '';
    renderQuestList('completed-quest-list', completedQuests, '');

    document.querySelectorAll('.quest-view-intel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const quest = quests.find(q => q.id === btn.dataset.questId);
            if (quest) openQuestIntel(quest);
        });
    });
}

function setupCollapsibleSections() {
    document.querySelectorAll('.quest-section-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const section = toggle.closest('.quest-section');
            const isCollapsed = section.classList.toggle('quest-section--collapsed');
            toggle.setAttribute('aria-expanded', String(!isCollapsed));
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderQuestsPage();
    setupCollapsibleSections();

    // This page's Hive Mind action - stub until Eevee is wired up.
    HiveMind.setActions([
        {
            icon: '➕',
            label: 'Add Campaign',
            onClick: () => {
                alert('🐝 Eevee Engaged: Preparing to generate new game plan...');
            }
        }
    ]);
});
