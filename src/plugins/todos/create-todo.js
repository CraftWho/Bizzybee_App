console.log("/// CREATE TO-DO PROTOCOLS INITIALIZED ///");

function todayISOLocal() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatTime12h(hm) {
    const [h, m] = hm.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// One-off tiers - a To-Do happens once, so it shares Quest tasks' higher
// DP anchors rather than Dailies/Habits' modest recurring-task anchors
// (see llm-engine.js's assessTodoDP for the exact guidance given to Eevee).
const DIFFICULTY_TIERS = [
    { level: 'Trivial', dp: 15, icon: '◆' },
    { level: 'Easy', dp: 30, icon: '◆◆' },
    { level: 'Medium', dp: 70, icon: '◆◆◆' },
    { level: 'Hard', dp: 150, icon: '◆◆◆◆' }
];

// All mutable form state lives here rather than being re-read from the DOM
// on every change. The checklist/clock/tags/difficulty widgets keep their
// own internal state now (see src/core/checklist-editor, clock-picker,
// tag-picker, difficulty-picker); what's left here is state only this
// page cares about.
let selectedDifficulty = 'Easy';
let selectedDP = 30;
let remindersState = [];
let editingTodoId = null;

function renderReminders() {
    const list = document.getElementById('todo-reminders-list');
    list.innerHTML = remindersState.length
        ? remindersState.map(r => `
            <div class="todo-reminder-row" data-reminder-id="${r.id}">
                <span class="todo-reminder-time">🔔 ${formatTime12h(r.time)}</span>
                <button type="button" class="todo-reminder-remove" aria-label="Remove reminder">×</button>
            </div>
        `).join('')
        : '';

    list.querySelectorAll('.todo-reminder-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.todo-reminder-row');
            remindersState = remindersState.filter(r => r.id !== row.dataset.reminderId);
            renderReminders();
        });
    });
}

// --- AUTOMATIC TAGS --- collectKnownTerms stays page-owned (see
// src/core/tag-picker/tag-picker.js) - existing To-Do tags as a
// known-term source, on top of create-daily.js's own sources.
function collectKnownTerms() {
    const terms = new Map();

    (Vault.getDictionaryTerms() || []).forEach(term => {
        if (term.name && !terms.has(term.name.toLowerCase())) {
            terms.set(term.name.toLowerCase(), term.name);
        }
    });

    (Vault.getDailyTasks() || []).forEach(task => {
        (task.tags || []).forEach(tag => {
            if (tag && !terms.has(tag.toLowerCase())) terms.set(tag.toLowerCase(), tag);
        });
    });

    (Vault.getTodos() || []).forEach(todo => {
        (todo.tags || []).forEach(tag => {
            if (tag && !terms.has(tag.toLowerCase())) terms.set(tag.toLowerCase(), tag);
        });
    });

    (Vault.getQuests() || []).forEach(quest => {
        if (quest.title && !terms.has(quest.title.toLowerCase())) {
            terms.set(quest.title.toLowerCase(), quest.title);
        }
        (quest.tasks || []).forEach(task => {
            if (task.label && !terms.has(task.label.toLowerCase())) {
                terms.set(task.label.toLowerCase(), task.label);
            }
        });
    });

    return [...terms.values()];
}

function rescanTags() {
    const title = document.getElementById('todo-title-input').value;
    const notes = document.getElementById('todo-notes-input').value;
    TagPicker.rescan(document.getElementById('todo-tags-list'), [title, notes], collectKnownTerms());
}

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

function loadExistingTodo(existing) {
    document.getElementById('todo-title-input').value = existing.label || '';
    document.getElementById('todo-notes-input').value = existing.notes || '';
    selectedDifficulty = existing.difficulty || 'Easy';
    selectedDP = Number(existing.dp) || DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
    document.getElementById('todo-dp-value').textContent = selectedDP;
    document.getElementById('todo-due-date').value = existing.dueDate || '';

    remindersState = (existing.reminders || []).map(r => ({ ...r }));
    TagPicker.render(document.getElementById('todo-tags-list'), existing.tags || []);
    ChecklistEditor.render(document.getElementById('todo-checklist'), existing.checklist || []);

    document.getElementById('create-todo-heading').innerHTML = '✏️ <span class="gold-gradient-text">EDIT TO-DO</span>';
    document.getElementById('create-todo-subtitle').textContent = 'Update any part of this to-do - changes apply immediately on save.';
    document.getElementById('todo-save-btn').textContent = '💾 Save Changes';
}

