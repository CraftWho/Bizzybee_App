// Shared pieces of the create / edit forms (Dailies, To-Dos; styles in
// task-form.css). Added 2026-10-09. Each page keeps its own save logic -
// this file only holds the widgets that look and behave the same:
// difficulty tiles + colour, checklist editor, reminder rows, the privacy
// tip, and the tap-twice Delete button.

const TaskForm = {
    SPARKS: { Trivial: 1, Easy: 2, Medium: 3, Hard: 4 },

    esc(text) {
        return String(text == null ? '' : text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    newId(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    },

    // A native date input wants a LOCAL YYYY-MM-DD (todayISO() is UTC based).
    todayISOLocal() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    },

    time12(hm) {
        const [h, m] = String(hm).split(':').map(Number);
        return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    },

    nudge(el) {
        if (el) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], 260);
    },

    sparksSVG(n) {
        const spots = { 1: [[16, 16]], 2: [[9, 16], [23, 16]], 3: [[16, 9], [9, 21], [23, 21]], 4: [[9, 9], [23, 9], [9, 23], [23, 23]] }[n];
        return `<svg viewBox="0 0 32 32" aria-hidden="true">${spots.map(([x, y]) =>
            `<path d="M${x} ${y - 6}Q${x + 1} ${y - 1} ${x + 6} ${y}Q${x + 1} ${y + 1} ${x} ${y + 6}Q${x - 1} ${y + 1} ${x - 6} ${y}Q${x - 1} ${y - 1} ${x} ${y - 6}Z"/>`).join('')}</svg>`;
    },

    // Sparkle tiles. tiers = [{ level, xp }]. Also paints the form and the
    // phone's status bar in the chosen difficulty colour.
    renderDifficulty(grid, tiers, selected, form) {
        grid.innerHTML = tiers.map(tier => {
            const s = HABIT_DIFFICULTY_STYLE[tier.level];
            const on = tier.level === selected;
            return `<button type="button" class="hf-d${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-level="${tier.level}" style="--c:${s.color};--k:${s.ink}">
                ${this.sparksSVG(this.SPARKS[tier.level])}<span>${tier.level}</span></button>`;
        }).join('');
        const style = HABIT_DIFFICULTY_STYLE[selected] || HABIT_DIFFICULTY_STYLE.Easy;
        form.style.setProperty('--dc', style.color);
        form.style.setProperty('--dk', style.ink);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', style.color);
    },

    // Checklist rows: drag handle, text, ×. Enter adds the next row.
    // Returns { set(items), get() }; items keep any extra fields they had
    // (like done / doneOn), only the text is edited here.
    // opts (optional): placeholder, newItem() for extra fields on a new row,
    // extraHTML(item) for a control before the ×, and onExtra(item, el)
    // when something in that control is tapped (return true to redraw).
    checklist(list, addBtn, opts = {}) {
        let items = [];
        const placeholder = opts.placeholder || 'Checklist item';
        const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
        const render = (focusId) => {
            list.innerHTML = items.map(item => `
                <li class="df-cl-row" data-id="${this.esc(item.id)}">
                    <span class="df-grip" aria-label="Drag to reorder" title="Drag to reorder">${GRIP}</span>
                    <input type="text" class="df-cl-text" value="${this.esc(item.text)}" placeholder="${this.esc(placeholder)}" maxlength="140" aria-label="${this.esc(placeholder)}">
                    ${opts.extraHTML ? opts.extraHTML(item) : ''}
                    <button type="button" class="df-x" aria-label="Remove item">×</button>
                </li>`).join('');
            if (focusId) {
                const input = list.querySelector(`[data-id="${focusId}"] .df-cl-text`);
                if (input) input.focus();
            }
        };
        const add = () => {
            const item = { id: this.newId('cl'), text: '', ...(opts.newItem ? opts.newItem() : {}) };
            items.push(item);
            render(item.id);
        };
        addBtn.addEventListener('click', add);

        // Drag a row by its grip; the row moves live, order saved on release.
        let drag = null;
        list.addEventListener('pointerdown', (event) => {
            const grip = event.target.closest('.df-grip');
            if (!grip) return;
            event.preventDefault();
            drag = { row: grip.closest('.df-cl-row') };
            drag.row.classList.add('dragging');
            grip.setPointerCapture(event.pointerId);
        });
        list.addEventListener('pointermove', (event) => {
            if (!drag) return;
            const rows = [...list.children].filter(r => r !== drag.row);
            const after = rows.find(r => {
                const b = r.getBoundingClientRect();
                return event.clientY < b.top + b.height / 2;
            });
            if (after) {
                if (drag.row.nextSibling !== after) list.insertBefore(drag.row, after);
            } else if (list.lastElementChild !== drag.row) {
                list.appendChild(drag.row);
            }
        });
        const end = () => {
            if (!drag) return;
            drag.row.classList.remove('dragging');
            drag = null;
            const order = [...list.children].map(r => r.dataset.id);
            items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        };
        list.addEventListener('pointerup', end);
        list.addEventListener('pointercancel', end);
        list.addEventListener('input', (event) => {
            const input = event.target.closest('.df-cl-text');
            if (!input) return;
            const item = items.find(i => i.id === input.closest('.df-cl-row').dataset.id);
            if (item) item.text = input.value;
        });
        list.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.target.closest('.df-cl-text')) {
                event.preventDefault();
                add();
            }
        });
        list.addEventListener('click', (event) => {
            const x = event.target.closest('.df-x');
            if (!x) {
                const extra = opts.onExtra && event.target.closest('[data-extra]');
                if (extra) {
                    const item = items.find(i => i.id === extra.closest('.df-cl-row').dataset.id);
                    if (item && opts.onExtra(item, extra)) render();
                }
                return;
            }
            const id = x.closest('.df-cl-row').dataset.id;
            items = items.filter(i => i.id !== id);
            render();
        });

        return {
            set: (next) => { items = (next || []).map(i => ({ ...i, id: i.id || this.newId('cl'), text: i.text || '' })); render(); },
            count: () => items.filter(i => i.text.trim()).length,
            all: () => items,
            get: () => items.filter(i => i.text.trim()).map(i => ({ ...i, text: i.text.trim() }))
        };
    },

    // Reminder rows: bell, time, ×. "+ New reminder" adds 9:00 AM.
    reminders(list, addBtn) {
        let items = [];
        const render = (focusId) => {
            list.innerHTML = items.map(r => `
                <li class="df-rem-row" data-id="${this.esc(r.id)}">
                    <svg class="df-bell" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>
                    <input type="time" class="df-time" value="${this.esc(r.time)}" aria-label="Reminder time">
                    <button type="button" class="df-x" aria-label="Remove reminder">×</button>
                </li>`).join('');
            if (focusId) {
                const input = list.querySelector(`[data-id="${focusId}"] .df-time`);
                if (input) { input.focus(); if (input.showPicker) { try { input.showPicker(); } catch (e) { /* needs a user tap */ } } }
            }
        };
        addBtn.addEventListener('click', () => {
            const r = { id: this.newId('rem'), time: '09:00' };
            items.push(r);
            render(r.id);
        });
        list.addEventListener('change', (event) => {
            const input = event.target.closest('.df-time');
            if (!input) return;
            const r = items.find(x => x.id === input.closest('.df-rem-row').dataset.id);
            if (r) r.time = input.value;
        });
        list.addEventListener('click', (event) => {
            const x = event.target.closest('.df-x');
            if (!x) return;
            const id = x.closest('.df-rem-row').dataset.id;
            items = items.filter(r => r.id !== id);
            render();
        });
        return {
            set: (next) => { items = (next || []).map(r => ({ ...r })); render(); },
            get: () => items.filter(r => /^\d{2}:\d{2}$/.test(r.time))
        };
    },

    privacyToggle(btn, tip) {
        btn.addEventListener('click', () => {
            tip.hidden = !tip.hidden;
            btn.setAttribute('aria-expanded', String(!tip.hidden));
        });
    },

    // Time (Oct 2026): how long the task takes, plus which skills it
    // counts toward. XP = minutes x effort (db.js TASK_EFFORT); the skill
    // chips come from Dictionary words + tags (db.js skillsForTask) and a
    // tap turns one off for this task. opts: mount, note (element for the
    // "45 min x 1.25 = 56 XP" line), getTask() -> { label, notes, tags,
    // difficulty }, onChange(). Returns { get(), set(task), refresh() }.
    timePicker(opts) {
        const st = { minutes: null, other: false, off: new Set() };
        const fmt = (m) => m >= 60 ? `${+(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${m} min`;
        const planned = () => {
            const t = opts.getTask();
            return plannedMinutes({ ...t, minutes: st.minutes });
        };
        const render = () => {
            const t = opts.getTask();
            const found = minutesFromText(t.label);
            const m = planned();
            const chips = [...new Set([...TASK_TIME_CHIPS, m])].sort((a, b) => a - b);
            const skills = typeof skillsForTask === 'function'
                ? skillMatcher(Vault.getDictionaryTerms())([t.label, t.notes].filter(Boolean).join(' '), t.tags || []) : [];
            opts.mount.innerHTML = `
                <div class="tf-chips" role="radiogroup" aria-label="Time">${chips.map(x => `<button type="button" class="tf-chip${x === m ? ' on' : ''}" role="radio" aria-checked="${x === m}" data-min="${x}">${fmt(x)}</button>`).join('')}
                    <button type="button" class="tf-chip tf-other${st.other ? ' on' : ''}" data-other>✎ Other</button></div>
                ${st.other ? `<label class="tf-other-row"><input type="number" min="1" max="600" inputmode="numeric" value="${m}" aria-label="Minutes"> minutes</label>` : ''}
                <p class="hf-hint hf-hint-left tf-hint">${st.minutes ? 'Set by you.' : found ? `⏱️ Found <b>${fmt(found)}</b> in the title.` : 'Default for this difficulty - pick a time if you know it.'}</p>
                <div class="tf-skills">${skills.length
                    ? `<span class="tf-skills-l">Counts toward</span>${skills.map(sk => `<button type="button" class="tf-skill${st.off.has(sk.category) ? ' off' : ''}" data-skill="${this.esc(sk.category)}" aria-pressed="${!st.off.has(sk.category)}">${st.off.has(sk.category) ? '' : '✓ '}${this.esc(sk.category)}</button>`).join('')}`
                    : '<span class="tf-skills-l">No skill yet - mention one (like HTML) or type #word.</span>'}</div>`;
            if (opts.note) opts.note.textContent = `${fmt(m)} × ${TASK_EFFORT[t.difficulty] || 1} = ${xpForMinutes(m, t.difficulty)} XP`;
            const input = opts.mount.querySelector('.tf-other-row input');
            if (input) input.addEventListener('change', () => {
                const v = Math.round(Number(input.value));
                if (v > 0) { st.minutes = Math.min(600, v); st.other = false; render(); opts.onChange && opts.onChange(); }
            });
        };
        opts.mount.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.min) { st.minutes = Number(b.dataset.min); st.other = false; }
            else if (b.hasAttribute('data-other')) { st.other = !st.other; }
            else if (b.dataset.skill) { st.off.has(b.dataset.skill) ? st.off.delete(b.dataset.skill) : st.off.add(b.dataset.skill); }
            render();
            opts.onChange && opts.onChange();
        });
        render();
        return {
            refresh: render,
            set(task) { st.minutes = Number(task && task.minutes) > 0 ? Number(task.minutes) : null; st.off = new Set((task && task.skillsOff) || []); render(); },
            get() { return { minutes: st.minutes, skillsOff: [...st.off], planned: planned() }; }
        };
    },

    // Delete asks for a second tap instead of a pop-up box.
    armDelete(btn, onConfirm) {
        let armed = false;
        btn.addEventListener('click', () => {
            if (!armed) {
                armed = true;
                btn.textContent = 'TAP AGAIN';
                btn.classList.add('armed');
                setTimeout(() => { armed = false; btn.textContent = 'DELETE'; btn.classList.remove('armed'); }, 2500);
                return;
            }
            onConfirm();
        });
    }
};
