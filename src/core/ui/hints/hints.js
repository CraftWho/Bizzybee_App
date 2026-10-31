// Hints + Hive Coach (Oct 27 2026, approved demo).
// Oct 28 2026: Eve is the coach and guide. GUIDE below has one entry per
// feature. Add an entry (with intro: true) whenever a feature ships: Eve
// introduces it once, and it lives in the Guide page (features/guide/).
// "Show me" opens the page with ?guide=<id> and Eve points at the button.
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
        colony: ['This is your colony. Bees work by day (7 AM – 10 PM) and sleep at night. Their stats change hour by hour.',
            'Give bees jobs. Nurses heal, Guards protect streaks, Honey Makers turn Pollen into Honey.'],
        'colony-bees': ['Tap a bee to see its stats and what is changing right now. Tap its <b>picture</b> for its full card.',
            'Sick or hurt bees heal 4× faster in a <b>Nursery bed</b>. <b>Recuperate</b> lets a bee eat, sleep and heal slowly.'],
        gacha: ['Spend tickets here to pull new bees. You earn tickets by leveling up.'],
        'honey-store': ['Spend Honey coins and materials here.', 'Make <b>items</b> your Rare-and-up bees can hold, like Honey Extract for hunger.'],
        incubator: ['Eggs in the incubator hatch faster as you walk.', 'Every 4 finished dailies count too, so it works on the website.'],
        notifications: ['Everything that can remind you, in one place. <b>Coming up</b> shows what\'s next.'],
        guide: ['Every feature, explained. Tap <b>Show me</b> and I\'ll point at it.'],
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
        el.innerHTML = `<span class="bee" aria-hidden="true">👑</span><b class="hn-eve">EVE</b> ${tips[step]}
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
        card.innerHTML = `<h2>👑 EVE · HIVE COACH</h2>
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

    // ---- The Guide (Oct 28 2026). One entry per feature.
    // page: where "Show me" goes. steps: [{ page, sel, text }] Eve points at.
    // intro: true = Eve introduces it once (new features).
    const F = '/src/features/', PL = '/src/plugins/';
    const GUIDE = [
        { id: 'start-day', icon: '🌅', title: 'Start My Day', text: 'Every morning: what you did yesterday, what was missed, and today at a glance.', v: '1.0.5', intro: true, page: F + 'home/home.html' },
        { id: 'dailies', icon: '☀️', title: 'Dailies', text: 'Tasks that repeat. Finish them all for bonus XP and a growing streak.', v: '1.0.0', page: F + 'dailies/dailies.html', steps: [{ page: 'dailies', sel: '.dk-add', text: 'Tap the gold + to make a daily.' }] },
        { id: 'habits', icon: '🔁', title: 'Habits', text: '+ for good habits, − for bad ones. No due dates.', v: '1.0.0', page: F + 'habits/habits.html' },
        { id: 'todos', icon: '✅', title: 'To-Dos', text: 'One-time tasks. Give them a date and time to get reminders.', v: '1.0.0', page: F + 'todos/todos.html' },
        { id: 'quests', icon: '🗺️', title: 'Quests', text: 'Big goals made of many tasks, like a course or a project.', v: '1.0.0', page: F + 'quests/quests.html' },
        // Oct 30 2026 (Craft): Terminal clear today.
        { id: 'clear-today', icon: '🧹', title: 'Clear today', text: 'In the Terminal, type clear today to undo today: check-offs, XP and level go back. A backup is made first.', v: '1.0.5', page: PL + 'terminal/terminal.html' },
        { id: 'swipe-home', icon: '⬆️', title: 'Swipe up to go Home', text: 'Swipe up on the gold + from any page to jump Home.', v: '1.0.5', intro: true, page: F + 'dailies/dailies.html', steps: [{ page: 'dailies', sel: '.dk-add', text: 'Swipe up on this gold + to go Home. Tap it to make something new.' }] },
        { id: 'bee-vitals', icon: '🐝', title: 'Bee stats, hour by hour', text: 'Jobs cost stamina, food and mood. Bees sleep at night. Not-well bees work worse and tire faster.', v: '1.0.5', intro: true, page: F + 'colony-bees/colony-bees.html', steps: [{ page: 'colony-bees', sel: '.cb-tile, .row[data-bee]', text: 'Tap a bee to see what is changing right now, with ▲ and ▼ per hour.' }] },
        { id: 'nursery', icon: '🛏️', title: 'Nursery beds and Recuperate', text: 'Sick or hurt bees heal 4× faster in a bed. Recuperate = eat, sleep, heal slowly. Hurt has 3 levels.', v: '1.0.5', intro: true, page: F + 'colony-bees/colony-bees.html' },
        { id: 'hatch', icon: '🐣', title: 'Tap to hatch', text: 'A ready egg waits for you. Tap it to crack it open and meet your new bee.', v: '1.0.5', intro: true, page: F + 'home/home.html', steps: [{ page: 'home', sel: '#home-ready', text: 'When an egg is ready, tap here to hatch it.' }] },
        { id: 'held-items', icon: '🍯', title: 'Items bees hold', text: 'Rare and up hold items. Honey Extract feeds a hungry bee, gloves and shields help in raids.', v: '1.0.5', intro: true, page: F + 'honey-store/honey-store.html', steps: [{ page: 'honey-store', sel: '#store-held-grid', text: 'Make items here. Then give one from a bee\'s card.' }] },
        { id: 'incubator', icon: '🥚', title: 'Egg Incubator', text: 'Your steps (and dailies) hatch eggs faster. A plugin: turn it on in Plugins.', v: '1.0.5', intro: true, page: PL + 'incubator/incubator.html' },
        { id: 'notifications', icon: '🔔', title: 'Notifications', text: 'Pick what reminds you and when. Tap a notification to open that task.', v: '1.0.4', page: F + 'notifications/notifications.html' },
        { id: 'live-sky', icon: '🌧️', title: 'Live sky', text: 'The Hive Mind follows the time of day and your real weather.', v: '1.0.4', page: F + 'colony/colony.html' },
        { id: 'done-today', icon: '✨', title: 'Done today', text: 'Tap XP today on Home to see everything you finished today.', v: '1.0.4', page: F + 'home/home.html' },
        { id: 'skills', icon: '🌱', title: 'Skills', text: 'Tasks that mention a skill\'s words count toward it. Pick your skills on the Dashboard.', v: '1.0.4', page: F + 'dashboard/dashboard.html' },
        { id: 'themes', icon: '🎨', title: 'Themes', text: 'Change how the whole app looks. Halloween turns on by itself on Oct 31.', v: '1.0.5', intro: true, page: F + 'themes/themes.html' },
        { id: 'friends', icon: '🤝', title: "Friends' hives", text: 'Swap hive codes and visit each other\'s Hive Mind. Look only. Your friends\' hives show in the distance behind yours.', v: '1.0.5', intro: true, page: F + 'friends/friends.html' },
        { id: 'mailbox', icon: '📬', title: 'Mailbox', text: 'Letters from the creator. React with 👍 or 👎, and tap Connect to add his hive.', v: '1.0.5', intro: true, page: F + 'mailbox/mailbox.html' },
        { id: 'dictionary', icon: '📖', title: 'Dictionary', text: 'Your terms, with meaning, code examples and links. A plugin.', v: '1.0.5', intro: true, page: PL + 'dictionary/dictionary.html' },
        { id: 'phone', icon: '📱', title: 'Phone features', text: 'Steps, face or fingerprint unlock, your phone calendar. In the Android app.', v: '1.0.4', page: F + 'settings/settings.html' },
        { id: 'prestige', icon: '✦', title: 'Prestige Tiers', text: 'Level 50 is the top. Then come Tiers.', v: '1.0.2', page: F + 'profile/profile.html' },
        { id: 'cloud', icon: '☁️', title: 'Cloud sync', text: 'Your save on every device. Both copies are combined, so nothing is lost.', v: '1.0.4', page: F + 'settings/settings.html' },
    ];
    const seenGuide = () => { const h = Vault.state.hints || (Vault.state.hints = {}); if (!Array.isArray(h.guideSeen)) h.guideSeen = GUIDE.filter(g => !g.intro).map(g => g.id); return h.guideSeen; };
    function eveBubble(html, buttons) {
        document.querySelectorAll('.hn-eve-pop').forEach(x => x.remove());
        const b = document.createElement('div');
        b.className = 'hn-eve-pop';
        b.innerHTML = `<span class="hn-eve-hex" aria-hidden="true">👑</span><div><b class="hn-eve">EVE</b><p>${html}</p><div class="hn-eve-btns">${buttons.map(([k, t, gold]) => `<button type="button" data-k="${k}"${gold ? ' class="gold"' : ''}>${t}</button>`).join('')}</div></div>`;
        document.body.appendChild(b);
        return b;
    }
    // New features: Eve introduces one at a time (Home only, after tips).
    function intro() {
        if (page !== 'home' || !Vault.hintsOn() || document.querySelector('.hn-tip, .ds-scrim, .wn-scrim, .ss-scrim')) return;
        const seen = seenGuide();
        const g = GUIDE.find(x => x.intro && !seen.includes(x.id));
        if (!g) return;
        const b = eveBubble(`New: <b>${esc(g.title)}</b>. ${esc(g.text)}`, [['later', 'Later'], ['show', 'Show me', true]]);
        b.onclick = (e) => {
            const k = e.target.closest('[data-k]'); if (!k) return;
            seen.push(g.id); Vault.save(); b.remove();
            if (k.dataset.k === 'show') location.href = `${location.origin}${g.page}?guide=${g.id}`;
            else if (typeof Toast !== 'undefined') Toast.show('📘 It\'s in the Guide whenever you want it.', 'neutral');
        };
    }
    // ?guide=<id>: Eve points at the right spot on this page.
    function tour() {
        const id = new URLSearchParams(location.search).get('guide');
        const g = id && GUIDE.find(x => x.id === id);
        if (!g) return;
        const steps = (g.steps || []).filter(st => st.page === page);
        let i = 0;
        const next = () => {
            const st = steps[i];
            if (!st) { eveBubble(`That's <b>${esc(g.title)}</b>. ${esc(g.text)}`, [['ok', 'Got it', true]]).onclick = (e) => { if (e.target.closest('[data-k]')) e.currentTarget.remove(); }; return; }
            const el = document.querySelector(st.sel);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('bb-focus'); void el.offsetWidth; el.classList.add('bb-focus'); }
            const b = eveBubble(esc(st.text).replace(/&lt;b&gt;|&lt;\/b&gt;/g, ''), [['ok', i < steps.length - 1 ? 'Next' : 'Got it', true]]);
            b.onclick = (e) => { if (!e.target.closest('[data-k]')) return; b.remove(); if (el) el.classList.remove('bb-focus'); i++; if (i < steps.length) next(); };
        };
        setTimeout(next, 900);
    }

    async function start() {
        if (typeof Vault === 'undefined' || typeof AppShell === 'undefined') return;
        await Vault.init();
        if (!Vault.state || document.body.classList.contains('ob-mode')) return;
        page = location.pathname.split('/').pop().replace('.html', '') || 'home';
        if (page === 'index') page = 'home';
        addAsk();
        coach();
        if (new URLSearchParams(location.search).get('guide')) { tour(); return; }
        setTimeout(() => show(false), 900);
        setTimeout(intro, 4000);
    }

    // Settings switch.
    function setOn(on) {
        Vault.setHintsOn(on);
        if (on) { addAsk(); coach(); } else { close(); removeCoach(); removeAsk(); }
    }
    function resetAll() { Vault.resetHints(); step = 0; addAsk(); show(false); }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    return { show: () => { step = 0; show(true); }, setOn, resetAll, TIPS, GUIDE, seenGuide: () => seenGuide() };
})();
