console.log("/// HABITS PLUGIN PROTOCOLS INITIALIZED ///");

// A recurring "reward/punish" action button, Habitica-style - not a
// checklist task like Dailies (nothing resets, nothing is "due"), just a
// running +/- tally. Which of +/- shows is a per-habit toggle set on
// create-habit.html (both on by default) - Vault.getHabits() already
// resolves the default for old habits, so this file just reads
// habit.positive/habit.negative as given. Adding/editing happens on its
// own page (create-habit.html), same split as Dailies/create-daily.html.
const HABIT_RESET_PERIOD_LABEL = { daily: 'today', weekly: 'this week', monthly: 'this month' };

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
                <div class="habit-item-accent habit-item-accent--${HABIT_DIFFICULTY_DOT_COLOR[(habit.difficulty || '').toLowerCase()] || 'gray'}"></div>
                <div class="habit-item-body">
                    <div class="habit-item-top-row">
                        <span class="habit-item-label">${escapeHabitHTML(habit.label)}</span>
                        ${habit.negative ? '<button class="habit-action-btn habit-action-btn--negative" data-role="negative" aria-label="Log negative">−</button>' : ''}
                        ${habit.positive ? '<button class="habit-action-btn habit-action-btn--positive" data-role="positive" aria-label="Log positive">+</button>' : ''}
                        <button class="habit-item-more-btn" data-role="more" aria-label="More actions">⋯</button>
                    </div>
                    <div class="habit-item-meta">
                        <small class="habit-item-dp">±${habit.dp} DP</small>
                        ${habit.difficulty ? `<small class="habit-item-difficulty habit-item-difficulty--${escapeHabitAttr(habit.difficulty.toLowerCase())}">${StatusDot.html(HABIT_DIFFICULTY_DOT_COLOR[habit.difficulty.toLowerCase()] || 'gray')}${escapeHabitHTML(habit.difficulty)}</small>` : ''}
                        <span class="habit-item-tally">
                            <span class="habit-item-tally-positive">+${habit.periodPositiveCount}</span> / <span class="habit-item-tally-negative">-${habit.periodNegativeCount}</span> ${HABIT_RESET_PERIOD_LABEL[habit.resetCounter] || 'today'}
                        </span>
                        <span class="habit-item-tally-alltime">+${habit.positiveCount} / -${habit.negativeCount} all time</span>
                        ${habitTagsHTML(habit.tags)}
                    </div>
                </div>
                <div class="habit-item-more-menu" data-role="more-menu">
                    <button type="button" data-role="edit">✏️ Edit</button>
                    <button type="button" data-role="remove">🗑️ Remove</button>
                </div>
            </li>
        `).join('')
        : `<p class="quest-empty-state">No habits yet - use the honeycomb button below to add one.</p>`;

    habits.forEach(habit => {
        const row = list.querySelector(`[data-habit-id="${habit.id}"]`);

        const positiveBtn = row.querySelector('[data-role="positive"]');
        if (positiveBtn) positiveBtn.addEventListener('click', () => {
            const levelBefore = Vault.getUser().level;
            Vault.bumpHabit(habit.id, 'positive');
            const levelAfter = Vault.getUser().level;

            Toast.show(`🐝 +${habit.dp} DP`, 'positive');
            if (levelAfter > levelBefore) Toast.show(`🎉 LEVEL UP! Lv. ${levelAfter}`, 'positive');

            renderHabits();
        });

        const negativeBtn = row.querySelector('[data-role="negative"]');
        if (negativeBtn) negativeBtn.addEventListener('click', () => {
            Vault.bumpHabit(habit.id, 'negative');
            Toast.show(`➖ ${habit.dp} DP`, 'negative');
            renderHabits();
        });

        row.querySelector('[data-role="more"]').addEventListener('click', (event) => {
            event.stopPropagation();
            const menu = row.querySelector('[data-role="more-menu"]');
            const willOpen = !menu.classList.contains('habit-item-more-menu--open');
            document.querySelectorAll('.habit-item-more-menu--open').forEach(m => m.classList.remove('habit-item-more-menu--open'));
            if (willOpen) menu.classList.add('habit-item-more-menu--open');
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

    document.addEventListener('click', () => {
        document.querySelectorAll('.habit-item-more-menu--open').forEach(m => m.classList.remove('habit-item-more-menu--open'));
    });

    Waggle.setActions([
        {
            icon: '➕',
            label: 'Add Habit',
            onClick: () => { window.location.href = './create-habit.html'; }
        },
        ...baseWaggleActions()
    ]);
});
