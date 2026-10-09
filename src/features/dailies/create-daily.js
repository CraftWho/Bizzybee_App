console.log("/// CREATE DAILY PROTOCOLS INITIALIZED ///");

// Create / edit a daily (rebuilt 2026-10-09 from Craft's Habitica photo,
// same look as create-habit.html). Shared widgets (difficulty tiles,
// checklist, reminders, Delete) are in src/core/task-form/task-form.js;
// this page owns Scheduling and Adjust Streak. The top takes the
// difficulty colour. Creating shows CREATE; editing shows DELETE and SAVE.

const DAILY_DIFFICULTY_TIERS = [
    { level: 'Trivial', dp: 10 },
    { level: 'Easy', dp: 20 },
    { level: 'Medium', dp: 60 },
    { level: 'Hard', dp: 120 }
];

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun..Sat, matches Date#getDay()
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EVERY_UNIT = { daily: ['Day', 'Days'], weekly: ['Week', 'Weeks'], monthly: ['Month', 'Months'] };

let selectedDifficulty = 'Easy';
let selectedDP = 20;
let repeatsType = 'weekly';
let selectedDays = [0, 1, 2, 3, 4, 5, 6];
let editingTaskId = null;
let startingStreak = 0;
let checklistEditor = null;
let reminderEditor = null;

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---- tags (same sources as the old form, plus Habit tags) ----
function collectKnownTerms() {
    const terms = new Map();
    const add = (t) => { if (t && !terms.has(t.toLowerCase())) terms.set(t.toLowerCase(), t); };
    (Vault.getDictionaryTerms() || []).forEach(term => add(term.name));
    (Vault.getDailyTasks() || []).forEach(task => (task.tags || []).forEach(add));
    (Vault.getHabits ? Vault.getHabits() : []).forEach(habit => (habit.tags || []).forEach(add));
    (Vault.getQuests() || []).forEach(quest => {
        add(quest.title);
        (quest.tasks || []).forEach(task => add(task.label));
    });
    return [...terms.values()];
}

function rescanTags() {
    const title = document.getElementById('daily-title-input').value;
    const notes = document.getElementById('daily-notes-input').value;
    TagPicker.rescan(document.getElementById('daily-tags-list'), [title, notes], collectKnownTerms());
}

function renderDifficulty() {
    TaskForm.renderDifficulty(document.getElementById('hf-diff'), DAILY_DIFFICULTY_TIERS, selectedDifficulty, document.getElementById('hf'));
    document.getElementById('hf-dp-note').textContent = `${selectedDP} DP when done`;
}

// ---- scheduling ----
function everyValue() {
    return Math.max(1, Math.min(99, Number(document.getElementById('daily-every-input').value) || 1));
}

function renderDays() {
    const row = document.getElementById('df-days');
    row.hidden = repeatsType !== 'weekly';
    row.innerHTML = DAY_LETTERS.map((letter, i) => {
        const on = selectedDays.includes(i);
        return `<button type="button" class="df-day${on ? ' on' : ''}" data-day="${i}" aria-pressed="${on}" aria-label="${DAY_NAMES[i]}">${letter}</button>`;
    }).join('');
}

function renderSummary() {
    const every = everyValue();
    const unit = EVERY_UNIT[repeatsType] || EVERY_UNIT.weekly;
    document.getElementById('daily-every-unit').textContent = every === 1 ? unit[0] : unit[1];
    const el = document.getElementById('df-summary');
    const span = every === 1 ? unit[0].toLowerCase() : `${every} ${unit[1].toLowerCase()}`;

    if (repeatsType === 'daily') {
        el.innerHTML = `Repeats every <b>${span}</b>.`;
    } else if (repeatsType === 'monthly') {
        const start = document.getElementById('daily-start-date').value || TaskForm.todayISOLocal();
        el.innerHTML = `Repeats every <b>${span}</b> on the <b>${ordinal(Number(start.slice(8, 10)))}</b>.`;
    } else if (!selectedDays.length) {
        el.textContent = 'Pick at least one day, or this will never be due.';
    } else {
        el.innerHTML = selectedDays.length === 7
            ? (every === 1 ? 'Repeats <b>every day</b>.' : `Repeats <b>every day</b>, every <b>${span}</b>.`)
            : `Repeats every <b>${span}</b> on <b>${selectedDays.map(d => DAY_NAMES[d]).join(', ')}</b>.`;
    }
}

