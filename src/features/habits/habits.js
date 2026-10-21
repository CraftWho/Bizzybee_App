console.log("/// HABITS PLUGIN PROTOCOLS INITIALIZED ///");

// A recurring "reward/punish" action, Habitica-style - not a checklist
// task like Dailies, just a running +/- tally. Rebuilt 2026-10-08 (Craft):
// every habit is its own card with hexagon + / − buttons in its difficulty
// colour (src/core/ui/habit-row/). Tap the name to edit, hold to move.
// Creating and editing happen on create-habit.html; the dock's + goes there.

function renderHabits() {
    const list = document.getElementById('habit-list');
    const habits = Vault.getHabits();
    list.innerHTML = habits.length > 0
        ? HabitRow.listHTML(habits, { reorder: true })
        : `<p class="quest-empty-state">No habits yet. Tap the + below to make one.</p>`;
}

function renderQuote() {
    const q = quoteOfTheWeek();
    document.getElementById('habits-quote-text').textContent = q.text;
    const by = document.getElementById('habits-quote-by');
    by.textContent = '\u2014 ';
    const name = document.createElement('b');
    name.textContent = q.by;
    by.append(name, `, ${q.source}${q.note ? ` \u00b7 ${q.note}` : ''}`);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    renderQuote();

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
