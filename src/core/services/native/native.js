// Phone features (Oct 27 2026, approved demo). Only does anything inside the
// BizzyBee Android app (Capacitor, native/ on the android branch). On the
// website BizzyNative.isApp is false and every call is a safe no-op.
//
// Reminders: the phone schedules them itself (works offline), with Done and
// Snooze buttons on each alert. Smart Notifications (BETA, off by default):
// harder tasks and closer deadlines get more alerts, and louder ones.
const BizzyNative = (() => {
    const Cap = window.Capacitor;
    const isApp = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
    const P = (name) => (isApp && Cap.Plugins && Cap.Plugins[name]) || null;
    const LN = () => P('LocalNotifications');
    const KEY = { rem: 'bizzybee_native_reminders', smart: 'bizzybee_smart_notify', quiet: 'bizzybee_smart_quiet', level: 'bizzybee_smart_level', buzz: 'bizzybee_vibration',
        sound: 'bizzybee_notify_sound', alarmSound: 'bizzybee_alarm_sound', rhythm: 'bizzybee_notify_rhythm' };
    const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
    const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
    const prefs = {
        reminders: () => get(KEY.rem, 'on') === 'on',
        smart: () => get(KEY.smart, 'off') === 'on',          // off by default
        quiet: () => get(KEY.quiet, '22-7'),                   // "22-7", "23-8" or "off"
        level: () => get(KEY.level, 'normal'),                 // gentle | normal | relentless
        vibration: () => get(KEY.buzz, 'on') === 'on',
        sound: () => get(KEY.sound, 'default'),          // "default", "none" or a phone tone uri
        alarmSound: () => get(KEY.alarmSound, 'default'),
        rhythm: () => get(KEY.rhythm, 'buzz'),
    };
    // Vibration rhythms (ms: wait, buzz, wait, buzz...).
    const RHYTHMS = {
        buzz: { label: 'Double buzz', p: [0, 250, 150, 250] },
        bee: { label: 'Bee wings', p: [0, 60, 40, 60, 40, 60, 40, 60, 40, 60, 40, 300] },
        heartbeat: { label: 'Heartbeat', p: [0, 120, 100, 120, 600, 120, 100, 120] },
        long: { label: 'One long', p: [0, 800] },
        sos: { label: 'SOS', p: [0, 150, 100, 150, 100, 150, 300, 450, 100, 450, 100, 450, 300, 150, 100, 150, 100, 150] },
        off: { label: 'No vibration', p: [] },
    };
    const Alerts = () => P('BeeAlerts');   // native/ BeeAlertsPlugin.java (app 1.0.5+)

    // ---- alert levels -> Android channels (sound/vibration live on the channel)
    const CHANNELS = [
        { lvl: 1, id: 'bb-gentle', name: 'Gentle reminders', importance: 2, vibration: false },
        { lvl: 2, id: 'bb-nudge', name: 'Reminders', importance: 3, vibration: true },
        { lvl: 3, id: 'bb-loud', name: 'Important reminders', importance: 4, vibration: true },
        { lvl: 4, id: 'bb-alarm', name: 'Deadline alarms', importance: 5, vibration: true, alarm: true },
    ];
    // Sound + rhythm are baked into an Android channel, so each settings
    // combo gets its own channel ids ("bb-nudge-k3f9a").
    const tag = () => { const t = `${prefs.sound()}|${prefs.alarmSound()}|${prefs.rhythm()}`; let h = 7; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h).toString(36).slice(0, 6); };
    let CH = { 1: 'bb-gentle', 2: 'bb-nudge', 3: 'bb-loud', 4: 'bb-alarm' };

    // Smart plans, from the approved demo. [minutes from the time, level, title, text]
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
    const DEFAULT_DAILY_TIME = '18:00';   // Smart nudges for Medium/Hard dailies with no reminder
    const DEFAULT_DEADLINE = '21:00';     // To-Dos only have a due date; this is the deadline time
    const DAYS = 3;

    const pad = (n) => String(n).padStart(2, '0');
    const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const at = (day, time) => new Date(`${day}T${time}:00`);
    const diffOf = (t) => ['Trivial', 'Easy', 'Medium', 'Hard'].includes(t.difficulty) ? t.difficulty : 'Easy';
    function inQuiet(d) {
        const q = prefs.quiet();
        if (q === 'off') return false;
        const [a, b] = q.split('-').map(Number), h = d.getHours();
        return a > b ? (h >= a || h < b) : (h >= a && h < b);
    }
    function shrink(plan) {
        const lvl = prefs.level();
        if (lvl === 'gentle') return plan.filter((s, i) => i === 0 || s[1] >= 3).map(s => [s[0], Math.min(3, s[1]), s[2], s[3], false]);
        if (lvl === 'relentless') return plan.map(s => [s[0], Math.min(4, s[1] + (s[1] >= 3 ? 1 : 0)), s[2], s[3], s[4] || s[1] >= 3]);
        return plan;
    }

    // Every alert for the next few days, as plain objects.
    function buildPlan(now = Date.now()) {
        const S = (typeof Vault !== 'undefined' && Vault.state) || {};
        const out = [];
        const smart = prefs.smart();
        const names = localStorage.getItem('bizzybee_push_names') !== '0';
        // own = a reminder time you set yourself: it always rings, even in quiet hours.
        const add = (kind, task, when, level, title, text, sticky, slot, own) => {
            if (isNaN(when) || when.getTime() < now + 30000) return;
            if (smart && !own && inQuiet(when) && !(kind === 'todo' && level === 4)) return;
            out.push({ key: `${kind}:${task.id}:${slot}`, at: when, level, sticky: !!sticky, kind, taskId: task.id,
                title: `🐝 ${title}`, body: names ? `${task.label}${text ? ' · ' + text : ''}` : (text || 'You have a task waiting.') });
        };
        const today = dayStr(new Date(now));
        for (let i = 0; i < DAYS; i++) {
            const d = new Date(now); d.setDate(d.getDate() + i);
            const day = dayStr(d);
            (S.dailyTasks || []).forEach(t => {
                if (typeof isDailyDueOn === 'function' && !isDailyDueOn(t, day)) return;
                if ((t.completedDates || []).includes(day)) return;
                const times = (t.reminders || []).map(r => r.time).filter(x => /^\d{2}:\d{2}$/.test(x || ''));
                if (!smart) { times.forEach(tm => add('daily', t, at(day, tm), 2, 'Reminder', '', false, `${day}-${tm}`)); return; }
                const diff = diffOf(t);
                const base = times[0] || ((diff === 'Medium' || diff === 'Hard') ? DEFAULT_DAILY_TIME : null);
                if (!base) return;
                shrink(PLAN.daily[diff]).forEach(([m, lvl, title, text, sticky], n) => add('daily', t, new Date(at(day, base).getTime() + m * 60000), lvl, title, text, sticky, `${day}-s${n}`, n === 0 && !!times[0]));
                times.slice(1).forEach(tm => add('daily', t, at(day, tm), 2, 'Reminder', '', false, `${day}-${tm}`, true));
            });
        }
        // Evening check-in (Oct 27 2026): "3 dailies left today" at a time you pick.
        const ci = localStorage.getItem('bizzybee_checkin') || '20:00';
        if (/^\d{2}:\d{2}$/.test(ci)) {
            for (let i = 0; i < DAYS; i++) {
                const d = new Date(now); d.setDate(d.getDate() + i);
                const day = dayStr(d);
                const left = (S.dailyTasks || []).filter(t => (typeof isDailyDueOn !== 'function' || isDailyDueOn(t, day)) && !(t.completedDates || []).includes(day)).length;
                if (!left) continue;
                const when = at(day, ci);
                if (isNaN(when) || when.getTime() < now + 30000) continue;
                out.push({ key: `checkin:${day}`, at: when, level: 2, sticky: false, kind: 'checkin', taskId: null,
                    title: '🐝 Evening check-in', body: `${left} ${left === 1 ? 'daily' : 'dailies'} left today. Finish them to keep your streak.` });
            }
        }
        (S.todos || []).forEach(t => {
            if (t.completed || !t.dueDate) return;
            const times = (t.reminders || []).map(r => r.time).filter(x => /^\d{2}:\d{2}$/.test(x || '')).sort();
            if (!smart) { times.forEach(tm => add('todo', t, at(t.dueDate, tm), 2, 'Reminder', '', false, tm)); return; }
            const deadline = at(t.dueDate, t.dueTime || (times.length ? times[times.length - 1] : DEFAULT_DEADLINE));
            shrink(PLAN.todo[diffOf(t)]).forEach(([m, lvl, title, text, sticky], n) => add('todo', t, new Date(deadline.getTime() + m * 60000), lvl, title, text, sticky, `s${n}`));
            times.slice(0, -1).forEach(tm => add('todo', t, at(t.dueDate, tm), 2, 'Reminder', '', false, tm, true));
        });
        void today;
        return out.sort((a, b) => a.at - b.at).slice(0, 120);
    }

    // Stable 31-bit number for each alert (Android needs integer ids).
    const idOf = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2000000000 + 1; };

    let setupDone = false;
    async function setup() {
        const ln = LN();
        if (!ln || setupDone) return !!ln;
        setupDone = true;
        await makeChannels();
        try {
            await ln.registerActionTypes({ types: [{ id: 'bb-task', actions: [{ id: 'done', title: '✓ Done' }, { id: 'snooze', title: 'Snooze 15m' }] }] });
        } catch {}
        ln.addListener('localNotificationActionPerformed', onAction);
        return true;
    }

    async function makeChannels() {
        const ln = LN(), al = Alerts();
        try {
            if (al) {
                const t = tag(), pat = (RHYTHMS[prefs.rhythm()] || RHYTHMS.buzz).p;
                const next = {};
                for (const c of CHANNELS) {
                    const id = `${c.id}-${t}`;
                    const pattern = !c.vibration ? [] : c.alarm && pat.length ? [...pat, 300, ...pat.slice(1)] : pat;
                    await al.createChannel({ id, name: c.name, importance: c.importance, alarm: !!c.alarm, pattern,
                        sound: c.lvl === 1 ? 'none' : c.alarm ? prefs.alarmSound() : prefs.sound() });
                    next[c.lvl] = id;
                }
                CH = next;
                await al.cleanChannels({ prefix: 'bb-', keep: Object.values(next) });
            } else if (ln) {
                for (const c of CHANNELS) await ln.createChannel({ id: c.id, name: c.name, importance: c.importance, vibration: c.vibration, visibility: 1, lights: true, lightColor: '#FFCC00' });
            }
        } catch (e) { console.warn('Alert channels:', e && e.message); }
    }

    async function permission(ask) {
        const ln = LN();
        if (!ln) return 'unsupported';
        let p = await ln.checkPermissions();
        if (p.display !== 'granted' && ask) p = await ln.requestPermissions();
        return p.display;
    }

    let busy = false, again = false, asked = false;
    async function reschedule() {
        const ln = LN();
        if (!ln || typeof Vault === 'undefined' || !Vault.state) return;
        if (busy) { again = true; return; }
        busy = true;
        try {
            await setup();
            const pending = await ln.getPending();
            const ours = (pending.notifications || []).filter(n => !(n.extra && n.extra.snoozed));
            if (ours.length) await ln.cancel({ notifications: ours.map(n => ({ id: n.id })) });
            if (!prefs.reminders()) return;
            const plan = buildPlan();
            if (!plan.length) return;
            // Ask at the moment it's needed: there's something to remind you about.
            if ((await permission(false)) !== 'granted') {
                if (!asked && typeof BizzyPhone !== 'undefined' && !/settings\.html/.test(location.pathname)) {
                    asked = true;
                    busy = false;
                    if ((await BizzyPhone.ask('notifications')) === 'granted') reschedule();
                }
                return;
            }
            await ln.schedule({ notifications: plan.map(a => ({
                id: idOf(a.key), title: a.title, body: a.body, channelId: CH[a.level],
                schedule: { at: a.at, allowWhileIdle: true },
                actionTypeId: a.kind === 'checkin' ? undefined : 'bb-task', ongoing: a.sticky, autoCancel: !a.sticky,
                smallIcon: 'ic_stat_bee', iconColor: '#FFCC00', group: 'bizzybee',
                extra: { kind: a.kind, taskId: a.taskId, level: a.level },
            })) });
        } catch (e) { console.warn('Phone reminders:', e && e.message); }
        finally { busy = false; if (again) { again = false; reschedule(); } }
    }

    async function onAction(ev) {
        const n = ev.notification || {}, x = n.extra || {};
        if (x.kind === 'checkin') { if (!location.pathname.endsWith('dailies/dailies.html')) location.href = `${location.origin}/src/features/dailies/dailies.html`; return; }
        if (!x.taskId) return;
        if (typeof Vault !== 'undefined') await Vault.init();
        if (ev.actionId === 'done') {
            if (x.kind === 'daily') {
                const t = (Vault.state.dailyTasks || []).find(d => d.id === x.taskId);
                if (t && !(t.completedDates || []).includes(dayStr(new Date()))) Vault.toggleDailyTask(t.id);
            } else {
                const t = (Vault.state.todos || []).find(d => d.id === x.taskId);
                if (t && !t.completed) Vault.toggleTodoComplete(t.id);
            }
            if (typeof Toast !== 'undefined') Toast.show('✓ Done from your reminder. The hive ate well.', 'positive');
            reschedule();
        } else if (ev.actionId === 'snooze') {
            const ln = LN();
            try { await ln.cancel({ notifications: [{ id: n.id }] }); } catch {}
            await ln.schedule({ notifications: [{ ...n, id: idOf(`snooze:${x.taskId}:${Date.now()}`), ongoing: false, autoCancel: true,
                schedule: { at: new Date(Date.now() + 15 * 60000), allowWhileIdle: true }, extra: { ...x, snoozed: true } }] });
        } else {
            // Tapped the alert: open the right page.
            const page = x.kind === 'daily' ? 'dailies/dailies.html' : 'todos/todos.html';
            if (!location.pathname.endsWith(page)) location.href = `${location.origin}/src/features/${page}`;
        }
    }

    async function exactAlarmsOk() {
        const ln = LN();
        try { return ln && ln.checkExactNotificationSetting ? (await ln.checkExactNotificationSetting()).exact_alarm === 'granted' : true; } catch { return true; }
    }
    async function openExactAlarmSettings() { try { await LN().changeExactNotificationSetting(); } catch {} }

    function start() {
        if (!isApp) return;
        // Vibration switch: when off, quietly ignore every vibrate call.
        if (!prefs.vibration() && navigator.vibrate) navigator.vibrate = () => false;
        let t = null;
        const soon = () => { clearTimeout(t); t = setTimeout(reschedule, 2500); };
        window.addEventListener('vault-saved', soon);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(); });
        setup();
        (typeof Vault !== 'undefined' ? Vault.init() : Promise.resolve()).then(() => setTimeout(reschedule, 1500));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    return {
        isApp, prefs, buildPlan, reschedule, permission, exactAlarmsOk, openExactAlarmSettings,
        set(key, on) {
            set(KEY[key], typeof on === 'string' ? on : (on ? 'on' : 'off'));
            if (key === 'sound' || key === 'alarmSound' || key === 'rhythm') { makeChannels().then(reschedule); return; }
            if (key !== 'buzz') reschedule();
        },
        RHYTHMS, hasAlertSettings: () => !!Alerts(), channelFor: (level) => CH[level],
        sounds: async (kind) => { try { return await Alerts().listSounds({ kind }); } catch { return { sounds: [] }; } },
        previewSound: (sound, alarm) => { try { Alerts().previewSound({ sound, alarm: !!alarm }); } catch {} },
        previewRhythm: (key) => { try { Alerts().previewVibration({ pattern: (RHYTHMS[key] || RHYTHMS.buzz).p }); } catch {} },
        buzz(ms = 30) { if (isApp && prefs.vibration() && navigator.vibrate) navigator.vibrate(ms); },
        releasesUrl: 'https://github.com/CraftWho/Bizzybee_App/releases/latest',
    };
})();