// ---- streak ----
function setStreakInput(n) {
    document.getElementById('df-streak').value = Math.max(0, Math.floor(Number(n) || 0));
}

function loadExistingTask(task) {
    document.getElementById('daily-title-input').value = task.label || '';
    document.getElementById('daily-notes-input').value = task.notes || '';
    selectedDifficulty = DAILY_DIFFICULTY_TIERS.some(t => t.level === task.difficulty) ? task.difficulty : 'Easy';
    selectedDP = Number(task.dp) || DAILY_DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
    document.getElementById('daily-start-date').value = task.startDate || TaskForm.todayISOLocal();

    const repeats = task.repeats || { type: 'daily', every: 1, daysOfWeek: [] };
    repeatsType = EVERY_UNIT[repeats.type] ? repeats.type : 'daily';
    document.getElementById('daily-every-input').value = repeats.every || 1;
    selectedDays = repeats.daysOfWeek && repeats.daysOfWeek.length ? [...repeats.daysOfWeek] : [0, 1, 2, 3, 4, 5, 6];

    // Keep each item's doneOn so today's ticks survive an edit.
    checklistEditor.set((task.checklist || []).map(i => ({ id: i.id, text: i.text, doneOn: i.doneOn || null })));
    reminderEditor.set(task.reminders || []);
    startingStreak = task.streak || 0;
    setStreakInput(startingStreak);
    TagPicker.render(document.getElementById('daily-tags-list'), task.tags || []);

    document.getElementById('hf-heading').textContent = '';
    document.getElementById('hf-delete').hidden = false;
    document.getElementById('hf-save').textContent = 'SAVE';
    document.title = '✏️ Edit Daily';
}

function goBack() {
    window.location.href = './dailies.html';
}