function setupNewTodoDefaults() {
    selectedDP = DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
    document.getElementById('todo-dp-value').textContent = selectedDP;
    TagPicker.render(document.getElementById('todo-tags-list'), []);
    ChecklistEditor.render(document.getElementById('todo-checklist'), []);
}

function saveTodo() {
    const label = document.getElementById('todo-title-input').value.trim();
    if (!label) {
        Toast.show('Give this to-do a title first.', 'negative');
        return;
    }

    const payload = {
        label,
        dp: selectedDP,
        difficulty: selectedDifficulty,
        notes: document.getElementById('todo-notes-input').value,
        checklist: ChecklistEditor.getItems(document.getElementById('todo-checklist')),
        dueDate: document.getElementById('todo-due-date').value || null,
        reminders: remindersState,
        tags: TagPicker.getTags(document.getElementById('todo-tags-list'))
    };

    if (editingTodoId) {
        Vault.updateTodo(editingTodoId, payload);
        Toast.show(`📝 Updated: ${label}`, 'positive');
    } else {
        Vault.addTodo(payload);
        Toast.show(`📝 New to-do added: ${label}`, 'positive');
    }

    window.location.href = './todos.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('todos');
    if (!installed) {
        window.location.href = './todos.html';
        return;
    }

    Waggle.setActions(baseWaggleActions());

    editingTodoId = getQueryParam('id');
    const existing = editingTodoId ? Vault.getTodos().find(t => t.id === editingTodoId) : null;

    if (existing) {
        loadExistingTodo(existing);
    } else {
        editingTodoId = null;
        setupNewTodoDefaults();
    }

    DifficultyPicker.render(document.getElementById('todo-difficulty-grid'), DIFFICULTY_TIERS, selectedDifficulty, (tier) => {
        selectedDifficulty = tier.level;
        selectedDP = tier.dp;
        document.getElementById('todo-dp-value').textContent = selectedDP;
    });
    renderReminders();

    // The clock wheel widget renders into its own mount point; the
    // "+ Add reminder" button lives in the page's own HTML (it's this
    // page's action, not the picker's) but visually belongs inside the
    // picker's controls column, so it's moved in right after render -
    // same flex column layout the original inline markup had.
    const clockMount = document.getElementById('todo-clock-mount');
    ClockPicker.render(clockMount);
    clockMount.querySelector('.clock-wheel-controls').appendChild(document.getElementById('todo-add-reminder-btn'));

    rescanTags();

    document.getElementById('todo-title-input').addEventListener('input', rescanTags);
    document.getElementById('todo-notes-input').addEventListener('input', rescanTags);

    document.getElementById('todo-title-tip-btn').addEventListener('click', () => {
        const tip = document.getElementById('todo-title-tip-text');
        const button = document.getElementById('todo-title-tip-btn');
        const willShow = tip.hidden;
        tip.hidden = !willShow;
        button.setAttribute('aria-expanded', String(willShow));
    });

    document.getElementById('todo-add-reminder-btn').addEventListener('click', () => {
        const time = ClockPicker.getTime24(clockMount);
        remindersState.push({ id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, time });
        renderReminders();
        Reminders.requestPermissionIfNeeded();
        Toast.show(`🔔 Reminder set for ${formatTime12h(time)}`, 'positive');
        ClockPicker.reset(clockMount);
    });

    document.getElementById('todo-ask-eevee-btn').addEventListener('click', async () => {
        const title = document.getElementById('todo-title-input').value.trim();
        if (!title) {
            Toast.show('Give this to-do a title first so Eevee has something to judge.', 'negative');
            return;
        }
        const notes = document.getElementById('todo-notes-input').value.trim();
        const btn = document.getElementById('todo-ask-eevee-btn');
        const originalLabel = btn.textContent;
        btn.textContent = '🐝 Buzzing...';
        btn.disabled = true;

        try {
            selectedDP = await Eevee.assessTodoDP(title, notes, selectedDifficulty);
            document.getElementById('todo-dp-value').textContent = selectedDP;
            Toast.show(`🐝 Eevee set this at ${selectedDP} DP.`, 'positive');
        } catch (error) {
            Toast.show(`⚠️ ${error.message} Keeping the ${selectedDifficulty} tier default.`, 'negative');
        } finally {
            btn.textContent = originalLabel;
            btn.disabled = false;
        }
    });

    document.getElementById('todo-cancel-btn').addEventListener('click', () => {
        window.location.href = './todos.html';
    });

    document.getElementById('todo-save-btn').addEventListener('click', saveTodo);
});
