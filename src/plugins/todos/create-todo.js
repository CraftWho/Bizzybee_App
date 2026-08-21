console.log("/// CREATE TO-DO PROTOCOLS INITIALIZED ///");

function escapeCreateTodoAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

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

const CLOCK_CENTER = 100;
const CLOCK_RADIUS = 80;

let checklistState = [];
let checklistIdCounter = 0;
let selectedDifficulty = 'Easy';
let selectedDP = 30;
let remindersState = [];
let tagsState = [];
let dismissedTags = new Set();
let editingTodoId = null;

let clockMode = 'hour';
let clockHour = 12;
let clockMinute = 0;
let clockPeriod = 'AM';

function newChecklistId() {
    checklistIdCounter += 1;
    return `chk-${Date.now()}-${checklistIdCounter}`;
}

function createChecklistRowEl(item) {
    const row = document.createElement('div');
    row.className = 'todo-checklist-row';
    row.dataset.checklistId = item.id;
    row.innerHTML = `
        <button type="button" class="todo-checklist-remove" aria-label="Remove entry">×</button>
        <input type="text" class="todo-checklist-text" value="${escapeCreateTodoAttr(item.text)}">
    `;

    row.querySelector('.todo-checklist-text').addEventListener('input', (e) => {
        item.text = e.target.value;
    });

    row.querySelector('.todo-checklist-remove').addEventListener('click', () => {
        checklistState = checklistState.filter(i => i.id !== item.id);
        row.remove();
    });

    return row;
}

function createGhostRowEl() {
    const row = document.createElement('div');
    row.className = 'todo-checklist-row todo-checklist-row--ghost';
    row.innerHTML = `
        <span class="todo-checklist-ghost-icon">+</span>
        <input type="text" class="todo-checklist-text todo-checklist-ghost-input" placeholder="New checklist entry">
    `;

    const input = row.querySelector('.todo-checklist-ghost-input');
    let promotedItem = null;

    input.addEventListener('input', () => {
        if (!promotedItem) {
            if (!input.value) return;

            promotedItem = { id: newChecklistId(), text: input.value, done: false };
            checklistState.push(promotedItem);

            row.classList.remove('todo-checklist-row--ghost');
            input.classList.remove('todo-checklist-ghost-input');
            input.placeholder = '';

            const icon = row.querySelector('.todo-checklist-ghost-icon');
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'todo-checklist-remove';
            removeBtn.setAttribute('aria-label', 'Remove entry');
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => {
                checklistState = checklistState.filter(i => i.id !== promotedItem.id);
                row.remove();
            });
            icon.replaceWith(removeBtn);

            document.getElementById('todo-checklist').appendChild(createGhostRowEl());
            return;
        }

        promotedItem.text = input.value;
        if (!input.value) {
            checklistState = checklistState.filter(i => i.id !== promotedItem.id);
            row.remove();
        }
    });

    return row;
}

function initChecklist(initialItems) {
    checklistState = (initialItems || []).map(item => ({ ...item }));
    const container = document.getElementById('todo-checklist');
    container.innerHTML = '';
    checklistState.forEach(item => container.appendChild(createChecklistRowEl(item)));
    container.appendChild(createGhostRowEl());
}

function renderDifficultyTiles() {
    const grid = document.getElementById('todo-difficulty-grid');
    grid.innerHTML = DIFFICULTY_TIERS.map(tier => `
        <button type="button" class="todo-difficulty-tile${tier.level === selectedDifficulty ? ' todo-difficulty-tile--selected' : ''}" data-difficulty="${tier.level}">
            <span class="todo-difficulty-icon">${tier.icon}</span>
            <span class="todo-difficulty-label">${tier.level}</span>
        </button>
    `).join('');

    grid.querySelectorAll('.todo-difficulty-tile').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedDifficulty = btn.dataset.difficulty;
            selectedDP = DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
            document.getElementById('todo-dp-value').textContent = selectedDP;
            renderDifficultyTiles();
        });
    });
}

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

