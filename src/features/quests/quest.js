console.log("/// QUEST PAGE PROTOCOLS INITIALIZED ///");

// One quest, full page (2026-10-09; replaces the old "View Intel" pop-up).
// Top: the quest in its category colour, with Focus and Edit. Then the
// progress numbers, every task (check them off here, or add one), and the
// extras a quest can carry: source, related Dictionary terms, the Queen's
// Decree, Ghost Logs, side quests, Codex unlocks, repo task, quiz and
// patch notes. Raw JSON editing sits under "Advanced" at the bottom.
// Editing the title / objective / category / tasks: create-quest.html?id=.

const GHOST_STATES = [
    { key: 'pending', label: 'Pending', short: '–' },
    { key: 'red', label: 'Attempted', short: 'Tried' },
    { key: 'yellow', label: 'Partial', short: 'Partial' },
    { key: 'green', label: 'Full', short: 'Full' }
];

let questId = null;
let addingTask = false;
let addingGhost = false;
let newTaskDifficulty = 'Easy';
let armedGhost = null;

const esc = (t) => QuestUI.esc(t);

function getQuest() {
    return Vault.getQuests().find(q => q.id === questId) || null;
}

function heroHTML(quest) {
    const s = QuestUI.style(quest);
    const isActive = Vault.getActiveQuestId() === quest.id;
    const done = quest.status === 'completed';
    const parent = Vault.getParentQuestFor(quest.id);
    return `<section class="qd-hero">
        <div class="qd-bar">
            <a class="qd-icon" href="./quests.html" aria-label="Back to Quests"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7M8 12h12"/></svg></a>
            <span class="qd-chip">${s.label.toUpperCase()} QUEST${done ? ' · DONE' : ''}</span>
            <a class="qd-icon" href="./create-quest.html?id=${encodeURIComponent(quest.id)}" aria-label="Edit quest"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg></a>
        </div>
        ${parent ? `<a class="qd-parent" href="./quest.html?id=${encodeURIComponent(parent.id)}">↖ Part of ${esc(parent.title)}</a>` : ''}
        <h1 class="qd-title">${esc(quest.title)}</h1>
        ${quest.objective ? `<p class="qd-obj">${esc(quest.objective)}</p>` : '<p class="qd-obj qd-muted">No objective yet. Tap the pencil to say what finishing looks like.</p>'}
        ${done ? '' : `<button type="button" class="qd-focus${isActive ? ' on' : ''}" id="qd-focus" aria-pressed="${isActive}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/></svg>${isActive ? 'In focus' : 'Focus on this quest'}</button>`}
    </section>`;
}

function statsHTML(quest) {
    const p = QuestUI.progress(quest);
    return `<section class="qd-stats">
        ${QuestUI.ring(p.pct, 84)}
        <div class="qd-stat"><b>${p.done}<small>/${p.total}</small></b><span>Tasks</span></div>
        <div class="qd-stat"><b>${p.earned}<small>/${p.max}</small></b><span>XP</span></div>
        <div class="qd-stat"><b>${QuestUI.daysIn(quest) || '—'}</b><span>${quest.status === 'completed' ? `Days · done ${esc(QuestUI.shortDate(quest.dateCompleted))}` : `Days · since ${esc(QuestUI.shortDate(quest.dateStarted)) || '—'}`}</span></div>
    </section>`;
}

// Course quests (Oct 2026): tasks that carry a `module` (and maybe a
// `section`) show as drop-downs - module > chapter > lessons - like the
// course itself. Each header shows % done, lessons, ghost challenges and
// time. The one holding your next lesson starts open; what you open or
// close is remembered while you're on the page.
const openGroups = new Set();
let openSeeded = false;
function groupStats(list) {
    const done = list.filter(t => t.completed).length;
    const sec = list.reduce((s, t) => s + (Number(t.durSec) || plannedMinutes(t) * 60), 0);
    const g = list.reduce((s, t) => s + (t.ghosts || 0), 0), gd = list.reduce((s, t) => s + (t.ghostsDone || 0), 0);
    const pct = list.length ? Math.round(done / list.length * 100) : 0;
    return `<span class="qg-stats"><b class="${pct === 100 ? 'full' : ''}">${pct}%</b><span>${done}/${list.length}</span>${g ? `<span class="qg-gh">👻 ${gd}/${g}</span>` : ''}<span>${QuestUI.fmtTotal(sec)}</span></span>`;
}
function groupedTasksHTML(tasks) {
    const modules = [];
    tasks.forEach(t => {
        // Tasks with no chapter stay plain rows, in their place.
        if (!t.module) { modules.push({ loose: t }); return; }
        const name = t.module;
        let m = modules.find(x => x.name === name);
        if (!m) modules.push(m = { name, blocks: [], all: [] });
        m.all.push(t);
        const last = m.blocks[m.blocks.length - 1];
        if (t.section) {
            if (last && last.section === t.section) last.tasks.push(t);
            else m.blocks.push({ section: t.section, tasks: [t] });
        } else m.blocks.push({ task: t });
    });
    if (!openSeeded) {
        openSeeded = true;
        const next = tasks.find(t => !t.completed);
        if (next) { openGroups.add('m:' + (next.module || 'Other')); if (next.section) openGroups.add('s:' + (next.module || 'Other') + '>' + next.section); }
    }
    let n = 0;
    return `<div class="qg" id="qd-tasks">${modules.map(m => {
        if (m.loose) return `<ul class="qt-list">${QuestUI.taskRowHTML(m.loose)}</ul>`;
        const mi = n++;
        const mk = 'm:' + m.name;
        return `<details class="qg-mod${m.all.every(t => t.completed) ? ' done' : ''}" data-key="${esc(mk)}"${openGroups.has(mk) ? ' open' : ''}>
            <summary><span class="qg-n">${mi + 1}</span><span class="qg-t">${esc(m.name)}</span>${groupStats(m.all)}</summary>
            <div class="qg-body">${m.blocks.map(b => {
                if (b.task) return `<ul class="qt-list">${QuestUI.taskRowHTML(b.task)}</ul>`;
                const sk = 's:' + m.name + '>' + b.section;
                return `<details class="qg-sec${b.tasks.every(t => t.completed) ? ' done' : ''}" data-key="${esc(sk)}"${openGroups.has(sk) ? ' open' : ''}>
                    <summary><span class="qg-t">${esc(b.section)}</span>${groupStats(b.tasks)}</summary>
                    <ul class="qt-list">${b.tasks.map(t => QuestUI.taskRowHTML(t)).join('')}</ul>
                </details>`;
            }).join('')}</div>
        </details>`;
    }).join('')}</div>`;
}

function tasksHTML(quest) {
    const tasks = quest.tasks || [];
    const p = QuestUI.progress(quest);
    const diffButtons = QUEST_DIFFICULTY_TIERS.map(t => {
        const st = HABIT_DIFFICULTY_STYLE[t.level];
        return `<button type="button" class="qd-seg${t.level === newTaskDifficulty ? ' on' : ''}" data-diff="${t.level}" style="--c:${st.color};--k:${st.ink}">${t.level} <small>${t.xp}</small></button>`;
    }).join('');
    return `<section class="qd-sec">
        <h2 class="qd-h">Tasks <span>${p.done} of ${p.total} done</span></h2>
        <div class="qa-bar qd-bar-prog"><i style="width:${p.pct}%"></i></div>
        ${tasks.length ? (tasks.some(t => t.module) ? groupedTasksHTML(tasks) : `<ul class="qt-list" id="qd-tasks">${tasks.map(t => QuestUI.taskRowHTML(t)).join('')}</ul>`) : '<p class="qd-muted">No tasks yet. Break this goal into steps you can finish in a day or two.</p>'}
        ${addingTask ? `<div class="qd-add-form" id="qd-task-form">
            <input type="text" id="qd-task-input" placeholder="New task" maxlength="140" autocomplete="off">
            <div class="qd-segs" id="qd-task-diff">${diffButtons}</div>
            <div class="qd-form-acts"><button type="button" class="qd-btn" id="qd-task-cancel">Cancel</button><button type="button" class="qd-btn primary" id="qd-task-save">Add task</button></div>
        </div>` : '<button type="button" class="qd-add" id="qd-task-add"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New task</button>'}
    </section>`;
}

function sourceHTML(quest) {
    const terms = Vault.getQuestRelatedTerms(quest.id);
    if (!quest.source && !terms.length && !quest.queensDecree) return '';
    return `<section class="qd-sec">
        ${quest.source ? `<h2 class="qd-h">Source</h2>
            <a class="qd-source" href="${esc(quest.source.url)}" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
                <span>${esc(quest.source.label)}<small>${esc(quest.source.url)}</small></span></a>` : ''}
        ${terms.length ? `<h2 class="qd-h">Related terms <span>${terms.length}</span></h2>
            <div class="qd-terms">${terms.map(t => `<a href="../../plugins/dictionary/dictionary.html?term=${encodeURIComponent(t.id)}">📖 ${esc(t.name)}</a>`).join('')}</div>` : ''}
        ${quest.queensDecree ? `<h2 class="qd-h">🐝 The Queen's Decree</h2><blockquote class="qd-decree">${esc(quest.queensDecree)}</blockquote>` : ''}
    </section>`;
}

// One ghost log row: name, XP (hidden when 0), the result buttons.
function ghostRowHTML(g) {
    const count = g.ghosts ? `<small class="qd-ghost-n">${QuestUI.ghostsHTML(g.ghostsDone || 0, g.ghosts)}</small>` : '';
    return `
            <li class="qd-ghost s-${esc(g.status)}" data-ghost-id="${esc(g.id)}">
                <div class="qd-ghost-top"><span class="qd-ghost-name">${esc(g.name)}${count}</span>${g.xp ? `<span class="dr-xp">+${g.xp} XP</span>` : ''}
                    <button type="button" class="qd-x${armedGhost === g.id ? ' armed' : ''}" data-act="ghost-remove" aria-label="Remove ${esc(g.name)}">${armedGhost === g.id ? 'Tap again' : '×'}</button></div>
                <div class="qd-ghost-states" role="radiogroup" aria-label="Result">${GHOST_STATES.map(st => `<button type="button" role="radio" aria-checked="${g.status === st.key}" class="g-${st.key}${g.status === st.key ? ' on' : ''}" data-act="ghost-status" data-status="${st.key}" title="${st.label}">${st.short}</button>`).join('')}</div>
            </li>`;
}
// Course ghost logs (Oct 2026): grouped by module, like the tasks.
function groupedGhostsHTML(logs) {
    const mods = [];
    logs.forEach(g => { const n = g.module || 'Other'; let m = mods.find(x => x.name === n); if (!m) mods.push(m = { name: n, logs: [] }); m.logs.push(g); });
    return `<div class="qg">${mods.map(m => {
        const k = 'g:' + m.name;
        const full = m.logs.filter(g => g.status === 'green').length;
        const ghosts = m.logs.reduce((a, g) => a + (g.ghosts || 0), 0), gd = m.logs.reduce((a, g) => a + (g.ghostsDone || 0), 0);
        return `<details class="qg-mod${full === m.logs.length ? ' done' : ''}" data-key="${esc(k)}"${openGroups.has(k) ? ' open' : ''}>
            <summary><span class="qg-n">👻</span><span class="qg-t">${esc(m.name)}</span><span class="qg-stats"><b class="${full === m.logs.length ? 'full' : ''}">${full}/${m.logs.length}</b><span>lessons</span><span class="qg-gh">👻 ${gd}/${ghosts}</span></span></summary>
            <div class="qg-body"><ul class="qd-ghosts">${m.logs.map(ghostRowHTML).join('')}</ul></div>
        </details>`;
    }).join('')}</div>`;
}

function ghostHTML(quest) {
    const logs = Vault.getGhostLogs(quest.id);
    return `<section class="qd-sec">
        <h2 class="qd-h">👻 Ghost Logs <span>Challenges you try without help</span></h2>
        ${logs.length ? (logs.some(g => g.module) ? groupedGhostsHTML(logs) : `<ul class="qd-ghosts">${logs.map(ghostRowHTML).join('')}</ul>`) : '<p class="qd-muted">None yet. Add a challenge, then mark how it went: tried, partial or full.</p>'}
        ${addingGhost ? `<div class="qd-add-form" id="qd-ghost-form">
            <input type="text" id="qd-ghost-name" placeholder="Challenge name" maxlength="140" autocomplete="off">
            <input type="number" id="qd-ghost-xp" placeholder="XP" min="0" inputmode="numeric">
            <div class="qd-form-acts"><button type="button" class="qd-btn" id="qd-ghost-cancel">Cancel</button><button type="button" class="qd-btn primary" id="qd-ghost-save">Add</button></div>
        </div>` : '<button type="button" class="qd-add" id="qd-ghost-add"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New ghost log</button>'}
    </section>`;
}

function linksHTML(quest) {
    const children = Vault.getSideQuestsFor(quest.id);
    const unlocks = Vault.getCodexUnlocks(quest.id);
    const parts = [];
    if (children.length) {
        parts.push(`<h2 class="qd-h">🧩 Side quests <span>${children.length}</span></h2><ul class="qd-links">${children.map(c => {
            const p = QuestUI.progress(c);
            return `<li><a href="./quest.html?id=${encodeURIComponent(c.id)}" style="${QuestUI.styleAttr(c)}">${QuestUI.ring(p.pct, 40)}<span>${esc(c.title)}<small>${p.done}/${p.total} tasks${c.status === 'completed' ? ' · done' : ''}</small></span></a></li>`;
        }).join('')}</ul>`);
    }
    if (unlocks.length) {
        parts.push(`<h2 class="qd-h">🔓 Codex unlocks</h2><ul class="qd-unlocks">${unlocks.map(u => `
            <li data-unlock-id="${esc(u.id)}"><div><b>${esc(u.title)}</b><span>${esc(u.ability)}</span></div>
            ${u.dateEarned ? `<small>✓ ${esc(QuestUI.shortDate(u.dateEarned))}</small>` : '<button type="button" class="qd-btn primary" data-act="claim">Claim</button>'}</li>`).join('')}</ul>`);
    }
    return parts.length ? `<section class="qd-sec">${parts.join('')}</section>` : '';
}

function extrasHTML(quest) {
    const parts = [];
    if (quest.repoTask) {
        const r = quest.repoTask;
        parts.push(`<h2 class="qd-h">🛠️ Repo task</h2><div class="qd-box">
            <p><b>File:</b> ${esc(r.file)}</p>
            ${(r.requirements || []).length ? `<ul>${r.requirements.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
            <p class="qd-muted">+${esc(r.xp)} XP · ${r.dateCompleted ? `done ${esc(QuestUI.shortDate(r.dateCompleted))}` : 'not done yet'}</p></div>`);
    }
    if (quest.quizChallenge) {
        const z = quest.quizChallenge;
        parts.push(`<h2 class="qd-h">❓ Quiz challenge</h2><div class="qd-box">
            <p><b>${esc(z.concept)}</b></p>
            <p>${esc(z.correct)}/${esc(z.questionCount)} correct (${esc(z.score)}%) · ${esc(z.status)}</p>
            <p class="qd-muted">${esc(z.file)}${z.dateCompleted ? ` · ${esc(QuestUI.shortDate(z.dateCompleted))}` : ''}</p></div>`);
    }
    if (quest.patchNotes && quest.patchNotes.length) {
        parts.push(`<h2 class="qd-h">📜 Patch notes <span class="qd-dev">Developer version</span></h2><ul class="qd-notes">${quest.patchNotes.map(n => `
            <li><b>${esc(n.date)}</b> ${esc(n.change)}${n.notes ? `<small>${esc(n.notes)}</small>` : ''}</li>`).join('')}</ul>`);
    }
    return parts.length ? `<section class="qd-sec">${parts.join('')}</section>` : '';
}

