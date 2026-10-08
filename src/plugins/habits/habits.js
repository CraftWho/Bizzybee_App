console.log("/// HABITS PLUGIN PROTOCOLS INITIALIZED ///");

// A recurring "reward/punish" action, Habitica-style - not a checklist
// task like Dailies, just a running +/- tally. Rebuilt 2026-10-08 (Craft):
// every habit is its own card with hexagon + / − buttons in its difficulty
// colour (src/core/habit-row/). Tap the name to edit, hold to move.
// Creating and editing happen on create-habit.html; the dock's + goes there.

function renderHabits() {
    const list = document.getElementById('habit-list');
    const habits = Vault.getHabits();
    list.innerHTML = habits.length > 0
        ? HabitRow.listHTML(habits, { reorder: true })
        : `<p class="quest-empty-state">No habits yet. Tap the + below to make one.</p>`;
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

    const list = document.getElementById('habit-list');
    HabitRow.bind(list, {
        editHref: (habit) => `./create-habit.html?id=${encodeURIComponent(habit.id)}`
    });
    HabitRow.enableReorder(list, {
        onMoved: (habitId, toIndex) => {
            Vault.moveHabit(habitId, toIndex);
            renderHabits();
        }
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
