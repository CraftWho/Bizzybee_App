console.log("/// CREATE QUEST PROTOCOLS INITIALIZED ///");

// Create / edit a quest (2026-10-09; replaces the old New Quest pop-up).
// Same coloured-top form as Habits / Dailies / To-Dos. The colour follows
// the quest type (Main gold, Side blue - QUEST_STYLE in quest-common.js).
// Fields: Title, Objective, Type, Tasks (each with its own difficulty and
// XP), Source, and Focus. Editing keeps each task's done state; the rest
// of the quest (ghost logs, side quests, unlocks...) is never touched here.

let editingQuestId = null;
// Quest tags (Oct 2026): typed by hand, count toward skills for every task.
let questTags = [];
function renderTags() {
    const host = document.getElementById('cq-tags');
    host.innerHTML = questTags.map((t, i) => `<span class="cq-tag">${QuestUI.esc(t)}<button type="button" data-tag="${i}" aria-label="Remove ${QuestUI.esc(t)}">×</button></span>`).join('');
}
function addTagFromInput() {
    const input = document.getElementById('cq-tag-input');
    input.value.split(',').map(t => t.replace(/^#/, '').trim()).filter(Boolean).forEach(t => {
        const name = typeof splitTagWords === 'function' ? splitTagWords(t) : t;
        if (!questTags.some(x => x.toLowerCase() === name.toLowerCase())) questTags.push(name);
    });
    input.value = '';
    renderTags();
}
let category = 'main';
let taskEditor = null;
let deleteArmed = false;

function tierFor(level) {
    return QUEST_DIFFICULTY_TIERS.find(t => t.level === level) || QUEST_DIFFICULTY_TIERS[0];
}

function renderColour() {
    const s = QUEST_STYLE[category];
    const form = document.getElementById('hf');
    form.style.setProperty('--dc', s.color);
    form.style.setProperty('--dk', s.ink);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', s.color);
    document.querySelectorAll('#cq-type [data-cat]').forEach(b => {
        const on = b.dataset.cat === category;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
    });
}

// Oct 2026: XP is time. Each task row has a time pill (tap cycles through
// the usual lengths, "auto" = found in the task text or by difficulty) and
// a difficulty pill. XP = minutes x effort (db.js).
const QUEST_TIME_STEPS = [null, 15, 30, 45, 60, 90, 120, 180];
const fmtMin = (m) => m >= 60 ? `${+(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${m} min`;
function rowMinutes(item) {
    return plannedMinutes({ label: item.text, difficulty: item.difficulty, minutes: item.minutes, historyXP: item.historyXP });
}
function rowXP(item) {
    return xpForMinutes(rowMinutes(item), item.difficulty);
}

function renderTotal() {
    const items = taskEditor.all().filter(i => i.text.trim() && !i.chapter);
    const xp = items.reduce((sum, i) => sum + rowXP(i), 0);
    const mins = items.reduce((sum, i) => sum + rowMinutes(i), 0);
    document.getElementById('cq-total').textContent = items.length ? `${items.length} task${items.length === 1 ? '' : 's'} · ${fmtMin(mins)} · ${xp} XP` : '';
}

// Time pill + difficulty pill on each task row.
function difficultyPill(item) {
    const s = HABIT_DIFFICULTY_STYLE[item.difficulty] || HABIT_DIFFICULTY_STYLE.Easy;
    const m = rowMinutes(item);
    return `<button type="button" class="cq-time" data-extra="time" aria-label="Time: ${fmtMin(m)}${item.minutes ? '' : ' (auto)'}. Tap to change.">⏱️ ${fmtMin(m)}${item.minutes ? '' : '<small>auto</small>'}</button>
        <button type="button" class="cq-diff" data-extra="diff" style="--c:${s.color};--k:${s.ink}" aria-label="Difficulty: ${item.difficulty}, ${rowXP(item)} XP. Tap to change.">
        ${item.completed ? '<span class="cq-done" title="Done">✓</span>' : ''}${item.difficulty}<small>${rowXP(item)}</small></button>`;
}

