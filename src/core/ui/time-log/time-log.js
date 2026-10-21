// "How long did it take?" (Oct 2026). Pops up after you check off a Daily,
// To-Do, Quest task or good Habit, so XP and skill hours use your real
// minutes. Skip = the planned time counts. Loaded on every app page by
// app.js (loadTimeLog). Turn it off in Settings > Time tracking.
const TimeLog = (() => {
    const OFF_KEY = 'bizzybee_ask_time';      // 'off' = never ask
    const HABIT_MIN = 10;                     // quick habits (under 10 min) never ask
    let open = null;

    const fmt = (m) => m >= 60 ? `${+(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${m} min`;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const enabled = () => localStorage.getItem(OFF_KEY) !== 'off';

    function find(kind, id, questId) {
        const s = Vault.state || {};
        if (kind === 'daily') return { task: (s.dailyTasks || []).find(t => t.id === id) };
        if (kind === 'habit') return { task: (s.habits || []).find(t => t.id === id) };
        if (kind === 'todo') return { task: (s.todos || []).find(t => t.id === id) };
        const quest = (s.quests || []).find(q => q.id === questId);
        return { task: quest && (quest.tasks || []).find(t => t.id === id), quest };
    }

    // ask({ kind: 'daily'|'habit'|'todo'|'quest', id, questId })
    function ask({ kind, id, questId }) {
        if (!enabled() || typeof Vault === 'undefined' || !Vault.state) return;
        const { task, quest } = find(kind, id, questId);
        if (!task) return;
        const planned = plannedMinutes(task);
        if (kind === 'habit' && planned < HABIT_MIN) return;
        close();
        let m = planned;
        const skills = skillsForTask(task, Vault.getDictionaryTerms(), quest).map(x => x.category);
        const wrap = document.createElement('div');
        wrap.className = 'tl-scrim';
        wrap.innerHTML = '<div class="tl-sheet" role="dialog" aria-modal="true" aria-labelledby="tl-title"></div>';
        const sheet = wrap.firstChild;
        const draw = () => {
            sheet.innerHTML = `<h3 id="tl-title">✅ ${esc(task.label)}</h3>
                <p class="tl-sub">How long did it actually take?</p>
                <div class="tl-step"><button type="button" data-d="-5" aria-label="5 minutes less">−</button><b aria-live="polite">${fmt(m)}</b><button type="button" data-d="5" aria-label="5 minutes more">+</button></div>
                <div class="tl-chips">${[5, 15, 30, 45, 60, 90, 120].map(x => `<button type="button" data-x="${x}" class="${x === m ? 'on' : ''}">${fmt(x)}</button>`).join('')}</div>
                <div class="tl-gain">+<b>${xpForMinutes(m, task.difficulty)} XP</b>${skills.length ? ` · <b>+${fmt(m)}</b> to ${skills.map(esc).join(', ')}` : ''}</div>
                <div class="tl-btns"><button type="button" class="tl-skip" data-skip>Skip (${fmt(planned)})</button><button type="button" class="tl-save" data-save>Save</button></div>
                <button type="button" class="tl-never" data-never>Stop asking (turn back on in Settings)</button>`;
        };
        draw();
        sheet.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.d) { m = Math.max(1, Math.min(600, m + Number(b.dataset.d))); draw(); }
            else if (b.dataset.x) { m = Number(b.dataset.x); draw(); }
            else if (b.hasAttribute('data-save')) {
                if (m !== planned) {
                    const xp = Vault.logCompletionMinutes(kind, id, m, { questId });
                    if (typeof Toast !== 'undefined' && xp) Toast.show(`⏱️ ${fmt(m)} logged · ${xp} XP`, 'positive');
                    window.dispatchEvent(new CustomEvent('time-logged', { detail: { kind, id, minutes: m } }));
                }
                close();
            } else if (b.hasAttribute('data-skip')) close();
            else if (b.hasAttribute('data-never')) {
                localStorage.setItem(OFF_KEY, 'off');
                if (typeof Toast !== 'undefined') Toast.show('Okay - planned times will count. Turn it back on in Settings.', 'positive');
                close();
            }
        });
        wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
        open = wrap;
        const save = sheet.querySelector('[data-save]');
        if (save) save.focus({ preventScroll: true });
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
        if (open) { open.remove(); open = null; }
        document.removeEventListener('keydown', onKey);
    }

    return { ask, close, enabled, setEnabled(on) { localStorage.setItem(OFF_KEY, on ? 'on' : 'off'); } };
})();
