// Shared by the Quests list, the Quest page and the Create / Edit Quest
// form (rebuilt 2026-10-09). Quests are long-term goals: things that take
// more than a day, broken into tasks. A quest finishes itself when every
// task is done (Vault._updateQuestCompletionState).

// Quests have no difficulty of their own (their tasks do), so their colour
// comes from the category instead.
const QUEST_STYLE = {
    main: { color: '#ffcc00', ink: '#2a1a00', label: 'Main' },
    side: { color: '#4fb3d9', ink: '#04202b', label: 'Side' }
};

// One-off task XP anchors - same scale as Eve's quest prompt.
const QUEST_DIFFICULTY_TIERS = [
    { level: 'Easy', xp: 25 },
    { level: 'Medium', xp: 60 },
    { level: 'Hard', xp: 120 }
];

const QuestUI = {
    esc(text) {
        return String(text == null ? '' : text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    style(quest) {
        return QUEST_STYLE[quest.category] || QUEST_STYLE.main;
    },

    styleAttr(quest) {
        const s = this.style(quest);
        return `--qc:${s.color};--qk:${s.ink}`;
    },

    progress(quest) {
        const tasks = quest.tasks || [];
        const done = tasks.filter(t => t.completed);
        const max = tasks.reduce((sum, t) => sum + (Number(t.xp) || 0), 0);
        const earned = done.reduce((sum, t) => sum + (Number(t.xp) || 0), 0);
        return {
            done: done.length,
            total: tasks.length,
            earned,
            max,
            pct: tasks.length ? Math.round(done.length / tasks.length * 100) : 0
        };
    },

    shortDate(iso) {
        if (!iso) return '';
        const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
        if (!y) return '';
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString(undefined, y === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
    },

    // "Day 12" - how long a quest has been going (long-term goals, so the
    // count of days matters more than the start date itself).
    daysIn(quest) {
        const day = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
        if (!quest.dateStarted) return 0;
        const now = new Date();
        const end = quest.dateCompleted ? day(quest.dateCompleted) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.max(1, Math.round((end - day(quest.dateStarted)) / 86400000) + 1);
    },

    // Honeycomb progress ring: a hexagon outline that fills as tasks finish.
    ring(pct, size = 56) {
        const hex = '28,3 50,15.5 50,40.5 28,53 6,40.5 6,15.5';
        const per = 6 * 25; // ~perimeter of the hexagon path
        return `<svg class="q-ring" viewBox="0 0 56 56" width="${size}" height="${size}" aria-hidden="true">
            <polygon class="q-ring-bg" points="${hex}"/>
            <polygon class="q-ring-fg" points="${hex}" pathLength="${per}" style="stroke-dasharray:${per};stroke-dashoffset:${per - per * pct / 100}"/>
            <text x="28" y="32.5" text-anchor="middle">${pct}%</text></svg>`;
    },

    TARGET_ICON: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/></svg>',

    // The quest in focus, with its progress and next few tasks to check
    // off (Quests page and Home's Today panel). null = nothing in focus.
    focusCardHTML(quest) {
        if (!quest) {
            return `<div class="qa-empty">${this.TARGET_ICON}<div><b>No quest in focus</b><span>Tap 🎯 on a quest to pin it here and on Home.</span></div></div>`;
        }
        const p = this.progress(quest);
        const open = (quest.tasks || []).filter(t => !t.completed);
        const next = open.slice(0, 3);
        const done = quest.status === 'completed';
        return `<div class="qa-card" data-quest-id="${this.esc(quest.id)}" style="${this.styleAttr(quest)}">
            <div class="qa-top">
                <span class="qa-tag">${this.TARGET_ICON} IN FOCUS · ${this.style(quest).label.toUpperCase()}</span>
                ${quest.dateStarted ? `<span class="qa-day">Day ${this.daysIn(quest)}</span>` : ''}
            </div>
            <button type="button" class="qa-title" data-act="open">${this.esc(quest.title)}</button>
            ${quest.objective ? `<p class="qa-obj">${this.esc(quest.objective)}</p>` : ''}
            <div class="qa-prog">
                <div class="qa-bar"><i style="width:${p.pct}%"></i></div>
                <div class="qa-nums"><span><b>${p.done}</b> of ${p.total} tasks</span><span><b>${p.earned}</b> / ${p.max} XP</span></div>
            </div>
            ${done
                ? '<p class="qa-done">🏆 Every task is done. Pick your next quest to focus on.</p>'
                : next.length ? `<p class="qa-next-h">Up next</p><ul class="qt-list">${next.map(t => this.taskRowHTML(t, { compact: true })).join('')}</ul>` : ''}
            <button type="button" class="qa-open" data-act="open">${open.length > next.length ? `See all ${p.total} tasks` : 'Open quest'} <span aria-hidden="true">→</span></button>
        </div>`;
    },

    // 348 -> "5:48", 4920 -> "1 h 22 min"
    fmtDur(sec) {
        sec = Math.round(Number(sec) || 0);
        if (sec >= 3600) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return m ? `${h} h ${m} min` : `${h} h`; }
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    },
    fmtTotal(sec) {
        const m = Math.round((Number(sec) || 0) / 60);
        if (m < 60) return `${m} min`;
        const h = m / 60;
        return `${h >= 10 ? Math.round(h * 10) / 10 : Math.round(h * 10) / 10} hrs`;
    },
    // Ghost challenges: one little ghost each, green once done.
    ghostsHTML(done, total) {
        const g = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a5.5 5.5 0 0 0-5.5 5.5v7.5l1.8-1.4 1.8 1.4L8 13.1l1.9 1.4 1.8-1.4 1.8 1.4V7A5.5 5.5 0 0 0 8 1.5z"/><circle cx="6" cy="7" r="1" fill="#120e07"/><circle cx="10" cy="7" r="1" fill="#120e07"/></svg>';
        const icons = Array.from({ length: Math.min(total, 12) }, (_, i) => `<i class="${i < done ? 'on' : ''}">${g}</i>`).join('');
        return `<span class="qt-ghosts" title="${done} of ${total} ghost challenges done">${icons}${total > 12 ? `<b>+${total - 12}</b>` : ''}</span>`;
    },

    taskStyle(task) {
        return HABIT_DIFFICULTY_STYLE[task.difficulty] || HABIT_DIFFICULTY_STYLE.Easy;
    },

    // A quest task row with a hexagon check in its difficulty colour.
    // Uses the shared Dailies / To-Dos check look (src/core/ui/task-row/).
    taskRowHTML(task, { compact = false } = {}) {
        const s = this.taskStyle(task);
        const label = task.link
            ? `<a class="qt-label" href="${this.esc(task.link)}" target="_blank" rel="noopener noreferrer" data-no-hold>${this.esc(task.label)} <span aria-hidden="true">↗</span></a>`
            : `<span class="qt-label">${this.esc(task.label)}</span>`;
        const meta = [`<span class="dr-xp">+${task.xp} XP</span>`];
        // Course lessons (Oct 2026): exact length and the ghost challenges in it.
        if (!compact && (task.durSec || task.minutes)) meta.push(`<span class="qt-dur">⏱ ${this.fmtDur(task.durSec || task.minutes * 60)}</span>`);
        if (!compact && task.ghosts) meta.push(this.ghostsHTML(task.ghostsDone || 0, task.ghosts));
        if (!compact && task.difficulty) meta.unshift(`<span class="qt-diff">${this.esc(task.difficulty)}</span>`);
        if (!compact && task.completed && task.dateCompleted) meta.push(`<span class="qt-when">✓ ${this.esc(this.shortDate(task.dateCompleted))}</span>`);
        return `<li class="qt dr-row hand-row${task.completed ? ' done' : ''}" data-task-id="${this.esc(task.id)}" style="--dc:${s.color};--dk:${s.ink}">
            ${TaskRow.checkButton(task, !!task.completed)}
            <div class="qt-text hand-text">${label}<div class="qt-meta">${meta.join('')}</div></div>
        </li>`;
    },

    // Check a task off (or back on), with the shared pop / +XP float.
    // Returns the fresh quest. Toasts when the whole quest finishes.
    toggleTask(questId, taskId, rowEl) {
        const before = Vault.getQuests().find(q => q.id === questId);
        const task = before && (before.tasks || []).find(t => t.id === taskId);
        if (!task) return null;
        const wasDone = before.status === 'completed';
        const nowDone = !task.completed;
        const quest = Vault.toggleTask(questId, taskId);
        if (rowEl) TaskRow.animateCheck(rowEl, nowDone, task.xp);
        // Course lessons already know their length - no "how long?" pop-up.
        if (nowDone && !task.durSec) setTimeout(() => typeof TimeLog !== 'undefined' && TimeLog.ask({ kind: 'quest', id: taskId, questId }), 450);
        if (quest && !wasDone && quest.status === 'completed') {
            Toast.show(`🏆 Quest complete: ${quest.title}`, 'positive');
            if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
        }
        return quest;
    }
};