function loadExisting(quest) {
    document.getElementById('quest-title-input').value = quest.title || '';
    document.getElementById('quest-objective-input').value = quest.objective || '';
    document.getElementById('cq-deadline').value = quest.deadline || '';   // Nov 1 2026 (Craft)
    category = quest.category === 'side' ? 'side' : 'main';
    // A chapter row goes in wherever a task's chapter (module) changes.
    const rows = [];
    let chapter = null;
    (quest.tasks || []).forEach(t => {
        if ((t.module || null) !== chapter) { chapter = t.module || null; if (chapter) rows.push({ text: chapter, chapter: true }); }
        rows.push(t);
    });
    taskEditor.set(rows.map(t => t.chapter ? t : ({
        id: t.id,
        text: t.label || '',
        difficulty: QUEST_DIFFICULTY_TIERS.some(x => x.level === t.difficulty) ? t.difficulty : 'Easy',
        xp: Number(t.xp) || tierFor(t.difficulty).xp,
        minutes: Number(t.minutes) > 0 ? Number(t.minutes) : null,
        historyXP: t.historyXP || 0,
        completed: !!t.completed,
        existing: true
    })));
    if (quest.source) {
        document.getElementById('cq-source-label').value = quest.source.label || '';
        document.getElementById('cq-source-url').value = quest.source.url || '';
    }
    document.getElementById('cq-focus').checked = Vault.getActiveQuestId() === quest.id;
    questTags = [...(quest.tags || [])];
    document.getElementById('hf-heading').textContent = '';
    document.getElementById('hf-delete').hidden = false;
    document.getElementById('hf-save').textContent = 'SAVE';
    document.getElementById('cq-more').hidden = false;
    document.title = '✏️ Edit Quest';
}

function goBack(id) {
    window.location.href = id ? `./quest.html?id=${encodeURIComponent(id)}` : './quests.html';
}

