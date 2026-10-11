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

// One pass over quests/dailies/events, bucketed by date key - built fresh
// on every render rather than cached, since a quest/daily can be
// (un)checked from OTHER pages between visits and this page has no way to
// know that happened.
function buildEventIndex() {
    const index = {};
    const ensure = (key) => {
        if (!index[key]) index[key] = { quests: [], dailies: [], events: [] };
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

    board.className = 'calendar-board calendar-board--month';
    board.innerHTML = `
        <div class="calendar-month-weekdays">
            ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span>${d}</span>`).join('')}
        </div>
        <div class="calendar-month-grid">
            ${cells.map(cell => {
                const key = gridDateKey(cell.date);
                const day = index[key] || { quests: [], dailies: [], events: [] };
                const hasItems = day.quests.length + day.dailies.length + day.events.length > 0;
                return `
                    <button class="calendar-month-cell${cell.inMonth ? '' : ' calendar-month-cell--outside'}${key === todayKey ? ' calendar-month-cell--today' : ''}" data-date="${key}">
                        <span class="calendar-month-cell-num">${cell.date.getDate()}</span>
                        ${hasItems ? `
                        <span class="calendar-month-cell-dots">
                            ${day.quests.length ? `<span class="calendar-dot calendar-dot--quest" title="${day.quests.length} quest task(s)"></span>` : ''}
                            ${day.dailies.length ? `<span class="calendar-dot calendar-dot--daily" title="${day.dailies.length} daily(s)"></span>` : ''}
                            ${day.events.length ? `<span class="calendar-dot calendar-dot--event" title="${day.events.length} event(s)"></span>` : ''}
                        </span>` : ''}
                    </button>
                `;
            }).join('')}
        </div>
    `;

    board.querySelectorAll('.calendar-month-cell').forEach(cell => {
        cell.addEventListener('click', () => goToDay(cell.dataset.date));
    });
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
        const day = index[key] || { quests: [], dailies: [], events: [] };
        const items = [
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
    const day = index[key] || { quests: [], dailies: [], events: [] };

    board.className = 'calendar-board calendar-board--day';
    board.innerHTML = `
        <div class="calendar-day-header">
            <h3>${anchorDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>
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

    if (currentView === 'month') renderMonthView(board, currentDate, index);
    else if (currentView === 'week') renderWeekView(board, currentDate, index);
    else renderDayView(board, currentDate, index);
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

    if (installed) {
        document.getElementById('calendar-prev-btn').addEventListener('click', () => navigate(-1));
        document.getElementById('calendar-next-btn').addEventListener('click', () => navigate(1));
        document.getElementById('calendar-today-btn').addEventListener('click', () => {
            currentDate = new Date();
            renderCalendar();
        });
        document.getElementById('calendar-add-event-btn').addEventListener('click', () => {
            openEventModal({ date: gridDateKey(currentDate) });
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
