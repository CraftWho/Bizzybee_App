console.log("/// CREATE HABIT PROTOCOLS INITIALIZED ///");

// Create / edit a habit (rebuilt 2026-10-08 from Craft's Habitica photos):
// a coloured top with Task Title + Notes, then Positive / Negative hexagons,
// Difficulty, Reset Counter, Adjust Counter (edit only) and Tags. The top
// takes the colour of the chosen difficulty, same colours as the hexagon
// buttons on the Habits page (HABIT_DIFFICULTY_STYLE in habit-row.js).
// Creating shows CREATE; editing shows DELETE and SAVE.

// Same 4-tier scale Dailies uses - a habit repeats at least as often (often
// MORE often, since it can be clicked several times a day), so it shares
// Dailies' modest XP anchors rather than Quest's one-off anchors.
const HABIT_DIFFICULTY_TIERS = [
    { level: 'Trivial', xp: 10, sparks: 1 },
    { level: 'Easy', xp: 20, sparks: 2 },
    { level: 'Medium', xp: 60, sparks: 3 },
    { level: 'Hard', xp: 120, sparks: 4 }
];

let selectedDifficulty = 'Easy';
let timePicker = null;   // TaskForm.timePicker (Oct 2026: XP = minutes x effort)
let selectedXP = 20;
let editingHabitId = null;
let habitPositiveEnabled = true;
let habitNegativeEnabled = false;
let selectedResetCounter = 'daily';
let deleteArmed = false;

// Every term a tag could plausibly match against - same sources
// create-daily.js's collectKnownTerms uses, plus existing Habit tags too.
// Stays page-owned (see src/core/ui/tag-picker/tag-picker.js) - only the
// scan/render/dismiss mechanics around this are shared.
function collectKnownTerms() {
    const terms = new Map();
    const add = (t) => { if (t && !terms.has(t.toLowerCase())) terms.set(t.toLowerCase(), t); };
    (Vault.getDictionaryTerms() || []).forEach(term => add(term.name));
    (Vault.getDailyTasks() || []).forEach(task => (task.tags || []).forEach(add));
    (Vault.getHabits() || []).forEach(habit => (habit.tags || []).forEach(add));
    (Vault.getQuests() || []).forEach(quest => {
        add(quest.title);
        (quest.tasks || []).forEach(task => add(task.label));
    });
    return [...terms.values()];
}

function rescanTags() {
    const title = document.getElementById('habit-title-input').value;
    const notes = document.getElementById('habit-notes-input').value;
    TagPicker.rescan(document.getElementById('habit-tags-list'), [title, notes], collectKnownTerms());
    if (timePicker) timePicker.refresh();
}

function sparksSVG(n) {
    const spots = { 1: [[16, 16]], 2: [[9, 16], [23, 16]], 3: [[16, 9], [9, 21], [23, 21]], 4: [[9, 9], [23, 9], [9, 23], [23, 23]] }[n];
    return `<svg viewBox="0 0 32 32" aria-hidden="true">${spots.map(([x, y]) =>
        `<path d="M${x} ${y - 6}Q${x + 1} ${y - 1} ${x + 6} ${y}Q${x + 1} ${y + 1} ${x} ${y + 6}Q${x - 1} ${y + 1} ${x - 6} ${y}Q${x - 1} ${y - 1} ${x} ${y - 6}Z"/>`).join('')}</svg>`;
}

// ---- render the parts that change ----
function renderColour() {
    const style = HABIT_DIFFICULTY_STYLE[selectedDifficulty] || HABIT_DIFFICULTY_STYLE.Easy;
    const form = document.getElementById('hf');
    form.style.setProperty('--dc', style.color);
    form.style.setProperty('--dk', style.ink);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', style.color);
}

function renderDifficulty() {
    const grid = document.getElementById('hf-diff');
    grid.innerHTML = HABIT_DIFFICULTY_TIERS.map(tier => {
        const s = HABIT_DIFFICULTY_STYLE[tier.level];
        const on = tier.level === selectedDifficulty;
        return `<button type="button" class="hf-d${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-level="${tier.level}" style="--c:${s.color};--k:${s.ink}">
            ${sparksSVG(tier.sparks)}<span>${tier.level}</span></button>`;
    }).join('');
    if (timePicker) timePicker.refresh();
    renderColour();
}

