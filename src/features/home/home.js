console.log("/// HOME PROTOCOLS INITIALIZED ///");

// Home (rebuilt 2026-10-08 from the approved demo, Craft):
//   - your royal + name + level bar now live in the app's top bar (app.js
//     AppShell), full size on this page - the Level Up button is there too
//   - hive strip: bees / honey cells / decayed cells, taps through to the hive
//   - Today: a dropdown (closed by default) with Dailies / Habits / To-Dos /
//     Quest tabs, so the day can be checked off without leaving Home
//   - the app grid: every page that isn't in the bottom dock

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TODAY_TABS = ['dailies', 'habits', 'todos', 'quest'];
const TAB_LINKS = {
    dailies: { href: '../dailies/dailies.html', label: 'Open Dailies' },
    habits: { href: '../../plugins/habits/habits.html', label: 'Open Habits' },
    todos: { href: '../../plugins/todos/todos.html', label: 'Open To-Dos' },
    quest: { href: '../quests/quests.html', label: 'Open Quests' }
};
let currentTab = 'dailies';

function pluginOn(id) {
    return typeof Plugins === 'undefined' || Plugins.isEnabled(id);
}

function localDateISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// ---- hive strip ----
function renderHive() {
    const hive = Vault.getHiveHoney();
    document.getElementById('home-hive-bees').textContent = hive.bees;
    document.getElementById('home-hive-honey').textContent = Math.max(0, hive.lit - hive.decay);
    document.getElementById('home-hive-decay').textContent = hive.decay;
}

// ---- Today ----
const hexCheck = `<svg viewBox="0 0 30 32" aria-hidden="true">
    <polygon class="hc-cell" points="15,1.5 28,9 28,23 15,30.5 2,23 2,9"/>
    <polygon class="hc-fill" points="15,4 25.6,10.2 25.6,21.8 15,28 4.4,21.8 4.4,10.2"/>
    <path class="hc-tick" d="M9.5 16.5 L13.5 20.5 L21 12"/></svg>`;

function checkRow({ id, kind, label, sub, done, dp, due }) {
    return `<li class="home-row${done ? ' done' : ''}" data-kind="${kind}" data-id="${escapeHTML(id)}">
        <button type="button" class="home-check" data-act="check" aria-label="${done ? 'Undo' : 'Check off'}: ${escapeHTML(label)}">${hexCheck}</button>
        <div class="home-row-text"><span>${escapeHTML(label)}</span>${sub ? `<small>${escapeHTML(sub)}</small>` : ''}</div>
        ${due && !done ? `<span class="home-due${due === 'Today' || due === 'Overdue' ? '' : ' soon'}">${escapeHTML(due)}</span>` : `<span class="home-dp">+${dp}</span>`}
    </li>`;
}

function dueLabel(dueDate) {
    if (!dueDate) return '';
    if (dueDate < localDateISO(0)) return 'Overdue';
    if (dueDate === localDateISO(0)) return 'Today';
    if (dueDate === localDateISO(1)) return 'Tomorrow';
    return dueDate.slice(5).replace('-', '/');
}

function emptyState(icon, text) {
    return `<div class="home-empty"><b>${icon}</b>${text}</div>`;
}

function renderPanel(direction) {
    const data = todayData();
    const panel = document.getElementById('home-panel');
    let html = '';

    if (currentTab === 'dailies') {
        html = data.dailies.length
            ? `<ul class="home-list">${data.dailies.map(t => checkRow({ id: t.id, kind: 'daily', label: t.label, sub: t.difficulty || '', done: t.completedToday, dp: t.dp })).join('')}</ul>`
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
                ? `<ul class="home-list">${[...open, ...done].map(t => {
                    const steps = (t.checklist || []).length;
                    const stepsDone = (t.checklist || []).filter(c => c.done || c.completed).length;
                    return checkRow({ id: t.id, kind: 'todo', label: t.label, sub: steps ? `${stepsDone} of ${steps} steps` : '', done: t.completed, dp: t.dp, due: dueLabel(t.dueDate) });
                }).join('')}</ul>`
                : emptyState('📝', 'Nothing to do. Nice.');
        }
    } else if (currentTab === 'quest') {
        const q = data.quest;
        html = q
            ? `<p class="home-quest-title">🎯 ${escapeHTML(q.title)}</p><ul class="home-list">${(q.tasks || []).map(t => checkRow({ id: t.id, kind: 'quest', label: t.label, done: t.completed, dp: t.dp })).join('')}</ul>`
            : emptyState('🎯', 'No active quest yet. Pick one on the Quests tab.');
    }

    panel.innerHTML = html;
    const list = panel.querySelector('.home-list, .home-habits, .home-empty');
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
    const today = localDateISO(0);
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

function floatAt(row, text, cls) {
    const f = document.createElement('span');
    f.className = `home-float ${cls}`;
    f.textContent = text;
    row.appendChild(f);
    setTimeout(() => f.remove(), 1100);
}

