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
    // Nov 20 2026 (Craft): ANDROID TAILORING. The app gets a class so PC-only controls hide, and links to other
    // websites open in the phone's browser (BeeFiles.openUrl, new in the app) instead of a blocked pop-up window.
    if (isApp) {
        try { document.documentElement.classList.add('bb-app'); } catch { /* early */ }
        const external = (href) => { try { const u = new URL(href, location.href); return /^https?:$/.test(u.protocol) && u.host !== location.host && !/bizzybeee\.netlify\.app$/.test(u.host) ? u.href : null; } catch { return null; } };
        const openOutside = async (url) => { try { await P('BeeFiles').openUrl({ url }); return true; } catch { return false; } };
        document.addEventListener('click', async (e) => {
            const a = e.target.closest && e.target.closest('a[href]');
            if (!a) return;
            const url = external(a.getAttribute('href'));
            if (!url && a.target !== '_blank') return;
            e.preventDefault();
            if (url && await openOutside(url)) return;
            location.href = a.href;   // old app: open it here (the back button returns)
        }, true);
        const nativeOpen = window.open;
        window.open = (href, ...rest) => {
            const url = external(href || '');
            if (url) { openOutside(url).then(ok => { if (!ok) location.href = url; }); return null; }
            return nativeOpen ? nativeOpen.call(window, href, ...rest) : null;
        };
    }
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

    // Back button (Oct 28 2026, Craft): always one step back. Some pages
    // replace themselves in the browser history, so Android's own back
    // could jump straight to Home. We keep our own list of pages instead.
    // Nov 17 2026 (Craft): fixes. (1) Inside a page's own view (a Settings group) back now closes
    // that view first instead of leaving the page. (2) Going back with the floating back button
    // or the browser used to leave the list stale, so the next back came to the page you had just
    // left. (3) Any pop-up that covers the screen is closed first, not only the ones on a fixed list.
    const BLOCKING = '.ds-scrim, .app-lock-overlay';   // finish Start My Day / unlock first
    function visibleOverlay() {
        const vw = window.innerWidth, vh = window.innerHeight;
        const cands = [...document.querySelectorAll('[class*="scrim"], [class*="sheet-bg"], [class*="overlay"], [class*="modal"], dialog[open], [role="dialog"], [aria-modal="true"]')];
        const found = cands.filter(el => {
            if (el.matches(BLOCKING) || el.hidden || el.closest('[hidden]')) return false;
            if (el.matches('.back-fab-btn, .install-fab-btn, [class*="modal-"]:not([class*="modal-box"])') && !el.matches('dialog')) return false;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none') return false;
            if (cs.position !== 'fixed' && !el.matches('dialog')) return false;
            const r = el.getBoundingClientRect();
            return r.width >= vw * 0.5 && r.height >= vh * 0.35;
        });
        found.sort((a, b) => (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0));
        return found.pop() || null;
    }
    function closeOverlay(pop) {
        const x = pop.querySelector('.hl-x, .dev-close, [data-k="close"], [data-close], [data-k="no"], [data-k="skip"], .modal-close, [aria-label="Close"], [aria-label="Close dialog"]');
        if (x) { x.click(); return; }
        if (pop.matches('dialog[open]') && pop.close) { pop.close(); return; }
        pop.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // tapping the backdrop closes it
    }
    function backButton() {
        const NAV = 'bb_nav';
        const here = location.pathname + location.search;
        let stack = [];
        try { stack = JSON.parse(sessionStorage.getItem(NAV) || '[]'); } catch {}
        let cameBack = false;
        try { const nav = performance.getEntriesByType('navigation')[0]; cameBack = !!nav && nav.type === 'back_forward'; } catch {}
        if (cameBack && stack.lastIndexOf(here) >= 0) stack = stack.slice(0, stack.lastIndexOf(here) + 1);   // went back to a page we already had
        else if (stack[stack.length - 1] !== here) stack.push(here);
        stack = stack.slice(-40);
        try { sessionStorage.setItem(NAV, JSON.stringify(stack)); } catch {}
        const App = P('App');
        if (!App) return;
        App.addListener('backButton', () => {
            // 1. Close the top pop-up (tapping its backdrop closes it).
            const pop = visibleOverlay();
            if (pop) { closeOverlay(pop); return; }
            if (document.querySelector(BLOCKING)) return;
            // 2. A page with its own views (Settings groups) pushes a history entry for each: undo that first.
            if (history.state && (history.state.st || history.state.bb)) { history.back(); return; }
            // 3. One page back.
            let list = [];
            try { list = JSON.parse(sessionStorage.getItem(NAV) || '[]'); } catch {}
            if (list[list.length - 1] === here) list.pop();
            const prev = list[list.length - 1];
            try { sessionStorage.setItem(NAV, JSON.stringify(list)); } catch {}
            if (prev && prev !== here) { location.href = location.origin + prev; return; }
            // 4. Nothing behind us: Home, or leave the app from Home.
            if (!/\/home\/home\.html/.test(location.pathname)) { location.href = `${location.origin}/src/features/home/home.html`; return; }
            try { App.minimizeApp(); } catch {}
        });
    }

    // ---- bizzybee:// LINKS (Nov 21 2026, Craft; approved) ----
    // The home-screen "Save BizzyBee" button and Bixby Quick Commands open these links:
    //   bizzybee://save                       make a backup (Documents/BizzyBee too), upload, then close
    //   bizzybee://voice                      open the voice screen
    //   bizzybee://done?daily=Workout         complete a daily (also todo=..., task=...)
    //   bizzybee://habit?name=Water&dir=-     +1 (or -1) on a habit
    const root = () => { const i = location.pathname.indexOf('/src/'); return i >= 0 ? location.pathname.slice(0, i) : ''; };
    async function quickSave(note = 'Save button') {
        await Vault.init();
        try { await Vault.journalFlush(); } catch { /* fine */ }
        const r = await Vault.savePoint('backup', note);
        let up = false;
        try { if (typeof CloudSyncAuto !== 'undefined' && CloudSyncAuto.pushNow) up = await CloudSyncAuto.pushNow(); } catch { /* the backup still counts */ }
        const m = Vault.backupMeta(Vault.state) || {};
        if (typeof Toast !== 'undefined') Toast.show(`💾 Saved · Lv ${m.level} · ${Number(m.xp || 0).toLocaleString()} XP${up ? ' · in the cloud' : ''}${r.ok ? '' : ' (backup failed: ' + r.error + ')'}`, r.ok ? 'positive' : 'negative');
        return r.ok;
    }
    async function handleLink(url) {
        let u; try { u = new URL(url); } catch { return; }
        if (u.protocol !== 'bizzybee:') return;
        const what = (u.host || u.pathname.replace(/^\/+/, '')).toLowerCase();
        const q = (k) => u.searchParams.get(k);
        const close = () => setTimeout(() => { try { P('App').minimizeApp(); } catch { /* stay */ } }, 1800);
        if (what === 'voice') { location.href = root() + '/src/features/voice/voice.html'; return; }
        await Vault.init();
        if (what === 'save') { await quickSave(); close(); return; }
        const ops = [];
        if (what === 'done') {
            if (q('daily')) ops.push({ op: 'complete', kind: 'daily', label: q('daily') });
            if (q('todo')) ops.push({ op: 'complete', kind: 'todo', label: q('todo') });
            if (q('task')) ops.push({ op: 'complete', kind: 'quest-task', label: q('task') });
        } else if (what === 'habit' && q('name')) ops.push({ op: 'habit', kind: 'habit', label: q('name'), dir: q('dir') === '-' ? '-' : '+' });
        if (!ops.length) return;
        const res = Vault.applyOps(ops, { src: 'bixby', note: 'Bixby' });
        const ok = res.filter(r => r.ok);
        if (typeof Toast !== 'undefined') Toast.show(ok.length ? `🎙️ Done: ${ok.map(r => r.label).join(', ')}` : `🎙️ Couldn't find "${res.map(r => r.label).join(', ')}"`, ok.length ? 'positive' : 'negative');
        try { if (typeof CloudSyncAuto !== 'undefined') CloudSyncAuto.schedule(); } catch { /* uploads later */ }
        if (ok.length) close();
    }

    function start() {
        if (!isApp) return;
        backButton();
        try {
            const App = P('App');
            if (App) {
                App.addListener('appUrlOpen', (e) => handleLink(e && e.url));
                if (!sessionStorage.getItem('bb_launch_url_done')) {
                    sessionStorage.setItem('bb_launch_url_done', '1');
                    App.getLaunchUrl().then(r => { if (r && r.url) handleLink(r.url); }).catch(() => {});
                }
            }
            if (!localStorage.getItem('bb_shortcuts_v1')) { P('BeeFiles').shortcuts({}).then(() => localStorage.setItem('bb_shortcuts_v1', '1')).catch(() => {}); }
        } catch { /* old app */ }
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
        quickSave, handleLink,
        pinSaveButton: async () => { const r = await P('BeeFiles').shortcuts({ pin: true }); return r; },
    };
})();