function renderToggles() {
    const pos = document.getElementById('hf-positive');
    const neg = document.getElementById('hf-negative');
    pos.setAttribute('aria-pressed', String(habitPositiveEnabled));
    neg.setAttribute('aria-pressed', String(habitNegativeEnabled));
    pos.classList.toggle('on', habitPositiveEnabled);
    neg.classList.toggle('on', habitNegativeEnabled);
    document.getElementById('hf-pn-hint').textContent = habitPositiveEnabled && habitNegativeEnabled
        ? "+ means you did it. − means you didn't."
        : habitPositiveEnabled ? 'Tap + each time you do it.' : 'Tap − each time it slips in.';
    document.getElementById('hf-adj-pos').hidden = !habitPositiveEnabled;
    document.getElementById('hf-adj-neg').hidden = !habitNegativeEnabled;
}

function renderReset() {
    document.querySelectorAll('#hf-reset button').forEach(btn => {
        const on = btn.dataset.reset === selectedResetCounter;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-checked', String(on));
        btn.setAttribute('role', 'radio');
    });
}

function nudge(el) {
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], 260);
}

function loadExistingHabit(existing) {
    document.getElementById('habit-title-input').value = existing.label || '';
    document.getElementById('habit-notes-input').value = existing.notes || '';
    selectedDifficulty = HABIT_DIFFICULTY_TIERS.some(t => t.level === existing.difficulty) ? existing.difficulty : 'Easy';
    selectedXP = Number(existing.xp) || HABIT_DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).xp;
    TagPicker.render(document.getElementById('habit-tags-list'), existing.tags || []);
    // Absent on a habit saved before this toggle existed - default both on,
    // same "both, always" behavior it already had (see Vault.getHabits).
    habitPositiveEnabled = existing.positive !== false;
    habitNegativeEnabled = existing.negative !== false;
    selectedResetCounter = existing.resetCounter || 'daily';

    document.getElementById('hf-heading').textContent = '';
    document.getElementById('hf-delete').hidden = false;
    document.getElementById('hf-save').textContent = 'SAVE';
    document.getElementById('hf-adjust').hidden = false;
    document.getElementById('hf-adj-pos-input').value = existing.periodPositiveCount || 0;
    document.getElementById('hf-adj-neg-input').value = existing.periodNegativeCount || 0;
    document.title = '✏️ Edit Habit';
}

function goBack() {
    window.location.href = './habits.html';
}

