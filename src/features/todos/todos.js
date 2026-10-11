console.log("/// TO-DOS PLUGIN PROTOCOLS INITIALIZED ///");

// To-Dos list (rebuilt 2026-10-09 to match Dailies and Habits). Each to-do
// is a card with a hexagon check in its difficulty colour. Tap the hexagon
// to finish it, tap the card to edit, hold to move (Active tab). Tabs:
// Active (everything not done), Scheduled (has a due date, soonest first)
// and Done (newest first, tap the hexagon to bring one back). The box on
// the right is the checklist count; tap it to tick lines here.
// The card itself is TaskRow.todoHTML (src/core/task-row/), shared with
// Home's Today panel.

const openChecklists = new Set();
let currentTab = 'active';
try { currentTab = sessionStorage.getItem('bizzybee_todos_tab') || 'active'; } catch (e) { /* storage off */ }

function tabLists() {
    const all = Vault.getTodos();
    const active = all.filter(t => !t.completed);
    const scheduled = active.filter(t => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const done = all.filter(t => t.completed).sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));
    return { all, active, scheduled, done };
}

const EMPTY = {
    active: 'Nothing to do. Tap the + below to add a to-do.',
    scheduled: 'No to-dos with a due date. Give one a due date to see it here.',
    done: 'Nothing finished yet. Check off a to-do and it lands here.'
};

function renderTodos() {
    const lists = tabLists();
    const today = TaskRow.localISO(new Date());
    const overdue = lists.active.filter(t => t.dueDate && t.dueDate < today).length;
    const dueToday = lists.active.filter(t => t.dueDate === today).length;

    document.getElementById('td-n-active').textContent = lists.active.length;
    document.getElementById('td-n-scheduled').textContent = lists.scheduled.length;
    document.getElementById('td-n-done').textContent = lists.done.length;
    const sum = [`<b>${lists.active.length}</b> to go`];
    if (dueToday) sum.push(`<span class="today">${dueToday} due today</span>`);
    if (overdue) sum.push(`<span class="over">${overdue} overdue</span>`);
    document.getElementById('td-sum').innerHTML = sum.join('<i>·</i>');

    document.querySelectorAll('.td-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === currentTab)));
    document.getElementById('td-hold').hidden = currentTab !== 'active';
    document.getElementById('td-tip').textContent = currentTab === 'done'
        ? 'Tap the hexagon to bring one back. Its XP comes off again.'
        : "Tap the hexagon when it's done. Tap a to-do to edit it.";

    const shown = lists[currentTab];
    document.getElementById('todo-task-list').innerHTML = shown.length
        ? `<ul class="hr-list"${currentTab === 'active' ? ' data-reorder="1"' : ''}>${shown.map(x => TaskRow.todoHTML(x, openChecklists.has(x.id))).join('')}</ul>`
        : `<p class="dl-empty">${EMPTY[currentTab]}</p>`;
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderTodos();

    document.querySelector('.td-tabs').addEventListener('click', (event) => {
        const b = event.target.closest('[data-tab]');
        if (!b) return;
        currentTab = b.dataset.tab;
        try { sessionStorage.setItem('bizzybee_todos_tab', currentTab); } catch (e) { /* storage off */ }
        renderTodos();
    });

    const list = document.getElementById('todo-task-list');
    list.addEventListener('click', (event) => {
        if (window.__hrJustDragged) return;
        const el = event.target.closest('[data-act]');
        if (!el) return;
        const row = el.closest('.dr-row');
        const todo = Vault.getTodos().find(t => t.id === row.dataset.rowId);
        if (!todo) return;
        const act = el.dataset.act;
        if (act === 'edit') {
            window.location.href = `./create-todo.html?id=${encodeURIComponent(todo.id)}`;
        } else if (act === 'check') {
            const nowDone = !todo.completed;
            Vault.toggleTodoComplete(todo.id);
            TaskRow.animateCheck(row, nowDone, todo.xp);
            row.classList.add(nowDone ? 'leaving' : 'returning');
            setTimeout(renderTodos, 700);
        } else if (act === 'list') {
            if (openChecklists.has(todo.id)) openChecklists.delete(todo.id); else openChecklists.add(todo.id);
            renderTodos();
        } else if (act === 'item') {
            Vault.toggleTodoChecklistItem(todo.id, el.dataset.item);
            renderTodos();
        }
    });
    list.addEventListener('keydown', (event) => {
        const main = event.target.closest('.dr-main');
        if (main && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); main.click(); }
    });

    // Moves within the Active tab. The drop spot is another active to-do,
    // so move next to that one in the full list (done ones stay put).
    HabitRow.enableReorder(list, {
        onMoved: (todoId, toIndex) => {
            const active = Vault.getTodos().filter(t => !t.completed);
            const target = active[toIndex];
            if (target) Vault.moveTodo(todoId, Vault.getTodos().findIndex(t => t.id === target.id));
            renderTodos();
        }
    });

    Waggle.setActions([
        {
            icon: '➕',
            label: 'Add To-Do',
            onClick: () => { window.location.href = './create-todo.html'; }
        },
        ...baseWaggleActions()
    ]);
});
