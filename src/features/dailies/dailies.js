console.log("/// DAILIES PROTOCOLS INITIALIZED ///");

// Dailies list (rebuilt 2026-10-09 to match Habits and Home). Each daily is
// a card with a hexagon check in its difficulty colour. Tap the hexagon to
// check it off, tap the card to edit, hold to move. Dailies not due today
// are dimmed and show when they're next due. The box on the right is the
// checklist count; tap it to tick lines here (they reset every day, like
// the daily itself). The card itself is TaskRow.dailyHTML (src/core/ui/task-row/),
// shared with Home's Today panel.

const openChecklists = new Set();

function renderHead(tasks) {
    const due = tasks.filter(t => t.dueToday || t.completedToday);
    const done = due.filter(t => t.completedToday).length;
    const pct = due.length ? Math.round(done / due.length * 100) : 0;
    document.getElementById('dl-count').innerHTML = due.length
        ? `<b>${done}</b> of ${due.length} done today`
        : 'Nothing due today';
    document.getElementById('dl-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const bar = document.getElementById('dl-bar');
    bar.setAttribute('aria-valuenow', pct);
    bar.classList.toggle('full', due.length > 0 && done === due.length);
    document.getElementById('dl-bar-fill').style.width = `${pct}%`;
}

// Oct 2026: dailies not due today sit in their own "Not due today"
// section under the rest, instead of greyed out between them.
function renderDailyTasks() {
    const tasks = Vault.getDailyTasks();
    renderHead(tasks);
    const due = tasks.filter(t => t.dueToday || t.completedToday);
    const off = tasks.filter(t => !(t.dueToday || t.completedToday));
    document.getElementById('daily-task-list').innerHTML = tasks.length
        ? (due.length ? `<ul class="hr-list" data-reorder="1">${due.map(t => TaskRow.dailyHTML(t, openChecklists.has(t.id))).join('')}</ul>` : '<p class="dl-empty">Nothing due today. 🎉</p>')
          + (off.length ? `<h2 class="dl-sec">💤 Not due today <small>${off.length}</small></h2><ul class="hr-list dl-off">${off.map(t => TaskRow.dailyHTML(t, openChecklists.has(t.id))).join('')}</ul>` : '')
        : '<p class="dl-empty">No dailies yet. Tap the + below to make one.</p>';
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    renderDailyTasks();

    const list = document.getElementById('daily-task-list');
    list.addEventListener('click', (event) => {
        if (window.__hrJustDragged) return;
        const el = event.target.closest('[data-act]');
        if (!el) return;
        const row = el.closest('.dr-row');
        const task = Vault.getDailyTasks().find(t => t.id === row.dataset.rowId);
        if (!task) return;
        const act = el.dataset.act;
        if (act === 'edit') {
            window.location.href = `./create-daily.html?id=${encodeURIComponent(task.id)}`;
        } else if (act === 'check') {
            Vault.toggleDailyTask(task.id);
            TaskRow.animateCheck(row, !task.completedToday, task.xp);
            if (!task.completedToday) setTimeout(() => typeof TimeLog !== 'undefined' && TimeLog.ask({ kind: 'daily', id: task.id }), 450);
            setTimeout(renderDailyTasks, 650);
        } else if (act === 'list') {
            if (openChecklists.has(task.id)) openChecklists.delete(task.id); else openChecklists.add(task.id);
            renderDailyTasks();
        } else if (act === 'item') {
            Vault.toggleDailyChecklistItem(task.id, el.dataset.item);
            renderDailyTasks();
        }
    });
    list.addEventListener('keydown', (event) => {
        const main = event.target.closest('.dr-main');
        if (main && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); main.click(); }
    });

    HabitRow.enableReorder(list, {
        onMoved: (taskId, toIndex) => {
            // toIndex is a spot in the "due today" list; turn it into a spot
            // in the full list (the not-due ones keep their places).
            const due = Vault.getDailyTasks().filter(t => t.dueToday || t.completedToday);
            const target = due[Math.max(0, Math.min(due.length - 1, toIndex))];
            const all = Vault.state.dailyTasks || [];
            Vault.moveDaily(taskId, target ? all.findIndex(t => t.id === target.id) : toIndex);
            renderDailyTasks();
        }
    });

    Waggle.setActions([
        {
            icon: '➕',
            label: 'Add Daily',
            onClick: () => { window.location.href = './create-daily.html'; }
        },
        ...baseWaggleActions()
    ]);
});
