console.log("/// CREATE QUEST PROTOCOLS INITIALIZED ///");

// Create / edit a quest (2026-10-09; replaces the old New Quest pop-up).
// Same coloured-top form as Habits / Dailies / To-Dos. The colour follows
// the quest type (Main gold, Side blue - QUEST_STYLE in quest-common.js).
// Fields: Title, Objective, Type, Tasks (each with its own difficulty and
// XP), Source, and Focus. Editing keeps each task's done state; the rest
// of the quest (ghost logs, side quests, unlocks...) is never touched here.

let editingQuestId = null;
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

function renderTotal() {
    const items = taskEditor.all().filter(i => i.text.trim());
    const xp = items.reduce((sum, i) => sum + (Number(i.xp) || 0), 0);
    document.getElementById('cq-total').textContent = items.length ? `${items.length} task${items.length === 1 ? '' : 's'} · ${xp} XP` : '';
}

// The difficulty pill on each task row. Tap cycles Easy → Medium → Hard.
function difficultyPill(item) {
    const s = HABIT_DIFFICULTY_STYLE[item.difficulty] || HABIT_DIFFICULTY_STYLE.Easy;
    return `<button type="button" class="cq-diff" data-extra style="--c:${s.color};--k:${s.ink}" aria-label="Difficulty: ${item.difficulty}, ${item.xp} XP. Tap to change.">
        ${item.completed ? '<span class="cq-done" title="Done">✓</span>' : ''}${item.difficulty}<small>${item.xp}</small></button>`;
}

function loadExisting(quest) {
    document.getElementById('quest-title-input').value = quest.title || '';
    document.getElementById('quest-objective-input').value = quest.objective || '';
    category = quest.category === 'side' ? 'side' : 'main';
    taskEditor.set((quest.tasks || []).map(t => ({
        id: t.id,
        text: t.label || '',
        difficulty: QUEST_DIFFICULTY_TIERS.some(x => x.level === t.difficulty) ? t.difficulty : 'Easy',
        xp: Number(t.xp) || tierFor(t.difficulty).xp,
        completed: !!t.completed,
        existing: true
    })));
    if (quest.source) {
        document.getElementById('cq-source-label').value = quest.source.label || '';
        document.getElementById('cq-source-url').value = quest.source.url || '';
    }
    document.getElementById('cq-focus').checked = Vault.getActiveQuestId() === quest.id;
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
    const tasks = taskEditor.get();
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
        tasks: tasks.map(i => ({ id: i.existing ? i.id : null, label: i.text, difficulty: i.difficulty, xp: i.xp })),
        makeActive: document.getElementById('cq-focus').checked
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
        onExtra: (item) => {
            const order = QUEST_DIFFICULTY_TIERS.map(t => t.level);
            item.difficulty = order[(order.indexOf(item.difficulty) + 1) % order.length];
            item.xp = tierFor(item.difficulty).xp;
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

    document.getElementById('cq-type').addEventListener('click', (event) => {
        const b = event.target.closest('[data-cat]');
        if (!b) return;
        category = b.dataset.cat;
        renderColour();
    });
    document.getElementById('cq-tasks').addEventListener('input', renderTotal);
    document.getElementById('cq-tasks').addEventListener('click', () => setTimeout(renderTotal, 0));
    document.getElementById('cq-task-add').addEventListener('click', () => setTimeout(renderTotal, 0));

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
