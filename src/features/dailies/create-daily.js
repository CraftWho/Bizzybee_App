console.log("/// CREATE DAILY PROTOCOLS INITIALIZED ///");

// Not the same escapeHTML/escapeAttr as dailies.js - kept private to this
// file, same reasoning as map.js's escapeMapAttr.
function escapeCreateDailyAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

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

// Clock wheel geometry - a 200x200 face (see create-daily.css), 12 spots
// evenly spaced around a shared radius for both hour mode (1-12) and
// minute mode (:00, :05, ... :55).
const CLOCK_CENTER = 100;
const CLOCK_RADIUS = 80;

// All mutable form state lives here rather than being re-read from the DOM
// on every change - the DOM is just a view of this, same separation
// BeeCard/ItemCard use, just inline to this one page instead of a shared
// component (nothing else needs a checklist/day-toggle editor).
let checklistState = [];
let checklistIdCounter = 0;
let selectedDifficulty = 'Easy';
let selectedDP = 20;
let repeatsType = 'weekly';
let selectedDaysOfWeek = [];
let remindersState = [];
let tagsState = [];
let dismissedTags = new Set(); // lowercased tags the worker bee explicitly × 'd off - stays off for the rest of this edit even if the text below still matches it
let editingTaskId = null;

// Clock wheel picker state - separate from remindersState, which only
// gains an entry once "+ Add reminder" is pressed.
let clockMode = 'hour'; // 'hour' | 'minute'
let clockHour = 12; // 1-12
let clockMinute = 0; // 0, 5, 10, ... 55
let clockPeriod = 'AM';

function newChecklistId() {
    checklistIdCounter += 1;
    return `chk-${Date.now()}-${checklistIdCounter}`;
}

// A real checklist row - already-promoted (has its own remove button) from
// the moment it's created, whether that's because it was loaded from an
// existing daily or just got promoted out of a ghost row (see
// createGhostRowEl below).
function createChecklistRowEl(item) {
    const row = document.createElement('div');
    row.className = 'daily-checklist-row';
    row.dataset.checklistId = item.id;
    row.innerHTML = `
        <button type="button" class="daily-checklist-remove" aria-label="Remove entry">×</button>
        <input type="text" class="daily-checklist-text" value="${escapeCreateDailyAttr(item.text)}">
    `;

    row.querySelector('.daily-checklist-text').addEventListener('input', (e) => {
        item.text = e.target.value;
    });

    row.querySelector('.daily-checklist-remove').addEventListener('click', () => {
        checklistState = checklistState.filter(i => i.id !== item.id);
        row.remove();
    });

    return row;
}

// The "+ New checklist entry" placeholder row - the moment its input goes
// from empty to non-empty, it promotes ITSELF in place (same input
// element, so focus/cursor position is never disturbed mid-word) and a
// fresh ghost row is appended after it for the next entry. This is what
// makes continuous entry work: type a whole line, it becomes real; a new
// blank "+" row is already waiting below by the time you're done.
function createGhostRowEl() {
    const row = document.createElement('div');
    row.className = 'daily-checklist-row daily-checklist-row--ghost';
    row.innerHTML = `
        <span class="daily-checklist-ghost-icon">+</span>
        <input type="text" class="daily-checklist-text daily-checklist-ghost-input" placeholder="New checklist entry">
    `;

    const input = row.querySelector('.daily-checklist-ghost-input');
    let promotedItem = null;

    input.addEventListener('input', () => {
        if (!promotedItem) {
            if (!input.value) return;

            promotedItem = { id: newChecklistId(), text: input.value, done: false };
            checklistState.push(promotedItem);

            row.classList.remove('daily-checklist-row--ghost');
            input.classList.remove('daily-checklist-ghost-input');
            input.placeholder = '';

            const icon = row.querySelector('.daily-checklist-ghost-icon');
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'daily-checklist-remove';
            removeBtn.setAttribute('aria-label', 'Remove entry');
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => {
                checklistState = checklistState.filter(i => i.id !== promotedItem.id);
                row.remove();
            });
            icon.replaceWith(removeBtn);

            document.getElementById('daily-checklist').appendChild(createGhostRowEl());
            return;
        }

        promotedItem.text = input.value;
        // Backspacing a promoted entry back to nothing removes it outright
        // (same as clicking its ×) rather than leaving a blank real row
        // behind - the explicit × is still there for a deliberate delete
        // at any point, this is just a convenience for "never mind."
        if (!input.value) {
            checklistState = checklistState.filter(i => i.id !== promotedItem.id);
            row.remove();
        }
    });

    return row;
}

