console.log("/// HOME PROTOCOLS INITIALIZED ///");

// Home (rebuilt 2026-10-08, refreshed 2026-10-09 - Craft):
//   - your royal + name + level bar live in the app's top bar (app.js
//     AppShell), full size on this page - the Level Up button is there too
//   - hive strip: four stats, each opening its own page (bees -> Hive Mind,
//     XP today -> today's list, current streak -> Dailies, focus quest -> Quests)
//   - Today: a dropdown with Dailies / Habits / To-Dos / Quest tabs, using
//     the exact same cards as those tabs (TaskRow, HabitRow, QuestUI).
//     Closed by default on phones, open on wide screens.
//   - the app grid: every page that isn't in the bottom dock, one grid
//     (Hive / Grow / You / More), with gold line icons on coloured hexagons

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TODAY_TABS = ['dailies', 'habits', 'todos', 'quest'];
const TAB_LINKS = {
    dailies: { href: '../dailies/dailies.html', label: 'Open Dailies', edit: '../dailies/create-daily.html?id=' },
    habits: { href: '../../features/habits/habits.html', label: 'Open Habits' },
    todos: { href: '../../features/todos/todos.html', label: 'Open To-Dos', edit: '../../features/todos/create-todo.html?id=' },
    quest: { href: '../quests/quests.html', label: 'Open Quests' }
};
let currentTab = 'dailies';
const openChecklists = new Set();

function pluginOn(id) {
    return typeof Plugins === 'undefined' || Plugins.isEnabled(id);
}

// ---- data for the Today card ----
function todayData() {
    const dailies = Vault.getDailyTasks().filter(t => t.dueToday || t.completedToday);
    const todosAll = pluginOn('todos') ? Vault.getTodos() : [];
    const today = todayISO();
    const todos = todosAll.filter(t => !t.completed || t.completedDate === today);
    const quest = Vault.getQuests().find(q => q.id === Vault.getActiveQuestId()) || null;
    return { dailies, todos, quest, habits: pluginOn('habits') ? Vault.getHabits() : [] };
}

