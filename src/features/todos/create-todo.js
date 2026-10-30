console.log("/// CREATE TO-DO PROTOCOLS INITIALIZED ///");

// Create / edit a to-do (rebuilt 2026-10-09, same look as the Habit and
// Daily forms). Coloured top with Title + Notes, then Checklist,
// Difficulty, Due Date, Reminders and Tags. Shared widgets live in
// src/core/ui/task-form/task-form.js. Creating shows CREATE; editing shows
// DELETE and SAVE.

// One-off tiers - a To-Do happens once, so it uses Quest tasks' higher XP
// anchors rather than Dailies/Habits' recurring ones (see llm-engine.js's
// assessTodoXP for the guidance given to Eve).
const TODO_DIFFICULTY_TIERS = [
    { level: 'Trivial', xp: 15 },
    { level: 'Easy', xp: 30 },
    { level: 'Medium', xp: 70 },
    { level: 'Hard', xp: 150 }
];

let selectedDifficulty = 'Easy';
let timePicker = null;   // TaskForm.timePicker (Oct 2026: XP = minutes x effort)
// A tag added or removed updates "Counts toward" right away (Oct 29 2026).
document.addEventListener('tagschange', (e) => { if (e.target && e.target.id === 'todo-tags-list' && timePicker) timePicker.refresh(); });
let selectedXP = 30;
let editingTodoId = null;
let checklistEditor = null;
let reminderEditor = null;

// Tags: Dictionary terms, Daily / To-Do / Habit tags, Quest titles + tasks.
function collectKnownTerms() {
    const terms = new Map();
    const add = (t) => { if (t && !terms.has(t.toLowerCase())) terms.set(t.toLowerCase(), t); };
    (Vault.getDictionaryTerms() || []).forEach(term => add(term.name));
    (Vault.getDailyTasks() || []).forEach(task => (task.tags || []).forEach(add));
    (Vault.getTodos() || []).forEach(todo => (todo.tags || []).forEach(add));
    (Vault.getHabits ? Vault.getHabits() : []).forEach(habit => (habit.tags || []).forEach(add));
    (Vault.getQuests() || []).forEach(quest => {
        add(quest.title);
        (quest.tasks || []).forEach(task => add(task.label));
    });
    return [...terms.values()];
}

function rescanTags() {
    const title = document.getElementById('todo-title-input').value;
    const notes = document.getElementById('todo-notes-input').value;
    TagPicker.rescan(document.getElementById('todo-tags-list'), [title, notes], collectKnownTerms());
    if (timePicker) timePicker.refresh();
}

function renderDifficulty() {
    TaskForm.renderDifficulty(document.getElementById('hf-diff'), TODO_DIFFICULTY_TIERS, selectedDifficulty, document.getElementById('hf'));
    if (timePicker) timePicker.refresh();
}

function isoPlusDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The hint under Due Date, the × button, and the quick picks all follow
// whatever date is set. Reminders only fire on the due date, so their
// hint says so when there isn't one.
function renderDue() {
    const value = document.getElementById('todo-due-date').value;
    document.getElementById('todo-due-clear').hidden = !value;
    document.getElementById('todo-due-time-box').hidden = !value;
    // A date with no time: 10 PM (Oct 29 2026, Craft). You can change it.
    const timeEl = document.getElementById('todo-due-time');
    if (value && !timeEl.value) timeEl.value = '22:00';
    document.querySelectorAll('#todo-due-quick [data-days]').forEach(b => b.classList.toggle('on', value === isoPlusDays(Number(b.dataset.days))));
    let hint = 'Optional. Leave it blank for a to-do with no deadline.';
    if (value) {
        const [y, m, d] = value.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        hint = `Due ${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.`;
        if (value < TaskForm.todayISOLocal()) hint += ' That date has passed, so it shows as overdue.';
    }
    document.getElementById('todo-due-hint').textContent = hint;
    document.getElementById('todo-rem-hint').textContent = value
        ? 'Sends a notification on the due date, while Bizzybee is open in a tab.'
        : 'Reminders go off on the due date, so set one above for these to fire.';
}

function loadExistingTodo(todo) {
    document.getElementById('todo-title-input').value = todo.label || '';
    document.getElementById('todo-notes-input').value = todo.notes || '';
    selectedDifficulty = TODO_DIFFICULTY_TIERS.some(t => t.level === todo.difficulty) ? todo.difficulty : 'Easy';
    selectedXP = Number(todo.xp) || TODO_DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).xp;
    document.getElementById('todo-due-date').value = todo.dueDate || '';
    document.getElementById('todo-due-time').value = todo.dueTime || '';
    checklistEditor.set(todo.checklist || []);
    reminderEditor.set(todo.reminders || []);
    TagPicker.render(document.getElementById('todo-tags-list'), todo.tags || []);

    document.getElementById('hf-heading').textContent = '';
    document.getElementById('hf-delete').hidden = false;
    document.getElementById('hf-save').textContent = 'SAVE';
    document.title = '✏️ Edit To-Do';
}

function goBack() {
    window.location.href = './todos.html';
}

