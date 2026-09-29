console.log("/// CREATE HABIT PROTOCOLS INITIALIZED ///");

// Same 4-tier scale Dailies uses - a habit repeats at least as often (often
// MORE often, since it can be clicked several times a day), so it shares
// Dailies' modest DP anchors rather than Quest's one-off anchors.
const HABIT_DIFFICULTY_TIERS = [
    { level: 'Trivial', dp: 10, icon: '◆' },
    { level: 'Easy', dp: 20, icon: '◆◆' },
    { level: 'Medium', dp: 60, icon: '◆◆◆' },
    { level: 'Hard', dp: 120, icon: '◆◆◆◆' }
];

let selectedDifficulty = 'Easy';
let selectedDP = 20;
let editingHabitId = null;
let habitPositiveEnabled = true;
let habitNegativeEnabled = true;
let selectedResetCounter = 'daily';

// Every term a tag could plausibly match against - same sources
// create-daily.js's collectKnownTerms uses, plus existing Habit tags too.
// Stays page-owned (see src/core/tag-picker/tag-picker.js) - only the
// scan/render/dismiss mechanics around this are shared.
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

    (Vault.getHabits() || []).forEach(habit => {
        (habit.tags || []).forEach(tag => {
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
    const title = document.getElementById('habit-title-input').value;
    const notes = document.getElementById('habit-notes-input').value;
    TagPicker.rescan(document.getElementById('habit-tags-list'), [title, notes], collectKnownTerms());
}

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

function loadExistingHabit(existing) {
    document.getElementById('habit-title-input').value = existing.label || '';
    document.getElementById('habit-notes-input').value = existing.notes || '';
    selectedDifficulty = existing.difficulty || 'Easy';
    selectedDP = Number(existing.dp) || HABIT_DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
    document.getElementById('habit-dp-value').textContent = selectedDP;
    TagPicker.render(document.getElementById('habit-tags-list'), existing.tags || []);

    // Absent on a habit saved before this toggle existed - default both on,
    // same "both, always" behavior it already had (see Vault.getHabits).
    habitPositiveEnabled = existing.positive !== false;
    habitNegativeEnabled = existing.negative !== false;
    selectedResetCounter = existing.resetCounter || 'daily';
    renderActionToggles();
    renderResetToggles();

    document.getElementById('create-habit-heading').innerHTML = '✏️ <span class="gold-gradient-text">EDIT HABIT</span>';
    document.getElementById('create-habit-subtitle').textContent = 'Update any part of this habit - changes apply immediately on save.';
    document.getElementById('habit-save-btn').textContent = '💾 Save Changes';
}

// Reflects habitPositiveEnabled/habitNegativeEnabled onto the two toggle
// buttons - called on load and after every click (see the click handlers
// wired in DOMContentLoaded below).
function renderActionToggles() {
    const positiveBtn = document.querySelector('.habit-action-toggle--positive');
    const negativeBtn = document.querySelector('.habit-action-toggle--negative');
    positiveBtn.setAttribute('aria-pressed', String(habitPositiveEnabled));
    negativeBtn.setAttribute('aria-pressed', String(habitNegativeEnabled));
}

function renderResetToggles() {
    document.querySelectorAll('.habit-reset-btn').forEach(btn => {
        btn.classList.toggle('habit-reset-btn--selected', btn.dataset.reset === selectedResetCounter);
    });
}

function setupNewHabitDefaults() {
    selectedDP = HABIT_DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
    document.getElementById('habit-dp-value').textContent = selectedDP;
    TagPicker.render(document.getElementById('habit-tags-list'), []);
    renderActionToggles();
    renderResetToggles();
}

function saveHabit() {
    const label = document.getElementById('habit-title-input').value.trim();
    if (!label) {
        Toast.show('Give this habit a title first.', 'negative');
        return;
    }

    if (!habitPositiveEnabled && !habitNegativeEnabled) {
        Toast.show('Turn on at least one of Positive or Negative.', 'negative');
        return;
    }

    const payload = {
        label,
        dp: selectedDP,
        difficulty: selectedDifficulty,
        notes: document.getElementById('habit-notes-input').value,
        tags: TagPicker.getTags(document.getElementById('habit-tags-list')),
        positive: habitPositiveEnabled,
        negative: habitNegativeEnabled,
        resetCounter: selectedResetCounter
    };

    if (editingHabitId) {
        Vault.updateHabit(editingHabitId, payload);
        Toast.show(`✅ Updated: ${label}`, 'positive');
    } else {
        Vault.addHabit(payload);
        Toast.show(`✅ New habit added: ${label}`, 'positive');
    }

    window.location.href = './habits.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('habits');
    if (!installed) {
        window.location.href = './habits.html';
        return;
    }

    Waggle.setActions(baseWaggleActions());

    editingHabitId = getQueryParam('id');
    const existing = editingHabitId ? Vault.getHabits().find(h => h.id === editingHabitId) : null;

    if (existing) {
        loadExistingHabit(existing);
    } else {
        editingHabitId = null;
        setupNewHabitDefaults();
    }

    DifficultyPicker.render(document.getElementById('habit-difficulty-grid'), HABIT_DIFFICULTY_TIERS, selectedDifficulty, (tier) => {
        selectedDifficulty = tier.level;
        selectedDP = tier.dp;
        document.getElementById('habit-dp-value').textContent = selectedDP;
    });
    rescanTags();

    document.querySelector('.habit-action-toggle--positive').addEventListener('click', () => {
        if (habitPositiveEnabled && !habitNegativeEnabled) {
            Toast.show('Turn on at least one of Positive or Negative.', 'negative');
            return;
        }
        habitPositiveEnabled = !habitPositiveEnabled;
        renderActionToggles();
    });
    document.querySelector('.habit-action-toggle--negative').addEventListener('click', () => {
        if (habitNegativeEnabled && !habitPositiveEnabled) {
            Toast.show('Turn on at least one of Positive or Negative.', 'negative');
            return;
        }
        habitNegativeEnabled = !habitNegativeEnabled;
        renderActionToggles();
    });

    document.querySelectorAll('.habit-reset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedResetCounter = btn.dataset.reset;
            renderResetToggles();
        });
    });

    document.getElementById('habit-title-tip-btn').addEventListener('click', () => {
        const tip = document.getElementById('habit-title-tip-text');
        const button = document.getElementById('habit-title-tip-btn');
        const willShow = tip.hidden;
        tip.hidden = !willShow;
        button.setAttribute('aria-expanded', String(willShow));
    });

    document.getElementById('habit-title-input').addEventListener('input', rescanTags);
    document.getElementById('habit-notes-input').addEventListener('input', rescanTags);

    document.getElementById('habit-ask-eevee-btn').addEventListener('click', async () => {
        const title = document.getElementById('habit-title-input').value.trim();
        if (!title) {
            Toast.show('Give this habit a title first so Eevee has something to judge.', 'negative');
            return;
        }
        const notes = document.getElementById('habit-notes-input').value.trim();
        const btn = document.getElementById('habit-ask-eevee-btn');
        const originalLabel = btn.textContent;
        btn.textContent = '🐝 Buzzing...';
        btn.disabled = true;

        try {
            selectedDP = await Eevee.assessHabitDP(title, notes, selectedDifficulty);
            document.getElementById('habit-dp-value').textContent = selectedDP;
            Toast.show(`🐝 Eevee set this at ${selectedDP} DP.`, 'positive');
        } catch (error) {
            Toast.show(`⚠️ ${error.message} Keeping the ${selectedDifficulty} tier default.`, 'negative');
        } finally {
            btn.textContent = originalLabel;
            btn.disabled = false;
        }
    });

    document.getElementById('habit-cancel-btn').addEventListener('click', () => {
        window.location.href = './habits.html';
    });

    document.getElementById('habit-save-btn').addEventListener('click', saveHabit);
});