// Oct 31 2026 (Craft, from 1.0.6): XP today, Done today and History all
// read one list (Vault.doneOn), so they always match. Each row links to its
// task and says when it was done.
function xpToday() {
    return Vault.doneOn(todayISO()).reduce((n, x) => n + x.xp, 0);
}
function doneToday() { return Vault.doneOn(todayISO()); }
function doneHref(x) {
    if (typeof BizzyNotify === 'undefined') return null;
    try { return BizzyNotify.urlFor(x.kind, x.id, x.extra); } catch { return null; }
}
function doneRows(list) {
    return list.map(x => {
        const href = doneHref(x), when = x.t ? new Date(x.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        const inner = `<span class="xt-ic" aria-hidden="true">${x.icon}</span><span class="xt-mid"><b>${escapeHTML(x.label)}</b><small>${escapeHTML(x.what)}${when ? ' · ' + when : ''}</small></span><span class="xt-xp${x.xp < 0 ? ' neg' : ''}">${x.xp > 0 ? '+' : ''}${x.xp} XP</span>`;
        return href ? `<li><a class="xt-row" href="${escapeHTML(href)}">${inner}</a></li>` : `<li><span class="xt-row">${inner}</span></li>`;
    }).join('');
}

function openDoneToday() {
    if (document.querySelector('.xt-scrim')) return;
    const list = doneToday();
    const total = list.reduce((n, x) => n + x.xp, 0);
    const s = document.createElement('div');
    s.className = 'xt-scrim';
    s.innerHTML = `<div class="xt-sheet" role="dialog" aria-modal="true" aria-label="Done today">
        <div class="xt-head"><div><h2>DONE TODAY</h2><small>${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · starts fresh at midnight</small></div>
            <b class="xt-total">${total > 0 ? '+' : ''}${total} XP</b></div>
        ${list.length ? `<ul class="xt-list">${doneRows(list)}</ul>`
            : '<p class="xt-empty">Nothing finished yet today. Check off a daily to get started.</p>'}
        <div class="xt-btns"><a class="xt-btn" href="../history/history.html">History</a><button type="button" class="xt-btn gold" data-k="close">Close</button></div></div>`;
    const close = () => s.remove();
    s.addEventListener('click', e => { if (e.target === s || e.target.closest('[data-k="close"]')) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(s);
    s.querySelector('[data-k="close"]').focus();
}

// Nov 1 2026 (Craft): days in a row with 5+ tasks of any kind done
// (Vault.taskStreak in db.js). Today joins once it reaches 5.
function currentStreak() {
    return typeof Vault.taskStreak === 'function' ? Vault.taskStreak() : 0;
}

// ---- hive strip: four stats, each to its own page ----
const STRIP_ICONS = {
    // Oct 31 2026 (Craft, from 1.0.6): top-down bee: antennae, round head, torso, striped
    // pointed tail, and big wings.
    bees: '<path d="M10.6 4.4 9.2 2.4M13.4 4.4l1.4-2"/><circle cx="12" cy="5.9" r="1.8"/><ellipse cx="12" cy="10.1" rx="2.3" ry="2.1"/><path d="M12 12.2c-2.7 0-3.6 2.4-3.4 4.5.3 2.5 1.9 4.1 3.4 5.6 1.5-1.5 3.1-3.1 3.4-5.6.2-2.1-.7-4.5-3.4-4.5z"/><path d="M8.8 15.4h6.4M9.3 18.3h5.4"/><path d="M9.8 9.4C6.3 6.1 2.6 6.8 2.7 9.5c.1 2.4 3.9 2.6 7.1 1z"/><path d="M14.2 9.4c3.5-3.3 7.2-2.6 7.1.1-.1 2.4-3.9 2.6-7.1 1z"/><path d="M9.8 11.3c-2.9.6-4.8 2.6-3.8 4 1 1.3 3 .1 4-2.2M14.2 11.3c2.9.6 4.8 2.6 3.8 4-1 1.3-3 .1-4-2.2"/>',
    steps: '<path d="M8 3.5c1.7 0 2.6 2 2.6 4.6S9.7 13 8 13s-2.6-2.3-2.6-4.9S6.3 3.5 8 3.5z"/><path d="M6 15.5h4v1.3a2 2 0 0 1-4 0z"/><path d="M16 7.5c1.7 0 2.6 2 2.6 4.6S17.7 17 16 17s-2.6-2.3-2.6-4.9.9-4.6 2.6-4.6z"/><path d="M14 19.5h4v1.3a2 2 0 0 1-4 0z"/>',
    wx: '<path d="M7.2 18.5h10a3.7 3.7 0 0 0 .3-7.4 5.2 5.2 0 0 0-10-.9A3.9 3.9 0 0 0 7.2 18.5z"/>',
    // Nov 16 2026 (Craft): the first stat is Hive Life again (the bee icon) and opens Hive Life. The Hive Mind app tile below is unchanged.
    hive: '<path d="M8.5 3.5 12 5.5v4L8.5 11.5 5 9.5v-4z"/><path d="M15.5 3.5 19 5.5v4l-3.5 2-3.5-2v-4z"/><path d="M12 9.5l3.5 2v4L12 17.5l-3.5-2v-4z"/><path d="M8.5 15.5v4L12 21.5l3.5-2v-4"/>',
    xp: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    streak: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.7 1.9 1.8 3 3 3.4-.2-2.6.8-5.3 2.9-6.9.1 3.4 3.5 6 3.5 10.4C18.5 18.2 16 21 12 21z"/><path d="M12 21c-1.7 0-2.8-1.2-2.8-2.8 0-1.8 1.6-2.7 2.2-4.2.9 1.5 3.4 2.4 3.4 4.4 0 1.5-1.2 2.6-2.8 2.6z"/>',
    quest: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>'
};

function renderHive() {
    const hive = Vault.getHiveHoney();
    const streak = currentStreak();
    const quest = Vault.getQuests().find(q => q.id === Vault.getActiveQuestId());
    const qp = quest && typeof QuestUI !== 'undefined' ? QuestUI.progress(quest).pct : null;
    const xp = xpToday();
    const stats = [
        { key: 'bees', value: hive.bees, label: 'Hive Life', aria: `Hive Life, ${hive.bees} bees`, href: '../hive-mind/hive-mind.html?view=life', color: '#ffcc00' },   // Oct 31 2026 (Craft)
        { key: 'xp', value: `${xp > 0 ? '+' : ''}${xp}`, label: 'XP today', button: true, color: '#34c77b' },
        { key: 'streak', value: streak, label: 'Current streak', href: '../dailies/dailies.html', color: '#ff8a3d' },
        { key: 'quest', value: qp === null ? '—' : `${qp}%`, label: quest ? 'Focus quest' : 'No focus', href: quest ? `../quests/quest.html?id=${encodeURIComponent(quest.id)}` : '../quests/quests.html', color: '#4fb3d9' }
    ];
    // Oct 31 2026 (Craft, from 1.0.6): steps and weather: fixed slots so nothing pops in late.
    // phone.js fills them once the data arrives (window.__homeStrip).
    const hs = window.__homeStrip || {};
    const app = typeof BizzyPhone !== 'undefined' && BizzyPhone.isApp;
    // Oct 31 2026 (Craft): on PC LOCAL, a dashed placeholder shows where a
    // tile goes when it can't work on this computer (steps = app only;
    // weather turned on but not loading). Turned off = hidden, as before.
    const local = typeof Vault !== 'undefined' && Vault.pcLocal;
    let wxOn = false;
    try { wxOn = (localStorage.getItem('bb_weather') || 'off') !== 'off'; } catch { /* storage off */ }
    const incOn = typeof Plugins === 'undefined' || Plugins.isEnabled('incubator');   // Nov 13 2026 (Craft): the steps tile opens the Incubator + step stats
    if (app && hs.steps !== null) stats.push({ key: 'steps', value: hs.steps != null ? hs.steps.toLocaleString() : '–', label: 'Steps', color: '#9be15d', still: !incOn, href: '../../plugins/incubator/incubator.html#steps' });
    else if (local) stats.push({ key: 'steps', value: '—', label: 'Steps · app', title: 'Steps show in the Android app', color: '#9be15d', still: true, ph: true });
    if (hs.wx !== null) stats.push({ key: 'wx', value: hs.wx ? `${hs.wx.temp}°` : '–', label: hs.wx ? hs.wx.text : 'Weather', color: '#7fc8ff', still: true, icon: hs.wx && hs.wx.icon, title: hs.wx && hs.wx.place });
    else if (local && wxOn) stats.push({ key: 'wx', value: '—', label: 'Weather', title: 'Weather is on but not loading here', color: '#7fc8ff', still: true, ph: true });
    const host = document.getElementById('home-hive');
    const tag = (s) => s.button ? 'button' : s.still ? 'div' : 'a';
    host.classList.toggle('six', stats.length > 4);
    host.innerHTML = stats.map(s => `
        <${s.button ? 'button type="button" data-done-today' : s.still ? `div data-stat="${s.key}"${s.title ? ` title="${escapeHTML(s.title)}"` : ''}` : `a href="${s.href}"`} class="home-stat${s.ph ? ' ph' : ''}" style="--sc:${s.color}" aria-label="${escapeHTML(s.aria || `${s.label}: ${s.value}`)}${s.button ? '. Show what you finished today' : ''}">
            ${s.icon || `<svg viewBox="0 0 24 24" aria-hidden="true">${STRIP_ICONS[s.key]}</svg>`}
            <b>${escapeHTML(s.value)}</b><small>${escapeHTML(s.label)}</small>
        </${tag(s)}>`).join('');
    host.querySelector('[data-done-today]').onclick = openDoneToday;
}
window.addEventListener('home-strip', () => { try { renderHive(); } catch { /* not ready yet */ } });

// ---- Bees that need help (Hive Life moods) ----
// 😢 hungry / tired / hurt, 😠 no job for 3+ days, 😵 fainted. One line,
// tap to open Hive Bees on the "Need help" filter. Hidden when all is well.
// Eggs ready to hatch (Oct 28 2026): tap to hatch them right here.
function renderReadyEggs() {
    const help = document.getElementById('home-help');
    if (!help || typeof Vault.readyEggs !== 'function') return;
    let el = document.getElementById('home-ready');
    const eggs = Vault.readyEggs();
    if (!eggs.length) { if (el) el.remove(); return; }
    if (!el) {
        el = document.createElement('button');
        el.type = 'button'; el.id = 'home-ready'; el.className = 'home-card home-help home-ready';
        help.parentNode.insertBefore(el, help);
        el.addEventListener('click', () => { const e = Vault.readyEggs()[0]; if (e) AppShell.hatch(e.id, () => { renderReadyEggs(); renderBeeHelp(); renderHive(); }); });
    }
    el.innerHTML = `<span class="home-help-ic" aria-hidden="true">🥚</span><span class="home-help-t"><b>${eggs.length} egg${eggs.length === 1 ? ' is' : 's are'} ready to hatch!</b><small>Tap to crack ${eggs.length === 1 ? 'it' : 'the first one'} open.</small></span><span class="home-help-go" aria-hidden="true">›</span>`;
}

// Nov 1 2026 (Craft; approved demo): no more "bees need help" card pushing
// the Home apps down. Eve (Adam if your royal is a King) pops up in the
// corner with one line, leaves after 5 seconds, and a tap takes you to
// the bees that need help. At most once every 30 minutes for the same news.
function renderLifeLink() {
    const el = document.getElementById('home-life');
    if (!el || typeof beeNeeds !== 'function') return;
    const bees = Vault.getHiveBees().filter(b => b.rarity !== 'Royal');
    const need = bees.filter(b => beeNeeds(b).length).length;
    el.innerHTML = `<span class="home-life-ic" aria-hidden="true">🐝</span><span class="home-life-t"><b>Hive Life</b><small>${need ? `${need} bee${need === 1 ? '' : 's'} need${need === 1 ? 's' : ''} help` : 'All your bees are doing fine'}</small></span><span class="home-help-go" aria-hidden="true">›</span>`;
    el.classList.toggle('need', need > 0);
}
function renderBeeHelp() {
    renderReadyEggs();
    try { renderLifeLink(); } catch { /* not ready yet */ }
    const card = document.getElementById('home-help');
    if (card) card.hidden = true;
    if (typeof beeNeeds !== 'function') return;
    const list = Vault.getHiveBees().filter(b => b.rarity !== 'Royal')
        .map(b => ({ b, needs: beeNeeds(b) })).filter(x => x.needs.length);
    if (!list.length) return;
    const line = list.slice(0, 2).map(({ b, needs }) => `${b.name}: ${needs[0].need.toLowerCase()}`).join(' · ') + (list.length > 2 ? ` · +${list.length - 2} more` : '');
    try {
        const last = JSON.parse(sessionStorage.getItem('bizzybee_eve_help') || 'null');
        if (last && last.line === line && Date.now() - last.at < 30 * 60000) return;
        sessionStorage.setItem('bizzybee_eve_help', JSON.stringify({ line, at: Date.now() }));
    } catch { /* storage off: show it */ }
    const royal = Vault.getHiveBees().find(b => b.rarity === 'Royal');
    // Nov 1 2026 (Craft): Eve is your Queen, Adam your King, drawn with their real art.
    const king = !!(royal && royal.royal === 'king');
    const art = AppShell.url(`src/assets/bees/${king ? 'king/king' : 'queen/queen'}-body.webp`);
    const who = { name: king ? 'Adam' : 'Eve', face: `<img src="${art}" alt="" draggable="false">` };
    setTimeout(() => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'home-eve';
        el.setAttribute('aria-label', `${who.name}: ${line}. Tap to check on them.`);
        el.innerHTML = `<span class="home-eve-bub">${escapeHTML(line)}<small>${who.name} · tap to check on them</small></span><span class="home-eve-who" aria-hidden="true">${who.face}</span>`;
        el.addEventListener('click', () => { location.href = '../bee-care/bee-care.html'; });
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add('in'));
        setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 450); }, 5000);
    }, 1200);
}

