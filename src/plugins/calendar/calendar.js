console.log("/// CALENDAR PLUGIN PROTOCOLS INITIALIZED ///");

// A real Month/Week/Day calendar, built from THREE sources merged onto one
// board: completed quest tasks (Vault.getQuests()' task.dateCompleted),
// completed dailies (Vault.getDailyTasks()' completedDates history), and
// the user's own entries (Vault.getCalendarEvents() - see the "5j" section
// of db.js). The first two are read-only reflections of what already
// happened elsewhere in the app; only the third is editable here.
//
// Date keys are plain 'YYYY-MM-DD' strings throughout, matching exactly
// what <input type="date"> already produces and what quest/daily
// completion dates are already stored as - no Date-object round-tripping
// needed for stored data, only for generating the grid itself.

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

// Local calendar-day key (NOT UTC) - a grid cell showing "August 5" must
// key as "2026-08-05" regardless of timezone, which toISOString() can get
// wrong near midnight in positive-UTC-offset zones.
function gridDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
}

function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay()); // Sunday-start week
    d.setHours(0, 0, 0, 0);
    return d;
}

let currentView = 'month'; // 'month' | 'week' | 'day'
let currentDate = new Date();
let selectedKey = null;     // the day tapped in Month view (agenda below)
const EMPTY_DAY = { quests: [], dailies: [], events: [], todos: [] };

// One pass over quests/dailies/events, bucketed by date key - built fresh
// on every render rather than cached, since a quest/daily can be
// (un)checked from OTHER pages between visits and this page has no way to
// know that happened.
function buildEventIndex() {
    const index = {};
    const ensure = (key) => {
        if (!index[key]) index[key] = { quests: [], dailies: [], events: [], todos: [] };
        return index[key];
    };

    Vault.getQuests().forEach(quest => {
        (quest.tasks || []).forEach(task => {
            if (task.completed && task.dateCompleted) {
                const key = task.dateCompleted.slice(0, 10);
                ensure(key).quests.push({ label: task.label, xp: task.xp, questTitle: quest.title });
            }
        });
    });

    Vault.getDailyTasks().forEach(task => {
        (task.completedDates || []).forEach(key => {
            ensure(key).dailies.push({ label: task.label, xp: task.xp });
        });
    });

    Vault.getCalendarEvents().forEach(event => {
        ensure(event.date).events.push(event);
    });

    // To-Dos show on their due date (Oct 2026).
    (Vault.getTodos() || []).forEach(todo => {
        if (todo.dueDate) ensure(String(todo.dueDate).slice(0, 10)).todos.push(todo);
    });

    return index;
}

function buildMonthCells(anchorDate) {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const gridStart = startOfWeek(firstOfMonth);

    // Always 42 cells (6 full weeks) so the grid height never jumps
    // around between months with 4 vs 6 visible weeks.
    const cells = [];
    for (let i = 0; i < 42; i++) {
        const date = addDays(gridStart, i);
        cells.push({ date, inMonth: date.getMonth() === month });
    }
    return cells;
}

function goToDay(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    currentDate = new Date(y, m - 1, d);
    currentView = 'day';
    renderCalendar();
}