function saveQuest() {
    const titleInput = document.getElementById('quest-title-input');
    const title = titleInput.value.trim();
    if (!title) {
        titleInput.focus();
        TaskForm.nudge(titleInput.closest('.hf-field'));
        Toast.show('Give this quest a title first.', 'negative');
        return;
    }
    // Chapter rows set the chapter (module) of the tasks under them.
    const tasks = [];
    let chapter = null;
    taskEditor.get().forEach(i => { if (i.chapter) chapter = i.text; else tasks.push({ ...i, module: chapter }); });
    if (!tasks.length) {
        TaskForm.nudge(document.getElementById('cq-task-add'));
        Toast.show('Add at least one task. Quests are finished one task at a time.', 'negative');
        return;
    }
    let url = document.getElementById('cq-source-url').value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;

    const quest = Vault.saveQuestForm(editingQuestId, {
        title,
        objective: document.getElementById('quest-objective-input').value.trim(),
        category,
        source: url ? { label: document.getElementById('cq-source-label').value.trim(), url } : null,
        tasks: tasks.map(i => ({ id: i.existing ? i.id : null, label: i.text, difficulty: i.difficulty, xp: rowXP(i), minutes: i.minutes || null, module: i.module || null })),
        tags: (addTagFromInput(), questTags),
        makeActive: document.getElementById('cq-focus').checked,
        deadline: document.getElementById('cq-deadline').value || null   // Nov 1 2026 (Craft)
    });
    if (!document.getElementById('cq-focus').checked && editingQuestId && Vault.getActiveQuestId() === editingQuestId) {
        Vault.setActiveQuestId(null);
    }
    Toast.show(editingQuestId ? `📜 Saved: ${title}` : `📜 New quest: ${title}`, 'positive');
    goBack(quest && quest.id);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    Waggle.setActions(baseWaggleActions());

    taskEditor = TaskForm.checklist(document.getElementById('cq-tasks'), document.getElementById('cq-task-add'), {
        placeholder: 'Task',
        newItem: () => ({ difficulty: 'Easy', xp: tierFor('Easy').xp }),
        extraHTML: difficultyPill,
        onExtra: (item, el) => {
            if (el && el.dataset.extra === 'time') {
                const i = QUEST_TIME_STEPS.indexOf(item.minutes || null);
                item.minutes = QUEST_TIME_STEPS[(i + 1) % QUEST_TIME_STEPS.length];
            } else {
                const order = QUEST_DIFFICULTY_TIERS.map(t => t.level);
                item.difficulty = order[(order.indexOf(item.difficulty) + 1) % order.length];
            }
            item.xp = rowXP(item);
            setTimeout(renderTotal, 0);
            return true;
        }
    });

    editingQuestId = new URLSearchParams(window.location.search).get('id');
    const existing = editingQuestId ? Vault.getQuests().find(q => q.id === editingQuestId) : null;
    if (existing) {
        loadExisting(existing);
    } else {
        editingQuestId = null;
        // A first quest gets focus by default; after that you choose.
        document.getElementById('cq-focus').checked = !Vault.getActiveQuestId();
        taskEditor.set([{ text: '', difficulty: 'Easy', xp: tierFor('Easy').xp }]);
        setTimeout(() => document.getElementById('quest-title-input').focus(), 300);
    }
    renderColour();
    renderTotal();
    renderTags();
    document.getElementById('cq-tag-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTagFromInput(); }
    });
    document.getElementById('cq-tag-input').addEventListener('blur', addTagFromInput);
    document.getElementById('cq-tags').addEventListener('click', (event) => {
        const x = event.target.closest('[data-tag]');
        if (!x) return;
        questTags.splice(Number(x.dataset.tag), 1);
        renderTags();
    });

    document.getElementById('cq-type').addEventListener('click', (event) => {
        const b = event.target.closest('[data-cat]');
        if (!b) return;
        category = b.dataset.cat;
        renderColour();
    });
    document.getElementById('cq-tasks').addEventListener('input', renderTotal);
    document.getElementById('cq-tasks').addEventListener('click', () => setTimeout(renderTotal, 0));
    document.getElementById('cq-task-add').addEventListener('click', () => setTimeout(renderTotal, 0));
    document.getElementById('cq-chapter-add').addEventListener('click', () => taskEditor.addChapter());
    // Nov 1 2026 (Craft): deadline + Add to calendar / Set alarm.
    const dl = document.getElementById('cq-deadline');
    const phone = TaskForm.phoneButtons(document.getElementById('cq-phone'), () => dl.value ? {
        title: document.getElementById('quest-title-input').value.trim(), notes: document.getElementById('quest-objective-input').value.trim(), date: dl.value, time: null } : null);
    const dlRender = () => { document.getElementById('cq-deadline-clear').hidden = !dl.value; phone.refresh(); };
    dl.addEventListener('change', dlRender);
    document.getElementById('cq-deadline-clear').addEventListener('click', () => { dl.value = ''; dlRender(); });
    dlRender();

    TaskForm.privacyToggle(document.getElementById('hf-tip-btn'), document.getElementById('hf-tip'));
    document.getElementById('quest-title-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); document.getElementById('quest-objective-input').focus(); }
    });

    document.getElementById('hf-back').addEventListener('click', () => goBack(editingQuestId));
    document.getElementById('hf-save').addEventListener('click', saveQuest);

    // Deleting a quest removes all its tasks too, so it asks for a second tap.
    document.getElementById('hf-delete').addEventListener('click', (event) => {
        const btn = event.currentTarget;
        if (!deleteArmed) {
            deleteArmed = true;
            btn.textContent = 'TAP AGAIN';
            btn.classList.add('armed');
            Toast.show('This deletes the quest and all its tasks. Tap again to confirm.', 'negative');
            setTimeout(() => { deleteArmed = false; btn.textContent = 'DELETE'; btn.classList.remove('armed'); }, 3000);
            return;
        }
        Vault.removeQuest(editingQuestId);
        Toast.show('Quest deleted', 'negative');
        goBack(null);
    });
});
