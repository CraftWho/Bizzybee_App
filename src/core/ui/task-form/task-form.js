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
        // opts.checkable (Oct 29 2026, Craft): 'todo' or 'daily' adds a check
        // circle so steps can be ticked off on the edit screen too. Dailies
        // count as done only for today (doneOn), same as the Dailies page.
        const isDone = (item) => opts.checkable === 'daily' ? item.doneOn === todayISO() : !!item.done;
        const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>';
        const render = (focusId) => {
            // A `chapter` row (quests, Oct 2026) is a heading: tasks below it
            // group into a drop-down until the next chapter.
            list.innerHTML = items.map(item => `
                <li class="df-cl-row${item.chapter ? ' chapter' : ''}${opts.checkable && isDone(item) ? ' done' : ''}" data-id="${this.esc(item.id)}">
                    <span class="df-grip" aria-label="Drag to reorder" title="Drag to reorder">${GRIP}</span>
                    ${opts.checkable && !item.chapter ? `<button type="button" class="df-check" aria-pressed="${isDone(item)}" aria-label="${isDone(item) ? 'Mark not done' : 'Mark done'}">${CHECK}</button>` : ''}
                    <input type="text" class="df-cl-text" value="${this.esc(item.text)}" placeholder="${item.chapter ? 'Chapter name' : this.esc(placeholder)}" maxlength="140" aria-label="${item.chapter ? 'Chapter name' : this.esc(placeholder)}">
                    ${opts.extraHTML && !item.chapter ? opts.extraHTML(item) : ''}
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
        const addChapter = () => {
            const item = { id: this.newId('ch'), text: '', chapter: true };
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
            const ck = opts.checkable && event.target.closest('.df-check');
            if (ck) {
                const item = items.find(i => i.id === ck.closest('.df-cl-row').dataset.id);
                if (item) {
                    if (opts.checkable === 'daily') { const t = todayISO(); item.doneOn = item.doneOn === t ? null : t; item.done = item.doneOn === t; }
                    else item.done = !item.done;
                    render();
                }
                return;
            }
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
            addChapter,
            count: () => items.filter(i => i.text.trim() && !i.chapter).length,
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

    // Nov 1 2026 (Craft; from 1.0.7, approved demo): "Add to calendar" and
    // "Set alarm" on To-Dos and Quests with a date. Greyed out until there is
    // a date. In the Android app both open the phone's own calendar / Clock
    // with everything filled in (BeeAlerts). On the website, Add to calendar
    // gives an .ics file with an alert 15 min early; Set alarm is app only.
    // info() -> { title, notes, date 'YYYY-MM-DD', time 'HH:MM'|null } or null.
    // Returns { refresh() } to call when the date changes.
    phoneButtons(mount, info) {
        const Cap = window.Capacitor;
        const isApp = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
        const native = () => (isApp && Cap.Plugins && Cap.Plugins.BeeAlerts) || null;
        const toast = (m, t = 'neutral') => { if (typeof Toast !== 'undefined') Toast.show(m, t); };
        mount.innerHTML = `<div class="tf-phone">
            <button type="button" class="tf-phone-btn" data-ph="cal"><span aria-hidden="true">📅</span> Add to calendar</button>
            <button type="button" class="tf-phone-btn" data-ph="alarm"><span aria-hidden="true">⏰</span> Set alarm</button>
        </div><p class="hf-hint hf-hint-left tf-phone-hint"></p>`;
        const hint = mount.querySelector('.tf-phone-hint');
        const pad = n => String(n).padStart(2, '0');
        const icsText = (x) => {
            const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
            const esc = t => String(t || '').replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
            const fmt = t => `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
            let start, end;
            if (x.time) {
                const [Y, M, D] = x.date.split('-').map(Number), [h, m] = x.time.split(':').map(Number);
                const s0 = new Date(Y, M - 1, D, h, m);
                start = `DTSTART:${fmt(s0)}`; end = `DTEND:${fmt(new Date(s0.getTime() + 30 * 60000))}`;
            } else {
                const n = new Date(x.date + 'T12:00'); n.setDate(n.getDate() + 1);
                start = `DTSTART;VALUE=DATE:${x.date.replace(/-/g, '')}`; end = `DTEND;VALUE=DATE:${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}`;
            }
            return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BizzyBee//EN', 'BEGIN:VEVENT',
                `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@bizzybee`, `DTSTAMP:${stamp}`, start, end,
                `SUMMARY:${esc('🐝 ' + x.title)}`, ...(x.notes ? [`DESCRIPTION:${esc(x.notes)}`] : []),
                'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(x.title)}`, x.time ? 'TRIGGER:-PT15M' : 'TRIGGER:PT9H', 'END:VALARM',
                'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        };
        const addToCalendar = async (x) => {
            const n = native();
            if (n) {
                const [h, m] = (x.time || '00:00').split(':').map(Number), [Y, M, D] = x.date.split('-').map(Number);
                const begin = new Date(Y, M - 1, D, h, m).getTime();
                try { await n.addToCalendar({ title: '🐝 ' + x.title, notes: x.notes || '', begin, end: begin + (x.time ? 30 : 24 * 60) * 60000, allDay: !x.time, rrule: '' }); }
                catch (e) { toast('Update BizzyBee to add this to your calendar.'); }
                return;
            }
            const url = URL.createObjectURL(new Blob([icsText(x)], { type: 'text/calendar' }));
            const a = document.createElement('a');
            a.href = url; a.download = (x.title.replace(/[^\w ]+/g, '').trim().slice(0, 40) || 'bizzybee') + '.ics';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            toast('📅 Calendar file ready. Open it to add the event.', 'positive');
        };
        const setAlarm = async (x) => {
            const n = native();
            if (!n) { toast('⏰ Set alarm works in the BizzyBee Android app.'); return; }
            const time = x.time || '09:00';   // no time: 9 AM on the day
            const [Y, M, D] = x.date.split('-').map(Number), [h, m] = time.split(':').map(Number);
            const at = new Date(Y, M - 1, D, h, m).getTime(), now = Date.now();
            if (at <= now) { toast('That time has passed.'); return; }
            // A phone alarm only knows a time of day, so it must be within 24 hours.
            if (at - now > 24 * 3600000) { toast('An alarm can only be set for the next 24 hours. Add it to your calendar instead.'); return; }
            try { await n.setAlarm({ hour: h, minutes: m, message: '🐝 ' + x.title.slice(0, 60), days: [] }); }
            catch (e) { toast('Update BizzyBee to set alarms.'); }
        };
        const refresh = () => {
            const x = info();
            mount.querySelectorAll('[data-ph]').forEach(b => { b.disabled = !(x && x.date); });
            hint.textContent = !(x && x.date) ? 'Set a date to add it to your calendar or set an alarm.'
                : isApp ? 'Opens your phone\'s calendar or Clock with it filled in.' : 'Adds it to your calendar with an alert. Set alarm works in the Android app.';
        };
        mount.addEventListener('click', (e) => {
            const b = e.target.closest('[data-ph]');
            if (!b || b.disabled) return;
            const x = info();
            if (!x || !x.date) return;
            if (!x.title) { toast('Give it a name first.'); return; }
            if (b.dataset.ph === 'cal') addToCalendar(x); else setAlarm(x);
        });
        refresh();
        return { refresh };
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
        const st = { minutes: null, other: false, off: new Set(), open: false };   // open: the time chips are showing (Oct 29 2026)
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
            const meta = (c) => (typeof Vault !== 'undefined' && Vault.skillMeta ? Vault.skillMeta(c) : { icon: '', measure: 'time' });
            const on = skills.filter(sk => !st.off.has(sk.category));
            const timesOnly = on.length && on.every(sk => meta(sk.category).measure === 'times');
            const skillRow = `<div class="tf-skills">${skills.length
                ? `<span class="tf-skills-l">Counts toward</span>${skills.map(sk => `<button type="button" class="tf-skill${st.off.has(sk.category) ? ' off' : ''}" data-skill="${this.esc(sk.category)}" aria-pressed="${!st.off.has(sk.category)}" style="--skc:${meta(sk.category).color || 'inherit'}">${st.off.has(sk.category) ? '' : '✓ '}${meta(sk.category).icon ? meta(sk.category).icon + ' ' : ''}${this.esc(sk.category)}</button>`).join('')}`
                : '<span class="tf-skills-l">No skill yet. Mention one (like Fitness or HTML), or add a tag.</span>'}</div>`;
            // Smart skills (Oct 29 2026): time stays hidden until you ask for it.
            // A "times done" skill doesn't need a time at all.
            if (timesOnly && !st.minutes) {
                opts.mount.innerHTML = `<p class="hf-hint hf-hint-left tf-hint">✔ Counted by <b>times done</b>. No time needed. A streak adds a bonus.</p>${skillRow}`;
            } else if (!st.open && !st.minutes && !found) {
                opts.mount.innerHTML = `<button type="button" class="tf-addtime" data-open>＋ Time</button>
                    <p class="hf-hint hf-hint-left tf-hint">Optional. Skip it and BizzyBee asks how long it took when you finish.</p>${skillRow}`;
            } else {
                opts.mount.innerHTML = `
                <div class="tf-chips" role="radiogroup" aria-label="Time">${chips.map(x => `<button type="button" class="tf-chip${x === m && (st.minutes || found) ? ' on' : ''}" role="radio" aria-checked="${x === m}" data-min="${x}">${fmt(x)}</button>`).join('')}
                    <button type="button" class="tf-chip tf-other${st.other ? ' on' : ''}" data-other>✎ Other</button>${st.minutes ? '<button type="button" class="tf-chip tf-clear" data-clear>✕ No time</button>' : ''}</div>
                ${st.other ? `<label class="tf-other-row"><input type="number" min="1" max="600" inputmode="numeric" value="${m}" aria-label="Minutes"> minutes</label>` : ''}
                <p class="hf-hint hf-hint-left tf-hint">${st.minutes ? 'Set by you.' : found ? `⏱️ Found <b>${fmt(found)}</b> in the title.` : 'Pick how long it takes.'}</p>${skillRow}`;
            }
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
            if (b.hasAttribute('data-open')) { st.open = true; }
            else if (b.hasAttribute('data-clear')) { st.minutes = null; st.open = false; st.other = false; }
            else if (b.dataset.min) { st.minutes = Number(b.dataset.min); st.other = false; }
            else if (b.hasAttribute('data-other')) { st.other = !st.other; }
            else if (b.dataset.skill) { st.off.has(b.dataset.skill) ? st.off.delete(b.dataset.skill) : st.off.add(b.dataset.skill); }
            render();
            opts.onChange && opts.onChange();
        });
        render();
        return {
            refresh: render,
            set(task) { st.minutes = Number(task && task.minutes) > 0 ? Number(task.minutes) : null; st.open = !!st.minutes; st.off = new Set((task && task.skillsOff) || []); render(); },
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
