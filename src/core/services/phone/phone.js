// Permissions + the features that need them (Oct 27 2026, approved demo).
// Rule: nothing is asked when the app opens. The first time you use a
// feature, BizzyBee explains why (a short card), then Android's own box
// asks. "Not now" waits until you use that feature again.
//   ask / renderPage   explain-first asks and Settings › Permissions
//   Steps    today's steps from Health Connect -> finishes step dailies
//   Weather  Open-Meteo weather (approximate area, or a typed city)
//   Photo    take or pick a photo (camera / Android photo picker)
//   Backup   daily save copies into a folder you pick (no storage permission)
const BizzyPhone = (() => {
    const Cap = window.Capacitor;
    const isApp = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
    const P = (n) => (isApp && Cap.Plugins && Cap.Plugins[n]) || null;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const get = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
    const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
    const toast = (m, t = 'positive', o) => { if (typeof Toast !== 'undefined') Toast.show(m, t, o); };
    const norm = (s) => s === 'granted' || s === 'limited' ? 'granted' : s === 'denied' ? 'denied' : 'prompt';

    // ------------------------------------------------------------------ perms
    const DEFS = {
        notifications: {
            icon: '🔔', title: 'Notifications', why: 'Reminders and Smart Notifications',
            card: ['TURN ON REMINDERS?', 'So BizzyBee can remind you about your tasks. You pick which ones.', ['Asked when you turn on reminders, or save a task with a reminder time.']],
            async check() {
                if (isApp) { try { return norm((await P('LocalNotifications').checkPermissions()).display); } catch { return 'unsupported'; } }
                if (!('Notification' in window)) return 'unsupported';
                return Notification.permission === 'default' ? 'prompt' : norm(Notification.permission);
            },
            async request() {
                if (isApp) return norm((await P('LocalNotifications').requestPermissions()).display);
                return norm(await Notification.requestPermission());
            },
        },
        alarms: {
            icon: '⏰', title: 'Alarms & reminders', why: 'So alerts arrive on the exact minute', app: true,
            async check() { try { const r = await P('LocalNotifications').checkExactNotificationSetting(); return r.exact_alarm === 'granted' ? 'granted' : 'denied'; } catch { return 'granted'; } },
            async request() { try { await P('LocalNotifications').changeExactNotificationSetting(); } catch {} return this.check(); },
            settings() { this.request(); },
        },
        steps: {
            icon: '👟', title: 'Steps', why: 'Health Connect (Samsung Health shares into it)', app: true,
            card: ['COUNT YOUR STEPS?', 'BizzyBee reads only your step count from Health Connect. Nothing else from your health data.', ['Step dailies finish themselves, like "Walk 8000 steps".', 'Samsung Health: Settings › Health Connect › let it share Steps.']],
            async check() {
                const h = P('Health');
                if (!h) return 'unsupported';
                try { const a = await h.isAvailable(); if (!a.available) return 'unsupported'; } catch { return 'unsupported'; }
                try {
                    const r = await h.checkAuthorization({ read: ['steps'], write: [] });
                    if ((r.readAuthorized || []).includes('steps')) return 'granted';
                    return get('bb_perm_steps_denied') ? 'denied' : 'prompt';
                } catch { return 'prompt'; }
            },
            async request() {
                const r = await P('Health').requestAuthorization({ read: ['steps'], write: [] });
                const ok = (r.readAuthorized || []).includes('steps');
                set('bb_perm_steps_denied', ok ? null : '1');
                return ok ? 'granted' : 'denied';
            },
            settings() { try { P('Health').openHealthConnectSettings(); } catch {} },
        },
        location: {
            icon: '🌦️', title: 'Weather', why: 'Approximate location only, or type a city instead',
            card: ['SHOW YOUR WEATHER?', 'Uses your approximate area only (about a city block wide, never your exact spot). Or type a city instead, with no permission at all.', ['Checked when you open the app. Never tracked in the background.']],
            async check() {
                if (isApp) { try { return norm((await P('Geolocation').checkPermissions()).coarseLocation); } catch { return 'unsupported'; } }
                try { return norm((await navigator.permissions.query({ name: 'geolocation' })).state); } catch { return 'prompt'; }
            },
            async request() {
                if (isApp) return norm((await P('Geolocation').requestPermissions({ permissions: ['coarseLocation'] })).coarseLocation);
                return new Promise(res => navigator.geolocation.getCurrentPosition(() => res('granted'), () => res('denied'), { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 }));
            },
        },
        camera: {
            icon: '📷', title: 'Camera', why: 'Take a profile photo (more uses later)', app: true,
            card: ['USE THE CAMERA?', 'To take this photo. BizzyBee only sees the photo you take.', ['Asked the first time you tap a camera button.']],
            async check() { try { return norm((await P('Camera').checkPermissions()).camera); } catch { return 'unsupported'; } },
            async request() { return norm((await P('Camera').requestPermissions({ permissions: ['camera'] })).camera); },
        },
        photos: { icon: '🖼️', title: 'Photos', why: "Only the photos you pick. Android's photo picker, no access to the rest.", none: true },
        folder: {
            icon: '💾', title: 'Backup folder', why: 'Pick a folder once. A copy of your save goes there daily.', app: true,
            card: ['PICK A BACKUP FOLDER', "Choose a folder, like Documents › BizzyBee. A copy of your save goes there once a day. BizzyBee can't see anything else.", ['No "storage" permission needed.', 'Keeps the newest 14 copies.']],
            async check() { try { return (await P('BeeFiles').status()).picked ? 'granted' : 'prompt'; } catch { return 'unsupported'; } },
            async request() { const r = await P('BeeFiles').pickFolder(); return r.picked ? 'granted' : 'prompt'; },
        },
        biometric: {
            icon: '👆', title: 'Face & fingerprint', why: 'Unlock with your face or fingerprint. Your phone checks it. BizzyBee never sees or stores it.', app: true,
            card: ['USE FACE OR FINGERPRINT?', 'Unlock BizzyBee with your face or fingerprint instead of typing the App Lock PIN.', ['Turn it on next to your App Lock PIN.', 'The PIN still works.']],
            async check() {
                if (typeof AppLock === 'undefined' || !(await AppLock.bioAvailable())) return 'unsupported';
                return AppLock.bioOn() ? 'granted' : 'prompt';
            },
            async request() { location.href = `${location.origin}/src/features/account-security/account-security.html`; return 'prompt'; },
            settings() { this.request(); },
        },
        calendar: {
            icon: '📅', title: 'Phone calendar', why: 'See your phone events in Calendar. Add To-Do due dates to it.', app: true,
            card: ['USE YOUR PHONE CALENDAR?', 'BizzyBee reads your events to show them in its Calendar, and adds your To-Do due dates. Nothing leaves your phone.', ['You pick which of the two to turn on.', 'Turning it off removes the To-Dos it added.']],
            async check() {
                const c = P('CapacitorCalendar');
                if (!c) return 'unsupported';
                try {
                    const r = (await c.checkPermission({ scope: 'readCalendar' })).result;
                    const w = (await c.checkPermission({ scope: 'writeCalendar' })).result;
                    if (r === 'granted' && w === 'granted') return 'granted';
                    return (r === 'denied' || w === 'denied') ? 'denied' : 'prompt';
                } catch { return 'unsupported'; }
            },
            async request() { return norm((await P('CapacitorCalendar').requestFullCalendarAccess()).result); },
        },
        install: {
            icon: '⬆️', title: 'Install updates', why: 'Asked the first time you update the app', app: true,
            async check() { try { return (await P('BeeUpdater').canInstall()).allowed ? 'granted' : 'prompt'; } catch { return 'unsupported'; } },
            async request() { try { await P('BeeUpdater').openInstallSettings(); } catch {} return 'prompt'; },
        },
    };
    const notNow = new Set();   // "Not now" this session

    // The explain-first card. Resolves to the final status.
    function card(name) {
        const d = DEFS[name];
        const [title, text, bullets] = d.card || [d.title.toUpperCase(), d.why, []];
        return new Promise(resolve => {
            const s = document.createElement('div');
            s.className = 'pm-scrim';
            s.innerHTML = `<div class="pm-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="pm-hex">${esc(d.icon)}</div><h2>${esc(title)}</h2><p>${esc(text)}</p>
                ${bullets.length ? `<ul>${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
                <div class="pm-btns"><button type="button" class="pm-btn" data-k="no">Not now</button><button type="button" class="pm-btn go" data-k="go">Continue</button></div></div>`;
            const done = (v) => { s.remove(); resolve(v); };
            s.addEventListener('click', async e => {
                const b = e.target.closest('[data-k]');
                if (e.target === s || (b && b.dataset.k === 'no')) { notNow.add(name); done('prompt'); return; }
                if (b && b.dataset.k === 'go') {
                    b.disabled = true;
                    let r = 'prompt';
                    try { r = await d.request(); } catch (err) { console.warn(name, err); }
                    done(r);
                }
            });
            document.body.appendChild(s);
        });
    }

    // Ask for one permission, only if needed. Returns the status.
    async function ask(name, { force = false } = {}) {
        const d = DEFS[name];
        if (!d || d.none || d.soon) return 'granted';
        if (d.app && !isApp) return 'unsupported';
        const st = await d.check();
        if (st === 'granted' || st === 'unsupported') return st;
        if (st === 'denied') {
            toast(`${d.title} is turned off for BizzyBee.`, 'neutral', { action: { label: 'Open settings', onClick: () => openSettings(name) } });
            return st;
        }
        if (notNow.has(name) && !force) return 'prompt';
        return card(name);
    }
    function openSettings(name) {
        const d = DEFS[name];
        if (d && d.settings) { d.settings(); return; }
        if (isApp && P('BeeFiles') && P('BeeFiles').openAppSettings) { P('BeeFiles').openAppSettings(); return; }
        toast('Open your browser\'s site settings to change this.', 'neutral');
    }

    const LABEL = { granted: ['ALLOWED', 'on'], denied: ['DENIED', 'no'], prompt: ['NOT ASKED', 'off'], unsupported: ['NOT AVAILABLE', 'off'], none: ['NO PERMISSION NEEDED', 'none'], soon: ['NEXT UPDATE', 'off'] };
    async function renderPage(host) {
        if (!host) return;
        const names = Object.keys(DEFS).filter(n => isApp || !DEFS[n].app);
        const rows = await Promise.all(names.map(async n => {
            const d = DEFS[n];
            const st = d.soon ? 'soon' : d.none ? 'none' : await d.check().catch(() => 'unsupported');
            const [lab, cls] = LABEL[st];
            const btn = st === 'prompt' ? `<button type="button" class="btn" data-pm="${n}">${n === 'folder' ? 'Pick folder' : 'Allow'}</button>`
                : st === 'denied' ? `<button type="button" class="btn" data-pm-open="${n}">Settings</button>`
                : n === 'folder' && st === 'granted' ? '<button type="button" class="btn" data-pm-backup>Back up now</button>' : '';
            let extra = '';
            if (n === 'folder' && st === 'granted') { try { const f = await P('BeeFiles').status(); extra = ` · ${esc(f.folder)}`; } catch {} }
            if (n === 'steps' && st === 'granted') { const s = Steps.today(); extra = s != null ? ` · ${s.toLocaleString()} today` : ''; }
            if (n === 'steps' && st === 'unsupported' && isApp) extra = ' · Needs the "Health Connect" app (built in on Android 14+)';
            return `<div class="row"><span class="hx">${esc(d.icon)}</span><span class="mid"><b>${esc(d.title)}</b><small>${esc(d.why)}${extra}</small></span><span class="pm-st ${cls}">${lab}</span>${btn}</div>`;
        }));
        host.innerHTML = rows.join('') + (isApp ? '' : '<p class="pm-note">The Android app adds steps, camera, phone backups and more.</p>');
        host.onclick = async e => {
            const a = e.target.closest('[data-pm]'), o = e.target.closest('[data-pm-open]'), bk = e.target.closest('[data-pm-backup]');
            if (a) {
                const n = a.dataset.pm;
                const r = await ask(n, { force: true });
                if (r === 'granted' && n === 'steps') await Steps.sync();
                if (r === 'granted' && n === 'folder') await Backup.run('first');
                renderPage(host);
            }
            if (o) openSettings(o.dataset.pmOpen);
            if (bk) await Backup.run('manual');
        };
    }

    // ------------------------------------------------------------------ steps
    const Steps = {
        today() {
            const s = typeof Vault !== 'undefined' && Vault.state && Vault.state.steps;
            const k = typeof todayISO === 'function' ? todayISO() : '';
            return s && s[k] != null ? s[k] : null;
        },
        // Reads today's total, keeps it, and finishes any "… 8000 steps" daily that hit its goal.
        async sync() {
            const h = P('Health');
            if (!h || typeof Vault === 'undefined' || !Vault.state) return null;
            if ((await DEFS.steps.check()) !== 'granted') return null;
            const start = new Date(); start.setHours(0, 0, 0, 0);
            let total = 0;
            try {
                // Whole day (Oct 28 2026 fix): Samsung Health saves one midnight-to-midnight
                // block. Asking only "until now" counted part of it (2,226 showed as ~400).
                const end = new Date(start); end.setDate(end.getDate() + 1);
                const r = await h.queryAggregated({ dataType: 'steps', startDate: start.toISOString(), endDate: end.toISOString(), bucket: 'day', aggregation: 'sum' });
                total = Math.round((r.samples || []).reduce((n, s) => n + (Number(s.value) || 0), 0));
            } catch (e) { console.warn('steps', e); return null; }
            const day = todayISO();
            Vault.state.steps = Vault.state.steps || {};
            const before = Vault.state.steps[day];
            Vault.state.steps[day] = total;
            Object.keys(Vault.state.steps).sort().slice(0, -60).forEach(k => delete Vault.state.steps[k]);   // keep 60 days
            (Vault.state.dailyTasks || []).forEach(t => {
                const m = String(t.label || '').match(/(\d[\d,.]*)\s*(k\b)?\s*steps?\b/i);
                if (!m) return;
                const goal = Math.round(parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1));
                if (!goal || total < goal || (t.completedDates || []).includes(day)) return;
                if (typeof isDailyDueOn === 'function' && !isDailyDueOn(t, day)) return;
                Vault.toggleDailyTask(t.id);
                toast(`👟 ${total.toLocaleString()} steps! "${t.label}" is done.`, 'positive');
            });
            const hatched = typeof Vault.incubatorTick === 'function' ? Vault.incubatorTick() : 0;   // steps warm the Egg Incubator
            if (hatched) toast(`🥚 Your steps took a day off ${hatched} egg${hatched === 1 ? '' : 's'} in the incubator.`);
            if (before !== total || hatched) Vault.save();
            return total;
        },
    };

    // ------------------------------------------------------- phone calendar
    // Two switches (Settings › Phone features): show phone events in the
    // Calendar plugin, and add To-Do due dates to the phone's calendar. Which
    // phone event belongs to which To-Do is kept on this phone only.
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const Calendar = {
        showOn: () => get('bb_cal_show') === 'on',
        addOn: () => get('bb_cal_todos') === 'on',
        map() { try { return JSON.parse(get('bb_cal_map') || '{}') || {}; } catch { return {}; } },
        saveMap(m) { set('bb_cal_map', Object.keys(m).length ? JSON.stringify(m) : null); },
        async allow() { return (await ask('calendar', { force: true })) === 'granted'; },
        async setShow(on) {
            if (on && !(await this.allow())) return false;
            set('bb_cal_show', on ? 'on' : null);
            return true;
        },
        async setAdd(on) {
            if (on && !(await this.allow())) return false;
            set('bb_cal_todos', on ? 'on' : null);
            if (on) await this.syncTodos(); else await this.removeAll();
            return true;
        },
        // Phone events in a time range: [{ id, date, time, title }]. Skips the To-Dos we added.
        async events(from, to) {
            const c = P('CapacitorCalendar');
            if (!c || !this.showOn() || (await DEFS.calendar.check()) !== 'granted') return [];
            const ours = new Set(Object.values(this.map()).map(x => String(x.e)));
            const r = await c.listEventsInRange({ from, to });
            return (r.result || []).filter(e => !ours.has(String(e.id))).map(e => {
                const d = new Date(e.startDate);
                // All-day events are stored at midnight UTC.
                const day = e.isAllDay ? new Date(d.getTime() + d.getTimezoneOffset() * 60000) : d;
                return { id: String(e.id), date: ymd(day), time: e.isAllDay ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), title: e.title || '(No title)' };
            });
        },
        // Add / update / remove To-Do due dates in the phone calendar.
        async syncTodos() {
            const c = P('CapacitorCalendar');
            if (!c || !this.addOn() || typeof Vault === 'undefined' || !Vault.state) return;
            if ((await DEFS.calendar.check()) !== 'granted') return;
            const m = this.map();
            const todos = new Map((Vault.state.todos || []).map(t => [t.id, t]));
            const drop = async (id) => { try { await c.deleteEvent({ id: String(m[id].e) }); } catch {} delete m[id]; };
            for (const id of Object.keys(m)) { const t = todos.get(id); if (!t || t.completed || !t.dueDate) await drop(id); }
            for (const t of todos.values()) {
                if (t.completed || !t.dueDate) continue;
                const sig = `${t.label}|${t.dueDate}|${t.dueTime || ''}`;
                if (m[t.id] && m[t.id].s === sig) continue;
                if (m[t.id]) await drop(t.id);
                const [y, mo, d] = t.dueDate.split('-').map(Number);
                let opts;
                if (t.dueTime) { const [h, mi] = t.dueTime.split(':').map(Number); const st = new Date(y, mo - 1, d, h, mi).getTime(); opts = { startDate: st, endDate: st + 30 * 60000, isAllDay: false }; }
                else { const st = Date.UTC(y, mo - 1, d); opts = { startDate: st, endDate: st + 86400000, isAllDay: true }; }
                try {
                    const r = await c.createEvent({ title: `✅ ${t.label}`, description: 'To-Do from BizzyBee', ...opts });
                    if (r && r.id) m[t.id] = { e: String(r.id), s: sig };
                } catch (e) { console.warn('calendar add', e && e.message); }
            }
            this.saveMap(m);
        },
        async removeAll() {
            const c = P('CapacitorCalendar');
            const m = this.map();
            if (c) for (const id of Object.keys(m)) { try { await c.deleteEvent({ id: String(m[id].e) }); } catch {} }
            this.saveMap({});
        },
    };

    // ---------------------------------------------------------------- weather
    const WCODE = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'], 51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Drizzle'], 61: ['🌧️', 'Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'], 95: ['⛈️', 'Storms'], 96: ['⛈️', 'Storms'], 99: ['⛈️', 'Storms'] };
    // Weather code -> a simple kind, for the animated icons and the Hive Mind sky.
    function kindOf(code) {
        if (code == null) return 'clear';
        if (code <= 1) return code === 0 ? 'clear' : 'mostly';
        if (code === 2) return 'partly';
        if (code === 3) return 'cloudy';
        if (code === 45 || code === 48) return 'fog';
        if (code >= 51 && code <= 57) return 'drizzle';
        if (code === 65 || code === 67 || code === 82) return 'heavy';
        if ((code >= 61 && code <= 66) || code === 80 || code === 81) return 'rain';
        if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
        if (code >= 95) return 'storm';
        return 'cloudy';
    }
    // Small animated icon (header, widgets). Pure SVG + CSS (phone.css).
    function iconSVG(kind, isDay = true) {
        const sun = '<g class="wxi-sun"><circle cx="12" cy="12" r="4.2"/><g class="wxi-rays">' + Array.from({ length: 8 }, (_, i) => `<path d="M12 3.2v2.2" transform="rotate(${i * 45} 12 12)"/>`).join('') + '</g></g>';
        const moon = '<g class="wxi-moon"><path d="M15.5 4.5a7.5 7.5 0 1 0 4 12.6A6.3 6.3 0 0 1 15.5 4.5z"/><circle class="wxi-star" cx="19.5" cy="5" r=".9"/></g>';
        const cloud = (cls = '') => `<path class="wxi-cloud ${cls}" d="M7.2 18.5h10a3.7 3.7 0 0 0 .3-7.4 5.2 5.2 0 0 0-10-.9A3.9 3.9 0 0 0 7.2 18.5z"/>`;
        const lines = (cls, n, ch) => Array.from({ length: n }, (_, i) => ch(i)).map(x => `<g class="${cls}">${x}</g>`).join('');
        const body = {
            clear: isDay ? sun : moon,
            mostly: isDay ? sun : moon,
            partly: `<g class="wxi-behind">${isDay ? sun : moon}</g>${cloud('wxi-drift')}`,
            cloudy: cloud('wxi-drift'),
            fog: lines('wxi-fog', 3, i => `<path d="M${4 + i}  ${9 + i * 4}h${15 - i * 2}"/>`),
            drizzle: cloud() + lines('wxi-drop', 2, i => `<path d="M${10 + i * 4} 20.2v1.6"/>`),
            rain: cloud() + lines('wxi-drop', 3, i => `<path d="M${8.5 + i * 3.5} 20v2.4"/>`),
            heavy: cloud('wxi-dark') + lines('wxi-drop wxi-fast', 4, i => `<path d="M${7.5 + i * 3} 19.8v3"/>`),
            snow: cloud() + lines('wxi-flake', 3, i => `<circle cx="${8.5 + i * 3.5}" cy="21" r=".9"/>`),
            storm: cloud('wxi-dark') + '<path class="wxi-bolt" d="M12.8 15.5 10.6 19h2.2l-1.4 3.6 3.6-4.7h-2.3l1.4-2.4z"/>',
        }[kind] || sun;
        return `<svg class="wxi wxi-${kind}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
    }
    const Weather = {
        mode: () => get('bb_weather', 'off'),            // off | area | city
        unit: () => get('bb_weather_unit', 'F'),
        city: () => { try { return JSON.parse(get('bb_weather_city') || 'null'); } catch { return null; } },
        setMode(m) { set('bb_weather', m); set('bb_weather_cache', null); },
        setUnit(u) { set('bb_weather_unit', u); set('bb_weather_cache', null); },
        async findCity(q) {
            const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en`).then(x => x.json());
            return (r.results || []).map(c => ({ name: `${c.name}${c.admin1 ? ', ' + c.admin1 : ''}${c.country_code ? ', ' + c.country_code : ''}`, lat: c.latitude, lon: c.longitude }));
        },
        setCity(c) { set('bb_weather_city', JSON.stringify(c)); this.setMode('city'); },
        async where() {
            if (this.mode() === 'city') return this.city();
            if (this.mode() !== 'area') return null;
            if ((await DEFS.location.check()) !== 'granted') return null;
            const fix = (p) => ({ lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2), name: 'Your area' });
            if (isApp) return fix(await P('Geolocation').getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 }));
            return new Promise(res => navigator.geolocation.getCurrentPosition(p => res(fix(p)), () => res(null), { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 }));
        },
        async now() {
            if (this.mode() === 'off') return null;
            try { const c = JSON.parse(get('bb_weather_cache') || 'null'); if (c && c.v === 2 && Date.now() - c.at < 30 * 60000 && c.unit === this.unit()) return c; } catch {}
            const w = await this.where().catch(() => null);
            if (!w) return null;
            const u = this.unit() === 'C' ? 'celsius' : 'fahrenheit';
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}&current=temperature_2m,weather_code,is_day,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&temperature_unit=${u}&wind_speed_unit=kmh&timezone=auto&forecast_days=1`).then(x => x.json()).catch(() => null);
            if (!r || !r.current) return null;
            const [icon, text] = WCODE[r.current.weather_code] || ['🌡️', 'Weather'];
            const code = r.current.weather_code;
            const out = { v: 2, at: Date.now(), unit: this.unit(), place: w.name, temp: Math.round(r.current.temperature_2m), icon, text, code, kind: kindOf(code),
                isDay: r.current.is_day === 1, wind: Math.round(r.current.wind_speed_10m || 0),
                // "2026-10-28T07:21" in the place's own time: read as local clock time.
                sunrise: Date.parse(r.daily.sunrise[0]) || null, sunset: Date.parse(r.daily.sunset[0]) || null,
                hi: Math.round(r.daily.temperature_2m_max[0]), lo: Math.round(r.daily.temperature_2m_min[0]), rain: r.daily.precipitation_probability_max[0] };
            set('bb_weather_cache', JSON.stringify(out));
            return out;
        },
    };

    // ------------------------------------------------------------------ photo
    function shrink(dataUrl, max = 384) {
        return new Promise(res => {
            const img = new Image();
            img.onload = () => {
                const k = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                res(c.toDataURL('image/jpeg', .82));
            };
            img.onerror = () => res(null);
            img.src = dataUrl;
        });
    }
    const Photo = {
        // source: 'camera' | 'photos'. Returns a small JPEG data URL, or null.
        async pick(source) {
            if (isApp) {
                if (source === 'camera' && (await ask('camera')) !== 'granted') return null;
                try {
                    const r = await P('Camera').getPhoto({ resultType: 'base64', source: source === 'camera' ? 'CAMERA' : 'PHOTOS', quality: 75, width: 512, height: 512, correctOrientation: true, allowEditing: false });
                    return r && r.base64String ? shrink(`data:image/${r.format || 'jpeg'};base64,${r.base64String}`) : null;
                } catch { return null; }
            }
            return new Promise(res => {
                const i = document.createElement('input');
                i.type = 'file'; i.accept = 'image/*';
                if (source === 'camera') i.capture = 'user';
                i.onchange = () => {
                    const f = i.files && i.files[0];
                    if (!f) { res(null); return; }
                    const rd = new FileReader();
                    rd.onload = () => shrink(rd.result).then(res);
                    rd.readAsDataURL(f);
                };
                i.click();
            });
        },
    };

    // ----------------------------------------------------------------- backup
    const Backup = {
        async run(reason = 'auto') {
            const f = P('BeeFiles');
            if (!f || typeof Vault === 'undefined' || !Vault.state) return false;
            const st = await f.status().catch(() => ({}));
            if (!st.picked) return false;
            const d = new Date(), pad = (n) => String(n).padStart(2, '0');
            const name = `bizzybee-save-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}.json`;
            try {
                await f.writeFile({ name, text: Vault.exportFullState(), keep: 14, prefix: 'bizzybee-save-' });
                set('bb_phone_backup_at', String(Date.now()));
                if (reason !== 'auto') toast(`💾 Backup saved to ${st.folder}.`, 'positive');
                return true;
            } catch (e) {
                if (reason !== 'auto') toast(`Backup failed: ${(e && e.message) || e}`, 'negative');
                return false;
            }
        },
        async auto() { if (Date.now() - Number(get('bb_phone_backup_at', 0)) > 20 * 3600000) await this.run('auto'); },
        lastAt: () => Number(get('bb_phone_backup_at', 0)) || null,
    };

    // ------------------------------------------------- Home: steps + weather
    async function homeStrip() {
        if (!/\/home\/home\.html/.test(location.pathname)) return;
        const parts = [];
        const steps = isApp ? await Steps.sync().catch(() => null) : null;
        if (steps != null) parts.push(`<span class="ph-chip">👟 ${steps.toLocaleString()} steps</span>`);
        const w = await Weather.now().catch(() => null);
        // Home (Oct 29 2026): steps and weather sit in the stat strip now.
        if (document.getElementById('home-hive')) {
            window.__homeStrip = { steps: steps == null ? null : steps,
                wx: w ? { temp: w.temp, text: w.text, place: w.place, icon: iconSVG(w.kind || kindOf(w.code), w.isDay !== false) } : null };
            window.dispatchEvent(new Event('home-strip'));
            return;
        }
        if (w) parts.push(`<span class="ph-chip" title="${esc(w.place)}">${iconSVG(w.kind || kindOf(w.code), w.isDay !== false)} ${w.temp}°${w.unit} · ${esc(w.text)} · ${w.hi}°/${w.lo}°${w.rain >= 40 ? ` · ${w.rain}% rain` : ''}</span>`);
        let el = document.getElementById('ph-strip');
        if (!parts.length) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'ph-strip'; el.className = 'ph-strip';
            const main = document.querySelector('main'), first = main && main.firstElementChild;
            if (first) first.after(el); else if (main) main.prepend(el); else return;
        }
        el.innerHTML = parts.join('');
    }

    function start() {
        const path = location.pathname;
        if (!/\/(features|plugins)\//.test(path) || /\/onboarding\//.test(path)) return;
        const go = () => {
            homeStrip();
            // (Header weather removed Oct 28 2026, Craft. Home and Hive Mind keep theirs.)
            if (isApp) { Backup.auto(); if (!/home\.html/.test(path)) Steps.sync(); Calendar.syncTodos(); }
        };
        if (isApp) { let ct = null; window.addEventListener('vault-saved', () => { clearTimeout(ct); ct = setTimeout(() => Calendar.syncTodos(), 4000); }); }
        (typeof Vault !== 'undefined' ? Vault.init() : Promise.resolve()).then(() => setTimeout(go, 1200));
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(go, 800); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    return { isApp, ask, status: (n) => (DEFS[n] ? DEFS[n].check() : Promise.resolve('unsupported')), renderPage, openSettings, Steps, Weather, Photo, Backup, Calendar, homeStrip, iconSVG, kindOf };
})();
