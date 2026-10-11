console.log("/// QUEST BOARD PROTOCOLS INITIALIZED ///");

// Quests list (rebuilt 2026-10-09 to match Habits / Dailies / To-Dos).
// Quests are long-term goals broken into tasks. The 🎯 active quest sits
// on top with its next few tasks, so you can chip away right here. Below
// it: tabs for Main, Side and Done quests. Tap a quest to open its page
// (quest.html: objective, all tasks, ghost logs, side quests, unlocks...).
// The dock's + opens create-quest.html. Shared bits: quest-common.js.

let currentTab = 'main';
try { currentTab = sessionStorage.getItem('bizzybee_quests_tab') || 'main'; } catch (e) { /* storage off */ }

function questCardHTML(quest, activeId) {
    const p = QuestUI.progress(quest);
    const isActive = quest.id === activeId;
    const done = quest.status === 'completed';
    const sideCount = Vault.getSideQuestsFor(quest.id).length;
    const meta = [`<span><b>${p.done}</b>/${p.total} tasks</span>`, `<span class="q-xp">${p.earned}/${p.max} XP</span>`];
    if (done) meta.push(`<span>Done ${QuestUI.esc(QuestUI.shortDate(quest.dateCompleted))}</span>`);
    else if (quest.dateStarted) meta.push(`<span>Day ${QuestUI.daysIn(quest)}</span>`);
    if (sideCount) meta.push(`<span>🧩 ${sideCount}</span>`);
    if (quest.source) meta.push('<span title="Has a source">🔗</span>');
    return `<li class="qc${done ? ' done' : ''}${isActive ? ' focused' : ''}" data-quest-id="${QuestUI.esc(quest.id)}" style="${QuestUI.styleAttr(quest)}">
        <button type="button" class="qc-main" data-act="open" aria-label="Open ${QuestUI.esc(quest.title)}">
            ${QuestUI.ring(p.pct)}
            <span class="qc-text">
                <span class="qc-title">${QuestUI.esc(quest.title)}</span>
                ${quest.objective ? `<span class="qc-obj">${QuestUI.esc(quest.objective)}</span>` : ''}
                <span class="qc-meta">${meta.join('')}</span>
            </span>
        </button>
        ${done ? '' : `<button type="button" class="qc-focus${isActive ? ' on' : ''}" data-act="focus" aria-pressed="${isActive}" aria-label="${isActive ? 'In focus' : 'Focus on this quest'}" title="${isActive ? 'In focus' : 'Focus on this quest'}">${QuestUI.TARGET_ICON}</button>`}
    </li>`;
}

const EMPTY = {
    main: 'No main quests yet. Tap the + below to start a long-term goal.',
    side: 'No side quests. Side quests are smaller goals, often part of a main one.',
    done: 'No finished quests yet. They land here when every task is done.'
};

function renderQuestsPage() {
    const quests = Vault.getQuests();
    const activeId = Vault.getActiveQuestId();
    const active = quests.find(q => q.id === activeId) || null;
    const open = quests.filter(q => q.status !== 'completed');
    const lists = {
        main: open.filter(q => q.category !== 'side'),
        side: open.filter(q => q.category === 'side'),
        done: quests.filter(q => q.status === 'completed').sort((a, b) => (b.dateCompleted || '').localeCompare(a.dateCompleted || ''))
    };

    document.getElementById('q-n-main').textContent = lists.main.length;
    document.getElementById('q-n-side').textContent = lists.side.length;
    document.getElementById('q-n-done').textContent = lists.done.length;
    const openTasks = open.reduce((n, q) => n + (q.tasks || []).filter(t => !t.completed).length, 0);
    document.getElementById('q-sum').innerHTML = `<b>${open.length}</b> in progress<i>·</i>${openTasks} tasks left<i>·</i>${lists.done.length} done`;
    document.querySelectorAll('.q-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === currentTab)));

    const activeEl = document.getElementById('q-active');
    activeEl.hidden = currentTab === 'done';
    activeEl.innerHTML = QuestUI.focusCardHTML(active);

    // The focused quest is already on top, so it isn't listed twice.
    const shown = lists[currentTab].filter(q => currentTab === 'done' || q.id !== activeId);
    document.getElementById('q-list').innerHTML = shown.length
        ? shown.map(q => questCardHTML(q, activeId)).join('')
        : `<li class="dl-empty">${lists[currentTab].length ? 'This quest is in focus above.' : EMPTY[currentTab]}</li>`;
}

function openQuest(id) {
    window.location.href = `./quest.html?id=${encodeURIComponent(id)}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    // Old links (and Home's Create > Quest from before) used #new-quest.
    if (window.location.hash === '#new-quest') {
        window.location.replace('./create-quest.html');
        return;
    }

    renderQuestsPage();

    document.querySelector('.q-tabs').addEventListener('click', (event) => {
        const b = event.target.closest('[data-tab]');
        if (!b) return;
        currentTab = b.dataset.tab;
        try { sessionStorage.setItem('bizzybee_quests_tab', currentTab); } catch (e) { /* storage off */ }
        renderQuestsPage();
    });

    document.getElementById('q-active').addEventListener('click', (event) => {
        const card = event.target.closest('.qa-card');
        if (!card) return;
        const check = event.target.closest('.dr-check');
        if (check) {
            const row = check.closest('.qt');
            QuestUI.toggleTask(card.dataset.questId, row.dataset.taskId, row);
            setTimeout(renderQuestsPage, 700);
            return;
        }
        if (event.target.closest('[data-act="open"]')) openQuest(card.dataset.questId);
    });

    document.getElementById('q-list').addEventListener('click', (event) => {
        const card = event.target.closest('.qc');
        if (!card) return;
        const act = event.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'open') {
            openQuest(card.dataset.questId);
        } else if (act.dataset.act === 'focus') {
            const isActive = Vault.getActiveQuestId() === card.dataset.questId;
            Vault.setActiveQuestId(isActive ? null : card.dataset.questId);
            if (!isActive) {
                Toast.show('🎯 Quest in focus', 'positive');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            renderQuestsPage();
        }
    });

    Waggle.setActions([
        {
            icon: '📝',
            label: 'Add Quest',
            onClick: () => { window.location.href = './create-quest.html'; }
        },
        ...baseWaggleActions()
    ]);
});