function handleCheck(button) {
    const row = button.closest('.home-row');
    const { kind, id } = row.dataset;
    let nowDone = false, dp = 0;
    if (kind === 'daily') {
        const before = Vault.getDailyTasks().find(t => t.id === id);
        if (!before) return;
        Vault.toggleDailyTask(id);
        nowDone = !before.completedToday; dp = before.dp;
    } else if (kind === 'todo') {
        const before = Vault.getTodos().find(t => t.id === id);
        if (!before) return;
        Vault.toggleTodoComplete(id);
        nowDone = !before.completed; dp = before.dp;
    } else if (kind === 'quest') {
        const quest = Vault.getQuests().find(q => q.id === Vault.getActiveQuestId());
        const task = quest && (quest.tasks || []).find(t => t.id === id);
        if (!task) return;
        Vault.toggleTask(quest.id, id);
        nowDone = !task.completed; dp = task.dp;
    }
    row.classList.toggle('done', nowDone);
    button.setAttribute('aria-label', `${nowDone ? 'Undo' : 'Check off'}: ${row.querySelector('.home-row-text span').textContent}`);
    if (nowDone) {
        button.classList.remove('home-pop'); void button.offsetWidth; button.classList.add('home-pop');
        const ripple = document.createElement('span');
        ripple.className = 'home-ripple';
        row.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
        floatAt(row, `+${dp} DP`, 'good');
        if (navigator.vibrate) navigator.vibrate(25);
    } else {
        floatAt(row, `−${dp} DP`, 'bad');
    }
    renderHive();
    setTimeout(() => { renderTabs(); renderRing(); if (kind !== 'daily') renderPanel(); }, nowDone && kind !== 'daily' ? 650 : 0);
}

function setupToday() {
    const card = document.getElementById('home-today');
    const toggle = document.getElementById('home-today-toggle');
    toggle.addEventListener('click', () => {
        const open = card.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
    });
    document.getElementById('home-tabs').addEventListener('click', (event) => {
        const b = event.target.closest('.home-tab');
        if (!b || b.dataset.tab === currentTab) return;
        const direction = TODAY_TABS.indexOf(b.dataset.tab) > TODAY_TABS.indexOf(currentTab) ? 1 : -1;
        currentTab = b.dataset.tab;
        renderTabs();
        renderPanel(direction);
    });
    const panel = document.getElementById('home-panel');
    panel.addEventListener('click', (event) => {
        const b = event.target.closest('[data-act="check"]');
        if (b) handleCheck(b);
    });
    HabitRow.bind(panel, {
        editHref: (habit) => `../../plugins/habits/create-habit.html?id=${encodeURIComponent(habit.id)}`,
        onChange: () => { renderHive(); }
    });
}

// ---- app grid: everything that isn't in the bottom dock ----
const HOME_APP_DESTINATIONS = [
    { key: 'dashboard', icon: '👨🏾‍💻', label: 'Dashboard' },
    { key: 'map', icon: '🗺️', label: 'Map' },
    { key: 'skills', icon: '🌿', label: 'Skills' },
    { key: 'dictionary', icon: '📖', label: 'Dictionary' },
    { key: 'profile', icon: '🧘🏾', label: 'Profile' },
    { key: 'honey-store', icon: '🍯', label: 'Honey Store' },
    { key: 'plugin-hub', icon: '🧩', label: 'Plugins' },
    { key: 'hive-archive', icon: '📚', label: 'Hive Archive' },
    { key: 'models', icon: '🧬', label: 'Bee Models' },
    { key: 'settings', icon: '⚙️', label: 'Settings' }
];
// Habits and To-Dos are in the dock, so only the other installed plugins
// (Calendar, Study...) join the grid.
const DOCK_PLUGINS = ['habits', 'todos'];

function installedPluginDestinations() {
    if (typeof Plugins === 'undefined') return [];
    return Plugins.getCatalog()
        .filter(entry => Plugins.isEnabled(entry.id) && !DOCK_PLUGINS.includes(entry.id))
        .map(entry => ({ key: entry.id, icon: entry.icon, label: entry.label, base: 'plugins' }));
}

function hrefForDestination(item) {
    return item.base === 'plugins' ? `../../plugins/${item.key}/${item.key}.html` : `../${item.key}/${item.key}.html`;
}

function renderAppGrid() {
    const grid = document.getElementById('home-app-grid');
    const destinations = [...HOME_APP_DESTINATIONS, ...installedPluginDestinations()];
    grid.innerHTML = destinations.map(item => `
        <a class="home-app" href="${hrefForDestination(item)}">
            <span class="home-app-ic" aria-hidden="true">${item.icon}</span>
            <span class="home-app-label">${escapeHTML(item.label)}</span>
        </a>`).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderHive();
    renderToday();
    renderAppGrid();
    setupToday();

    Waggle.setActions(baseWaggleActions());
});
