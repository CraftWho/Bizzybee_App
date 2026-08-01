console.log("/// QUEST BOARD PROTOCOLS INITIALIZED ///");

const QUEST_STATUS_LABELS = {
    active: '🔄 In Progress',
    completed: '✅ Completed',
    optional: '🔓 Optional'
};

// Task/objective/source text is user-editable and rendered via innerHTML -
// escape it so a value containing '<' or '"' can't break the markup.
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Like escapeHTML, but also safe to drop inside a "..." attribute value
// (escapeHTML alone doesn't escape quote characters).
function escapeAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Historical tasks completed before this field stored a full timestamp only
// have a plain date ("2025-09-06") - still parses fine, just displays as
// local midnight for those. New completions get a real time going forward.
function formatCompletedAt(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Rough DP anchors per difficulty tier - matches the guidance baked into
// Eevee's prompt in llm-engine.js, so manual entry and LLM-generated tasks
// land on a similar scale. Auto-fills the DP field when a difficulty is
// picked in the add/edit forms below; still freely editable afterward.
const DIFFICULTY_DP_SUGGESTIONS = { Easy: 20, Medium: 60, Hard: 120 };

function difficultySelectHTML(selected) {
    const options = ['', 'Easy', 'Medium', 'Hard'].map(level => {
        const label = level || 'No difficulty';
        return `<option value="${level}"${level === (selected || '') ? ' selected' : ''}>${label}</option>`;
    }).join('');
    return `<select class="quest-task-form-difficulty">${options}</select>`;
}

function questMaxPoints(quest) {
    return (quest.tasks || []).reduce((sum, t) => sum + t.dp, 0);
}

function questEarnedPoints(quest) {
    return (quest.tasks || []).filter(t => t.completed).reduce((sum, t) => sum + t.dp, 0);
}

function renderQuestCard(quest) {
    const statusLabel = QUEST_STATUS_LABELS[quest.status] || quest.status;
    const completedClass = quest.status === 'completed' ? ' quest-card--completed' : '';

    return `
        <div class="panel quest-card${completedClass}">
            <h3 class="quest-card-title">${escapeHTML(quest.title)}</h3>
            <hr class="quest-card-divider">
            <p class="quest-meta"><strong>ID:</strong> ${quest.id}</p>
            <p class="quest-meta"><strong>Status:</strong> ${statusLabel}</p>
            <p class="quest-meta"><strong>Max Points:</strong> ${questMaxPoints(quest)} DP</p>
            <button class="quest-view-intel-btn" data-quest-id="${quest.id}">View Intel</button>
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

// A single unified scrolling document - name/points/status/dates, then
// objective, then source, then the live task checklist, in that order.
// No separate panels, no markdown: quests are fully structured data now.
// Builds on the generic modal shell in src/core/modal/ - the same shell
// MDViewer uses - rather than depending on MDViewer's own stylesheet.
const QuestDetail = {
    overlay: null,

    open(quest) {
        this.close();

        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-box">
                <div class="modal-header">
                    <span class="modal-title">${escapeHTML(quest.title)}</span>
                    <button class="modal-close" aria-label="Close">✕</button>
                </div>
                <div class="modal-body"></div>
                <div class="modal-footer">
                    <div class="modal-footer-actions">
                        <button class="modal-btn-accent quest-detail-make-active">🎯 Make Active</button>
                    </div>
                    <div class="modal-footer-controls">
                        <button class="modal-btn-muted quest-detail-dev-edit-btn">🛠️ Dev Edit</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        this.overlay.addEventListener('click', (event) => {
            if (event.target === this.overlay) this.close();
        });
        this.overlay.querySelector('.modal-close').addEventListener('click', () => this.close());
        this.overlay.querySelector('.quest-detail-make-active').addEventListener('click', () => {
            Vault.setActiveQuestId(quest.id);
            this.close();
            renderQuestsPage();
        });
        this.overlay.querySelector('.quest-detail-dev-edit-btn').addEventListener('click', () => {
            this.openDevEdit(quest);
        });

        this.render(quest);
    },

    render(quest) {
        const body = this.overlay.querySelector('.modal-body');
        const statusLabel = QUEST_STATUS_LABELS[quest.status] || quest.status;

        body.innerHTML = `
            <div class="stats-grid quest-detail-stats">
                <div class="stat-box">
                    <span class="stat-label">MAX POINTS</span>
                    <span class="stat-value text-gold">${questMaxPoints(quest)} DP</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">STATUS</span>
                    <span class="stat-value">${statusLabel}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">DATE STARTED</span>
                    <span class="stat-value">${quest.dateStarted || '—'}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">DATE COMPLETED</span>
                    <span class="stat-value">${quest.dateCompleted || '—'}</span>
                </div>
            </div>

            <h3 class="quest-detail-heading">
                <span>🎯 Objective</span>
                <button class="quest-task-icon-btn" data-role="edit-objective" aria-label="Edit objective">✏️</button>
            </h3>
            <div class="quest-detail-text-box" id="quest-detail-objective"></div>

            <h3 class="quest-detail-heading">
                <span>📺 Source</span>
                <button class="quest-task-icon-btn" data-role="edit-source" aria-label="Edit source">✏️</button>
            </h3>
            <div id="quest-detail-source"></div>

            ${quest.queensDecree ? `
            <h3 class="quest-detail-heading">
                <span>🐝 The Queen's Decree</span>
            </h3>
            <div class="quest-detail-text-box">
                <p class="quest-detail-text">${escapeHTML(quest.queensDecree)}</p>
            </div>
            ` : ''}

            <h3 class="quest-detail-heading">
                <span>📋 Tasks</span>
                <span class="quest-task-progress">${questEarnedPoints(quest)} / ${questMaxPoints(quest)} DP</span>
            </h3>
            <ul class="task-list quest-task-list" id="quest-detail-task-list"></ul>
            <button class="quest-task-add-btn">➕ Add Task</button>

            ${quest.repoTask ? `
            <h3 class="quest-detail-heading"><span>🛠️ Repo Task</span></h3>
            <div class="quest-detail-text-box">
                <p class="quest-detail-text"><strong>File:</strong> ${escapeHTML(quest.repoTask.file)}</p>
                <p class="quest-detail-text"><strong>Requirements:</strong></p>
                <ul class="quest-repo-requirements">
                    ${(quest.repoTask.requirements || []).map(r => `<li>${escapeHTML(r)}</li>`).join('')}
                </ul>
                <p class="quest-detail-text"><strong>DP Earned:</strong> +${quest.repoTask.dp} &nbsp;&nbsp; <strong>Date Completed:</strong> ${escapeHTML(quest.repoTask.dateCompleted || '—')}</p>
            </div>
            ` : ''}

            ${quest.quizChallenge ? `
            <h3 class="quest-detail-heading"><span>❓ Quiz Challenge</span></h3>
            <div class="quest-detail-text-box">
                <p class="quest-detail-text"><strong>File:</strong> ${escapeHTML(quest.quizChallenge.file)}</p>
                <p class="quest-detail-text"><strong>Concept:</strong> ${escapeHTML(quest.quizChallenge.concept)}</p>
                <p class="quest-detail-text"><strong>Score:</strong> ${quest.quizChallenge.correct}/${quest.quizChallenge.questionCount} (${quest.quizChallenge.score}%) &nbsp;&nbsp; <strong>Status:</strong> ${escapeHTML(quest.quizChallenge.status)}</p>
                <p class="quest-detail-text"><strong>Date Completed:</strong> ${escapeHTML(quest.quizChallenge.dateCompleted || '—')}</p>
            </div>
            ` : ''}

            ${quest.patchNotes && quest.patchNotes.length > 0 ? `
            <h3 class="quest-detail-heading"><span>📜 Patch Notes</span></h3>
            <ul class="quest-patch-notes">
                ${quest.patchNotes.map(p => `
                    <li><strong>${escapeHTML(p.date)}</strong> — ${escapeHTML(p.change)}<br><span class="quest-detail-text--empty">${escapeHTML(p.notes)}</span></li>
                `).join('')}
            </ul>
            ` : ''}
        `;

        this.renderObjective(quest);
        this.renderSource(quest);
        this.renderTasks(quest);

        body.querySelector('[data-role="edit-objective"]').addEventListener('click', () => {
            this.renderObjectiveEditForm(quest);
        });
        body.querySelector('[data-role="edit-source"]').addEventListener('click', () => {
            this.renderSourceEditForm(quest);
        });
        body.querySelector('.quest-task-add-btn').addEventListener('click', () => {
            renderTaskAddForm(body, quest, () => this.render(quest));
        });
    },

    renderObjective(quest) {
        const box = this.overlay.querySelector('#quest-detail-objective');
        box.innerHTML = quest.objective
            ? `<p class="quest-detail-text">${escapeHTML(quest.objective)}</p>`
            : `<p class="quest-detail-text quest-detail-text--empty">No objective set yet.</p>`;
    },

    renderObjectiveEditForm(quest) {
        const box = this.overlay.querySelector('#quest-detail-objective');
        box.innerHTML = `
            <textarea class="quest-detail-edit-textarea">${escapeHTML(quest.objective || '')}</textarea>
            <div class="quest-task-form">
                <button class="quest-task-form-save">Save</button>
                <button class="quest-task-form-cancel">Cancel</button>
            </div>
        `;

        box.querySelector('.quest-task-form-save').addEventListener('click', () => {
            const value = box.querySelector('.quest-detail-edit-textarea').value.trim();
            const updated = Vault.updateQuestField(quest.id, 'objective', value || null);
            if (updated) {
                quest.objective = updated.objective;
                this.renderObjective(quest);
            }
        });
        box.querySelector('.quest-task-form-cancel').addEventListener('click', () => this.renderObjective(quest));
    },

    renderSource(quest) {
        const box = this.overlay.querySelector('#quest-detail-source');
        box.innerHTML = quest.source
            ? `<a class="quest-detail-source-link" href="${escapeAttr(quest.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(quest.source.label)}</a>`
            : `<p class="quest-detail-text quest-detail-text--empty">No source linked.</p>`;
    },

    renderSourceEditForm(quest) {
        const box = this.overlay.querySelector('#quest-detail-source');
        box.innerHTML = `
            <input type="text" class="quest-detail-source-input" placeholder="Source label (e.g. Scrimba course name)" value="${escapeAttr(quest.source ? quest.source.label : '')}">
            <input type="text" class="quest-detail-source-input" placeholder="https://..." value="${escapeAttr(quest.source ? quest.source.url : '')}">
            <div class="quest-task-form">
                <button class="quest-task-form-save">Save</button>
                <button class="quest-task-form-cancel">Cancel</button>
            </div>
        `;

        const inputs = box.querySelectorAll('.quest-detail-source-input');
        box.querySelector('.quest-task-form-save').addEventListener('click', () => {
            const label = inputs[0].value.trim();
            const url = inputs[1].value.trim();
            const updated = Vault.updateQuestField(quest.id, 'source', label && url ? { label, url } : null);
            if (updated) {
                quest.source = updated.source;
                this.renderSource(quest);
            }
        });
        box.querySelector('.quest-task-form-cancel').addEventListener('click', () => this.renderSource(quest));
    },

    // Power-user / LLM-integration escape hatch: view and overwrite this
    // quest's raw JSON directly, instead of going through the field-level UI.
    openDevEdit(quest) {
        const body = this.overlay.querySelector('.modal-body');
        body.innerHTML = `
            <p class="quest-detail-text quest-detail-text--empty">
                🛠️ Raw JSON for this quest. Hand-edit it, or paste in Eevee-generated quest data.
                The "id" field is pinned to "${quest.id}" no matter what's pasted here.
            </p>
            <textarea class="modal-textarea quest-detail-json-editor">${escapeHTML(JSON.stringify(quest, null, 2))}</textarea>
            <div class="quest-task-form">
                <button class="quest-task-form-save">💾 Save JSON</button>
                <button class="quest-task-form-cancel">Cancel</button>
            </div>
        `;

        body.querySelector('.quest-task-form-save').addEventListener('click', () => {
            let parsed;
            try {
                parsed = JSON.parse(body.querySelector('.quest-detail-json-editor').value);
            } catch (error) {
                alert('That is not valid JSON - fix the syntax and try again.');
                return;
            }

            const updated = Vault.replaceQuest(quest.id, parsed);
            if (!updated) {
                alert('Could not save - quest ID not found.');
                return;
            }

            Object.assign(quest, updated);
            this.render(quest);
            renderQuestsPage();
        });

        body.querySelector('.quest-task-form-cancel').addEventListener('click', () => this.render(quest));
    },

    renderTasks(quest) {
        const list = this.overlay.querySelector('#quest-detail-task-list');
        const tasks = quest.tasks || [];

        list.innerHTML = tasks.map(task => `
            <li class="quest-task-item${task.completed ? ' quest-task-item--done' : ''}" data-task-id="${task.id}">
                <input type="checkbox" data-role="toggle" ${task.completed ? 'checked' : ''}>
                ${task.link
                    ? `<a class="quest-task-label quest-task-label--link" href="${escapeAttr(task.link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(task.label)}</a>`
                    : `<span class="quest-task-label">${escapeHTML(task.label)}</span>`
                }
                ${task.relevance ? `<small class="quest-task-relevance quest-task-relevance--${escapeAttr(task.relevance.toLowerCase())}">${escapeHTML(task.relevance)}</small>` : ''}
                ${task.difficulty ? `<small class="quest-task-difficulty quest-task-difficulty--${escapeAttr(task.difficulty.toLowerCase())}">${escapeHTML(task.difficulty)}</small>` : ''}
                <small class="quest-task-dp">+${task.dp} DP</small>
                ${task.completed && task.dateCompleted ? `<small class="quest-task-completed-at">✓ ${formatCompletedAt(task.dateCompleted)}</small>` : ''}
                <button class="quest-task-icon-btn" data-role="edit" aria-label="Edit task">✏️</button>
                <button class="quest-task-icon-btn quest-task-icon-btn--remove" data-role="remove" aria-label="Remove task">🗑️</button>
            </li>
        `).join('');

        tasks.forEach(task => {
            const row = list.querySelector(`[data-task-id="${task.id}"]`);

            row.querySelector('[data-role="toggle"]').addEventListener('change', () => {
                const willComplete = !task.completed;
                const levelBefore = Vault.getUser().level;
                const updated = Vault.toggleTask(quest.id, task.id);
                if (!updated) return;

                const levelAfter = Vault.getUser().level;
                Toast.show(willComplete ? `🐝 +${task.dp} DP` : `➖ ${task.dp} DP`, willComplete ? 'positive' : 'negative');
                if (levelAfter > levelBefore) Toast.show(`🎉 LEVEL UP! Lv. ${levelAfter}`, 'positive');

                this.render(quest);
                renderQuestsPage();
            });

            row.querySelector('[data-role="edit"]').addEventListener('click', () => {
                renderTaskEditForm(row, quest, task, () => this.render(quest));
            });

            row.querySelector('[data-role="remove"]').addEventListener('click', () => {
                if (!confirm(`Remove task "${task.label}"?`)) return;
                if (Vault.removeTask(quest.id, task.id)) {
                    this.render(quest);
                    renderQuestsPage();
                }
            });
        });
    },

    close() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
};

// Selecting a difficulty auto-fills the DP field with the matching
// suggestion (still freely editable after) - shared by every add/edit form
// below, quest tasks and dailies alike.
function wireDifficultyAutoFill(form) {
    const select = form.querySelector('.quest-task-form-difficulty');
    const dpInput = form.querySelector('.quest-task-form-dp');
    select.addEventListener('change', () => {
        if (DIFFICULTY_DP_SUGGESTIONS[select.value] !== undefined) {
            dpInput.value = DIFFICULTY_DP_SUGGESTIONS[select.value];
        }
    });
}

// Swaps a task row for an inline label/DP/difficulty edit form.
function renderTaskEditForm(row, quest, task, onDone) {
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

        if (Vault.updateTask(quest.id, task.id, { label, dp, difficulty })) {
            onDone();
            renderQuestsPage();
        }
    });

    row.querySelector('.quest-task-form-cancel').addEventListener('click', onDone);
}

// Reveals an inline "new task" form in place of the Add Task button.
function renderTaskAddForm(body, quest, onDone) {
    const addBtn = body.querySelector('.quest-task-add-btn');

    addBtn.insertAdjacentHTML('beforebegin', `
        <div class="quest-task-form">
            <input type="text" class="quest-task-form-label" placeholder="Task name">
            ${difficultySelectHTML(null)}
            <input type="number" class="quest-task-form-dp" placeholder="DP" min="0">
            <button class="quest-task-form-save">Save</button>
            <button class="quest-task-form-cancel">Cancel</button>
        </div>
    `);
    addBtn.style.display = 'none';

    const form = body.querySelector('.quest-task-form');
    wireDifficultyAutoFill(form);

    form.querySelector('.quest-task-form-save').addEventListener('click', () => {
        const label = form.querySelector('.quest-task-form-label').value.trim();
        const dp = form.querySelector('.quest-task-form-dp').value;
        const difficulty = form.querySelector('.quest-task-form-difficulty').value;
        if (!label) return;

        if (Vault.addTask(quest.id, { label, dp, difficulty })) {
            onDone();
            renderQuestsPage();
        }
    });

    form.querySelector('.quest-task-form-cancel').addEventListener('click', onDone);
}

// Daily Tasks moved to their own page (src/features/dailies/) - they were
// getting lost at the bottom of this page's collapsed sections. See
// dailies.js for the management UI (add/edit/remove); Home still just
// displays/toggles them for quick daily check-ins.

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
            if (quest) QuestDetail.open(quest);
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

    HiveMind.setActions([
        {
            icon: '➕',
            label: 'Add Campaign',
            onClick: async () => {
                const goal = prompt('🐝 What goal do you want Eevee to build a campaign around?');
                if (!goal || !goal.trim()) return;

                Toast.show('🐝 The Queen is deliberating...', 'positive');
                try {
                    const quest = await Eevee.generateQuest(goal.trim());
                    Vault.addQuest(quest);
                    renderQuestsPage();
                    Toast.show(quest.queensDecree || `🐝 New campaign added: ${quest.title}`, 'positive');
                } catch (error) {
                    console.error(error);
                    Toast.show(`⚠️ ${error.message}`, 'negative');
                }
            }
        },
        ...baseHiveMindActions()
    ]);
});
