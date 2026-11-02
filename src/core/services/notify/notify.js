// Notifications planner (Oct 28 2026, approved demo). One list of everything
// that will notify you, used by:
//   - the Android app (services/native/native.js) - the phone fires them offline
//   - (web push was removed Oct 31 2026; Android app only, see docs/OPEN-ISSUES.md)
//   - the Notifications page (features/notifications/) - "Coming up"
// Each type has its own switch. Tapping a notification opens that item (url).
const BizzyNotify = (() => {
    const KEY = 'bizzybee_notify';
    const CHECKIN_KEY = 'bizzybee_checkin';            // older key, kept: "20:00" or "off"
    const DEFAULTS = {
        todo: { on: true, at: true, m15: false, h1: true, morning: false },
        daily: { on: true, nudge: false },
        habit: { on: false, time: '12:00' },
        start: { on: true, time: '08:00' },
    };
    const TIME = /^\d{2}:\d{2}$/;
    const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

    function prefs() {
        let saved = {};
        try { saved = JSON.parse(read(KEY, '{}')) || {}; } catch {}
        const out = {};
        Object.keys(DEFAULTS).forEach(t => { out[t] = { ...DEFAULTS[t], ...(saved[t] || {}) }; });
        const ci = read(CHECKIN_KEY, '20:00');
        out.checkin = { on: ci !== 'off', time: TIME.test(ci) ? ci : (saved.checkin && saved.checkin.time) || '20:00' };
        return out;
    }
    function setPref(type, patch) {
        const p = prefs();
        p[type] = { ...p[type], ...patch };
        if (type === 'checkin') write(CHECKIN_KEY, p.checkin.on ? p.checkin.time : 'off');
        const { checkin, ...rest } = p; void checkin;
        write(KEY, JSON.stringify(rest));
        try { window.dispatchEvent(new Event('notify-prefs')); } catch {}
    }

    // Where tapping a notification goes.
    const ROOT = '/src/features/';
    function urlFor(kind, id, extra) {
        if (kind === 'daily') return `${ROOT}dailies/dailies.html${id ? '?focus=' + encodeURIComponent(id) : ''}`;
        if (kind === 'todo') return `${ROOT}todos/todos.html${id ? '?focus=' + encodeURIComponent(id) : ''}`;
        if (kind === 'habit') return `${ROOT}habits/habits.html${id ? '?focus=' + encodeURIComponent(id) : ''}`;
        if (kind === 'quest') return `${ROOT}quests/quest.html?id=${encodeURIComponent(id)}${extra ? '&focus=' + encodeURIComponent(extra) : ''}`;
        if (kind === 'start') return `${ROOT}home/home.html?daystart=1`;
        if (kind === 'checkin') return `${ROOT}dailies/dailies.html`;
        return `${ROOT}home/home.html`;
    }

    // Smart plans (approved demo, Oct 27). [minutes from the time, level, title, text, sticky]
    // Dailies count from their reminder time; To-Dos count to their deadline.
    const PLAN = {
        daily: {
            Trivial: [[0, 1, 'Reminder', 'Your daily is due.']],
            Easy: [[0, 1, 'Reminder', 'Your daily is due.'], [60, 2, 'Still open', 'One tap to finish it.']],
            Medium: [[0, 2, 'Reminder', 'Your daily is due.'], [30, 2, 'Nudge', 'The hive is waiting on this one.'], [90, 3, 'Getting late', 'Bees get hungry if this is missed.'], [180, 3, 'Last call today', 'Finish it before bed to keep your streak.']],
            Hard: [[0, 2, 'Reminder', 'Your daily is due.'], [15, 3, 'Nudge', 'Hard task: start now while you have time.'], [45, 3, 'Nudge', 'Your streak is on the line.'], [90, 4, "Don't lose it", 'This alert stays until you finish or snooze.', true], [150, 4, 'Last call', 'Missing this hurts the whole hive.', true]],
        },
        todo: {
            Trivial: [[-60, 1, 'Due in 1 hour', 'Quick one.'], [0, 2, 'Due now', 'Mark it done?']],
            Easy: [[-1440, 1, 'Due tomorrow', ''], [-60, 2, 'Due in 1 hour', ''], [0, 3, 'Due now', 'Running late.']],
            Medium: [[-1440, 1, 'Due tomorrow', ''], [-180, 2, 'Due in 3 hours', ''], [-60, 3, 'Due in 1 hour', 'Time to start.'], [-15, 3, '15 minutes left', ''], [0, 4, 'Deadline!', 'Tap to stop the alarm.', true], [60, 3, 'Overdue', 'The hive feels this one.']],
            Hard: [[-2880, 1, 'Due in 2 days', 'Big task. Plan it now.'], [-1440, 2, 'Due tomorrow', 'Block out time today.'], [-360, 2, 'Due in 6 hours', ''], [-120, 3, 'Due in 2 hours', 'This alert stays until you start.', true], [-60, 3, '1 hour left', ''], [-30, 4, '30 minutes left', ''], [-10, 4, '10 minutes!', ''], [0, 4, 'Deadline!', 'Tap to stop the alarm.', true], [60, 3, 'Overdue', 'Missed work hurts the hive.']],
        },
    };
    const DEFAULT_DAILY_TIME = '18:00';
    const DEFAULT_DEADLINE = '21:00';
    const smartOn = () => read('bizzybee_smart_notify', 'off') === 'on';
    const smartLevel = () => read('bizzybee_smart_level', 'normal');
    const quiet = () => read('bizzybee_smart_quiet', '22-7');

    const pad = (n) => String(n).padStart(2, '0');
    const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const at = (day, time) => new Date(`${day}T${time}:00`);
    const diffOf = (t) => ['Trivial', 'Easy', 'Medium', 'Hard'].includes(t.difficulty) ? t.difficulty : 'Easy';
    function inQuiet(d) {
        const q = quiet();
        if (q === 'off') return false;
        const [a, b] = q.split('-').map(Number), h = d.getHours();
        return a > b ? (h >= a || h < b) : (h >= a && h < b);
    }
    function shrink(plan) {
        const lvl = smartLevel();
        if (lvl === 'gentle') return plan.filter((s, i) => i === 0 || s[1] >= 3).map(s => [s[0], Math.min(3, s[1]), s[2], s[3], false]);
        if (lvl === 'relentless') return plan.map(s => [s[0], Math.min(4, s[1] + (s[1] >= 3 ? 1 : 0)), s[2], s[3], s[4] || s[1] >= 3]);
        return plan;
    }
    const tappedToday = (h, day) => (h.history || []).some(x => x.date === day && x.direction === 'positive');

    // Everything that will notify you in the next `days` days, soonest first.
    function plan({ days = 3, now = Date.now(), limit = 400 } = {}) {
        const S = (typeof Vault !== 'undefined' && Vault.state) || {};
        const P = prefs();
        const smart = smartOn();
        const names = read('bizzybee_push_names', '1') !== '0';
        const out = [];
        const seen = new Set();
        const push = (item) => {
            if (isNaN(item.at) || item.at.getTime() < now + 30000) return;
            if (seen.has(item.key)) return;
            seen.add(item.key);
            out.push(item);
        };
        // own = a time you set yourself: always rings, even in quiet hours.
        const add = (kind, task, when, level, title, text, sticky, slot, own) => {
            if (smart && !own && !isNaN(when) && inQuiet(when) && !(kind === 'todo' && level === 4)) return;
            push({ key: `${kind}:${task.id}:${slot}`, kind, taskId: task.id, at: when, level, sticky: !!sticky, own: !!own,
                title: `🐝 ${title}`, label: task.label, note: text || '',
                body: names ? `${task.label}${text ? ' · ' + text : ''}` : (text || 'You have a task waiting.'),
                url: urlFor(kind, task.id) });
        };
        const today = dayStr(new Date(now));
        const dayList = Array.from({ length: days }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() + i); return dayStr(d); });
        const dueOn = (t, day) => typeof isDailyDueOn !== 'function' || isDailyDueOn(t, day);

        // Dailies
        if (P.daily.on) dayList.forEach(day => (S.dailyTasks || []).forEach(t => {
            if (!dueOn(t, day) || (t.completedDates || []).includes(day)) return;
            const times = (t.reminders || []).map(r => r.time).filter(x => TIME.test(x || ''));
            const diff = diffOf(t);
            if (!smart) {
                times.forEach(tm => add('daily', t, at(day, tm), 2, 'Reminder', '', false, `${day}-${tm}`, true));
                if (!times.length && P.daily.nudge) add('daily', t, at(day, DEFAULT_DAILY_TIME), 2, 'Reminder', 'Your daily is still open.', false, `${day}-n`);
                return;
            }
            const base = times[0] || ((diff === 'Medium' || diff === 'Hard' || P.daily.nudge) ? DEFAULT_DAILY_TIME : null);
            if (!base) return;
            shrink(PLAN.daily[diff]).forEach(([m, lvl, title, text, sticky], n) => add('daily', t, new Date(at(day, base).getTime() + m * 60000), lvl, title, text, sticky, `${day}-s${n}`, n === 0 && !!times[0]));
            times.slice(1).forEach(tm => add('daily', t, at(day, tm), 2, 'Reminder', '', false, `${day}-${tm}`, true));
        }));

        // To-Do deadlines
        if (P.todo.on) (S.todos || []).forEach(t => {
            if (t.completed || !t.dueDate) return;
            const times = (t.reminders || []).map(r => r.time).filter(x => TIME.test(x || '')).sort();
            times.forEach(tm => add('todo', t, at(t.dueDate, tm), 2, 'Reminder', '', false, tm, true));
            if (smart) {
                const deadline = at(t.dueDate, t.dueTime || (times.length ? times[times.length - 1] : DEFAULT_DEADLINE));
                shrink(PLAN.todo[diffOf(t)]).forEach(([m, lvl, title, text, sticky], n) => add('todo', t, new Date(deadline.getTime() + m * 60000), lvl, title, text, sticky, `s${n}`));
                return;
            }
            if (P.todo.morning) add('todo', t, at(t.dueDate, '09:00'), 1, 'Due today', t.dueTime ? `Due at ${t.dueTime}` : '', false, 'morning');
            if (!t.dueTime) return;
            const deadline = at(t.dueDate, t.dueTime);
            if (P.todo.h1) add('todo', t, new Date(deadline.getTime() - 3600000), 2, 'Due in 1 hour', '', false, 'h1');
            if (P.todo.m15) add('todo', t, new Date(deadline.getTime() - 900000), 3, '15 minutes left', '', false, 'm15');
            if (P.todo.at) add('todo', t, deadline, 3, 'Due now', 'Mark it done?', false, 'at');
        });

        // Nov 1 2026 (Craft): Quest deadlines. Smart Notifications use the Hard
        // To-Do plan (quests are big); without Smart, a morning nudge on the day.
        if (P.todo.on) (S.quests || []).forEach(q => {
            if (!q.deadline || q.status === 'completed' || q.dateCompleted) return;
            if ((q.tasks || []).length && q.tasks.every(t => t.completed)) return;
            const task = { id: q.id, label: q.title || 'Quest' };
            if (smart) {
                const deadline = at(q.deadline, DEFAULT_DEADLINE);
                shrink(PLAN.todo.Hard).forEach(([m, lvl, title, text, sticky], n) => add('quest', task, new Date(deadline.getTime() + m * 60000), lvl, title, text, sticky, `s${n}`));
                return;
            }
            if (P.todo.morning) add('quest', task, at(q.deadline, '09:00'), 1, 'Quest due today', '', false, 'morning');
        });

        // Habits: one nudge a day for good habits not tapped yet.
        if (P.habit.on && TIME.test(P.habit.time)) dayList.forEach(day => {
            const open = (S.habits || []).filter(h => h.positive !== false && !(day === today && tappedToday(h, day)));
            if (!open.length) return;
            const one = open.length === 1 ? open[0] : null;
            push({ key: `habit:${day}`, kind: 'habit', taskId: one ? one.id : null, at: at(day, P.habit.time), level: 1, sticky: false,
                title: '🐝 Habits', label: one ? one.label : `${open.length} habits`, note: 'Not tapped yet today',
                body: one && names ? `${one.label} · not tapped yet today` : `${open.length} ${open.length === 1 ? 'habit' : 'habits'} not tapped yet today.`,
                url: urlFor('habit', one ? one.id : null) });
        });

        // Start My Day: a morning prompt (skipped today if already done).
        if (P.start.on && TIME.test(P.start.time)) dayList.forEach(day => {
            const q = S.hive && S.hive.queen;
            if (day === today && q && q.reviewedOn === today) return;
            push({ key: `start:${day}`, kind: 'start', taskId: null, at: at(day, P.start.time), level: 2, sticky: false,
                title: '🐝 Start My Day', label: 'Start My Day', note: 'See yesterday, plan today',
                body: 'Good morning. See how yesterday went and plan today.', url: urlFor('start') });
        });

        // Evening check-in: "3 dailies left today".
        if (P.checkin.on && TIME.test(P.checkin.time)) dayList.forEach(day => {
            const left = (S.dailyTasks || []).filter(t => dueOn(t, day) && !(t.completedDates || []).includes(day)).length;
            if (!left) return;
            push({ key: `checkin:${day}`, kind: 'checkin', taskId: null, at: at(day, P.checkin.time), level: 2, sticky: false,
                title: '🐝 Evening check-in', label: 'Evening check-in', note: `${left} ${left === 1 ? 'daily' : 'dailies'} left`,
                body: `${left} ${left === 1 ? 'daily' : 'dailies'} left today. Finish them to keep your streak.`, url: urlFor('checkin') });
        });

        return out.sort((a, b) => a.at - b.at).slice(0, limit);
    }

    return { prefs, setPref, plan, urlFor, DEFAULTS };
})();