function advancedHTML(quest) {
    return `<details class="qd-adv" id="qd-adv">
        <summary>Advanced · raw quest data</summary>
        <p class="qd-muted">Hand-edit this quest's JSON, or paste in generated quest data. The id stays "${esc(quest.id)}" whatever you paste.</p>
        <textarea id="qd-json" spellcheck="false">${esc(JSON.stringify(quest, null, 2))}</textarea>
        <div class="qd-form-acts"><button type="button" class="qd-btn primary" id="qd-json-save">Save JSON</button></div>
    </details>`;
}

function render() {
    const quest = getQuest();
    const root = document.getElementById('qd');
    if (!quest) {
        document.getElementById('qd-missing').hidden = false;
        return;
    }
    const advOpen = document.getElementById('qd-adv') && document.getElementById('qd-adv').open;
    root.style.cssText = QuestUI.styleAttr(quest);
    root.innerHTML = heroHTML(quest) + statsHTML(quest) + tasksHTML(quest) + sourceHTML(quest) + ghostHTML(quest) + linksHTML(quest) + extrasHTML(quest) + advancedHTML(quest);
    if (advOpen) document.getElementById('qd-adv').open = true;
    document.title = `📜 ${quest.title}`;
    if (addingTask) document.getElementById('qd-task-input').focus();
    if (addingGhost) document.getElementById('qd-ghost-name').focus();
}