// --- CLOCK WHEEL (duplicated from create-daily.js - self-contained, same
// reasoning as the CSS/HTML duplication elsewhere in this feature) ---
function clockPolarXY(index) {
    const angle = (index / 12) * 2 * Math.PI - Math.PI / 2;
    return {
        x: CLOCK_CENTER + CLOCK_RADIUS * Math.cos(angle),
        y: CLOCK_CENTER + CLOCK_RADIUS * Math.sin(angle)
    };
}

function renderClockFace() {
    const wheel = document.getElementById('todo-clock-wheel');
    const face = document.getElementById('todo-clock-face');
    const hand = document.getElementById('todo-clock-hand');
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
    document.getElementById('todo-clock-readout').textContent =
        `${clockHour}:${String(clockMinute).padStart(2, '0')} ${clockPeriod}`;
}

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

// --- AUTOMATIC TAGS (duplicated from create-daily.js, plus existing
// To-Do tags as a known-term source) ---
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

function rescanTags() {
    const title = document.getElementById('todo-title-input').value;
    const notes = document.getElementById('todo-notes-input').value;
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
    const list = document.getElementById('todo-tags-list');
    list.innerHTML = tagsState.length
        ? tagsState.map(tag => `
            <span class="todo-tag-chip" data-tag="${escapeCreateTodoAttr(tag)}">${escapeCreateTodoAttr(tag)} <button type="button" class="todo-tag-remove" aria-label="Remove tag">×</button></span>
        `).join('')
        : '<p class="todo-tags-empty">No matches yet - type a known term in your title or notes above.</p>';

    list.querySelectorAll('.todo-tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const chip = btn.closest('.todo-tag-chip');
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

function loadExistingTodo(existing) {
    document.getElementById('todo-title-input').value = existing.label || '';
    document.getElementById('todo-notes-input').value = existing.notes || '';
    selectedDifficulty = existing.difficulty || 'Easy';
    selectedDP = Number(existing.dp) || DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
    document.getElementById('todo-dp-value').textContent = selectedDP;
    document.getElementById('todo-due-date').value = existing.dueDate || '';

    remindersState = (existing.reminders || []).map(r => ({ ...r }));
    tagsState = [...(existing.tags || [])];

    initChecklist(existing.checklist || []);

    document.getElementById('create-todo-heading').innerHTML = '✏️ <span class="gold-gradient-text">EDIT TO-DO</span>';
    document.getElementById('create-todo-subtitle').textContent = 'Update any part of this to-do - changes apply immediately on save.';
    document.getElementById('todo-save-btn').textContent = '💾 Save Changes';
}

function setupNewTodoDefaults() {
    selectedDP = DIFFICULTY_TIERS.find(t => t.level === selectedDifficulty).dp;
    document.getElementById('todo-dp-value').textContent = selectedDP;
    initChecklist([]);
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
        checklist: checklistState,
        dueDate: document.getElementById('todo-due-date').value || null,
        reminders: remindersState,
        tags: tagsState
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

    HiveMind.setActions(baseHiveMindActions());

    editingTodoId = getQueryParam('id');
    const existing = editingTodoId ? Vault.getTodos().find(t => t.id === editingTodoId) : null;

    if (existing) {
        loadExistingTodo(existing);
    } else {
        editingTodoId = null;
        setupNewTodoDefaults();
    }

    renderDifficultyTiles();
    renderReminders();
    renderTags();
    resetClockWheel();
    rescanTags();

    document.getElementById('todo-title-input').addEventListener('input', rescanTags);
    document.getElementById('todo-notes-input').addEventListener('input', rescanTags);

    document.querySelectorAll('.clock-wheel-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            clockPeriod = btn.dataset.period;
            document.querySelectorAll('.clock-wheel-period-btn').forEach(b => {
                b.classList.toggle('clock-wheel-period-btn--selected', b === btn);
            });
            updateClockReadout();
        });
    });

    document.getElementById('todo-add-reminder-btn').addEventListener('click', () => {
        const time = clockTo24Hour();
        remindersState.push({ id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, time });
        renderReminders();
        Reminders.requestPermissionIfNeeded();
        Toast.show(`🔔 Reminder set for ${formatTime12h(time)}`, 'positive');
        resetClockWheel();
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
