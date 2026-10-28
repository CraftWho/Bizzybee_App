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

    const pad = (n) => String(n).padStart(2, '0');
    const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    // Every alert for the next few days (shared planner: services/notify/notify.js).
    const buildPlan = (now = Date.now()) => (typeof BizzyNotify !== 'undefined' ? BizzyNotify.plan({ days: 3, now, limit: 120 }) : []);

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
                actionTypeId: (a.kind === 'daily' || a.kind === 'todo') ? 'bb-task' : undefined, ongoing: a.sticky, autoCancel: !a.sticky,
                smallIcon: 'ic_stat_bee', iconColor: '#FFCC00', group: 'bizzybee',
                extra: { kind: a.kind, taskId: a.taskId, level: a.level, url: a.url },
            })) });
        } catch (e) { console.warn('Phone reminders:', e && e.message); }
        finally { busy = false; if (again) { again = false; reschedule(); } }
    }

    async function onAction(ev) {
        const n = ev.notification || {}, x = n.extra || {};
        // Tapped the alert itself: open that item (quest, To-Do, daily, habit...).
        const open = () => {
            const url = x.url || (typeof BizzyNotify !== 'undefined' ? BizzyNotify.urlFor(x.kind, x.taskId) : '/src/features/home/home.html');
            const target = new URL(url, location.origin);
            if (target.pathname === location.pathname && typeof BizzyFocus !== 'undefined') { BizzyFocus.run(target.searchParams); return; }
            location.href = target.href;
        };
        if (ev.actionId !== 'done' && ev.actionId !== 'snooze') { open(); return; }
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