function initChecklist(initialItems) {
    checklistState = (initialItems || []).map(item => ({ ...item }));
    const container = document.getElementById('daily-checklist');
    container.innerHTML = '';
    checklistState.forEach(item => container.appendChild(createChecklistRowEl(item)));
    container.appendChild(createGhostRowEl());
}

function renderDifficultyTiles() {
    const grid = document.getElementById('daily-difficulty-grid');
    grid.innerHTML = DIFFICULTY_TIERS.map(tier => `
        <button type="button" class="daily-difficulty-tile${tier.level === selectedDifficulty ? ' daily-difficulty-tile--selected' : ''}" data-difficulty="${tier.level}">
            <span class="daily-difficulty-icon">${tier.icon}</span>
            <span class="daily-difficulty-label">${tier.level}</span>
        </button>
    `).join('');

    grid.querySelectorAll('.daily-difficulty-tile').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedDifficulty = btn.dataset.difficulty;
            selectedDP = DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
            document.getElementById('daily-dp-value').textContent = selectedDP;
            renderDifficultyTiles();
        });
    });
}

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

// --- CLOCK WHEEL ---
// Maps a position (0-11) around the 12-spot ring to an x/y on the 200x200
// face, 12 o'clock at the top, going clockwise - same layout as a real
// analog clock face.
function clockPolarXY(index) {
    const angle = (index / 12) * 2 * Math.PI - Math.PI / 2;
    return {
        x: CLOCK_CENTER + CLOCK_RADIUS * Math.cos(angle),
        y: CLOCK_CENTER + CLOCK_RADIUS * Math.sin(angle)
    };
}

// Hour mode shows 1-12 and picking one advances straight to minute mode
// (same two-step flow as a native mobile time picker) - minute mode shows
// :00/:05/.../:55 in 5-minute steps around the same ring.
function renderClockFace() {
    const wheel = document.getElementById('daily-clock-wheel');
    const face = document.getElementById('daily-clock-face');
    const hand = document.getElementById('daily-clock-hand');
    wheel.dataset.mode = clockMode;

    const values = clockMode === 'hour'
        ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    const selectedValue = clockMode === 'hour' ? clockHour : clockMinute;

    face.innerHTML = values.map((value, index) => {
        const { x, y } = clockPolarXY(index);
        const label = clockMode === 'minute' ? String(value).padStart(2, '0') : value;
        const selected = value === selectedValue;
        return `<button type="button" class="clock-wheel-num${selected ? ' clock-wheel-num--selected' : ''}" style="left:${x}px; top:${y}px;" data-value="${value}">${label}</button>`;
    }).join('');

    const selectedIndex = values.indexOf(selectedValue);
    const handAngle = (selectedIndex / 12) * 360;
    hand.style.height = `${CLOCK_RADIUS - 12}px`;
    hand.style.transform = `translateX(-50%) rotate(${handAngle}deg)`;

    face.querySelectorAll('.clock-wheel-num').forEach(btn => {
        btn.addEventListener('click', () => {
            const value = Number(btn.dataset.value);
            if (clockMode === 'hour') {
                clockHour = value;
                clockMode = 'minute';
            } else {
                clockMinute = value;
            }
            renderClockFace();
            updateClockReadout();
        });
    });
}

function updateClockReadout() {
    document.getElementById('daily-clock-readout').textContent =
        `${clockHour}:${String(clockMinute).padStart(2, '0')} ${clockPeriod}`;
}

