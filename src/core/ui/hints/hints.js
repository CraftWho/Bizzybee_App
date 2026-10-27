// Hints + Hive Coach (Oct 27 2026, approved demo).
// - Each page shows its tips once (1 to 3), in a bubble above the dock.
//   The "?" button brings them back. Settings > Hints turns it all off.
// - Hive Coach: when a daily keeps getting missed while you're still active,
//   a card on Home and Dailies offers a fix (Vault.getCoachSuggestion).
// Loaded on every app page by app.js (loadHints).
const Hints = (() => {
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const TIPS = {
        home: ["This is your hive's home. <b>Today</b> lists what's due. Tap a task to finish it.",
            'The bar at the top is your level. Every task gives XP. Fill the bar, then tap the level chip to claim rewards.',
            'Missed tasks hurt the whole hive. Bees can get sick, hurt or worn out. Keep your streak going to keep them happy.'],
        dailies: ['Tap the circle when you finish a daily. Your bees eat, and your streak grows.',
            "Finish <b>all</b> of today's dailies for <b>+20 bonus XP</b>. Streaks of 3, 7, 30 and 100 days give more.",
            'Missed dailies hurt the whole hive. Guard Bees and Streak Charms can save a streak.'],
        habits: ['Tap <b>+</b> for a good habit and <b>−</b> for a bad one. Good habits give XP. Bad ones cost the Queen health.',
            'Habits have no due date. Use them for things you want to do more (or less) often.'],
        todos: ['To-Dos are one-time tasks. Add a due date to see them in Today and on the Calendar.',
            'Late To-Dos count as missed work for the hive, so set dates you can keep.'],
        quests: ['Quests are big goals made of many tasks, like a course or a project.',
            'Pick one quest as your <b>active</b> quest to keep it on Home.'],
        quest: ['Each task here gives XP when done. Groups open and close with a tap.',
            'Tags on a quest (like <b>JavaScript</b>) send its time to that skill on your Dashboard.'],
        'create-quest': ['Add tasks one by one, or use <b>New chapter</b> to group them.',
            'Tags at the bottom tell the app which skill this quest trains.'],
        dashboard: ['Your stats in one place: level, skills and time spent.',
            'Skills grow from time spent on tasks that mention them. Type <b>#word</b> in a task to tag it.'],
        skills: ['Each skill has stages. Hit the hours to unlock the next one.',
            'When a skill is ready, tap the gold <b>Level up</b> button for rewards.'],
        colony: ['This is your colony. Bees here eat, work and rest each day.',
            'Give bees jobs. Nurses heal, Guards protect streaks, Honey Makers turn Pollen into Honey.'],
        'colony-bees': ['Tap a bee to see its health, stamina, fatigue and mood.',
            'Bees with high <b>fatigue</b> are forced to rest. Sick and injured bees can\'t work until they recover.'],
        gacha: ['Spend tickets here to pull new bees. You earn tickets by leveling up.'],
        'honey-store': ['Spend Honey coins on items like Streak Charms and food.'],
        inventory: ['Your items and materials. Some are made from others, like Royal Jelly from Honey Drops.'],
        'plugin-hub': ['Turn on extra features here. Turned-on plugins show up on Home.'],
        settings: ['Change how the app looks and works. You can turn these hints off below.'],
        profile: ['Your profile: name, level, quests and projects.'],
        calendar: ['Your dailies, to-dos and quests on a calendar. Tap a day to see it.'],
        dictionary: ['Each term belongs to a skill. Tasks that mention a term count toward that skill.'],
        projects: ['All your builds in one place. Live sites show a preview.',
            'Tap <b>＋ Add project</b> to add one. Tap ⋯ on a card to edit or pin it.'],
        map: ['The hive map. Tap a room to go there.'],
    };

    let page = null, step = 0, el = null;

    function close() { if (el) el.remove(); el = null; }
    function show(force) {
        close();
        const tips = TIPS[page];
        if (!tips || (!force && (!Vault.hintsOn() || Vault.hintSeen(page)))) return;
        el = document.createElement('div');
        el.className = 'hn-tip';
        el.setAttribute('role', 'status');
        const last = step >= tips.length - 1;
        el.innerHTML = `<span class="bee" aria-hidden="true">🐝</span>${tips[step]}
            <div class="hn-ft"><span>${tips.length > 1 ? `Tip ${step + 1} of ${tips.length}` : 'Tip'}</span>
            <button type="button" class="hn-off">Turn off hints</button>
            <button type="button" class="hn-btn">${last ? 'Got it' : 'Next'}</button></div>`;
        el.querySelector('.hn-btn').onclick = () => {
            if (!last) { step++; show(true); return; }
            Vault.markHintSeen(page); close();
        };
        el.querySelector('.hn-off').onclick = () => {
            Vault.setHintsOn(false); close(); removeCoach(); removeAsk();
            if (typeof Toast !== 'undefined') Toast.show('💡 Hints off. Turn them back on in Settings.', 'positive');
        };
        document.body.appendChild(el);
    }

    function removeAsk() { document.querySelectorAll('.hn-ask').forEach(b => b.remove()); }
    function addAsk() {
        removeAsk();
        if (!TIPS[page] || !Vault.hintsOn()) return;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'hn-ask'; b.textContent = '?';
        b.setAttribute('aria-label', 'Show tips for this page');
        b.onclick = () => { step = 0; show(true); };
        document.body.appendChild(b);
    }

    // ---- Hive Coach
    const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    function removeCoach() { document.querySelectorAll('.hn-coach').forEach(c => c.remove()); }
    function coach() {
        removeCoach();
        if (page !== 'home' && page !== 'dailies') return;
        const s = Vault.getCoachSuggestion();
        if (!s) return;
        const t = s.task;
        const r = t.repeats || { type: 'daily' };
        const fewDays = r.type === 'weekly' && (r.daysOfWeek || []).length <= 1;
        const m = plannedMinutes(t);
        const opts = [
            !fewDays && ['less', '📅', 'Do it less often', r.type === 'weekly' && (r.daysOfWeek || []).length <= 3 ? 'One less day a week' : '3 days a week instead of every day'],
            ['time', '⏱️', 'Give it more time', `It may take longer than ${m} min. Plan ${Math.min(240, Math.max(m * 2, m + 15))} min.`],
            ['smaller', '🪜', 'Make it smaller', 'Edit it into a smaller step, build up later'],
            !(t.reminders || []).length && ['reminder', '⏰', 'Add a reminder', 'A phone reminder at 6:30 PM'],
        ].filter(Boolean);
        const card = document.createElement('section');
        card.className = 'hn-coach';
        card.innerHTML = `<h2>🐝 HIVE COACH</h2>
            <p><b>"${esc(t.label)}"</b> was missed ${s.missed} of the last ${s.of} times. You've been active though, so it may just need a change.</p>
            <div class="hn-dots">${s.days.map(d => `<i class="${d.done ? 'y' : 'n'}" title="${d.day}">${DAY[new Date(d.day + 'T12:00:00').getDay()]}</i>`).join('')}</div>
            <div class="hn-opts">${opts.map(([k, ic, title, sub]) => `<button type="button" class="hn-opt" data-k="${k}"><span class="ic">${ic}</span><span>${title}<small>${esc(sub)}</small></span></button>`).join('')}</div>
            <div class="hn-row"><button type="button" class="hn-off" data-k="keep">Keep it as is</button><button type="button" class="hn-off" data-k="later">Ask me next week</button></div>`;
        card.addEventListener('click', e => {
            const b = e.target.closest('[data-k]');
            if (!b) return;
            const out = Vault.applyCoachFix(t.id, b.dataset.k);
            if (out && out.go) { location.href = page === 'dailies' ? `./${out.go}` : `../dailies/${out.go}`; return; }
            card.querySelectorAll('.hn-opts, .hn-row').forEach(x => x.remove());
            card.insertAdjacentHTML('beforeend', `<p class="hn-done">✓ ${esc(out || '')}</p>`);
            setTimeout(() => card.remove(), 6000);
            window.dispatchEvent(new Event('hints-coach-applied'));
        });
        // Below the page's title card, so the page still opens with its name.
        const main = document.querySelector('main');
        const first = main && main.firstElementChild;
        if (first) first.after(card); else if (main) main.prepend(card);
    }

    async function start() {
        if (typeof Vault === 'undefined' || typeof AppShell === 'undefined') return;
        await Vault.init();
        if (!Vault.state || document.body.classList.contains('ob-mode')) return;
        page = location.pathname.split('/').pop().replace('.html', '') || 'home';
        if (page === 'index') page = 'home';
        addAsk();
        coach();
        setTimeout(() => show(false), 900);
    }

    // Settings switch.
    function setOn(on) {
        Vault.setHintsOn(on);
        if (on) { addAsk(); coach(); } else { close(); removeCoach(); removeAsk(); }
    }
    function resetAll() { Vault.resetHints(); step = 0; addAsk(); show(false); }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    return { show: () => { step = 0; show(true); }, setOn, resetAll, TIPS };
})();
