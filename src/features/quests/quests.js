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

// Maps this page's own relevance/difficulty vocabulary onto the shared
// StatusDot palette (src/core/status-dot/) - kept here rather than inside
// StatusDot itself, since "what 'medium' means" is this feature's own
// business, not the generic dot component's.
const RELEVANCE_DOT_COLOR = { high: 'green', medium: 'yellow', low: 'gray' };
const DIFFICULTY_DOT_COLOR = { easy: 'green', medium: 'yellow', hard: 'red' };
const GHOST_LOG_DOT_COLOR = { pending: 'gray', red: 'red', yellow: 'yellow', green: 'green' };

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

            <h3 class="quest-detail-heading quest-detail-heading--objective">
                <span>🎯 Objective</span>
                <button class="quest-task-icon-btn" data-role="edit-objective" aria-label="Edit objective">✏️</button>
            </h3>
            <div class="quest-detail-text-box" id="quest-detail-objective"></div>
            <div class="quest-related-terms-wrap" id="quest-detail-related-terms"></div>

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
            <div class="quest-task-progress-track"><div class="quest-task-progress-fill" style="width:${questMaxPoints(quest) > 0 ? Math.round(questEarnedPoints(quest) / questMaxPoints(quest) * 100) : 0}%;"></div></div>
            <ul class="task-list quest-task-list" id="quest-detail-task-list"></ul>
            <button class="quest-task-add-btn">➕ Add Task</button>

            <h3 class="quest-detail-heading"><span>👻 Interactive Intel (Ghost Logs)</span></h3>
            <ul class="quest-ghost-log-list" id="quest-detail-ghost-logs"></ul>
            <button class="quest-ghost-log-add-btn">➕ Add Ghost Log</button>

            ${(Vault.getSideQuestsFor(quest.id).length > 0 || Vault.getParentQuestFor(quest.id)) ? `
            <h3 class="quest-detail-heading"><span>🧩 Side Quests</span></h3>
            <div id="quest-detail-side-quests"></div>
            ` : ''}

            ${quest.codexUnlocks && quest.codexUnlocks.length > 0 ? `
            <h3 class="quest-detail-heading"><span>🔓 Codex Unlocks</span></h3>
            <ul class="quest-codex-unlocks-list" id="quest-detail-codex-unlocks"></ul>
            ` : ''}

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
            <h3 class="quest-detail-heading">
                <span>📜 Patch Notes</span>
                <span class="quest-dev-version-badge" title="Only ever present in your personal data - never shipped in the generic base app.">🛠️ Developer Version</span>
            </h3>
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
        this.renderRelatedTerms(quest);
        this.renderGhostLogs(quest);
        this.renderSideQuests(quest);
        this.renderCodexUnlocks(quest);

        body.querySelector('[data-role="edit-objective"]').addEventListener('click', () => {
            this.renderObjectiveEditForm(quest);
        });
        body.querySelector('[data-role="edit-source"]').addEventListener('click', () => {
            this.renderSourceEditForm(quest);
        });
        const ghostLogAddBtn = body.querySelector('.quest-ghost-log-add-btn');
        if (ghostLogAddBtn) {
            ghostLogAddBtn.addEventListener('click', () => {
                // Full re-render (not just renderGhostLogs) - the form gets
                // inserted as a sibling of the Add button itself, so only a
                // full render() cleanly removes it and restores the button,
                // same reasoning renderTaskAddForm's own onDone uses above.
                renderGhostLogAddForm(body, quest, () => this.render(quest));
            });
        }
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
                <div class="quest-task-accent quest-task-accent--${task.completed ? 'green' : 'yellow'}"></div>
                <div class="quest-task-body">
                    <div class="quest-task-top">
                        <input type="checkbox" class="quest-task-checkbox" data-role="toggle" ${task.completed ? 'checked' : ''}>
                        ${task.link
                            ? `<a class="quest-task-label quest-task-label--link" href="${escapeAttr(task.link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(task.label)}</a>`
                            : `<span class="quest-task-label">${escapeHTML(task.label)}</span>`
                        }
                        <button class="quest-task-more-btn" data-role="more" aria-label="More actions">⋯</button>
                    </div>
                    <div class="quest-task-meta">
                        <small class="quest-task-dp">+${task.dp} DP</small>
                        ${task.relevance ? `<small class="quest-task-relevance quest-task-relevance--${escapeAttr(task.relevance.toLowerCase())}">${StatusDot.html(RELEVANCE_DOT_COLOR[task.relevance.toLowerCase()] || 'gray')}${escapeHTML(task.relevance)}</small>` : ''}
                        ${task.difficulty ? `<small class="quest-task-difficulty quest-task-difficulty--${escapeAttr(task.difficulty.toLowerCase())}">${StatusDot.html(DIFFICULTY_DOT_COLOR[task.difficulty.toLowerCase()] || 'gray')}${escapeHTML(task.difficulty)}</small>` : ''}
                        ${task.completed && task.dateCompleted ? `<small class="quest-task-completed-at">✓ ${formatCompletedAt(task.dateCompleted)}</small>` : ''}
                    </div>
                </div>
                <div class="quest-task-more-menu" data-role="more-menu">
                    <button type="button" data-role="edit">✏️ Edit</button>
                    <button type="button" data-role="remove">🗑️ Remove</button>
                </div>
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

            row.querySelector('[data-role="more"]').addEventListener('click', (event) => {
                event.stopPropagation();
                const menu = row.querySelector('[data-role="more-menu"]');
                const willOpen = !menu.classList.contains('quest-task-more-menu--open');
                list.querySelectorAll('.quest-task-more-menu--open').forEach(m => m.classList.remove('quest-task-more-menu--open'));
                if (willOpen) menu.classList.add('quest-task-more-menu--open');
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

        // Tapping anywhere outside a row's own ⋯ menu closes it - the menu
        // toggle above already stopPropagation()s so this only ever fires
        // for genuine outside clicks/taps.
        list.addEventListener('click', () => {
            list.querySelectorAll('.quest-task-more-menu--open').forEach(m => m.classList.remove('quest-task-more-menu--open'));
        });
    },

    // "Related Terms" - a compact, collapsed-by-default list of Dictionary
    // terms this quest actually touches (via Vault.getQuestRelatedTerms),
    // each one linking straight to that term on the Dictionary page rather
    // than repeating its full definition inline here. This replaces the old
    // Codex tracker's approach of embedding a whole glossary excerpt
    // directly in the quest doc - Leo's own words: "I don't like how long
    // it is on the codex" - so the detail stays one click away instead of
    // pushing the quest screen itself down.
    renderRelatedTerms(quest) {
        const wrap = this.overlay.querySelector('#quest-detail-related-terms');
        const terms = Vault.getQuestRelatedTerms(quest.id);

        if (terms.length === 0) {
            wrap.innerHTML = '';
            return;
        }

        wrap.innerHTML = `
            <button type="button" class="quest-related-terms-toggle" data-role="toggle-related-terms">📖 Related Terms (${terms.length})</button>
            <div class="quest-related-terms-list" id="quest-related-terms-list" hidden>
                ${terms.map(term => `<a class="quest-related-term-link" href="../dictionary/dictionary.html?term=${encodeURIComponent(term.id)}">${escapeHTML(term.name)}</a>`).join('')}
            </div>
        `;

        wrap.querySelector('[data-role="toggle-related-terms"]').addEventListener('click', () => {
            const list = wrap.querySelector('#quest-related-terms-list');
            list.hidden = !list.hidden;
        });
    },

    // Ghost Logs - see db.js's "5m" section for the data model/rationale.
    // Each row gets a live StatusDot + a <select> to change its status
    // directly (rather than a click-to-cycle button, so the current state
    // and every option are visible at once).
    renderGhostLogs(quest) {
        const list = this.overlay.querySelector('#quest-detail-ghost-logs');
        if (!list) return;
        const entries = Vault.getGhostLogs(quest.id);

        list.innerHTML = entries.length > 0 ? entries.map(entry => `
            <li class="quest-ghost-log-item" data-entry-id="${entry.id}">
                ${StatusDot.html(GHOST_LOG_DOT_COLOR[entry.status] || 'gray', { large: true })}
                <span class="quest-ghost-log-name">${escapeHTML(entry.name)}</span>
                <select class="quest-ghost-log-status-select" data-role="status">
                    ${['pending', 'red', 'yellow', 'green'].map(s => `<option value="${s}"${s === entry.status ? ' selected' : ''}>${s === 'pending' ? 'Pending' : s === 'red' ? '🔴 Attempted' : s === 'yellow' ? '🟡 Partial' : '🟢 Full'}</option>`).join('')}
                </select>
                <small class="quest-task-dp">+${entry.dp} DP</small>
                <button class="quest-task-icon-btn quest-task-icon-btn--remove" data-role="remove-ghost-log" aria-label="Remove Ghost Log entry">🗑️</button>
            </li>
        `).join('') : '<li class="quest-detail-text--empty quest-ghost-log-empty">No Ghost Logs yet.</li>';

        entries.forEach(entry => {
            const row = list.querySelector(`[data-entry-id="${entry.id}"]`);
            if (!row) return;

            row.querySelector('[data-role="status"]').addEventListener('change', (event) => {
                Vault.updateGhostLogStatus(quest.id, entry.id, event.target.value);
                this.renderGhostLogs(quest);
                renderQuestsPage();
            });

            row.querySelector('[data-role="remove-ghost-log"]').addEventListener('click', () => {
                if (!confirm(`Remove Ghost Log "${entry.name}"?`)) return;
                Vault.removeGhostLog(quest.id, entry.id);
                this.renderGhostLogs(quest);
                renderQuestsPage();
            });
        });
    },

    // Side Quests - a main quest's own sideQuestIds rendered as a linked
    // list, PLUS (for a side quest) its live-derived back-link to whichever
    // main quest claims it (see Vault.getParentQuestFor - nothing stored on
    // the side quest itself, so the two can never disagree).
    renderSideQuests(quest) {
        const wrap = this.overlay.querySelector('#quest-detail-side-quests');
        if (!wrap) return;

        const children = Vault.getSideQuestsFor(quest.id);
        const parent = Vault.getParentQuestFor(quest.id);

        const rows = [];
        if (parent) {
            rows.push(`<li class="quest-side-quest-row"><span class="quest-detail-text--empty">⬅ Part of:</span> <button type="button" class="quest-side-quest-link" data-role="open-related" data-quest-id="${escapeAttr(parent.id)}">${escapeHTML(parent.title)}</button></li>`);
        }
        children.forEach(child => {
            const statusLabel = QUEST_STATUS_LABELS[child.status] || child.status;
            rows.push(`<li class="quest-side-quest-row"><button type="button" class="quest-side-quest-link" data-role="open-related" data-quest-id="${escapeAttr(child.id)}">${escapeHTML(child.title)}</button> <small class="quest-detail-text--empty">${escapeHTML(statusLabel)}</small></li>`);
        });

        wrap.innerHTML = `<ul class="quest-side-quest-list">${rows.join('')}</ul>`;

        wrap.querySelectorAll('[data-role="open-related"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const related = Vault.getQuests().find(q => q.id === btn.dataset.questId);
                if (related) QuestDetail.open(related);
            });
        });
    },

    // Codex Unlocks - see db.js's "5o" section. Read-only display + a
    // single "Claim" action per not-yet-earned entry; the data itself
    // (title/ability/optional skillNodeId) is authored via Dev Edit, same
    // as repoTask/quizChallenge/patchNotes.
    renderCodexUnlocks(quest) {
        const list = this.overlay.querySelector('#quest-detail-codex-unlocks');
        if (!list) return;

        const unlocks = Vault.getCodexUnlocks(quest.id);
        list.innerHTML = unlocks.map(unlock => `
            <li class="quest-codex-unlock-item" data-unlock-id="${unlock.id}">
                <div class="quest-codex-unlock-main">
                    <strong>${escapeHTML(unlock.title)}</strong>
                    <span class="quest-detail-text--empty">${escapeHTML(unlock.ability)}</span>
                </div>
                ${unlock.dateEarned
                    ? `<small class="quest-codex-unlock-earned">✅ ${escapeHTML(unlock.dateEarned)}</small>`
                    : `<button type="button" class="quest-codex-unlock-claim-btn" data-role="claim">🔓 Claim</button>`
                }
            </li>
        `).join('');

        unlocks.filter(u => !u.dateEarned).forEach(unlock => {
            const row = list.querySelector(`[data-unlock-id="${unlock.id}"]`);
            if (!row) return;
            row.querySelector('[data-role="claim"]').addEventListener('click', () => {
                const result = Vault.claimCodexUnlock(quest.id, unlock.id);
                if (!result) return;
                Toast.show(
                    result.skillUnlocked
                        ? `🔓 ${result.unlock.title} claimed - "${result.skillUnlocked.name}" unlocked on the Skill Tree!`
                        : `🔓 ${result.unlock.title} claimed!`,
                    'positive'
                );
                this.renderCodexUnlocks(quest);
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

// Reveals an inline "new Ghost Log" form in place of the Add Ghost Log
// button - name + dp only, since a fresh entry always starts 'pending'
// (set its real status afterward via the row's own status dropdown).
function renderGhostLogAddForm(body, quest, onDone) {
    const addBtn = body.querySelector('.quest-ghost-log-add-btn');
    if (!addBtn) return;

    addBtn.insertAdjacentHTML('beforebegin', `
        <div class="quest-task-form quest-ghost-log-form">
            <input type="text" class="quest-ghost-log-form-name" placeholder="Challenge name">
            <input type="number" class="quest-ghost-log-form-dp" placeholder="DP" min="0">
            <button class="quest-task-form-save">Save</button>
            <button class="quest-task-form-cancel">Cancel</button>
        </div>
    `);
    addBtn.style.display = 'none';

    const form = body.querySelector('.quest-ghost-log-form');

    form.querySelector('.quest-task-form-save').addEventListener('click', () => {
        const name = form.querySelector('.quest-ghost-log-form-name').value.trim();
        const dp = form.querySelector('.quest-ghost-log-form-dp').value;
        if (!name) return;

        if (Vault.addGhostLog(quest.id, { name, dp })) {
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

    Waggle.setActions([
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
        ...baseWaggleActions()
    ]);
});