// ---- Today ----
function emptyState(icon, text) {
    return `<div class="home-empty"><b>${icon}</b>${text}</div>`;
}

function renderPanel(direction) {
    const data = todayData();
    const panel = document.getElementById('home-panel');
    let html = '';

    if (currentTab === 'dailies') {
        html = data.dailies.length
            ? `<ul class="hr-list home-cards" data-kind="daily">${data.dailies.map(t => TaskRow.dailyHTML(t, openChecklists.has(t.id))).join('')}</ul>`
            : emptyState('☀️', 'No dailies due today.');
    } else if (currentTab === 'habits') {
        if (!pluginOn('habits')) html = emptyState('✅', 'Habits are off. Turn them on in Plugins.');
        else html = data.habits.length ? `<div class="home-habits">${HabitRow.listHTML(data.habits)}</div>` : emptyState('✅', 'No habits yet. Tap the + on the Habits tab to make one.');
    } else if (currentTab === 'todos') {
        if (!pluginOn('todos')) html = emptyState('📝', 'To-Dos are off. Turn them on in Plugins.');
        else {
            const open = data.todos.filter(t => !t.completed).sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
            const done = data.todos.filter(t => t.completed);
            html = open.length || done.length
                ? `<ul class="hr-list home-cards" data-kind="todo">${[...open, ...done].map(t => TaskRow.todoHTML(t, openChecklists.has(t.id))).join('')}</ul>`
                : emptyState('📝', 'Nothing to do. Nice.');
        }
    } else if (currentTab === 'quest') {
        html = `<div class="home-quest">${QuestUI.focusCardHTML(data.quest)}</div>`;
    }

    panel.innerHTML = html;
    const list = panel.firstElementChild;
    if (list && direction && !reduceMotion) {
        list.style.setProperty('--dx', `${direction * 14}px`);
        list.classList.add('home-enter');
    }
    const link = document.getElementById('home-see-all');
    link.href = TAB_LINKS[currentTab].href;
    link.textContent = `${TAB_LINKS[currentTab].label} →`;
}