function saveTodo() {
    const titleInput = document.getElementById('todo-title-input');
    const label = titleInput.value.trim();
    if (!label) {
        titleInput.focus();
        TaskForm.nudge(titleInput.closest('.hf-field'));
        Toast.show('Give this to-do a title first.', 'negative');
        return;
    }

    const payload = {
        label,
        xp: selectedXP,
        difficulty: selectedDifficulty,
        notes: document.getElementById('todo-notes-input').value.trim(),
        // Checklist ticks on a to-do stay ticked, so keep each item's done.
        checklist: checklistEditor.get().map(i => ({ id: i.id, text: i.text, done: !!i.done })),
        dueDate: document.getElementById('todo-due-date').value || null,
        dueTime: (document.getElementById('todo-due-date').value && document.getElementById('todo-due-time').value) || null,
        reminders: reminderEditor.get(),
        tags: TagPicker.getTags(document.getElementById('todo-tags-list')),
        ...timePicker.get()
    };

    if (editingTodoId) {
        Vault.updateTodo(editingTodoId, payload);
        Toast.show(`📝 Saved: ${label}`, 'positive');
    } else {
        Vault.addTodo(payload);
        Toast.show(`📝 New to-do: ${label}`, 'positive');
    }
    if (payload.reminders.length && payload.dueDate) Reminders.requestPermissionIfNeeded();
    goBack();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    Waggle.setActions(baseWaggleActions());

    checklistEditor = TaskForm.checklist(document.getElementById('todo-checklist'), document.getElementById('todo-cl-add'), { checkable: 'todo' });
    reminderEditor = TaskForm.reminders(document.getElementById('todo-reminders'), document.getElementById('todo-rem-add'));

    editingTodoId = new URLSearchParams(window.location.search).get('id');
    const existing = editingTodoId ? Vault.getTodos().find(t => t.id === editingTodoId) : null;
    if (existing) {
        loadExistingTodo(existing);
    } else {
        editingTodoId = null;
        TagPicker.render(document.getElementById('todo-tags-list'), []);
    }

    timePicker = TaskForm.timePicker({
        mount: document.getElementById('tf-time'),
        note: document.getElementById('hf-xp-note'),
        getTask: () => ({
            label: document.getElementById('todo-title-input').value,
            notes: document.getElementById('todo-notes-input').value,
            tags: TagPicker.getTags(document.getElementById('todo-tags-list')),
            difficulty: selectedDifficulty
        })
    });
    if (existing) timePicker.set(existing);
    renderDifficulty();
    renderDue();
    rescanTags();
    if (!existing) setTimeout(() => document.getElementById('todo-title-input').focus(), 300);

    document.getElementById('hf-diff').addEventListener('click', (event) => {
        const b = event.target.closest('.hf-d');
        if (!b) return;
        selectedDifficulty = b.dataset.level;
        selectedXP = TODO_DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).xp;
        renderDifficulty();
    });

    const dueInput = document.getElementById('todo-due-date');
    dueInput.addEventListener('change', renderDue);
    document.getElementById('todo-due-clear').addEventListener('click', () => { dueInput.value = ''; renderDue(); });
    document.getElementById('todo-due-quick').addEventListener('click', (event) => {
        const b = event.target.closest('[data-days]');
        if (!b) return;
        dueInput.value = isoPlusDays(Number(b.dataset.days));
        renderDue();
    });

    TaskForm.privacyToggle(document.getElementById('hf-tip-btn'), document.getElementById('hf-tip'));

    document.getElementById('todo-title-input').addEventListener('input', rescanTags);
    document.getElementById('todo-notes-input').addEventListener('input', rescanTags);
    document.getElementById('todo-title-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') saveTodo(); });

    document.getElementById('todo-ask-eevee-btn').addEventListener('click', async () => {
        const title = document.getElementById('todo-title-input').value.trim();
        if (!title) {
            Toast.show('Give this to-do a title first so Eve has something to judge.', 'negative');
            return;
        }
        const notes = document.getElementById('todo-notes-input').value.trim();
        const btn = document.getElementById('todo-ask-eevee-btn');
        const originalLabel = btn.textContent;
        btn.textContent = '🐝 Buzzing...';
        btn.disabled = true;
        try {
            selectedXP = await Eve.assessTodoXP(title, notes, selectedDifficulty);
            document.getElementById('hf-xp-note').textContent = `${selectedXP} XP when done`;
            Toast.show(`🐝 Eve set this at ${selectedXP} XP.`, 'positive');
        } catch (error) {
            Toast.show(`⚠️ ${error.message} Keeping the ${selectedDifficulty} default.`, 'negative');
        } finally {
            btn.textContent = originalLabel;
            btn.disabled = false;
        }
    });

    document.getElementById('hf-back').addEventListener('click', goBack);
    document.getElementById('hf-save').addEventListener('click', saveTodo);
    TaskForm.armDelete(document.getElementById('hf-delete'), () => {
        Vault.removeTodo(editingTodoId);
        Toast.show('To-do deleted', 'negative');
        goBack();
    });
});