// 12-hour + AM/PM -> the 24-hour "HH:MM" string reminders/formatTime12h
// already store and parse everywhere else in this feature.
function clockTo24Hour() {
    let h = clockHour % 12;
    if (clockPeriod === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${String(clockMinute).padStart(2, '0')}`;
}

function resetClockWheel() {
    clockMode = 'hour';
    clockHour = 12;
    clockMinute = 0;
    clockPeriod = 'AM';
    document.querySelectorAll('.clock-wheel-period-btn').forEach(btn => {
        btn.classList.toggle('clock-wheel-period-btn--selected', btn.dataset.period === 'AM');
    });
    renderClockFace();
    updateClockReadout();
}

// --- AUTOMATIC TAGS ---
// Every term a tag could plausibly match against: Dictionary term names
// (these are also what ties a tag to the Skill Mastery matrix - see
// computeSkillMatrixDP in db.js), every tag already used on any other
// Daily, and every Quest task's label. Map keyed by lowercase so matching
// is case-insensitive while still returning each term in its original
// canonical casing.
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

// Word-boundary-ish match (not a substring match) so a short term like "CSS"
// doesn't fire on "process" or "accessible" - matched against a lowercased
// copy of the text. Terms under 3 characters are skipped outright to avoid
// noisy single/double-letter false positives.
function findMatchingTerms(text, knownTerms) {
    if (!text) return [];
    const lowerText = text.toLowerCase();

    return knownTerms.filter(term => {
        if (term.length < 3) return false;
        const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, 'i');
        return re.test(lowerText);
    });
}

// Additive only - a fresh match gets added, but editing the text back
// below a match never yanks an already-attached tag back out. Removing a
// tag is always an explicit × click (see renderTags), which is the only
// thing that's "picking" left in an otherwise fully-automatic system.
function rescanTags() {
    const title = document.getElementById('daily-title-input').value;
    const notes = document.getElementById('daily-notes-input').value;
    const knownTerms = collectKnownTerms();
    const matched = new Set([
        ...findMatchingTerms(title, knownTerms),
        ...findMatchingTerms(notes, knownTerms)
    ]);

    let changed = false;
    matched.forEach(tag => {
        const lower = tag.toLowerCase();
        if (dismissedTags.has(lower)) return;
        if (tagsState.some(t => t.toLowerCase() === lower)) return;
        tagsState.push(tag);
        changed = true;
    });

    if (changed) renderTags();
}

function renderTags() {
    const list = document.getElementById('daily-tags-list');
    list.innerHTML = tagsState.length
        ? tagsState.map(tag => `
            <span class="daily-tag-chip" data-tag="${escapeCreateDailyAttr(tag)}">${escapeCreateDailyAttr(tag)} <button type="button" class="daily-tag-remove" aria-label="Remove tag">×</button></span>
        `).join('')
        : '<p class="daily-tags-empty">No matches yet - type a known term in your title or notes above.</p>';

    list.querySelectorAll('.daily-tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const chip = btn.closest('.daily-tag-chip');
            const tag = chip.dataset.tag;
            dismissedTags.add(tag.toLowerCase());
            tagsState = tagsState.filter(t => t !== tag);
            renderTags();
        });
    });
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
    tagsState = [...(existing.tags || [])];

    initChecklist(existing.checklist || []);

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
    initChecklist([]);
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
        checklist: checklistState,
        startDate: document.getElementById('daily-start-date').value || todayISOLocal(),
        repeats: {
            type: repeatsType,
            every: Number(document.getElementById('daily-every-input').value) || 1,
            daysOfWeek: repeatsType === 'weekly' ? selectedDaysOfWeek : []
        },
        reminders: remindersState,
        tags: tagsState
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
    HiveMind.setActions(baseHiveMindActions());

    editingTaskId = getQueryParam('id');
    const existing = editingTaskId ? Vault.getDailyTasks().find(t => t.id === editingTaskId) : null;

    if (existing) {
        loadExistingTask(existing);
    } else {
        editingTaskId = null; // an id that no longer matches anything just falls back to create mode
        setupNewTaskDefaults();
    }

    updateScheduleFieldVisibility();
    renderDifficultyTiles();
    renderDayToggles();
    renderScheduleSummary();
    renderReminders();
    renderTags();
    resetClockWheel();
    rescanTags(); // catches any Dictionary/tag/quest terms already sitting in loaded title/notes

    document.getElementById('daily-title-input').addEventListener('input', rescanTags);
    document.getElementById('daily-notes-input').addEventListener('input', rescanTags);

    document.getElementById('daily-repeats-select').addEventListener('change', (e) => {
        repeatsType = e.target.value;
        updateScheduleFieldVisibility();
        renderScheduleSummary();
    });
    document.getElementById('daily-every-input').addEventListener('input', renderScheduleSummary);

    document.querySelectorAll('.clock-wheel-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            clockPeriod = btn.dataset.period;
            document.querySelectorAll('.clock-wheel-period-btn').forEach(b => {
                b.classList.toggle('clock-wheel-period-btn--selected', b === btn);
            });
            updateClockReadout();
        });
    });

    document.getElementById('daily-add-reminder-btn').addEventListener('click', () => {
        const time = clockTo24Hour();
        remindersState.push({ id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, time });
        renderReminders();
        Reminders.requestPermissionIfNeeded();
        Toast.show(`🔔 Reminder set for ${formatTime12h(time)}`, 'positive');
        resetClockWheel();
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
