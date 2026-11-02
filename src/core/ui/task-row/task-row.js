// Shared bits of the Dailies and To-Dos card rows (2026-10-09). Styles in
// task-row.css. Each page builds its own row (the info differs); this holds
// the parts that are the same: the hexagon check, the checklist count
// badge and list, the reminder label, and the check-off animation.

const TaskRow = {
    HEX_CHECK: `<svg viewBox="0 0 44 48" aria-hidden="true">
        <polygon class="dr-glow" points="22,2 41,13 41,35 22,46 3,35 3,13"/>
        <polygon class="dr-cell" points="22,2 41,13 41,35 22,46 3,35 3,13"/>
        <path class="dr-tick" d="M13.5 24.5 L19.5 30.5 L31 18"/></svg>`,

    esc(text) {
        return String(text == null ? '' : text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    style(task) {
        return HABIT_DIFFICULTY_STYLE[task.difficulty] || HABIT_DIFFICULTY_STYLE.Easy;
    },

    checkButton(task, done) {
        return `<button type="button" class="dr-check" data-act="check" data-no-hold aria-pressed="${done}" aria-label="${done ? 'Undo' : 'Check off'}: ${this.esc(task.label)}">${this.HEX_CHECK}</button>`;
    },

    time12(hm) {
        const [h, m] = String(hm).split(':').map(Number);
        return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    },

    // "2:00 PM (+1)": the next reminder still to come today (else the
    // first one), plus how many more there are.
    reminderLabel(reminders) {
        const times = (reminders || []).map(r => r.time).filter(t => /^\d{2}:\d{2}$/.test(t)).sort();
        if (!times.length) return '';
        const now = new Date();
        const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const next = times.find(t => t >= nowHM) || times[0];
        return `${this.time12(next)}${times.length > 1 ? ` (+${times.length - 1})` : ''}`;
    },

    reminderChip(reminders) {
        const label = this.reminderLabel(reminders);
        return label ? `<span class="dr-rem" title="Reminders"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9" r="5.5"/><path d="M8 6.5V9l1.8 1.3M2.5 3.5l2-1.5M13.5 3.5l-2-1.5"/></svg>${label}</span>` : '';
    },

    // The "1 / 3" box on the right; tap to open the checklist.
    checklistBadge(items, open) {
        if (!items || !items.length) return '';
        const done = items.filter(i => i.done).length;
        return `<button type="button" class="dr-cl-badge${done === items.length ? ' full' : ''}" data-act="list" data-no-hold aria-expanded="${open}" aria-label="Checklist, ${done} of ${items.length} done">
            <b>${done}</b><i></i><b>${items.length}</b></button>`;
    },

    checklistList(items, open) {
        if (!items || !items.length || !open) return '';
        return `<ul class="dr-cl">${items.map(i => `
            <li><button type="button" class="dr-cl-item${i.done ? ' on' : ''}" data-act="item" data-item="${this.esc(i.id)}" data-no-hold aria-pressed="${!!i.done}">
                <svg viewBox="0 0 20 22" aria-hidden="true"><polygon points="10,1 19,6 19,16 10,21 1,16 1,6"/><path d="M6 11.5l3 3 5-6"/></svg>
                <span>${this.esc(i.text)}</span></button></li>`).join('')}</ul>`;
    },

    // ---- dates ----
    localISO(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },

    shortDate(iso) {
        const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString(undefined, y === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
    },

    daysUntil(iso) {
        const [y, m, d] = String(iso).split('-').map(Number);
        const now = new Date();
        return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    },

    // "Tomorrow", "Mon", or "Oct 21" - the next day a daily is due.
    nextDueLabel(task) {
        const d = new Date();
        for (let i = 1; i <= 400; i++) {
            d.setDate(d.getDate() + 1);
            if (isDailyDueOn(task, this.localISO(d))) {
                if (i === 1) return 'Tomorrow';
                if (i < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
                return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            }
        }
        return '';
    },

    // Due chip: "Overdue · Oct 3" (red), "Due today" (gold), "Due tomorrow",
    // "Due Mon" this week, else "Due Oct 21".
    dueChip(todo) {
        if (!todo.dueDate) return '';
        const n = this.daysUntil(todo.dueDate);
        let cls = '', text;
        if (n < 0) { cls = ' over'; text = `Overdue · ${this.shortDate(todo.dueDate)}`; }
        else if (n === 0) { cls = ' today'; text = 'Due today'; }
        else if (n === 1) { cls = ' soon'; text = 'Due tomorrow'; }
        else if (n < 7) { text = `Due ${new Date(Date.now() + n * 86400000).toLocaleDateString(undefined, { weekday: 'short' })}`; }
        else { text = `Due ${this.shortDate(todo.dueDate)}`; }
        if (todo.dueTime && n >= 0) {
            const [h, m] = todo.dueTime.split(':').map(Number);
            text += ` · ${new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
        }
        return `<span class="td-due${cls}"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 7h11M5.5 2v3M10.5 2v3"/></svg>${this.esc(text)}</span>`;
    },

    _card(item, { cls, done, meta, open }) {
        const s = this.style(item);
        const items = item.checklist || [];
        return `<li class="${cls} hand-row" data-row-id="${this.esc(item.id)}" style="--dc:${s.color};--dk:${s.ink}">
            <div class="dr-side">${this.checkButton(item, done)}</div>
            <div class="dr-mid hand-text">
                <div class="dr-main" data-act="edit" role="button" tabindex="0" aria-label="Edit ${this.esc(item.label)}">
                    <span class="dr-title">${this.esc(item.label)}</span>
                    ${item.notes ? `<span class="dr-notes">${this.esc(item.notes)}</span>` : ''}
                </div>
                <div class="dr-meta">${meta.filter(Boolean).join('')}</div>
                ${this.checklistList(items, open)}
            </div>
            ${this.checklistBadge(items, open)}
        </li>`;
    },

    // A daily's card (Dailies page and Home). open = checklist showing.
    dailyHTML(task, open) {
        const meta = [];
        if (task.streak > 0) meta.push(`<span class="dr-streak" title="Streak">🔥 ${task.streak}</span>`);
        meta.push(`<span class="dr-xp">+${task.xp} XP</span>`);
        meta.push(this.reminderChip(task.reminders));
        if (!task.dueToday) meta.push(`<span class="dr-next">Next: ${this.esc(this.nextDueLabel(task))}</span>`);
        const cls = ['hr-row', 'dr-row', task.completedToday ? 'done' : '', task.dueToday ? '' : 'off'].filter(Boolean).join(' ');
        return this._card(task, { cls, done: task.completedToday, meta, open });
    },

    // A to-do's card (To-Dos page and Home).
    todoHTML(todo, open) {
        const overdue = !todo.completed && todo.dueDate && this.daysUntil(todo.dueDate) < 0;
        const meta = [];
        if (todo.completed) meta.push(`<span class="td-done-on">Done${todo.completedDate ? ` ${this.esc(this.shortDate(todo.completedDate))}` : ''}</span>`);
        else { meta.push(this.dueChip(todo)); if (todo.dueDate) meta.push(this.reminderChip(todo.reminders)); }
        meta.push(`<span class="dr-xp">+${todo.xp} XP</span>`);
        const cls = ['hr-row', 'dr-row', 'td-row', todo.completed ? 'done' : '', overdue ? 'overdue' : ''].filter(Boolean).join(' ');
        return this._card(todo, { cls, done: !!todo.completed, meta, open });
    },

    // Flip the row's look right away, with the pop / ripple / +XP float.
    animateCheck(row, nowDone, xp) {
        const btn = row.querySelector('.dr-check');
        row.classList.toggle('done', nowDone);
        btn.setAttribute('aria-pressed', String(nowDone));
        if (nowDone) {
            btn.classList.remove('hr-pop'); void btn.offsetWidth; btn.classList.add('hr-pop');
            const ripple = document.createElement('span');
            ripple.className = 'hr-ripple l';
            row.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
            if (navigator.vibrate) navigator.vibrate(25);
        }
        const f = document.createElement('span');
        f.className = `hr-float ${nowDone ? 'good' : 'bad'}`;
        f.textContent = `${nowDone ? '+' : '−'}${xp} XP`;
        row.appendChild(f);
        setTimeout(() => f.remove(), 1100);
    }
};