function renderMonthView(board, anchorDate, index) {
    const cells = buildMonthCells(anchorDate);
    const todayKey = gridDateKey(new Date());
    if (!selectedKey || !cells.some(c => c.inMonth && gridDateKey(c.date) === selectedKey)) {
        selectedKey = cells.some(c => c.inMonth && gridDateKey(c.date) === todayKey) ? todayKey : gridDateKey(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
    }
    const dot = (n, cls) => n ? `<i class="dot dot--${cls}"></i>` : '';

    board.className = 'calendar-board calendar-board--month';
    board.innerHTML = `
        <div class="grid" role="grid">
            ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span class="dow" aria-hidden="true">${d}</span>`).join('')}
            ${cells.map(cell => {
                const key = gridDateKey(cell.date);
                const day = index[key] || EMPTY_DAY;
                const count = day.quests.length + day.dailies.length + day.events.length + day.todos.length;
                const label = cell.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + (count ? `, ${count} item${count === 1 ? '' : 's'}` : '');
                return `<button type="button" class="day${cell.inMonth ? '' : ' out'}${key === todayKey ? ' today' : ''}${key === selectedKey ? ' sel' : ''}" data-date="${key}" aria-label="${label}"${key === selectedKey ? ' aria-pressed="true"' : ''}>
                    ${cell.date.getDate()}<span class="dots">${dot(day.quests.length, 'quest')}${dot(day.dailies.length, 'daily')}${dot(day.todos.length, 'todo')}${dot(day.events.length, 'event')}</span></button>`;
            }).join('')}
        </div>`;

    board.querySelectorAll('.day').forEach(cell => {
        cell.addEventListener('click', () => {
            selectedKey = cell.dataset.date;
            const [y, m] = selectedKey.split('-').map(Number);
            if (m - 1 !== currentDate.getMonth() || y !== currentDate.getFullYear()) currentDate = new Date(y, m - 1, 1);
            renderCalendar();
        });
    });
}

// The list under the month: everything on the tapped day.
function renderAgenda(index) {
    const wrap = document.getElementById('calendar-agenda-wrap');
    wrap.hidden = currentView !== 'month';
    if (currentView !== 'month') return;
    const [y, m, d] = selectedKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const isToday = selectedKey === gridDateKey(new Date());
    document.getElementById('calendar-agenda-title').textContent = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + (isToday ? ' · Today' : '');
    const day = index[selectedKey] || EMPTY_DAY;
    const rows = [
        ...day.events.map(e => ({ tm: e.time || 'All day', c: 'event', t: e.title, s: 'Your event', id: e.id })),
        ...day.todos.map(t => ({ tm: 'Due', c: 'todo', t: t.label, s: t.completed ? 'To-Do · done' : 'To-Do · due' })),
        ...day.quests.map(q => ({ tm: 'Done', c: 'quest', t: q.label, s: `${q.questTitle} · +${q.xp} XP` })),
        ...day.dailies.map(dl => ({ tm: 'Daily', c: 'daily', t: dl.label, s: `Daily · done · +${dl.xp} XP` }))
    ];
    document.getElementById('calendar-agenda').innerHTML = (rows.length
        ? rows.map(r => `<${r.id ? `button type="button" data-event-id="${r.id}"` : 'div'} class="ag${r.id ? ' calendar-item--event' : ''}"><span class="tm">${escapeHTML(r.tm)}</span><span class="pip pip--${r.c}"></span><span class="txt"><b>${escapeHTML(r.t)}</b><small>${escapeHTML(r.s)}</small></span></${r.id ? 'button' : 'div'}>`).join('')
        : '<p class="sub">Nothing on this day.</p>')
        + `<div class="ag-actions"><button type="button" class="btn" id="calendar-agenda-add">+ Event this day</button><button type="button" class="btn" id="calendar-agenda-open">Open day view</button></div>`;
    bindEventItemClicks(document.getElementById('calendar-agenda'));
    document.getElementById('calendar-agenda-add').onclick = () => openEventModal({ date: selectedKey });
    document.getElementById('calendar-agenda-open').onclick = () => goToDay(selectedKey);
}

function renderCalendarItem(item) {
    if (item.isEvent) {
        return `
            <button class="calendar-item calendar-item--event" data-event-id="${item.id}">
                <span class="calendar-item-icon">${item.icon}</span>
                <span class="calendar-item-label">${escapeHTML(item.label)}</span>
                ${item.sub ? `<span class="calendar-item-sub">${escapeHTML(item.sub)}</span>` : ''}
            </button>
        `;
    }
    return `
        <div class="calendar-item calendar-item--system">
            <span class="calendar-item-icon">${item.icon}</span>
            <span class="calendar-item-label">${escapeHTML(item.label)}</span>
            ${item.sub ? `<span class="calendar-item-sub">${escapeHTML(item.sub)}</span>` : ''}
        </div>
    `;
}

function renderWeekView(board, anchorDate, index) {
    const start = startOfWeek(anchorDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const todayKey = gridDateKey(new Date());

    board.className = 'calendar-board calendar-board--week';
    board.innerHTML = days.map(date => {
        const key = gridDateKey(date);
        const day = index[key] || EMPTY_DAY;
        const items = [
            ...day.todos.map(t => ({ icon: '✅', label: t.label, sub: 'Due' })),
            ...day.quests.map(q => ({ icon: '🐝', label: q.label, sub: `+${q.xp} XP` })),
            ...day.dailies.map(dl => ({ icon: '☀️', label: dl.label, sub: `+${dl.xp} XP` })),
            ...day.events.map(e => ({ icon: '📌', label: e.title, sub: e.time || '', id: e.id, isEvent: true }))
        ];
        return `
            <div class="calendar-week-col${key === todayKey ? ' calendar-week-col--today' : ''}">
                <button class="calendar-week-col-header" data-date="${key}">
                    <span class="calendar-week-col-dow">${date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    <span class="calendar-week-col-num">${date.getDate()}</span>
                </button>
                <div class="calendar-week-col-items">
                    ${items.length === 0 ? `<p class="calendar-week-empty">—</p>` : items.map(renderCalendarItem).join('')}
                </div>
                <button class="calendar-week-add-btn" data-date="${key}" title="Add event">➕</button>
            </div>
        `;
    }).join('');

    board.querySelectorAll('.calendar-week-col-header').forEach(btn => {
        btn.addEventListener('click', () => goToDay(btn.dataset.date));
    });
    board.querySelectorAll('.calendar-week-add-btn').forEach(btn => {
        btn.addEventListener('click', () => openEventModal({ date: btn.dataset.date }));
    });
    bindEventItemClicks(board);
}

function renderDayView(board, anchorDate, index) {
    const key = gridDateKey(anchorDate);
    const day = index[key] || EMPTY_DAY;

    board.className = 'calendar-board calendar-board--day';
    board.innerHTML = `
        <div class="calendar-day-header">
            <h3>${anchorDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>
        </div>

        <div class="calendar-day-section">
            <h4>✅ To-Dos due</h4>
            ${day.todos.length === 0
                ? `<p class="empty-state">Nothing due this day.</p>`
                : day.todos.map(t => renderCalendarItem({ icon: '✅', label: t.label, sub: t.completed ? 'Done' : 'Due' })).join('')}
        </div>

        <div class="calendar-day-section">
            <h4>🐝 Quest Tasks</h4>
            ${day.quests.length === 0
                ? `<p class="empty-state">Nothing completed this day.</p>`
                : day.quests.map(q => renderCalendarItem({ icon: '🐝', label: `${q.label} — ${q.questTitle}`, sub: `+${q.xp} XP` })).join('')}
        </div>

        <div class="calendar-day-section">
            <h4>☀️ Dailies</h4>
            ${day.dailies.length === 0
                ? `<p class="empty-state">None completed this day.</p>`
                : day.dailies.map(dl => renderCalendarItem({ icon: '☀️', label: dl.label, sub: `+${dl.xp} XP` })).join('')}
        </div>

        <div class="calendar-day-section">
            <h4>📌 Your Events</h4>
            ${day.events.length === 0
                ? `<p class="empty-state">Nothing added yet.</p>`
                : day.events.map(e => renderCalendarItem({ icon: '📌', label: e.title, sub: e.time || '', id: e.id, isEvent: true })).join('')}
            <button class="calendar-day-add-btn" id="calendar-day-add-btn">➕ Add Event for This Day</button>
        </div>
    `;

    bindEventItemClicks(board);
    const addBtn = document.getElementById('calendar-day-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => openEventModal({ date: key }));
}

// Shared by week/day views - a user event pill is clickable (opens it for
// edit/delete); quest/daily items never are, since those are read-only
// reflections of state that lives elsewhere.
function bindEventItemClicks(board) {
    board.querySelectorAll('.calendar-item--event').forEach(el => {
        el.addEventListener('click', () => {
            const event = Vault.getCalendarEvents().find(e => e.id === el.dataset.eventId);
            if (event) openEventModal({ existing: event });
        });
    });
}

function periodLabel() {
    if (currentView === 'month') {
        return currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (currentView === 'week') {
        const start = startOfWeek(currentDate);
        const end = addDays(start, 6);
        const sameMonth = start.getMonth() === end.getMonth();
        const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const endLabel = end.toLocaleDateString(undefined, sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
        return `${startLabel} – ${endLabel}`;
    }
    return currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function navigate(direction) {
    if (currentView === 'month') currentDate = addMonths(currentDate, direction);
    else if (currentView === 'week') currentDate = addDays(currentDate, direction * 7);
    else currentDate = addDays(currentDate, direction);
    renderCalendar();
}

function renderCalendar() {
    const index = buildEventIndex();
    const board = document.getElementById('calendar-board');

    document.getElementById('calendar-period-label').textContent = periodLabel();
    document.querySelectorAll('.calendar-view-btn').forEach(btn => {
        btn.classList.toggle('calendar-view-btn--active', btn.dataset.view === currentView);
    });

    document.querySelectorAll('.calendar-view-btn').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.view === currentView)));
    if (currentView === 'month') renderMonthView(board, currentDate, index);
    else if (currentView === 'week') renderWeekView(board, currentDate, index);
    else renderDayView(board, currentDate, index);
    renderAgenda(index);
}

// Add/Edit form for a user-created event - the one thing on this page
// that actually writes anything (see addCalendarEvent/updateCalendarEvent/
// removeCalendarEvent in db.js). Pass either { date } to create a new
// entry pre-filled to that day, or { existing } to edit/delete one.
function openEventModal({ date, existing } = {}) {
    const isEdit = !!existing;
    const defaultDate = existing ? existing.date : (date || gridDateKey(currentDate));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-box calendar-event-modal">
            <div class="modal-header">
                <span class="modal-title">📌 ${isEdit ? 'Edit Event' : 'Add Event'}</span>
                <button class="modal-close" aria-label="Close">✕</button>
            </div>
            <div class="modal-body">
                <label class="calendar-form-label">Date
                    <input type="date" id="calendar-event-date" value="${defaultDate}">
                </label>
                <label class="calendar-form-label">Title
                    <input type="text" id="calendar-event-title" value="${isEdit ? escapeHTML(existing.title) : ''}" placeholder="What's happening?">
                </label>
                <label class="calendar-form-label">Time (optional)
                    <input type="time" id="calendar-event-time" value="${isEdit && existing.time ? existing.time : ''}">
                </label>
                <label class="calendar-form-label">Notes (optional)
                    <textarea id="calendar-event-notes" rows="3">${isEdit && existing.notes ? escapeHTML(existing.notes) : ''}</textarea>
                </label>
            </div>
            <div class="modal-footer">
                <div class="modal-footer-controls">
                    ${isEdit ? `<button class="modal-btn-muted calendar-event-delete-btn">🗑️ Delete</button>` : ''}
                </div>
                <div class="modal-footer-actions">
                    <button class="modal-btn-muted calendar-event-cancel-btn">Cancel</button>
                    <button class="calendar-event-save-btn">💾 Save</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('.calendar-event-cancel-btn').addEventListener('click', close);

    const deleteBtn = overlay.querySelector('.calendar-event-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (!confirm(`Delete "${existing.title}"?`)) return;
            Vault.removeCalendarEvent(existing.id);
            if (typeof Toast !== 'undefined') Toast.show(`🗑️ Event deleted.`, 'negative');
            close();
            renderCalendar();
        });
    }

    overlay.querySelector('.calendar-event-save-btn').addEventListener('click', () => {
        const dateVal = document.getElementById('calendar-event-date').value;
        const titleVal = document.getElementById('calendar-event-title').value.trim();
        const timeVal = document.getElementById('calendar-event-time').value;
        const notesVal = document.getElementById('calendar-event-notes').value.trim();

        if (!dateVal || !titleVal) {
            if (typeof Toast !== 'undefined') Toast.show(`A date and title are both needed.`, 'negative');
            return;
        }

        if (isEdit) {
            Vault.updateCalendarEvent(existing.id, { date: dateVal, title: titleVal, time: timeVal, notes: notesVal });
            if (typeof Toast !== 'undefined') Toast.show(`📌 Event updated.`, 'positive');
        } else {
            Vault.addCalendarEvent({ date: dateVal, title: titleVal, time: timeVal, notes: notesVal });
            if (typeof Toast !== 'undefined') Toast.show(`📌 Event added.`, 'positive');
        }

        close();
        const [y, m, d] = dateVal.split('-').map(Number);
        currentDate = new Date(y, m - 1, d);
        selectedKey = dateVal;
        renderCalendar();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    // This page still renders even if the user reaches it directly
    // without installing it from Plugin Hub first (e.g. a stale
    // bookmark) - shows a short redirect notice instead of a broken
    // half-working board.
    const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('calendar');
    document.getElementById('calendar-not-installed').hidden = installed;
    document.getElementById('calendar-app').hidden = !installed;
    document.getElementById('calendar-add-event-btn').hidden = !installed;

    if (installed) {
        document.getElementById('calendar-prev-btn').addEventListener('click', () => navigate(-1));
        document.getElementById('calendar-next-btn').addEventListener('click', () => navigate(1));
        document.getElementById('calendar-today-btn').addEventListener('click', () => {
            currentDate = new Date();
            selectedKey = gridDateKey(currentDate);
            renderCalendar();
        });
        document.getElementById('calendar-add-event-btn').addEventListener('click', () => {
            openEventModal({ date: currentView === 'month' && selectedKey ? selectedKey : gridDateKey(currentDate) });
        });
        document.querySelectorAll('.calendar-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentView = btn.dataset.view;
                renderCalendar();
            });
        });

        renderCalendar();
    }

    Waggle.setActions(baseWaggleActions());
});
