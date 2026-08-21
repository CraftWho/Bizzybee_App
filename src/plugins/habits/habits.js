console.log("/// HABITS PLUGIN PROTOCOLS INITIALIZED ///");

// A recurring "reward/punish" action button, Habitica-style - not a
// checklist task like Dailies (nothing resets, nothing is "due"), just a
// running +/- tally. Every habit always shows BOTH buttons (per an
// explicit "both, always" call over a per-habit configurable choice).
// Adding/editing happens on its own page (create-habit.html), same split
// as Dailies/create-daily.html.

function escapeHabitHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function escapeHabitAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Same mapping dailies.js/quests.js use for their own difficulty badge.
const HABIT_DIFFICULTY_DOT_COLOR = { trivial: 'gray', easy: 'green', medium: 'yellow', hard: 'red' };

function habitTagsHTML(tags) {
    if (!tags || tags.length === 0) return '';
    return `<span class="habit-item-tags">${tags.map(tag => `<span class="habit-item-tag">${escapeHabitHTML(tag)}</span>`).join('')}</span>`;
}

function renderHabits() {
    const list = document.getElementById('habit-list');
    const habits = Vault.getHabits();

    list.innerHTML = habits.length > 0
        ? habits.map(habit => `
            <li class="habit-item" data-habit-id="${habit.id}">
                <div class="habit-item-main">
                    <div class="habit-item-top-row">
                        <span class="habit-item-label">${escapeHabitHTML(habit.label)}</span>
                        ${habit.difficulty ? `<small class="habit-item-difficulty habit-item-difficulty--${escapeHabitAttr(habit.difficulty.toLowerCase())}">${StatusDot.html(HABIT_DIFFICULTY_DOT_COLOR[habit.difficulty.toLowerCase()] || 'gray')}${escapeHabitHTML(habit.difficulty)}</small>` : ''}
                        <small class="habit-item-dp">±${habit.dp} DP</small>
                        ${habitTagsHTML(habit.tags)}
                    </div>
                    <span class="habit-item-tally">
                        <span class="habit-item-tally-positive">+${habit.positiveCount}</span> / <span class="habit-item-tally-negative">-${habit.negativeCount}</span> all time
                    </span>
                </div>
                <div class="habit-item-actions">
                    <button class="habit-action-btn habit-action-btn--negative" data-role="negative" aria-label="Log negative">−</button>
                    <button class="habit-action-btn habit-action-btn--positive" data-role="positive" aria-label="Log positive">+</button>
                    <button class="habit-item-icon-btn" data-role="edit" aria-label="Edit habit">✏️</button>
                    <button class="habit-item-icon-btn habit-item-icon-btn--remove" data-role="remove" aria-label="Remove habit">🗑️</button>
                </div>
            </li>
        `).join('')
        : `<p class="quest-empty-state">No habits yet - use the honeycomb button below to add one.</p>`;

    habits.forEach(habit => {
        const row = list.querySelector(`[data-habit-id="${habit.id}"]`);

        row.querySelector('[data-role="positive"]').addEventListener('click', () => {
            const levelBefore = Vault.getUser().level;
            Vault.bumpHabit(habit.id, 'positive');
            const levelAfter = Vault.getUser().level;

            Toast.show(`🐝 +${habit.dp} DP`, 'positive');
            if (levelAfter > levelBefore) Toast.show(`🎉 LEVEL UP! Lv. ${levelAfter}`, 'positive');

            renderHabits();
        });

        row.querySelector('[data-role="negative"]').addEventListener('click', () => {
            Vault.bumpHabit(habit.id, 'negative');
            Toast.show(`➖ ${habit.dp} DP`, 'negative');
            renderHabits();
        });

        row.querySelector('[data-role="edit"]').addEventListener('click', () => {
            window.location.href = `./create-habit.html?id=${encodeURIComponent(habit.id)}`;
        });

        row.querySelector('[data-role="remove"]').addEventListener('click', () => {
            if (!confirm(`Remove habit "${habit.label}"?`)) return;
            if (Vault.removeHabit(habit.id)) renderHabits();
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    // Same "renders even if reached directly without installing first"
    // courtesy as the Calendar/Study plugins - see study.js.
    const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('habits');
    document.getElementById('habits-not-installed').hidden = installed;
    document.getElementById('habits-app').hidden = !installed;

    if (!installed) return;

    renderHabits();

    HiveMind.setActions([
        {
            icon: '➕',
            label: 'Add Habit',
            onClick: () => { window.location.href = './create-habit.html'; }
        },
        ...baseHiveMindActions()
    ]);
});