function saveHabit() {
    const titleInput = document.getElementById('habit-title-input');
    const label = titleInput.value.trim();
    if (!label) {
        titleInput.focus();
        nudge(titleInput.closest('.hf-field'));
        Toast.show('Give this habit a title first.', 'negative');
        return;
    }

    const payload = {
        label,
        xp: selectedXP,
        difficulty: selectedDifficulty,
        notes: document.getElementById('habit-notes-input').value.trim(),
        tags: TagPicker.getTags(document.getElementById('habit-tags-list')),
        ...timePicker.get(),
        positive: habitPositiveEnabled,
        negative: habitNegativeEnabled,
        resetCounter: selectedResetCounter
    };

    if (editingHabitId) {
        Vault.updateHabit(editingHabitId, payload);
        const fresh = Vault.getHabits().find(h => h.id === editingHabitId);
        const wantPos = habitPositiveEnabled ? Number(document.getElementById('hf-adj-pos-input').value) : undefined;
        const wantNeg = habitNegativeEnabled ? Number(document.getElementById('hf-adj-neg-input').value) : undefined;
        const counts = {};
        if (wantPos !== undefined && wantPos !== fresh.periodPositiveCount) counts.positive = wantPos;
        if (wantNeg !== undefined && wantNeg !== fresh.periodNegativeCount) counts.negative = wantNeg;
        if (Object.keys(counts).length) Vault.setHabitPeriodCounts(editingHabitId, counts);
        Toast.show(`✅ Saved: ${label}`, 'positive');
    } else {
        Vault.addHabit(payload);
        Toast.show(`✅ New habit: ${label}`, 'positive');
    }
    goBack();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    Waggle.setActions(baseWaggleActions());

    editingHabitId = new URLSearchParams(window.location.search).get('id');
    const existing = editingHabitId ? Vault.getHabits().find(h => h.id === editingHabitId) : null;
    if (existing) {
        loadExistingHabit(existing);
    } else {
        editingHabitId = null;
        TagPicker.render(document.getElementById('habit-tags-list'), []);
        // ?bad=1 (from the egg's "Add a bad habit" step) starts on − only.
        if (new URLSearchParams(window.location.search).get('bad') === '1') {
            habitPositiveEnabled = false;
            habitNegativeEnabled = true;
            document.getElementById('habit-title-input').placeholder = 'e.g. Scrolling in bed';
        }
    }

    timePicker = TaskForm.timePicker({
        mount: document.getElementById('tf-time'),
        note: document.getElementById('hf-xp-note'),
        getTask: () => ({
            label: document.getElementById('habit-title-input').value,
            notes: document.getElementById('habit-notes-input').value,
            tags: TagPicker.getTags(document.getElementById('habit-tags-list')),
            difficulty: selectedDifficulty
        })
    });
    if (existing) timePicker.set(existing);
    renderDifficulty();
    renderToggles();
    renderReset();
    rescanTags();
    if (!existing) setTimeout(() => document.getElementById('habit-title-input').focus(), 300);

    document.getElementById('hf-diff').addEventListener('click', (event) => {
        const b = event.target.closest('.hf-d');
        if (!b) return;
        selectedDifficulty = b.dataset.level;
        selectedXP = HABIT_DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).xp;
        renderDifficulty();
    });

    document.getElementById('hf-positive').addEventListener('click', (event) => {
        if (habitPositiveEnabled && !habitNegativeEnabled) { nudge(event.currentTarget); return; }
        habitPositiveEnabled = !habitPositiveEnabled;
        renderToggles();
    });
    document.getElementById('hf-negative').addEventListener('click', (event) => {
        if (habitNegativeEnabled && !habitPositiveEnabled) { nudge(event.currentTarget); return; }
        habitNegativeEnabled = !habitNegativeEnabled;
        renderToggles();
    });

    document.getElementById('hf-reset').addEventListener('click', (event) => {
        const b = event.target.closest('button[data-reset]');
        if (!b) return;
        selectedResetCounter = b.dataset.reset;
        renderReset();
    });

    document.getElementById('hf-tip-btn').addEventListener('click', () => {
        const tip = document.getElementById('hf-tip');
        const button = document.getElementById('hf-tip-btn');
        tip.hidden = !tip.hidden;
        button.setAttribute('aria-expanded', String(!tip.hidden));
    });

    document.getElementById('habit-title-input').addEventListener('input', rescanTags);
    document.getElementById('habit-notes-input').addEventListener('input', rescanTags);
    document.getElementById('habit-title-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') saveHabit(); });

    document.getElementById('habit-ask-eevee-btn').addEventListener('click', async () => {
        const title = document.getElementById('habit-title-input').value.trim();
        if (!title) {
            Toast.show('Give this habit a title first so Eve has something to judge.', 'negative');
            return;
        }
        const notes = document.getElementById('habit-notes-input').value.trim();
        const btn = document.getElementById('habit-ask-eevee-btn');
        const originalLabel = btn.textContent;
        btn.textContent = '🐝 Buzzing...';
        btn.disabled = true;
        try {
            selectedXP = await Eve.assessHabitXP(title, notes, selectedDifficulty);
            document.getElementById('hf-xp-note').textContent = `${selectedXP} XP each tap`;
            Toast.show(`🐝 Eve set this at ${selectedXP} XP.`, 'positive');
        } catch (error) {
            Toast.show(`⚠️ ${error.message} Keeping the ${selectedDifficulty} default.`, 'negative');
        } finally {
            btn.textContent = originalLabel;
            btn.disabled = false;
        }
    });

    document.getElementById('hf-back').addEventListener('click', goBack);
    document.getElementById('hf-save').addEventListener('click', saveHabit);

    // Delete asks for a second tap instead of a pop-up box.
    document.getElementById('hf-delete').addEventListener('click', (event) => {
        const btn = event.currentTarget;
        if (!deleteArmed) {
            deleteArmed = true;
            btn.textContent = 'TAP AGAIN';
            btn.classList.add('armed');
            setTimeout(() => { deleteArmed = false; btn.textContent = 'DELETE'; btn.classList.remove('armed'); }, 2500);
            return;
        }
        Vault.removeHabit(editingHabitId);
        Toast.show('Habit deleted', 'negative');
        goBack();
    });
});
