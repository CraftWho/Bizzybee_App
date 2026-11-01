console.log("/// HABITICA SYNC ONLINE ///");

// ============================================================================
// HABITICA TWO-WAY SYNC (Craft, 2026-10-10)
//
// Keeps Bizzybee's Habits, Dailies and To-Dos in step with Habitica, both
// ways: check-offs (+/- on habits, completing dailies and to-dos), new tasks,
// edits (name, notes, difficulty, a habit's +/- buttons) and deletes.
//
// When: on app open, every 5 minutes, when you come back to the app, and a
// few seconds after you change something. Needs the Habitica key on this
// device (see connect() - Account Info stores it after your PIN unlock).
//
// How it knows who changed what: every synced task has a LINK in
// state.habiticaLinks[bizzybeeId] = { hid, type, snap }. `snap` is how the
// task looked on BOTH sides right after the last sync. On the next sync:
//   - only Habitica differs from snap  -> Habitica changed it: copy here
//   - only Bizzybee differs from snap  -> you changed it here: send it there
//   - both differ                      -> Habitica wins
// Habits compare counts instead (+/- taps since the snapshot), so a tap is
// never counted twice. A link whose Bizzybee task is gone = deleted here
// (delete it on Habitica); a link whose Habitica task is gone = deleted
// there (delete it here).
//
// Safety:
//   - Nothing changes unless BOTH task lists (open + completed To-Dos)
//     arrive from Habitica.
//   - If more than a third of linked tasks (and more than 3) look deleted
//     at once, deletes are skipped that round - a half-empty list from
//     Habitica must never wipe your tasks.
//   - At most MAX_WRITES requests per run, spaced out (Habitica allows 30
//     a minute); anything left over goes in the next run.
//   - Never runs on the dev test save (Vault.devTest).
// ============================================================================
const HabiticaSync = (() => {
    const LINK_KEY = 'bizzybee_habitica_link';      // device-only { userId, apiToken }
    const STATUS_KEY = 'bizzybee_habitica_status';  // device-only last result
    const PENDING_KEY = 'bizzybee_habitica_pending';
    const LAST_KEY = 'bizzybee_habitica_last_run';
    const EVERY_MS = 5 * 60 * 1000;
    const AFTER_CHANGE_MS = 6000;
    const MIN_GAP_MS = 20 * 1000;
    const MAX_WRITES = 24;
    const SPACING_MS = 700;

    const TYPES = {
        habit: { coll: 'habits', remove: 'removeHabit' },
        daily: { coll: 'dailyTasks', remove: 'removeDailyTask' },
        todo: { coll: 'todos', remove: 'removeTodo' }
    };
    // Bizzybee difficulty <-> Habitica priority, and the XP each difficulty
    // gives per type (same tiers as the Create pages).
    const PRIORITY = { Trivial: 0.1, Easy: 1, Medium: 1.5, Hard: 2 };
    const TIER_XP = {
        habit: { Trivial: 10, Easy: 20, Medium: 60, Hard: 120 },
        daily: { Trivial: 10, Easy: 20, Medium: 60, Hard: 120 },
        todo: { Trivial: 15, Easy: 30, Medium: 70, Hard: 150 }
    };
    const difficultyOf = (priority) => priority >= 2 ? 'Hard' : priority >= 1.5 ? 'Medium' : priority >= 1 ? 'Easy' : 'Trivial';
    const priorityOf = (difficulty) => PRIORITY[difficulty] ?? 1;
    const cleanNotes = (notes) => String(notes || '').replace(/^Imported from Habitica \((habit|daily|todo)\)\.\s?/, '').trim();
    const nameKey = (text) => String(text || '').trim().toLowerCase();
    const today = () => todayISO();
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    let running = false;
    // Nov 1 2026 (Craft): true while Habitica is still on yesterday. Habitica
    // starts its day at your Habitica "day start" hour, which can be later
    // than BizzyBee's midnight. In that gap its dailies still show yesterday's
    // ticks, and the sync copied them in as "done today". Dailies wait now.
    let habiticaBehind = false;
    let changeTimer = null;
    let everyTimer = null;
    let started = false;

    // ---- device link -------------------------------------------------------
    function getLink() {
        try { const v = JSON.parse(localStorage.getItem(LINK_KEY) || 'null'); return v && v.userId && v.apiToken ? v : null; }
        catch { return null; }
    }
    function connect(userId, apiToken) {
        if (!userId || !apiToken) return;
        localStorage.setItem(LINK_KEY, JSON.stringify({ userId, apiToken }));
        start();
    }
    function disconnect() {
        localStorage.removeItem(LINK_KEY);
        localStorage.removeItem(PENDING_KEY);
        setStatus({ ok: true, message: 'Not connected on this device.' });
    }
    function isConnected() { return !!getLink(); }

    function setStatus(status) {
        const full = { at: new Date().toISOString(), ...status };
        try { localStorage.setItem(STATUS_KEY, JSON.stringify(full)); } catch {}
        window.dispatchEvent(new CustomEvent('habitica-sync-status', { detail: full }));
    }
    function getStatus() {
        try { return JSON.parse(localStorage.getItem(STATUS_KEY) || 'null'); } catch { return null; }
    }

    // ---- reading both sides -----------------------------------------------
    function localItems(type) { return (Vault.state[TYPES[type].coll] || []); }
    function findLocal(type, id) { return localItems(type).find(t => t.id === id) || null; }

    function habitCounts(habit) {
        const h = habit.history || [];
        return { up: h.filter(x => x.direction === 'positive').length, down: h.filter(x => x.direction === 'negative').length };
    }
    // ---- daily schedules -------------------------------------------------
    // Habitica keeps startDate as local midnight in UTC; Bizzybee keeps
    // a plain local 'YYYY-MM-DD'.
    const DAY_KEYS = ['su', 'm', 't', 'w', 'th', 'f', 's'];
    const pad = (n) => String(n).padStart(2, '0');
    function localDay(value) {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d)) return String(value).slice(0, 10);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    const toHabiticaDate = (day) => new Date(`${day}T00:00:00`).toISOString();

    // Habitica daily -> { repeats, startDate } for Bizzybee.
    function scheduleFrom(task) {
        const every = Math.max(1, Number(task.everyX) || 1);
        let startDate = localDay(task.startDate) || undefined;
        if (task.frequency === 'weekly') {
            const r = task.repeat || {};
            return { startDate, repeats: { type: 'weekly', every, daysOfWeek: DAY_KEYS.map((k, i) => (r[k] ? i : null)).filter(i => i !== null) } };
        }
        if (task.frequency === 'monthly') {
            // Bizzybee's monthly day comes from startDate's day.
            const dom = (task.daysOfMonth || [])[0];
            if (dom && startDate) {
                const [y, m] = startDate.split('-').map(Number);
                const last = new Date(y, m, 0).getDate();
                startDate = `${y}-${pad(m)}-${pad(Math.min(dom, last))}`;
            }
            return { startDate, repeats: { type: 'monthly', every, daysOfWeek: [] } };
        }
        return { startDate, repeats: { type: 'daily', every, daysOfWeek: [] } };
    }
    // One comparable string per schedule, for each side.
    function schedOfLocal(item) {
        const r = item.repeats || { type: 'daily', every: 1 };
        const every = Math.max(1, Number(r.every) || 1);
        const start = item.startDate || '';
        if (r.type === 'weekly') return `weekly|${every}|${[...(r.daysOfWeek || [])].sort().join(',')}|${start}`;
        if (r.type === 'monthly') return `monthly|${every}|${start ? Number(start.slice(8, 10)) : 1}|${start}`;
        return `daily|${every}|${start}`;
    }
    const schedOfRemote = (task) => schedOfLocal(scheduleFrom(task));
    function scheduleBody(item) {
        const r = item.repeats || { type: 'daily', every: 1 };
        const body = { everyX: Math.max(1, Number(r.every) || 1) };
        if (item.startDate) body.startDate = toHabiticaDate(item.startDate);
        if (r.type === 'weekly') {
            body.frequency = 'weekly';
            body.repeat = Object.fromEntries(DAY_KEYS.map((k, i) => [k, (r.daysOfWeek || []).includes(i)]));
        } else if (r.type === 'monthly') {
            body.frequency = 'monthly';
            body.daysOfMonth = [item.startDate ? Number(item.startDate.slice(8, 10)) : 1];
        } else {
            body.frequency = 'daily';
        }
        return body;
    }
    // Habitica's own answer to "is this due today?".
    function noteDue(item, task) {
        if (typeof task.isDue === 'boolean') item.habiticaDue = { day: today(), due: task.isDue };
    }

    function localDone(type, item) {
        if (type === 'daily') return (item.completedDates || []).includes(today());
        if (type === 'todo') return !!item.completed;
        return false;
    }
    function localFields(type, item) {
        const f = { text: item.label, notes: cleanNotes(item.notes), priority: priorityOf(item.difficulty || 'Easy') };
        if (type === 'habit') { f.up = item.positive !== false; f.down = item.negative !== false; }
        if (type === 'daily') f.sched = schedOfLocal(item);
        return f;
    }
    function remoteFields(type, task) {
        const f = { text: task.text, notes: task.notes || '', priority: Number(task.priority) || 1 };
        if (type === 'habit') { f.up = task.up !== false; f.down = task.down !== false; }
        if (type === 'daily') f.sched = schedOfRemote(task);
        return f;
    }
    function snapshot(type, item, task) {
        const snap = { f: remoteFields(type, task), day: today() };
        if (type === 'habit') {
            const c = habitCounts(item);
            snap.lUp = c.up; snap.lDown = c.down;
            snap.rUp = task.counterUp || 0; snap.rDown = task.counterDown || 0;
        } else {
            snap.done = !!task.completed;
        }
        return snap;
    }

    // Habitica task body from a Bizzybee item (for creating it there).
    function toRemote(type, item) {
        const body = { type, text: item.label, notes: cleanNotes(item.notes), priority: priorityOf(item.difficulty || 'Easy') };
        if (type === 'habit') { body.up = item.positive !== false; body.down = item.negative !== false; }
        if (type === 'todo' && item.dueDate) body.date = item.dueDate;
        if (type === 'daily') Object.assign(body, scheduleBody(item));
        return body;
    }

    // Bizzybee item from a Habitica task (for creating it here).
    function addLocalFrom(type, task) {
        const difficulty = difficultyOf(Number(task.priority) || 1);
        const base = { label: task.text, xp: TIER_XP[type][difficulty], difficulty, notes: task.notes || '' };
        let list;
        if (type === 'habit') list = Vault.addHabit({ ...base, positive: task.up !== false, negative: task.down !== false });
        else if (type === 'todo') list = Vault.addTodo({ ...base, dueDate: task.date ? String(task.date).slice(0, 10) : null });
        else list = Vault.addDailyTask({ ...base, ...scheduleFrom(task) });
        const item = list && list[list.length - 1];
        if (item && type === 'daily') noteDue(item, task);
        // addHabit's id is only per-millisecond; make it unique.
        if (item && type === 'habit') item.id = `habit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return item;
    }

    // ---- the run -----------------------------------------------------------
    async function run({ manual = false } = {}) {
        const link = getLink();
        if (!link || running) return null;
        if (typeof Vault === 'undefined' || Vault.devTest) return null;
        if (!navigator.onLine && !manual) return null;
        running = true;
        localStorage.setItem(LAST_KEY, String(Date.now()));
        localStorage.removeItem(PENDING_KEY);
        const counts = { pulled: 0, pushed: 0, created: 0, createdThere: 0, deleted: 0, deletedThere: 0 };
        let writes = 0;
        const api = (fn, ...args) => HabiticaAPI[fn](link.userId, link.apiToken, ...args);
        const write = async (fn, ...args) => {
            if (writes >= MAX_WRITES) throw Object.assign(new Error('write budget'), { budget: true });
            writes++;
            const result = await api(fn, ...args);
            await sleep(SPACING_MS);
            return result;
        };

        try {
            if (!Vault.state) await Vault.init();
            if (Vault.devTest) return null;
            if (!Vault.state.habiticaLinks) Vault.state.habiticaLinks = {};
            const links = Vault.state.habiticaLinks;

            // Start Habitica's new day first, like its own apps do.
            try {
                habiticaBehind = false;
                const cron = await api('getCronState');
                if (cron && cron.needsCron) await write('runCron');
                else if (cron && cron.lastCron && localDayOf(cron.lastCron) < today()) habiticaBehind = true;
            } catch (e) { if (e.status === 401) throw e; }

            const [open, done] = await Promise.all([api('getTasks'), api('getCompletedTodos')]);
            if (!Array.isArray(open) || !Array.isArray(done)) throw new Error('Habitica sent an incomplete task list - nothing changed.');
            const remote = new Map();
            [...open, ...done].forEach(t => { if (TYPES[t.type]) remote.set(t._id || t.id, t); });

            // 1. Deletes, with the "too many at once" guard.
            const entries = Object.entries(links);
            const goneThere = entries.filter(([bid, l]) => !remote.has(l.hid) && findLocal(l.type, bid));
            const skipRemoteDeletes = goneThere.length > 3 && goneThere.length > entries.length / 3;

            const linkedHids = new Set();
            for (const [bid, l] of entries) {
                const local = findLocal(l.type, bid);
                const task = remote.get(l.hid);
                if (!local && !task) { delete links[bid]; continue; }
                if (!local && task) {
                    // Deleted here -> delete there.
                    try { await write('deleteTask', l.hid); counts.deletedThere++; delete links[bid]; remote.delete(l.hid); }
                    catch (e) { if (e.budget) throw e; if (e.status === 404) { delete links[bid]; remote.delete(l.hid); } else linkedHids.add(l.hid); }
                    continue;
                }
                if (local && !task) {
                    if (skipRemoteDeletes) continue;
                    // Habitica drops finished To-Dos after a while - keep yours.
                    if (l.type === 'todo' && local.completed) { delete links[bid]; continue; }
                    // Deleted on Habitica -> delete here.
                    Vault[TYPES[l.type].remove](bid);
                    delete links[bid]; counts.deleted++;
                    continue;
                }
                linkedHids.add(l.hid);
                await reconcile(l.type, local, task, l, write, counts);
            }

            // 2. Habitica tasks with no link: match by name, else create here.
            for (const task of remote.values()) {
                if (linkedHids.has(task._id)) continue;
                if (Object.values(links).some(l => l.hid === task._id)) continue;
                const type = task.type;
                if (type === 'todo' && task.completed) continue;  // old finished To-Dos stay there
                const linkedLocal = new Set(Object.keys(links));
                const match = localItems(type).find(i => !linkedLocal.has(i.id) && nameKey(i.label) === nameKey(task.text));
                if (match) {
                    match.notes = cleanNotes(match.notes);
                    // First link: the Habitica side is the baseline, so any
                    // difference on this side is sent over next.
                    links[match.id] = { hid: task._id, type, snap: snapshot(type, match, task) };
                    await reconcile(type, match, task, links[match.id], write, counts);
                } else {
                    const item = addLocalFrom(type, task);
                    if (!item) continue;
                    if (task.completed && type !== 'habit') {
                        if (type === 'daily') Vault.toggleDailyTask(item.id); else Vault.toggleTodoComplete(item.id);
                    }
                    links[item.id] = { hid: task._id, type, snap: snapshot(type, item, task) };
                    counts.created++;
                }
            }

            // 3. Bizzybee tasks with no link: create them on Habitica (one request).
            const fresh = [];
            for (const type of Object.keys(TYPES)) {
                for (const item of localItems(type)) {
                    if (links[item.id]) continue;
                    if (String(item.id).startsWith('habit-starter-')) continue;   // the egg's starter habits stay here
                    if (type === 'todo' && item.completed) continue;              // old finished To-Dos stay here
                    fresh.push({ type, item });
                }
            }
            if (fresh.length) {
                const made = await write('createTasks', fresh.map(f => toRemote(f.type, f.item)));
                const list = Array.isArray(made) ? made : [made];
                // Link everything first, so a run that stops early can never
                // create the same task on Habitica twice.
                const toFinish = [];
                for (let i = 0; i < fresh.length; i++) {
                    const task = list[i];
                    if (!task || !task._id) continue;
                    const { type, item } = fresh[i];
                    links[item.id] = { hid: task._id, type, snap: snapshot(type, item, task) };
                    counts.createdThere++;
                    if (type !== 'habit' && localDone(type, item)) toFinish.push({ type, item, task });
                }
                Vault.save();
                // Already done here? Mark it done there too (reconcile sees the difference).
                for (const { type, item, task } of toFinish) await reconcile(type, item, task, links[item.id], write, counts);
            }

            finish(true, counts, manual);
            return counts;
        } catch (error) {
            if (error.budget) { finish(true, counts, manual, 'More to sync - continuing in the next run.'); return counts; }
            finish(false, counts, manual, error.message || 'Sync failed.');
            return null;
        } finally {
            running = false;
        }
    }

    function finish(ok, counts, manual, note) {
        // XP comes from minutes now (db.js) - refresh what tasks show.
        try { if (Vault._refreshTaskXP) Vault._refreshTaskXP(); Vault.save(); } catch {}
        const parts = [];
        if (counts.pulled) parts.push(`${counts.pulled} from Habitica`);
        if (counts.pushed) parts.push(`${counts.pushed} to Habitica`);
        if (counts.created) parts.push(`${counts.created} new here`);
        if (counts.createdThere) parts.push(`${counts.createdThere} new on Habitica`);
        if (counts.deleted) parts.push(`${counts.deleted} deleted here`);
        if (counts.deletedThere) parts.push(`${counts.deletedThere} deleted on Habitica`);
        const message = ok ? (note || (parts.length ? `Synced: ${parts.join(', ')}.` : 'Up to date.')) : note;
        setStatus({ ok, message, counts });
        if (manual && typeof Toast !== 'undefined') Toast.show(ok ? `🎮 ${message}` : `⚠️ Habitica: ${message}`, ok ? 'positive' : 'negative');
        // Pages redraw on their own after Vault changes they make; a sync
        // changes things behind their back, so tell them.
        if (ok && (counts.pulled || counts.created || counts.deleted)) window.dispatchEvent(new CustomEvent('habitica-synced', { detail: counts }));
    }

    // One linked task: fields, then check-offs / counts.
    async function reconcile(type, local, task, link, write, counts) {
        const snap = link.snap || {};
        const sf = snap.f || {};
        const lf = localFields(type, local);
        const rf = remoteFields(type, task);
        const push = {};
        for (const key of Object.keys(rf)) {
            const lc = lf[key] !== sf[key], rc = rf[key] !== sf[key];
            if (rc && lf[key] !== rf[key]) {
                // Habitica changed it (wins if both did).
                if (key === 'text') local.label = rf.text;
                else if (key === 'notes') local.notes = rf.notes;
                else if (key === 'priority') { local.difficulty = difficultyOf(rf.priority); local.xp = TIER_XP[type][local.difficulty]; }
                else if (key === 'up') local.positive = rf.up;
                else if (key === 'down') local.negative = rf.down;
                else if (key === 'sched') Object.assign(local, scheduleFrom(task));
                counts.pulled++;
            } else if (lc && !rc) {
                push[key] = lf[key];
            }
        }
        if (type === 'habit' && local.positive === false && local.negative === false) { local.positive = true; local.negative = true; }
        if (Object.keys(push).length) {
            const body = { ...push };
            if (body.sched) { delete body.sched; Object.assign(body, scheduleBody(local)); }
            const updated = await write('updateTask', link.hid, body);
            counts.pushed++;
            if (type === 'daily' && updated && typeof updated === 'object') noteDue(local, updated);
        }
        if (type === 'daily' && !push.sched && !habiticaBehind) noteDue(local, task);   // its "due" is for yesterday while behind

        if (type === 'habit') {
            const c = habitCounts(local);
            const rUp = task.counterUp || 0, rDown = task.counterDown || 0;
            // Habitica resets its counters (daily by default): a drop means a reset.
            const fromThere = (now, before) => (now >= (before || 0) ? now - (before || 0) : now);
            const upThere = fromThere(rUp, snap.rUp), downThere = fromThere(rDown, snap.rDown);
            const upHere = Math.max(0, c.up - (snap.lUp ?? c.up)), downHere = Math.max(0, c.down - (snap.lDown ?? c.down));
            for (let i = 0; i < upThere; i++) { if (local.positive !== false) Vault.bumpHabit(local.id, 'positive'); counts.pulled++; }
            for (let i = 0; i < downThere; i++) { if (local.negative !== false) Vault.bumpHabit(local.id, 'negative'); counts.pulled++; }
            let sentUp = 0, sentDown = 0;
            try {
                for (; sentUp < upHere; sentUp++) { await write('scoreTask', link.hid, 'up'); counts.pushed++; }
                for (; sentDown < downHere; sentDown++) { await write('scoreTask', link.hid, 'down'); counts.pushed++; }
            } finally {
                const after = habitCounts(local);
                // Taps not sent yet (write budget) stay "unsent" for next time.
                link.snap = { f: { ...rf, ...push }, day: today(), lUp: after.up - (upHere - sentUp), lDown: after.down - (downHere - sentDown), rUp: rUp + sentUp, rDown: rDown + sentDown };
            }
            return;
        }

        // Dailies and To-Dos: done / not done.
        // Habitica still on yesterday: leave dailies alone until its day starts.
        if (type === 'daily' && habiticaBehind) { link.snap = { ...snap, f: { ...rf, ...push } }; return; }
        const base = type === 'daily' && snap.day !== today() ? false : !!snap.done;
        const here = localDone(type, local), there = !!task.completed;
        let finalDone = there;
        if (there !== base && here !== there) {
            // Habitica changed it (wins if both did): copy here.
            if (type === 'daily') Vault.toggleDailyTask(local.id); else Vault.toggleTodoComplete(local.id);
            counts.pulled++;
        } else if (here !== base && there === base) {
            await write('scoreTask', link.hid, here ? 'up' : 'down');
            counts.pushed++;
            finalDone = here;
        }
        link.snap = { f: { ...rf, ...push }, day: today(), done: finalDone };
    }

    // ---- scheduling ----------------------------------------------------------
    function soon(delay = AFTER_CHANGE_MS) {
        if (!getLink()) return;
        try { localStorage.setItem(PENDING_KEY, '1'); } catch {}
        clearTimeout(changeTimer);
        changeTimer = setTimeout(() => run(), delay);
    }

    function start() {
        if (started || !getLink() || typeof Vault === 'undefined' || Vault.devTest) return;
        started = true;
        // A change anywhere in the app -> sync a few seconds later.
        const save = Vault.save.bind(Vault);
        Vault.save = (...args) => { const r = save(...args); if (!running) soon(); return r; };
        // On open: right away if a change was waiting, else unless we just ran.
        const last = Number(localStorage.getItem(LAST_KEY) || 0);
        const pending = localStorage.getItem(PENDING_KEY) === '1';
        const wait = pending ? 1500 : Math.max(1500, MIN_GAP_MS - (Date.now() - last));
        setTimeout(() => run(), wait);
        everyTimer = setInterval(() => run(), EVERY_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - Number(localStorage.getItem(LAST_KEY) || 0) > MIN_GAP_MS) run();
        });
    }

    return { connect, disconnect, isConnected, run, start, getStatus };
})();

// List pages redraw after a sync changed things behind their back.
window.addEventListener('habitica-synced', () => {
    if (document.visibilityState !== 'visible') return;
    if (/\/(home|habits|dailies|todos)\/(home|habits|dailies|todos)\.html/.test(location.pathname)) location.reload();
});

// Pages that load this file start syncing as soon as the save is ready.
(function bootHabiticaSync() {
    if (typeof Vault === 'undefined') return;
    const go = () => HabiticaSync.start();
    if (Vault.state) go();
    else Vault.init().then(go).catch(() => {});
})();