function saveNewTask() {
    const input = document.getElementById('qd-task-input');
    const label = input.value.trim();
    if (!label) { input.focus(); return; }
    const tier = QUEST_DIFFICULTY_TIERS.find(t => t.level === newTaskDifficulty) || QUEST_DIFFICULTY_TIERS[0];
    Vault.addTask(questId, { label, xp: tier.xp, difficulty: tier.level });
    Toast.show(`➕ Task added: ${label}`, 'positive');
    render(); // stays open for the next one
}

function saveNewGhost() {
    const name = document.getElementById('qd-ghost-name').value.trim();
    if (!name) { document.getElementById('qd-ghost-name').focus(); return; }
    Vault.addGhostLog(questId, { name, xp: document.getElementById('qd-ghost-xp').value });
    addingGhost = false;
    render();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    questId = new URLSearchParams(window.location.search).get('id');
    render();

    const root = document.getElementById('qd');
    // Remember which drop-downs are open across re-renders.
    root.addEventListener('toggle', (event) => {
        const d = event.target;
        if (!d.matches || !d.matches('details[data-key]')) return;
        if (d.open) openGroups.add(d.dataset.key); else openGroups.delete(d.dataset.key);
    }, true);
    root.addEventListener('click', (event) => {
        const t = event.target;
        if (t.closest('#qd-focus')) {
            const on = Vault.getActiveQuestId() === questId;
            Vault.setActiveQuestId(on ? null : questId);
            if (!on) Toast.show('🎯 Quest in focus', 'positive');
            render();
            return;
        }
        const check = t.closest('.qt .dr-check');
        if (check) {
            const row = check.closest('.qt');
            QuestUI.toggleTask(questId, row.dataset.taskId, row);
            setTimeout(render, 700);
            return;
        }
        if (t.closest('#qd-task-add')) { addingTask = true; render(); return; }
        if (t.closest('#qd-task-cancel')) { addingTask = false; render(); return; }
        if (t.closest('#qd-task-save')) { saveNewTask(); return; }
        const seg = t.closest('#qd-task-diff [data-diff]');
        if (seg) {
            newTaskDifficulty = seg.dataset.diff;
            document.querySelectorAll('#qd-task-diff [data-diff]').forEach(b => b.classList.toggle('on', b === seg));
            return;
        }
        if (t.closest('#qd-ghost-add')) { addingGhost = true; render(); return; }
        if (t.closest('#qd-ghost-cancel')) { addingGhost = false; render(); return; }
        if (t.closest('#qd-ghost-save')) { saveNewGhost(); return; }
        const act = t.closest('[data-act]');
        if (act && act.dataset.act === 'ghost-status') {
            Vault.updateGhostLogStatus(questId, act.closest('.qd-ghost').dataset.ghostId, act.dataset.status);
            render();
        } else if (act && act.dataset.act === 'ghost-remove') {
            const id = act.closest('.qd-ghost').dataset.ghostId;
            if (armedGhost !== id) {
                armedGhost = id;
                render();
                setTimeout(() => { if (armedGhost === id) { armedGhost = null; render(); } }, 2500);
                return;
            }
            armedGhost = null;
            Vault.removeGhostLog(questId, id);
            render();
        } else if (act && act.dataset.act === 'claim') {
            const result = Vault.claimCodexUnlock(questId, act.closest('li').dataset.unlockId);
            if (result) {
                Toast.show(result.skillUnlocked
                    ? `🔓 ${result.unlock.title} claimed. "${result.skillUnlocked.name}" unlocked on the Skill Tree!`
                    : `🔓 ${result.unlock.title} claimed!`, 'positive');
                render();
            }
        } else if (t.closest('#qd-json-save')) {
            let parsed;
            try {
                parsed = JSON.parse(document.getElementById('qd-json').value);
            } catch (error) {
                Toast.show("That isn't valid JSON. Fix it and try again.", 'negative');
                return;
            }
            if (Vault.replaceQuest(questId, parsed)) {
                Toast.show('💾 Quest data saved', 'positive');
                render();
            }
        }
    });
    root.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (event.target.id === 'qd-task-input') saveNewTask();
        if (event.target.id === 'qd-ghost-name' || event.target.id === 'qd-ghost-xp') saveNewGhost();
    });

    Waggle.setActions([
        {
            icon: '✏️',
            label: 'Edit Quest',
            onClick: () => { window.location.href = `./create-quest.html?id=${encodeURIComponent(questId)}`; }
        },
        ...baseWaggleActions()
    ]);
});
