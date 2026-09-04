console.log("/// CREATE DAILY PROTOCOLS INITIALIZED ///");

// A native <input type="date">'s default value has to be a LOCAL
// YYYY-MM-DD, not Vault's todayISO() (which slices toISOString() - UTC
// based, same off-by-one-near-midnight gotcha noted in the Calendar
// plugin's grid math). Only used for this input's default; everything
// stored/compared against isDailyDueOn still goes through Vault's own
// date handling untouched.
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

const DIFFICULTY_TIERS = [
    { level: 'Trivial', dp: 10, icon: '◆' },
    { level: 'Easy', dp: 20, icon: '◆◆' },
    { level: 'Medium', dp: 60, icon: '◆◆◆' },
    { level: 'Hard', dp: 120, icon: '◆◆◆◆' }
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun..Sat, matches Date#getDay()
const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// All mutable form state lives here rather than being re-read from the DOM
// on every change - the DOM is just a view of this, same separation
// BeeCard/ItemCard use. The checklist/clock/tags/difficulty widgets keep
// their own internal state now (see src/core/checklist-editor,
// clock-picker, tag-picker, difficulty-picker); what's left here is state
// only this page cares about.
let selectedDifficulty = 'Easy';
let selectedDP = 20;
let repeatsType = 'weekly';
let selectedDaysOfWeek = [];
let remindersState = [];
let editingTaskId = null;

function renderDayToggles() {
    const row = document.getElementById('daily-days-row');
    row.innerHTML = DAY_LABELS.map((label, i) => `
        <button type="button" class="daily-day-toggle${selectedDaysOfWeek.includes(i) ? ' daily-day-toggle--selected' : ''}" data-day="${i}">${label}</button>
    `).join('');

    row.querySelectorAll('.daily-day-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const day = Number(btn.dataset.day);
            selectedDaysOfWeek = selectedDaysOfWeek.includes(day)
                ? selectedDaysOfWeek.filter(d => d !== day)
                : [...selectedDaysOfWeek, day].sort((a, b) => a - b);
            renderDayToggles();
            renderScheduleSummary();
        });
    });
}

function renderScheduleSummary() {
    const summaryEl = document.getElementById('daily-schedule-summary');

    if (repeatsType === 'daily') {
        summaryEl.innerHTML = 'Due <strong>every day</strong>.';
        return;
    }

    if (selectedDaysOfWeek.length === 0) {
        summaryEl.textContent = 'Pick at least one day for this to ever be due.';
        return;
    }

    const every = Number(document.getElementById('daily-every-input').value) || 1;
    const dayNames = selectedDaysOfWeek.map(d => DAY_FULL_NAMES[d]);
    const everyLabel = every === 1 ? 'week' : `${every} weeks`;
    summaryEl.innerHTML = `Repeats every <strong>${everyLabel}</strong> on <strong>${dayNames.join(', ')}</strong>.`;
}

function updateScheduleFieldVisibility() {
    const isWeekly = repeatsType === 'weekly';
    document.getElementById('daily-every-wrap').style.display = isWeekly ? '' : 'none';
    document.getElementById('daily-days-row').style.display = isWeekly ? '' : 'none';
}

function renderReminders() {
    const list = document.getElementById('daily-reminders-list');
    list.innerHTML = remindersState.length
        ? remindersState.map(r => `
            <div class="daily-reminder-row" data-reminder-id="${r.id}">
                <span class="daily-reminder-time">🔔 ${formatTime12h(r.time)}</span>
                <button type="button" class="daily-reminder-remove" aria-label="Remove reminder">×</button>
            </div>
        `).join('')
        : '';

    list.querySelectorAll('.daily-reminder-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.daily-reminder-row');
            remindersState = remindersState.filter(r => r.id !== row.dataset.reminderId);
            renderReminders();
        });
    });
}

// --- AUTOMATIC TAGS ---
// Every term a tag could plausibly match against: Dictionary term names
// (these are also what ties a tag to the Skill Mastery matrix - see
// computeSkillMatrixDP in db.js), every tag already used on any other
// Daily, and every Quest task's label. Map keyed by lowercase so matching
// is case-insensitive while still returning each term in its original
// canonical casing. Stays page-owned (see src/core/tag-picker/tag-picker.js) -
// only the scan/render/dismiss mechanics around this are shared.
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
    const title = document.getElementById('daily-title-input').value;
    const notes = document.getElementById('daily-notes-input').value;
    TagPicker.rescan(document.getElementById('daily-tags-list'), [title, notes], collectKnownTerms());
}

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

function loadExistingTask(existing) {
    document.getElementById('daily-title-input').value = existing.label || '';
    document.getElementById('daily-notes-input').value = existing.notes || '';
    selectedDifficulty = existing.difficulty || 'Easy';
    selectedDP = Number(existing.dp) || DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
    document.getElementById('daily-dp-value').textContent = selectedDP;
    document.getElementById('daily-start-date').value = existing.startDate || todayISOLocal();

    const repeats = existing.repeats || { type: 'weekly', every: 1, daysOfWeek: [] };
    repeatsType = repeats.type || 'weekly';
    document.getElementById('daily-repeats-select').value = repeatsType;
    document.getElementById('daily-every-input').value = repeats.every || 1;
    selectedDaysOfWeek = repeats.daysOfWeek && repeats.daysOfWeek.length ? [...repeats.daysOfWeek] : [];

    remindersState = (existing.reminders || []).map(r => ({ ...r }));
    TagPicker.render(document.getElementById('daily-tags-list'), existing.tags || []);
    ChecklistEditor.render(document.getElementById('daily-checklist'), existing.checklist || []);

    document.getElementById('create-daily-heading').innerHTML = '✏️ <span class="gold-gradient-text">EDIT DAILY</span>';
    document.getElementById('create-daily-subtitle').textContent = 'Update any part of this daily - changes apply immediately on save.';
    document.getElementById('daily-save-btn').textContent = '💾 Save Changes';
}

