console.log("/// HOME PROTOCOLS INITIALIZED ///");

// Home (rebuilt 2026-10-08, refreshed 2026-10-09 - Craft):
//   - your royal + name + level bar live in the app's top bar (app.js
//     AppShell), full size on this page - the Level Up button is there too
//   - hive strip: four stats, each opening its own page (bees -> Colony,
//     XP today -> Dashboard, best streak -> Dailies, focus quest -> Quests)
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

// XP earned today across everything (habits count + and −).
function xpToday() {
    const today = todayISO();
    let xp = 0;
    Vault.getDailyTasks().forEach(t => { if ((t.completedDates || []).includes(today)) xp += Number(t.xp) || 0; });
    Vault.getTodos().forEach(t => { if (t.completed && t.completedDate === today) xp += Number(t.xp) || 0; });
    Vault.getQuests().forEach(q => (q.tasks || []).forEach(t => { if (t.completed && String(t.dateCompleted || '').slice(0, 10) === today) xp += Number(t.xp) || 0; }));
    (Vault.getHabits ? Vault.getHabits() : []).forEach(h => (h.history || []).forEach(x => {
        if (x.date === today) xp += (x.direction === 'positive' ? 1 : -1) * (Number(h.xp) || 0);
    }));
    return xp;
}

// ---- hive strip: four stats, each to its own page ----
const STRIP_ICONS = {
    bees: '<path d="M12 6.5a3 3 0 1 1 0 .1"/><path d="M8.5 11h7l-.8 7.5a2.7 2.7 0 0 1-5.4 0z"/><path d="M8.8 14h6.4M9.2 16.8h5.6M8.5 11C5 8 3 9.5 4.2 11.8S8.2 13 8.5 11zM15.5 11c3.5-3 5.5-1.5 4.3.8S15.8 13 15.5 11z"/>',
    xp: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    streak: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.7 1.9 1.8 3 3 3.4-.2-2.6.8-5.3 2.9-6.9.1 3.4 3.5 6 3.5 10.4C18.5 18.2 16 21 12 21z"/><path d="M12 21c-1.7 0-2.8-1.2-2.8-2.8 0-1.8 1.6-2.7 2.2-4.2.9 1.5 3.4 2.4 3.4 4.4 0 1.5-1.2 2.6-2.8 2.6z"/>',
    quest: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>'
};

function renderHive() {
    const hive = Vault.getHiveHoney();
    const streak = Vault.getDailyTasks().reduce((m, t) => Math.max(m, t.streak || 0), 0);
    const quest = Vault.getQuests().find(q => q.id === Vault.getActiveQuestId());
    const qp = quest && typeof QuestUI !== 'undefined' ? QuestUI.progress(quest).pct : null;
    const xp = xpToday();
    const stats = [
        { key: 'bees', value: hive.bees, label: 'Bees', href: '../colony/colony.html', color: '#ffcc00' },
        { key: 'xp', value: `${xp > 0 ? '+' : ''}${xp}`, label: 'XP today', href: '../dashboard/dashboard.html', color: '#34c77b' },
        { key: 'streak', value: streak, label: 'Best streak', href: '../dailies/dailies.html', color: '#ff8a3d' },
        { key: 'quest', value: qp === null ? '—' : `${qp}%`, label: quest ? 'Focus quest' : 'No focus', href: quest ? `../quests/quest.html?id=${encodeURIComponent(quest.id)}` : '../quests/quests.html', color: '#4fb3d9' }
    ];
    document.getElementById('home-hive').innerHTML = stats.map(s => `
        <a class="home-stat" href="${s.href}" style="--sc:${s.color}" aria-label="${escapeHTML(s.label)}: ${escapeHTML(s.value)}">
            <svg viewBox="0 0 24 24" aria-hidden="true">${STRIP_ICONS[s.key]}</svg>
            <b>${escapeHTML(s.value)}</b><small>${escapeHTML(s.label)}</small>
        </a>`).join('');
}