function saveDaily() {
    const titleInput = document.getElementById('daily-title-input');
    const label = titleInput.value.trim();
    if (!label) {
        titleInput.focus();
        TaskForm.nudge(titleInput.closest('.hf-field'));
        Toast.show('Give this daily a title first.', 'negative');
        return;
    }
    if (repeatsType === 'weekly' && !selectedDays.length) {
        TaskForm.nudge(document.getElementById('df-days'));
        Toast.show('Pick at least one day for it to repeat on.', 'negative');
        return;
    }

    const payload = {
        label,
        dp: selectedDP,
        difficulty: selectedDifficulty,
        notes: document.getElementById('daily-notes-input').value.trim(),
        checklist: checklistEditor.get().map(i => ({ id: i.id, text: i.text, done: false, ...(i.doneOn ? { doneOn: i.doneOn } : {}) })),
        startDate: document.getElementById('daily-start-date').value || TaskForm.todayISOLocal(),
        repeats: {
            type: repeatsType,
            every: everyValue(),
            daysOfWeek: repeatsType === 'weekly' ? selectedDays : []
        },
        reminders: reminderEditor.get(),
        tags: TagPicker.getTags(document.getElementById('daily-tags-list'))
    };
    const wantedStreak = Math.max(0, Math.floor(Number(document.getElementById('df-streak').value) || 0));

    if (editingTaskId) {
        Vault.updateDailyTask(editingTaskId, payload);
        if (wantedStreak !== startingStreak) Vault.setDailyStreak(editingTaskId, wantedStreak);
        Toast.show(`☀️ Saved: ${label}`, 'positive');
    } else {
        Vault.addDailyTask(payload);
        if (wantedStreak > 0 && Vault._lastDailyId) Vault.setDailyStreak(Vault._lastDailyId, wantedStreak);
        Toast.show(`☀️ New daily: ${label}`, 'positive');
    }
    if (payload.reminders.length) Reminders.requestPermissionIfNeeded();
    goBack();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    Waggle.setActions(baseWaggleActions());

    checklistEditor = TaskForm.checklist(document.getElementById('df-checklist'), document.getElementById('df-cl-add'));
    reminderEditor = TaskForm.reminders(document.getElementById('df-reminders'), document.getElementById('df-rem-add'));

    editingTaskId = new URLSearchParams(window.location.search).get('id');
    const existing = editingTaskId ? Vault.getDailyTasks().find(t => t.id === editingTaskId) : null;
    if (existing) {
        loadExistingTask(existing);
    } else {
        editingTaskId = null;
        document.getElementById('daily-start-date').value = TaskForm.todayISOLocal();
        TagPicker.render(document.getElementById('daily-tags-list'), []);
    }
    document.getElementById('daily-repeats-select').value = repeatsType;

    renderDifficulty();
    renderDays();
    renderSummary();
    rescanTags();
    if (!existing) setTimeout(() => document.getElementById('daily-title-input').focus(), 300);

    document.getElementById('hf-diff').addEventListener('click', (event) => {
        const b = event.target.closest('.hf-d');
        if (!b) return;
        selectedDifficulty = b.dataset.level;
        selectedDP = DAILY_DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
        renderDifficulty();
    });

    document.getElementById('daily-repeats-select').addEventListener('change', (event) => {
        repeatsType = event.target.value;
        renderDays();
        renderSummary();
    });
    document.getElementById('daily-every-input').addEventListener('input', renderSummary);
    document.getElementById('daily-start-date').addEventListener('change', renderSummary);
    document.getElementById('df-days').addEventListener('click', (event) => {
        const b = event.target.closest('.df-day');
        if (!b) return;
        const day = Number(b.dataset.day);
        selectedDays = selectedDays.includes(day) ? selectedDays.filter(d => d !== day) : [...selectedDays, day].sort((a, c) => a - c);
        renderDays();
        renderSummary();
    });

    const streakInput = document.getElementById('df-streak');
    document.getElementById('df-streak-down').addEventListener('click', () => setStreakInput(Number(streakInput.value) - 1));
    document.getElementById('df-streak-up').addEventListener('click', () => setStreakInput(Number(streakInput.value) + 1));

    TaskForm.privacyToggle(document.getElementById('hf-tip-btn'), document.getElementById('hf-tip'));

    document.getElementById('daily-title-input').addEventListener('input', rescanTags);
    document.getElementById('daily-notes-input').addEventListener('input', rescanTags);
    document.getElementById('daily-title-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') saveDaily(); });

    document.getElementById('daily-ask-eevee-btn').addEventListener('click', async () => {
        const title = document.getElementById('daily-title-input').value.trim();
        if (!title) {
            Toast.show('Give this daily a title first so Eevee has something to judge.', 'negative');
            return;
        }
        const notes = document.getElementById('daily-notes-input').value.trim();
        const btn = document.getElementById('daily-ask-eevee-btn');
        const originalLabel = btn.textContent;
        btn.textContent = '🐝 Buzzing...';
        btn.disabled = true;
        try {
            selectedDP = await Eevee.assessDailyDP(title, notes, selectedDifficulty);
            document.getElementById('hf-dp-note').textContent = `${selectedDP} DP when done`;
            Toast.show(`🐝 Eevee set this at ${selectedDP} DP.`, 'positive');
        } catch (error) {
            Toast.show(`⚠️ ${error.message} Keeping the ${selectedDifficulty} default.`, 'negative');
        } finally {
            btn.textContent = originalLabel;
            btn.disabled = false;
        }
    });

    document.getElementById('hf-back').addEventListener('click', goBack);
    document.getElementById('hf-save').addEventListener('click', saveDaily);
    TaskForm.armDelete(document.getElementById('hf-delete'), () => {
        Vault.removeDailyTask(editingTaskId);
        Toast.show('Daily deleted', 'negative');
        goBack();
    });
});
