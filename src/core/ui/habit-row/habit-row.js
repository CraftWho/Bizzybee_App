// Shared habit row (Habits page + Home's Today card), Craft 2026-10-08.
// Each habit is its own card: a hexagon + on the left, a hexagon − on the
// right, both in the habit's difficulty colour. A side the habit doesn't
// use is an empty grey hexagon. Tap the name to edit. On the Habits page,
// touch and hold a card to move it (HabitRow.enableReorder).
const HABIT_DIFFICULTY_STYLE = {
    Trivial: { color: '#9aa6b6', ink: '#14181d' },
    Easy: { color: '#34c77b', ink: '#06210f' },
    Medium: { color: '#ffcc00', ink: '#2a1a00' },
    Hard: { color: '#e3304a', ink: '#ffffff' }
};

const HabitRow = {
    HEX: '22,2 41,13 41,35 22,46 3,35 3,13',
    PERIOD_LABEL: { daily: 'today', weekly: 'this week', monthly: 'this month' },

    style(habit) {
        return HABIT_DIFFICULTY_STYLE[habit.difficulty] || HABIT_DIFFICULTY_STYLE.Easy;
    },

    esc(text) {
        return String(text == null ? '' : text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    hexButton(habit, side) {
        const on = side === 'positive' ? habit.positive : habit.negative;
        const sym = side === 'positive' ? '<path d="M22 15v18M13 24h18"/>' : '<path d="M13 24h18"/>';
        const label = side === 'positive' ? 'I did it' : (habit.positive ? "I didn't" : 'It slipped in');
        return `<button type="button" class="hr-btn hr-${side}${on ? '' : ' off'}" ${on ? `data-hr="${side}"` : 'disabled tabindex="-1"'} aria-label="${label}: ${this.esc(habit.label)}">
            <svg viewBox="0 0 44 48" aria-hidden="true"><polygon class="hr-glow" points="${this.HEX}"/><polygon class="hr-hex" points="${this.HEX}"/><g class="hr-sym">${sym}</g></svg></button>`;
    },

    counts(habit) {
        const parts = [];
        if (habit.positive) parts.push(`+${habit.periodPositiveCount || 0}`);
        if (habit.negative) parts.push(`−${habit.periodNegativeCount || 0}`);
        return `${parts.join('  |  ')} ${this.PERIOD_LABEL[habit.resetCounter] || 'today'}`;
    },

    // The "Read a motivational quote" habit shows the Quote of the Week
    // (src/core/ui/habit-quotes/, when that file is loaded) with its credit.
    isQuoteHabit(habit) {
        return habit.quoteOfWeek === true || habit.label === 'Read a motivational quote';
    },

    notesHTML(habit) {
        if (this.isQuoteHabit(habit) && typeof quoteOfTheWeek === 'function') {
            const q = quoteOfTheWeek();
            return `<span class="hr-notes"><q>${this.esc(q.text)}</q><span class="hr-credit">\u2014 ${this.esc(quoteCredit(q))}</span></span>`;
        }
        return habit.notes ? `<span class="hr-notes">${this.esc(habit.notes)}</span>` : '';
    },

    html(habit) {
        const s = this.style(habit);
        return `<li class="hr-row" data-habit-id="${this.esc(habit.id)}" style="--dc:${s.color};--dk:${s.ink}">
            <div class="hr-side${habit.positive ? ' lit' : ''}">${this.hexButton(habit, 'positive')}</div>
            <div class="hr-mid" data-hr="edit" role="button" tabindex="0" aria-label="Edit ${this.esc(habit.label)}">
                <span class="hr-title">${this.esc(habit.label)}</span>
                ${this.notesHTML(habit)}
                <span class="hr-count">${this.counts(habit)}</span>
            </div>
            <div class="hr-side${habit.negative ? ' lit' : ''}">${this.hexButton(habit, 'negative')}</div>
        </li>`;
    },

    listHTML(habits, { reorder = false } = {}) {
        return `<ul class="hr-list"${reorder ? ' data-reorder="1"' : ''}>${habits.map(h => this.html(h)).join('')}</ul>`;
    },

    // Wires + / − / edit on a container that holds HabitRow lists.
    // editHref(habit) -> URL of the edit screen. onChange() re-renders.
    bind(container, { editHref, onChange }) {
        if (container.__hrBound) return;
        container.__hrBound = true;
        container.addEventListener('click', (event) => {
            if (window.__hrJustDragged) return;
            const el = event.target.closest('[data-hr]');
            if (!el || !container.contains(el)) return;
            const row = el.closest('.hr-row');
            const habit = Vault.getHabits().find(h => h.id === row.dataset.habitId);
            if (!habit) return;
            const action = el.dataset.hr;
            if (action === 'edit') { window.location.href = editHref(habit); return; }
            const positive = action === 'positive';
            Vault.bumpHabit(habit.id, action);
            if (positive) setTimeout(() => typeof TimeLog !== 'undefined' && TimeLog.ask({ kind: 'habit', id: habit.id }), 450);
            el.classList.remove('hr-pop'); void el.offsetWidth; el.classList.add('hr-pop');
            const ripple = document.createElement('span');
            ripple.className = `hr-ripple ${positive ? 'l' : 'r'}`;
            row.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
            const float = document.createElement('span');
            float.className = `hr-float ${positive ? 'good' : 'bad'}`;
            float.textContent = `${positive ? '+' : '−'}${habit.xp} XP`;
            row.appendChild(float);
            setTimeout(() => float.remove(), 1100);
            if (navigator.vibrate) navigator.vibrate(positive ? 25 : [20, 30, 20]);
            const fresh = Vault.getHabits().find(h => h.id === habit.id);
            if (fresh) row.querySelector('.hr-count').textContent = this.counts(fresh);
            if (onChange) onChange(habit, action);
        });
        container.addEventListener('keydown', (event) => {
            const mid = event.target.closest('.hr-mid');
            if (mid && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); mid.click(); }
        });
    },

    // Touch and hold (or click and hold) a card, then drag it up or down.
    // Also used by the Dailies list (rows carry data-row-id; anything marked
    // data-no-hold, like a check button, never starts a hold).
    enableReorder(container, { onMoved }) {
        if (container.__hrReorder) return;
        container.__hrReorder = true;
        const HOLD_MS = 420;
        let hold = null, drag = null;

        const cancelHold = () => {
            if (!hold) return;
            clearTimeout(hold.timer);
            hold.row.classList.remove('pressing');
            hold = null;
        };
        const startDrag = (row, list, y) => {
            const rows = [...list.children];
            drag = { row, list, rows, start: y, from: rows.indexOf(row), to: rows.indexOf(row), rects: rows.map(r => r.getBoundingClientRect()) };
            row.classList.remove('pressing');
            row.classList.add('lifted');
            list.classList.add('sorting');
            hold = null;
            if (navigator.vibrate) navigator.vibrate(30);
        };

        container.addEventListener('pointerdown', (event) => {
            const row = event.target.closest('[data-reorder] .hr-row');
            if (!row || event.target.closest('.hr-btn, [data-no-hold]') || event.button > 0) return;
            const list = row.parentNode;
            hold = { row, x: event.clientX, y: event.clientY, timer: setTimeout(() => startDrag(row, list, event.clientY), HOLD_MS) };
            row.classList.add('pressing');
        });
        document.addEventListener('pointermove', (event) => {
            if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) cancelHold();
            if (!drag) return;
            const dy = event.clientY - drag.start;
            drag.row.style.transform = `translateY(${dy}px) scale(1.03)`;
            const r0 = drag.rects[drag.from];
            const mid = (r0.top + r0.bottom) / 2 + dy;
            let to = drag.from;
            drag.rects.forEach((r, i) => {
                const c = (r.top + r.bottom) / 2;
                if (i < drag.from && mid < c) to = Math.min(to, i);
                if (i > drag.from && mid > c) to = Math.max(to, i);
            });
            if (to !== drag.to) { drag.to = to; if (navigator.vibrate) navigator.vibrate(8); }
            const step = r0.height + 10;
            drag.rows.forEach((r, i) => {
                if (r === drag.row) return;
                let shift = 0;
                if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -step;
                if (drag.from > drag.to && i < drag.from && i >= drag.to) shift = step;
                r.style.transform = shift ? `translateY(${shift}px)` : '';
            });
        });
        document.addEventListener('touchmove', (event) => { if (drag) event.preventDefault(); }, { passive: false });
        const end = () => {
            cancelHold();
            if (!drag) return;
            const { from, to, row, rows, list } = drag;
            row.classList.remove('lifted');
            list.classList.remove('sorting');
            rows.forEach(r => { r.style.transform = ''; });
            drag = null;
            window.__hrJustDragged = true;
            setTimeout(() => { window.__hrJustDragged = false; }, 60);
            if (from !== to && onMoved) onMoved(row.dataset.habitId || row.dataset.rowId, to);
        };
        document.addEventListener('pointerup', end);
        document.addEventListener('pointercancel', end);
        container.addEventListener('contextmenu', (event) => { if (event.target.closest('[data-reorder] .hr-row')) event.preventDefault(); });
    }
};