function renderTabs() {
    const data = todayData();
    const i = TODAY_TABS.indexOf(currentTab);
    document.getElementById('home-tab-pill').style.transform = `translateX(${i * 100}%)`;
    document.querySelectorAll('.home-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === currentTab)));
    const counts = {
        dailies: data.dailies.filter(t => !t.completedToday).length,
        todos: data.todos.filter(t => !t.completed).length,
        quest: data.quest ? (data.quest.tasks || []).filter(t => !t.completed).length : 0
    };
    document.querySelectorAll('[data-n]').forEach(el => {
        const n = counts[el.dataset.n];
        el.textContent = n;
        el.hidden = !n;
    });
}

function renderRing() {
    const data = todayData();
    const today = TaskRow.localISO(new Date());
    const items = [
        ...data.dailies.map(t => t.completedToday),
        ...(data.quest ? (data.quest.tasks || []).map(t => t.completed) : []),
        ...data.todos.filter(t => t.completed || (t.dueDate && t.dueDate <= today)).map(t => t.completed)
    ];
    const total = items.length, done = items.filter(Boolean).length;
    document.getElementById('home-ring-fg').style.strokeDashoffset = total ? 119.4 * (1 - done / total) : 119.4;
    document.getElementById('home-ring-text').textContent = done;
    document.getElementById('home-today-sub').textContent = !total
        ? 'Nothing due today'
        : done === total ? 'All done. The hive is proud of you.' : `${done} of ${total} done · ${total - done} to go`;
}

function renderToday(direction) {
    renderTabs();
    renderPanel(direction);
    renderRing();
}

function refreshAfterCheck() {
    renderHive();
    renderBeeHelp();
    setTimeout(() => { renderTabs(); renderRing(); renderPanel(); }, 700);
}

// Taps on a daily / to-do card or the focused quest.
function handlePanelClick(event) {
    if (window.__hrJustDragged) return;
    const quest = event.target.closest('.qa-card');
    if (quest) {
        const check = event.target.closest('.dr-check');
        if (check) {
            const row = check.closest('.qt');
            QuestUI.toggleTask(quest.dataset.questId, row.dataset.taskId, row);
            refreshAfterCheck();
        } else if (event.target.closest('[data-act="open"]')) {
            window.location.href = `../quests/quest.html?id=${encodeURIComponent(quest.dataset.questId)}`;
        }
        return;
    }
    const el = event.target.closest('[data-act]');
    const row = el && el.closest('.dr-row');
    const list = row && row.closest('[data-kind]');
    if (!row || !list) return;
    const kind = list.dataset.kind, id = row.dataset.rowId, act = el.dataset.act;
    if (kind === 'daily') {
        const task = Vault.getDailyTasks().find(t => t.id === id);
        if (!task) return;
        if (act === 'check') { Vault.toggleDailyTask(id); TaskRow.animateCheck(row, !task.completedToday, task.xp); refreshAfterCheck(); if (!task.completedToday) setTimeout(() => typeof TimeLog !== 'undefined' && TimeLog.ask({ kind: 'daily', id: id }), 450); }
        else if (act === 'edit') window.location.href = TAB_LINKS.dailies.edit + encodeURIComponent(id);
        else if (act === 'list') { if (openChecklists.has(id)) openChecklists.delete(id); else openChecklists.add(id); renderPanel(); }
        else if (act === 'item') { Vault.toggleDailyChecklistItem(id, el.dataset.item); renderPanel(); }
    } else if (kind === 'todo') {
        const todo = Vault.getTodos().find(t => t.id === id);
        if (!todo) return;
        if (act === 'check') { Vault.toggleTodoComplete(id); TaskRow.animateCheck(row, !todo.completed, todo.xp); refreshAfterCheck(); if (!todo.completed) setTimeout(() => typeof TimeLog !== 'undefined' && TimeLog.ask({ kind: 'todo', id: id }), 450); }
        else if (act === 'edit') window.location.href = TAB_LINKS.todos.edit + encodeURIComponent(id);
        else if (act === 'list') { if (openChecklists.has(id)) openChecklists.delete(id); else openChecklists.add(id); renderPanel(); }
        else if (act === 'item') { Vault.toggleTodoChecklistItem(id, el.dataset.item); renderPanel(); }
    }
}

function setupToday() {
    const card = document.getElementById('home-today');
    const toggle = document.getElementById('home-today-toggle');
    const setOpen = (open) => { card.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
    // Open by default on wide screens, where there's room for it.
    if (window.matchMedia('(min-width: 860px)').matches) setOpen(true);
    toggle.addEventListener('click', () => setOpen(!card.classList.contains('open')));
    document.getElementById('home-tabs').addEventListener('click', (event) => {
        const b = event.target.closest('.home-tab');
        if (!b || b.dataset.tab === currentTab) return;
        const direction = TODAY_TABS.indexOf(b.dataset.tab) > TODAY_TABS.indexOf(currentTab) ? 1 : -1;
        currentTab = b.dataset.tab;
        renderTabs();
        renderPanel(direction);
    });
    const panel = document.getElementById('home-panel');
    panel.addEventListener('click', handlePanelClick);
    panel.addEventListener('keydown', (event) => {
        const main = event.target.closest('.dr-main');
        if (main && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); main.click(); }
    });
    HabitRow.bind(panel, {
        editHref: (habit) => `../../features/habits/create-habit.html?id=${encodeURIComponent(habit.id)}`,
        onChange: () => { renderHive(); }
    });
}

// ---- app grid: everything that isn't in the bottom dock ----
const APP_ICONS = {
    'hive-life': '<ellipse cx="14" cy="16.5" rx="5" ry="7"/><path d="M9.3 14.5h9.4M9.3 18.5h9.4"/><path d="M10 11C6 6 3 8.5 5 12s5 3 5 3M18 11c4-5 7-2.5 5 1s-5 3-5 3"/><path d="M12.5 9.5 11 6M15.5 9.5 17 6"/>',
    'hive-mind': '<path d="M14 3.5 20.5 7.2v7.6L14 18.5l-6.5-3.7V7.2z"/><path d="M7.5 14.8 1.8 18v6.6l5.7 3.2 5.7-3.2V18M20.5 14.8l5.7 3.2v6.6l-5.7 3.2-5.7-3.2V18"/>',
    models: '<path d="M9 3c0 6 10 8 10 14S9 19 9 25M19 3c0 6-10 8-10 14s10 2 10 8"/><path d="M10.5 7h7M10.5 21h7M12 11.5h4M12 16.5h4"/>',
    'honey-store': '<path d="M9 6h10M10 6v2.5C6.5 10 5.5 13 5.5 16.5c0 5 3.6 8 8.5 8s8.5-3 8.5-8c0-3.5-1-6.5-4.5-8V6"/><path d="M8 15c2 1.5 4 1.5 6 0s4-1.5 6 0"/><path d="M11 3.5h6"/>',
    skills: '<path d="M14 25V13"/><path d="M14 16c-5 0-8-3-8-8 5 0 8 3 8 8zM14 13c0-5 3-8 8-8 0 5-3 8-8 8z"/><path d="M9 25h10"/>',
    dictionary: '<path d="M4 6.5C7.5 5 11 5 14 7c3-2 6.5-2 10-.5v16c-3.5-1.5-7-1.5-10 .5-3-2-6.5-2-10-.5z"/><path d="M14 7v16"/>',
    map: '<path d="M3.5 7 10 4.5l8 3 6.5-2.5v16.5L18 24l-8-3-6.5 2.5z"/><path d="M10 4.5v16.5M18 7.5V24"/>',
    dashboard: '<path d="M4 23h20"/><rect x="6" y="13" width="3.5" height="7" rx="1"/><rect x="12.2" y="8" width="3.5" height="12" rx="1"/><rect x="18.5" y="4.5" width="3.5" height="15.5" rx="1"/>',
    profile: '<circle cx="14" cy="9.5" r="4.5"/><path d="M5 24c1-5 4.5-7.5 9-7.5s8 2.5 9 7.5"/>',
    projects: '<path d="M5 9h18v13H5z"/><path d="M10 9V6h8v3M5 14h18"/>',
    'plugin-hub': '<path d="M11 4.5h2.5a2 2 0 1 1 4 0H20v5.5a2 2 0 1 0 0 4V20h-5.5a2 2 0 1 0-4 0H5v-5.5a2 2 0 1 1 0-4V4.5z"/>',
    'hive-archive': '<rect x="4" y="5" width="20" height="5.5" rx="1.5"/><path d="M5.5 10.5V22a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V10.5M11.5 14.5h5"/>',
    settings: '<circle cx="14" cy="14" r="3.6"/><path d="M14 3.5v3M14 21.5v3M24.5 14h-3M6.5 14h-3M21.4 6.6l-2.1 2.1M8.7 19.3l-2.1 2.1M21.4 21.4l-2.1-2.1M8.7 8.7 6.6 6.6"/><circle cx="14" cy="14" r="7.5"/>',
    incubator: '<path d="M14 4.5c-4 0-6.5 5.5-6.5 10.2 0 4.2 2.8 7.3 6.5 7.3s6.5-3.1 6.5-7.3C20.5 10 18 4.5 14 4.5z"/><path d="M5 23.5h18M8 23.5v-2M20 23.5v-2"/>',
    notifications: '<path d="M8 19.5V13a6 6 0 0 1 12 0v6.5l2 2H6z"/><path d="M11.8 23.5a2.4 2.4 0 0 0 4.4 0M14 4.5v2.5"/>',
    plugin: '<path d="M14 3.5 23 8.7v10.6L14 24.5 5 19.3V8.7z"/><path d="M14 9v10M9 14h10"/>'
};
// One grid, no categories (Craft, 2026-10-10) - like a phone's home
// screen. Hold any app to rearrange (apps wiggle), drag, then tap Done.
// The order is kept in the save (state.homeAppOrder), so it follows you.
const HOME_APPS = [
    { key: 'hive-mind', label: 'Hive Mind' }, { key: 'hive-life', label: 'Hive Life', href: '../hive-mind/hive-mind.html?view=life' }, { key: 'models', label: 'Bee Models' }, { key: 'honey-store', label: 'Honey Mart' },   // Nov 1 2026 (Craft): renamed
    { key: 'skills', label: 'Skills' }, { key: 'map', label: 'Map' },
    { key: 'dashboard', label: 'Dashboard' }, { key: 'profile', label: 'Profile' }, { key: 'plugin-hub', label: 'Plugins' },
    { key: 'hive-archive', label: 'Hive Archive' }, { key: 'notifications', label: 'Notifications' }, { key: 'settings', label: 'Settings' }
];
// Habits and To-Dos are in the dock, so only the other installed plugins
// (Calendar, Study...) join the grid.
const DOCK_PLUGINS = ['habits', 'todos'];

function installedPluginApps() {
    if (typeof Plugins === 'undefined') return [];
    return Plugins.getCatalog()
        .filter(entry => Plugins.isEnabled(entry.id) && !DOCK_PLUGINS.includes(entry.id))
        .map(entry => ({ key: entry.id, label: entry.label, base: 'plugins' }));
}

function hrefFor(app) {
    if (app.href) return app.href;   // Nov 2026 (Craft): Hive Life opens inside the hive
    if (app.path) return `../../../${app.path}`;   // Nov 1 2026 (Craft): a pinned menu page
    const d = app.dir || app.key;
    return app.base === 'plugins' ? `../../plugins/${d}/${d}.html` : `../${d}/${d}.html`;
}

// Nov 1 2026 (Craft; from 1.0.7, approved demo): Home tiles you choose (HomeTiles in
// core/ui/hive-mind/hive-mind.js). Pages from the menu show their emoji.
function tileCatalog() {
    const all = [...HOME_APPS, ...installedPluginApps()];
    const have = new Set(all.map(a => a.key));
    const extra = typeof HomeTiles === 'undefined' ? [] : HomeTiles.menuPages()
        .filter(p => !have.has(p.key) && !DOCK_PLUGINS.includes(p.key))
        .map(p => ({ key: p.key, label: p.label, emoji: p.icon, path: p.path }));
    return [...all, ...extra];
}
const tileOn = (key) => typeof HomeTiles === 'undefined' ? HOME_APPS.some(a => a.key === key) || installedPluginApps().some(a => a.key === key) : HomeTiles.isOn(key);

// Saved order first, then any tile the order doesn't know yet (new plugin or pin).
function orderedApps() {
    const all = tileCatalog().filter(a => tileOn(a.key));
    const saved = (Vault.state && Array.isArray(Vault.state.homeAppOrder)) ? Vault.state.homeAppOrder : [];
    const byKey = new Map(all.map(a => [a.key, a]));
    const out = saved.filter(k => byKey.has(k)).map(k => byKey.get(k));
    all.forEach(a => { if (!saved.includes(a.key)) { const at = a.key === 'hive-life' ? out.findIndex(x => x.key === 'hive-mind') : -1; if (at >= 0) out.splice(at + 1, 0, a); else out.push(a); } });
    return out;
}

const tileIcon = (app) => APP_ICONS[app.key] ? `<svg viewBox="0 0 28 28">${APP_ICONS[app.key]}</svg>`
    : app.emoji ? `<span class="home-app-emoji">${app.emoji}</span>` : `<svg viewBox="0 0 28 28">${APP_ICONS.plugin}</svg>`;

let homeGridEditing = false;
function renderAppGrid() {
    const section = document.getElementById('home-app-grid');
    section.innerHTML = `
        <div class="home-apps-bar"><span class="home-apps-hint" id="home-apps-hint">${homeGridEditing ? 'Drag to move · ✕ to remove' : 'Hold an app to edit Home'}</span>
            <span class="home-apps-btns"><button type="button" class="home-apps-reset" id="home-apps-reset"${homeGridEditing ? '' : ' hidden'}>Reset Home</button>
            <button type="button" class="home-apps-done" id="home-apps-done"${homeGridEditing ? '' : ' hidden'}>Done</button></span></div>
        <div class="home-app-grid${homeGridEditing ? ' editing' : ''}" id="home-app-list">${orderedApps().map(app => `
            <a class="home-app" data-key="${app.key}" href="${hrefFor(app)}" draggable="false">
                <span class="home-app-ic" aria-hidden="true">${tileIcon(app)}</span>
                <span class="home-app-label">${escapeHTML(app.label)}</span>
                <button type="button" class="home-app-x" data-remove="${app.key}" aria-label="Remove ${escapeHTML(app.label)} from Home">✕</button>
            </a>`).join('')}
            <button type="button" class="home-app home-app-add" id="home-app-add" aria-label="Add a page to Home">
                <span class="home-app-ic" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M14 8v12M8 14h12"/></svg></span>
                <span class="home-app-label">Add</span></button>
        </div>`;
    setupAppGridEditing();
}

// ＋ tile: every page that isn't on Home yet.
function openAddTile() {
    const off = tileCatalog().filter(a => !tileOn(a.key));
    const el = document.createElement('div');
    el.className = 'app-create-sheet';
    el.innerHTML = `<div class="acs-card" role="dialog" aria-modal="true" aria-label="Add to Home"><h3>Add to Home</h3>
        ${off.length ? `<div class="acs-grid home-add-grid">${off.map(a => `<button type="button" class="acs-opt" data-add="${a.key}">${APP_ICONS[a.key] ? `<svg viewBox="0 0 28 28">${APP_ICONS[a.key]}</svg>` : `<span class="home-add-emoji">${a.emoji || '🧩'}</span>`}<span>${escapeHTML(a.label)}</span></button>`).join('')}</div>`
            : '<p class="home-add-none">Every page is already on Home.</p>'}
        <p class="home-add-tip">You can also hold a page in the menu to pin it.</p></div>`;
    const close = () => el.remove();
    el.addEventListener('click', e => {
        const b = e.target.closest('[data-add]');
        if (b) { HomeTiles.set(b.dataset.add, true); close(); renderAppGrid(); return; }
        if (e.target === el) close();
    });
    document.body.appendChild(el);
}

// Hold (0.45s) -> edit mode; drag to move (the others slide over); Done saves.
function setupAppGridEditing() {
    const grid = document.getElementById('home-app-list');
    const done = document.getElementById('home-apps-done');
    const hint = document.getElementById('home-apps-hint');
    let editing = homeGridEditing, holdTimer = null, drag = null, held = false;
    const reset = document.getElementById('home-apps-reset');

    const save = () => {
        Vault.state.homeAppOrder = [...grid.querySelectorAll('.home-app[data-key]')].map(a => a.dataset.key);
        Vault.save();
    };
    const startEditing = () => {
        editing = homeGridEditing = true;
        grid.classList.add('editing');
        done.hidden = false; reset.hidden = false;
        hint.textContent = 'Drag to move · ✕ to remove';
        if (navigator.vibrate) navigator.vibrate(15);
    };
    const stopEditing = () => {
        editing = homeGridEditing = false;
        grid.classList.remove('editing');
        done.hidden = true; reset.hidden = true;
        hint.textContent = 'Hold an app to edit Home';
        save();
    };
    done.addEventListener('click', stopEditing);
    // Nov 1 2026 (Craft): remove a tile, add one, or go back to the default Home.
    reset.addEventListener('click', () => { HomeTiles.reset(); homeGridEditing = false; renderAppGrid(); if (typeof Toast !== 'undefined') Toast.show('Home is back to the default tiles.', 'neutral'); });
    document.getElementById('home-app-add').addEventListener('click', openAddTile);
    grid.addEventListener('click', e => {
        const x = e.target.closest('[data-remove]');
        if (!x) return;
        e.preventDefault(); e.stopPropagation();
        save(); HomeTiles.set(x.dataset.remove, false); renderAppGrid();
    }, true);

    // In edit mode (or right after a hold) a tap doesn't open the app.
    grid.addEventListener('click', e => { if ((editing || held) && e.target.closest('.home-app')) { e.preventDefault(); held = false; } });
    grid.addEventListener('contextmenu', e => { if (e.target.closest('.home-app')) e.preventDefault(); });
    grid.addEventListener('dragstart', e => e.preventDefault());
    document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });

    grid.addEventListener('pointerdown', e => {
        const app = e.target.closest('.home-app[data-key]');
        if (!app || e.target.closest('[data-remove]')) return;
        held = false;
        if (editing) { beginDrag(app, e); return; }
        const start = { x: e.clientX, y: e.clientY };
        holdTimer = setTimeout(() => { holdTimer = null; held = true; startEditing(); beginDrag(app, e); }, 450);
        const cancel = (ev) => {
            if (ev.type === 'pointermove' && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return;
            clearTimeout(holdTimer); holdTimer = null;
            window.removeEventListener('pointermove', cancel); window.removeEventListener('pointerup', cancel);
        };
        window.addEventListener('pointermove', cancel); window.addEventListener('pointerup', cancel);
    });

    function beginDrag(app, e) {
        const ghost = app.cloneNode(true);
        ghost.classList.add('home-app-ghost');
        ghost.style.left = `${e.clientX}px`; ghost.style.top = `${e.clientY}px`;
        document.body.appendChild(ghost);
        app.classList.add('lifted');
        drag = { app, ghost };
        window.addEventListener('pointermove', moveDrag);
        window.addEventListener('pointerup', endDrag, { once: true });
        window.addEventListener('pointercancel', endDrag, { once: true });
    }
    function moveDrag(e) {
        if (!drag) return;
        drag.ghost.style.left = `${e.clientX}px`; drag.ghost.style.top = `${e.clientY}px`;
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const target = over && over.closest('#home-app-list .home-app[data-key]');
        if (!target || target === drag.app) return;
        const apps = [...grid.children];
        const before = new Map(apps.map(a => [a, a.getBoundingClientRect()]));
        const from = apps.indexOf(drag.app), to = apps.indexOf(target);
        grid.insertBefore(drag.app, to > from ? target.nextSibling : target);
        apps.forEach(a => {
            const b = before.get(a), n = a.getBoundingClientRect();
            const dx = b.left - n.left, dy = b.top - n.top;
            if (dx || dy) a.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.3,1.2,.4,1)' });
        });
    }
    function endDrag() {
        if (!drag) return;
        drag.ghost.remove();
        drag.app.classList.remove('lifted');
        drag = null;
        window.removeEventListener('pointermove', moveDrag);
        save();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderHive();
    renderBeeHelp();
    renderToday();
    renderAppGrid();
    window.addEventListener('home-tiles-changed', () => renderAppGrid());   // Nov 1 2026 (Craft): pinned from the menu
    if (new URLSearchParams(location.search).get('devdone') === '1') setTimeout(openDoneToday, 600);   // dev tools
    setupToday();

    Waggle.setActions(baseWaggleActions());
});