function setupNewTaskDefaults() {
    document.getElementById('daily-start-date').value = todayISOLocal();
    selectedDP = DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
    document.getElementById('daily-dp-value').textContent = selectedDP;
    document.getElementById('daily-repeats-select').value = repeatsType;
    // Every day of the week selected by default - matches how a fresh
    // daily behaves before you've narrowed it down to specific days.
    selectedDaysOfWeek = [0, 1, 2, 3, 4, 5, 6];
    TagPicker.render(document.getElementById('daily-tags-list'), []);
    ChecklistEditor.render(document.getElementById('daily-checklist'), []);
}

function saveDaily() {
    const label = document.getElementById('daily-title-input').value.trim();
    if (!label) {
        Toast.show('Give this daily a title first.', 'negative');
        return;
    }

    const payload = {
        label,
        dp: selectedDP,
        difficulty: selectedDifficulty,
        notes: document.getElementById('daily-notes-input').value,
        checklist: ChecklistEditor.getItems(document.getElementById('daily-checklist')),
        startDate: document.getElementById('daily-start-date').value || todayISOLocal(),
        repeats: {
            type: repeatsType,
            every: Number(document.getElementById('daily-every-input').value) || 1,
            daysOfWeek: repeatsType === 'weekly' ? selectedDaysOfWeek : []
        },
        reminders: remindersState,
        tags: TagPicker.getTags(document.getElementById('daily-tags-list'))
    };

    if (editingTaskId) {
        Vault.updateDailyTask(editingTaskId, payload);
        Toast.show(`☀️ Updated: ${label}`, 'positive');
    } else {
        Vault.addDailyTask(payload);
        Toast.show(`☀️ New daily added: ${label}`, 'positive');
    }

    window.location.href = './dailies.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    Waggle.setActions(baseWaggleActions());

    editingTaskId = getQueryParam('id');
    const existing = editingTaskId ? Vault.getDailyTasks().find(t => t.id === editingTaskId) : null;

    if (existing) {
        loadExistingTask(existing);
    } else {
        editingTaskId = null; // an id that no longer matches anything just falls back to create mode
        setupNewTaskDefaults();
    }

    updateScheduleFieldVisibility();
    DifficultyPicker.render(document.getElementById('daily-difficulty-grid'), DIFFICULTY_TIERS, selectedDifficulty, (tier) => {
        selectedDifficulty = tier.level;
        selectedDP = tier.dp;
        document.getElementById('daily-dp-value').textContent = selectedDP;
    });
    renderDayToggles();
    renderScheduleSummary();
    renderReminders();

    // The clock wheel widget renders into its own mount point; the
    // "+ Add reminder" button lives in the page's own HTML (it's this
    // page's action, not the picker's) but visually belongs inside the
    // picker's controls column, so it's moved in right after render -
    // same flex column layout the original inline markup had.
    const clockMount = document.getElementById('daily-clock-mount');
    ClockPicker.render(clockMount);
    clockMount.querySelector('.clock-wheel-controls').appendChild(document.getElementById('daily-add-reminder-btn'));

    rescanTags(); // catches any Dictionary/tag/quest terms already sitting in loaded title/notes

    document.getElementById('daily-title-input').addEventListener('input', rescanTags);
    document.getElementById('daily-notes-input').addEventListener('input', rescanTags);

    document.getElementById('daily-repeats-select').addEventListener('change', (e) => {
        repeatsType = e.target.value;
        updateScheduleFieldVisibility();
        renderScheduleSummary();
    });
    document.getElementById('daily-every-input').addEventListener('input', renderScheduleSummary);

    document.getElementById('daily-add-reminder-btn').addEventListener('click', () => {
        const time = ClockPicker.getTime24(clockMount);
        remindersState.push({ id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, time });
        renderReminders();
        Reminders.requestPermissionIfNeeded();
        Toast.show(`🔔 Reminder set for ${formatTime12h(time)}`, 'positive');
        ClockPicker.reset(clockMount);
    });

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
            document.getElementById('daily-dp-value').textContent = selectedDP;
            Toast.show(`🐝 Eevee set this at ${selectedDP} DP.`, 'positive');
        } catch (error) {
            Toast.show(`⚠️ ${error.message} Keeping the ${selectedDifficulty} tier default.`, 'negative');
        } finally {
            btn.textContent = originalLabel;
            btn.disabled = false;
        }
    });

    document.getElementById('daily-cancel-btn').addEventListener('click', () => {
        window.location.href = './dailies.html';
    });

    document.getElementById('daily-save-btn').addEventListener('click', saveDaily);
});