// ---- Bees that need help (Hive Life moods) ----
// 😢 hungry / tired / hurt, 😠 no job for 3+ days, 😵 fainted. One line,
// tap to open Colony Bees on the "Need help" filter. Hidden when all is well.
function renderBeeHelp() {
    const el = document.getElementById('home-help');
    if (!el || typeof beeFeeling !== 'function') return;
    const bees = Vault.getColonyBees().filter(b => b.rarity !== 'Royal');
    const count = (k) => bees.filter(b => beeFeeling(b).key === k).length;
    const sad = count('sad'), upset = count('upset'), faint = count('fainted');
    const total = sad + upset + faint;
    el.hidden = !total;
    if (!total) return;
    const parts = [
        sad ? `😢 ${sad} hungry, tired or hurt` : '',
        upset ? `😠 ${upset} with no job` : '',
        faint ? `😵 ${faint} fainted` : ''
    ].filter(Boolean);
    el.setAttribute('aria-label', `${total} bee${total === 1 ? ' needs' : 's need'} help: ${parts.join(', ')}`);
    el.innerHTML = `<span class="home-help-ic" aria-hidden="true">${upset ? '😠' : faint ? '😵' : '😢'}</span>
        <span class="home-help-t"><b>${total} bee${total === 1 ? ' needs' : 's need'} help</b><small>${parts.join(' · ')}</small></span>
        <span class="home-help-go" aria-hidden="true">›</span>`;
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
    colony: '<path d="M14 3.5 20.5 7.2v7.6L14 18.5l-6.5-3.7V7.2z"/><path d="M7.5 14.8 1.8 18v6.6l5.7 3.2 5.7-3.2V18M20.5 14.8l5.7 3.2v6.6l-5.7 3.2-5.7-3.2V18"/>',
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
    plugin: '<path d="M14 3.5 23 8.7v10.6L14 24.5 5 19.3V8.7z"/><path d="M14 9v10M9 14h10"/>'
};
// One grid, no categories (Craft, 2026-10-10) - like a phone's home
// screen. Hold any app to rearrange (apps wiggle), drag, then tap Done.
// The order is kept in the save (state.homeAppOrder), so it follows you.
const HOME_APPS = [
    { key: 'colony', label: 'Colony' }, { key: 'models', label: 'Bee Models' }, { key: 'honey-store', label: 'Honey Store' },
    { key: 'skills', label: 'Skills' }, { key: 'map', label: 'Map' },
    { key: 'dashboard', label: 'Dashboard' }, { key: 'profile', label: 'Profile' }, { key: 'plugin-hub', label: 'Plugins' },
    { key: 'hive-archive', label: 'Hive Archive' }, { key: 'settings', label: 'Settings' }
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
    return app.base === 'plugins' ? `../../plugins/${app.key}/${app.key}.html` : `../${app.key}/${app.key}.html`;
}

// Saved order first, then any app the order doesn't know yet (new plugin).
function orderedApps() {
    const all = [...HOME_APPS, ...installedPluginApps()];
    const saved = (Vault.state && Array.isArray(Vault.state.homeAppOrder)) ? Vault.state.homeAppOrder : [];
    const byKey = new Map(all.map(a => [a.key, a]));
    const out = saved.filter(k => byKey.has(k)).map(k => byKey.get(k));
    all.forEach(a => { if (!saved.includes(a.key)) out.push(a); });
    return out;
}

function renderAppGrid() {
    const section = document.getElementById('home-app-grid');
    section.innerHTML = `
        <div class="home-apps-bar"><span class="home-apps-hint" id="home-apps-hint">Hold an app to move it</span>
            <button type="button" class="home-apps-done" id="home-apps-done" hidden>Done</button></div>
        <div class="home-app-grid" id="home-app-list">${orderedApps().map(app => `
            <a class="home-app" data-key="${app.key}" href="${hrefFor(app)}" draggable="false">
                <span class="home-app-ic" aria-hidden="true"><svg viewBox="0 0 28 28">${APP_ICONS[app.key] || APP_ICONS.plugin}</svg></span>
                <span class="home-app-label">${escapeHTML(app.label)}</span>
            </a>`).join('')}
        </div>`;
    setupAppGridEditing();
}

// Hold (0.45s) -> edit mode; drag to move (the others slide over); Done saves.
function setupAppGridEditing() {
    const grid = document.getElementById('home-app-list');
    const done = document.getElementById('home-apps-done');
    const hint = document.getElementById('home-apps-hint');
    let editing = false, holdTimer = null, drag = null, held = false;

    const save = () => {
        Vault.state.homeAppOrder = [...grid.children].map(a => a.dataset.key);
        Vault.save();
    };
    const startEditing = () => {
        editing = true;
        grid.classList.add('editing');
        done.hidden = false;
        hint.textContent = 'Drag apps to move them';
        if (navigator.vibrate) navigator.vibrate(15);
    };
    const stopEditing = () => {
        editing = false;
        grid.classList.remove('editing');
        done.hidden = true;
        hint.textContent = 'Hold an app to move it';
        save();
    };
    done.addEventListener('click', stopEditing);

    // In edit mode (or right after a hold) a tap doesn't open the app.
    grid.addEventListener('click', e => { if ((editing || held) && e.target.closest('.home-app')) { e.preventDefault(); held = false; } });
    grid.addEventListener('contextmenu', e => { if (e.target.closest('.home-app')) e.preventDefault(); });
    grid.addEventListener('dragstart', e => e.preventDefault());
    document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });

    grid.addEventListener('pointerdown', e => {
        const app = e.target.closest('.home-app');
        if (!app) return;
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
        const target = over && over.closest('#home-app-list .home-app');
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
    setupToday();

    Waggle.setActions(baseWaggleActions());
});
