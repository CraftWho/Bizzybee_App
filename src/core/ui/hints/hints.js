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
    // Oct 31 2026 (Craft): dashboard, skills, inventory and map tips brought up to date.
    const TIPS = {
        home: ["This is your hive's home. <b>Today</b> lists what's due. Tap a task to finish it.",
            'The bar at the top is your level. Every task gives XP. Fill the bar, then tap the level chip to claim rewards.',
            'Missed tasks hurt the whole hive. Bees can get sick, hurt or worn out. Keep your streak going to keep them happy.'],
        dailies: ['Tap the circle when you finish a daily. Your bees eat, and your streak grows.',
            "Finish <b>all</b> of today's dailies for <b>+20 bonus XP</b>. Finish <b>5 tasks</b> of any kind in a day to grow your streak.",
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
            'Skills grow from tasks that mention them. Add a tag to a task, or use everyday words like "run".'],
        skills: ['Each cell is a skill. Tap one for its time, path and rewards.',
            'A red dot means a reward is waiting. Tap the cell, then <b>Claim</b> or <b>Level up</b>.'],
        'hive-mind': ['This is your Hive Mind. Bees work by day (7 AM – 10 PM) and sleep at night. Their stats change hour by hour.',
            'Give bees jobs. Nurses heal, Guards protect streaks, Honey Makers turn Pollen into Honey.'],
        // Oct 31 2026 (Craft): Hive Bees is the card binder now.
        'hive-bees': ['Your card binder. <b>Drag</b> the cards, or spin the <b>click wheel</b>. Flick fast to jump by codex number.',
            'Tap the middle card to see it big. Rare and up <b>catch the light</b> when you tilt your phone. Tap it again to read its <b>memory</b>.'],
        gacha: ['Spend tickets here to pull new bees. You earn tickets by leveling up.'],
        'honey-store': ['Spend Honey coins and materials here.', 'Make <b>items</b> your Rare-and-up bees can hold, like Honey Extract for hunger.'],
        incubator: ['Eggs in the incubator hatch faster as you walk.', 'Every 4 finished dailies count too, so it works on the website.'],
        notifications: ['Everything that can remind you, in one place. <b>Coming up</b> shows what\'s next.'],
        guide: ['Every feature, explained. Tap <b>Show me</b> and I\'ll point at it.'],
        inventory: ['Everything you own: materials, evolution items and store items. Use them from a bee\'s card.'],
        'plugin-hub': ['Turn on extra features here. Turned-on plugins show up on Home.'],
        settings: ['Change how the app looks and works. You can turn these hints off below.'],
        profile: ['Your profile: name, level, quests and projects.'],
        calendar: ['Your dailies, to-dos and quests on a calendar. Tap a day to see it.'],
        dictionary: ['Each term belongs to a skill. Tasks that mention a term count toward that skill.'],
        projects: ['All your builds in one place. Live sites show a preview.',
            'Tap <b>＋ Add project</b> to add one. Tap ⋯ on a card to edit or pin it.'],
        history: ['Everything you finished on a day. Use ‹ › to change the day, and tap a row to open it.'],   // Oct 31 2026 (Craft)
        titles: ['Your ladder opens at your level. Scroll down to see where you came from, up for what\'s next. Equip a title to show it next to your rank.'],   // Oct 31 2026 (Craft)
        map: ['Your quests as a trail. Done ones at the bottom, your current one in red.'],
    };

    let page = null, step = 0, el = null;
    // Nov 1 2026 (Craft): "Got it" = not again until the app is reopened.
    const SNOOZE = 'bizzybee_tips_snoozed';
    const snoozedList = () => { try { return JSON.parse(sessionStorage.getItem(SNOOZE) || '[]'); } catch { return []; } };
    const snoozed = (p) => snoozedList().includes(p);
    const snoozeForNow = (p) => { try { sessionStorage.setItem(SNOOZE, JSON.stringify([...new Set([...snoozedList(), p])])); } catch { /* storage off */ } };

    function close() { if (el) el.remove(); el = null; }
    function show(force) {
        close();
        const tips = TIPS[page];
        if (!tips || (!force && (!Vault.hintsOn() || Vault.hintSeen(page) || snoozed(page)))) return;
        el = document.createElement('div');
        el.className = 'hn-tip';
        el.setAttribute('role', 'status');
        const last = step >= tips.length - 1;
        el.innerHTML = `<span class="bee" aria-hidden="true">👑</span><b class="hn-eve">EVE</b> ${tips[step]}
            <div class="hn-ft"><span>${tips.length > 1 ? `Tip ${step + 1} of ${tips.length}` : 'Tip'}</span>
            <button type="button" class="hn-off">Don't show again</button>
            <button type="button" class="hn-btn">${last ? 'Got it' : 'Next'}</button></div>`;
        el.querySelector('.hn-btn').onclick = () => {
            if (!last) { step++; show(true); return; }
            snoozeForNow(page); close();   // Nov 1 2026 (Craft): until the app is reopened
        };
        el.querySelector('.hn-off').onclick = () => {
            // Nov 1 2026 (Craft): "Don't show again" hides this page's tips for good.
            Vault.markHintSeen(page); close();
            if (typeof Toast !== 'undefined') Toast.show('👍 Got it. These tips are in the Guide if you need them.', 'positive');
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
    // Oct 31 2026 (Craft): the Guide covers every feature and mechanic,
    // grouped by `cat` on the Guide page. Ranks are never named here (they
    // stay a secret until reached). New feature = add an entry here.
    const GUIDE = [
        { id: "onboarding", icon: "🥚", title: "The egg gift", cat: "Getting started", text: "Your first run. Hold the egg, then raise it by learning Habits, To-Dos, Dailies and Quests on their real pages. Each dock tab unlocks in turn. Then name your King or Queen and the egg hatches.", v: "1.0.0", page: F + 'onboarding/onboarding.html' },
        // Nov 7 2026 (Craft): Batch 23.
        { id: "recover-egg", icon: "🛟", title: "Recover my account", cat: "Getting started", text: "Signed in but only see the egg? Tap \"Recover my account\" at the top right of the egg screen. It opens Settings, where you can restore a cloud backup. It never skips or hatches the egg.", v: "1.0.8", page: F + 'settings/settings.html' },
        { id: "start-day", icon: "🌅", title: "Start My Day", cat: "Getting started", text: "Opens the first time you open the app each day. Tell it which of yesterday's unfinished tasks you really did. Then see which streaks were saved or lost, and today's plan.", v: "1.0.5", intro: true, page: F + 'home/home.html' },
        { id: "top-bar", icon: "👑", title: "Top bar", cat: "Getting started", text: "Your royal, name, rank, level bar, Queen health and coins. Full size on Home, slim elsewhere. Tap it to go Home.", v: "1.0.0", page: F + 'home/home.html' },
        { id: "dock-create", icon: "➕", title: "The dock and the gold +", cat: "Getting started", text: "The dock has Habits, Dailies, To-Dos and Quests. The gold + makes whatever the current tab makes. On other pages it asks what to make.", v: "1.0.0", page: F + 'home/home.html' },
        { id: "swipe-home", icon: "⬆️", title: "Swipe up to go Home", cat: "Getting started", text: "Swipe up on the gold + from any page to jump Home. On Home it scrolls to the top.", v: "1.0.5", intro: true, page: F + 'dailies/dailies.html', steps: [{ page: 'dailies', sel: '.dk-add', text: 'Swipe up on this gold + to go Home. Tap it to make something new.' }] },
        { id: "waggle-menu", icon: "☰", title: "Menu", cat: "Getting started", text: "The menu at the top right has every page, grouped. A red dot means something waits: a level up, rank up, tickets, a fainted bee or new mail.", v: "1.0.0", page: F + 'home/home.html' },
        { id: "app-grid", icon: "🔲", title: "Home apps", cat: "Getting started", text: "A grid of every page not in the dock, plus plugins you turned on. Hold an app to move it, then tap Done.", v: "1.0.4", page: F + 'home/home.html' },
        { id: "back-button", icon: "⬅️", title: "Back button", cat: "Getting started", text: "The ← hexagon goes back one page, or Home if there's nothing to go back to.", v: "1.0.0", page: F + 'home/home.html' },
        { id: "eve-hints", icon: "💡", title: "Eve's tips", cat: "Getting started", text: "Each page shows a few tips once, above the dock. The ? button brings them back. Turn tips on, off or reset them in Settings › Eve, your coach.", v: "1.0.4", page: F + 'settings/settings.html' },
        { id: "guide", icon: "📘", title: "Guide", cat: "Getting started", text: "Every feature, searchable. Show me opens the page and Eve points at it. Eve also introduces each new feature once on Home.", v: "1.0.4", page: F + 'guide/guide.html' },
        { id: "dailies", icon: "☀️", title: "Dailies", cat: "Tasks", text: "Tasks that repeat: every day, every few days, on chosen weekdays, or monthly. Days a daily isn't due go under Not due today. Tap the hexagon to check it off.", v: "1.0.0", page: F + 'dailies/dailies.html', steps: [{ page: 'dailies', sel: '.dk-add', text: 'Tap the gold + to make a daily.' }] },
        { id: "daily-streak", icon: "🔥", title: "Daily streaks", cat: "Tasks", text: "Each daily counts the due days in a row you did it. Days it isn't due don't break it. Adjust Streak on the edit screen sets it by hand.", v: "1.0.0", page: F + 'dailies/dailies.html' },
        { id: "streak-bonus", icon: "🏅", title: "Your streak", cat: "Tasks", text: "A day counts toward your streak once you finish 5 tasks: any mix of dailies, To-Dos and quest tasks (habits don't count). You don't have to finish everything. Every Sunday while your streak is 7 days or more: +75 XP. Reaching 3, 30 and 100 days gives +30, +300 and +1000 XP once. Finishing every daily due today still gives +20 XP.", v: "1.0.0", page: F + 'home/home.html' },   // Nov 1 2026 (Craft): 5 tasks of any kind
        { id: "habits", icon: "🔁", title: "Habits", cat: "Tasks", text: "Tap + for a good habit and − for a bad one. No due dates. Reset Counter only resets the count you see. Adjust Counter changes taps and XP.", v: "1.0.0", page: F + 'habits/habits.html' },
        { id: "starter-habits", icon: "🌱", title: "Starter habits", cat: "Tasks", text: "Hatching your egg adds 3 habits: read a quote, walk 1,000 feet, and stretch for 3 minutes. The quote habit shows a Quote of the Week.", v: "1.0.0", page: F + 'habits/habits.html' },
        { id: "todos", icon: "✅", title: "To-Dos", cat: "Tasks", text: "One-time tasks with an optional due date and time, a checklist and tags. Tabs: Active, Scheduled and Done. Tap a done one to bring it back.", v: "1.0.0", page: F + 'todos/todos.html' },
        { id: "checklists", icon: "☑️", title: "Checklists", cat: "Tasks", text: "Dailies and To-Dos can have checklist lines. Ticking a line gives no XP. Daily lines reset each day; To-Do lines stay ticked.", v: "1.0.0", page: F + 'todos/todos.html' },
        { id: "quests", icon: "🗺️", title: "Quests", cat: "Tasks", text: "Big goals made of tasks, like a course or a project. Main or Side. Tasks can be grouped into chapters. A quest finishes when every task is done, and pays its loot once.", v: "1.0.0", page: F + 'quests/quests.html' },
        { id: "focus-quest", icon: "🎯", title: "Focus quest", cat: "Tasks", text: "One quest is your focus. It sits on top of Quests and in Home's Today card.", v: "1.0.0", page: F + 'quests/quests.html' },
        { id: "quest-page", icon: "📜", title: "Quest page extras", cat: "Tasks", text: "A quest's own page shows all its tasks, plus extras it may have: Ghost Logs (challenges scored red, yellow or green for partial XP), side quests and related Dictionary words.", v: "1.0.0", page: F + 'quests/quests.html' },
        { id: "reorder", icon: "✋", title: "Hold to move", cat: "Tasks", text: "Hold a habit, daily or To-Do card, then drag it to a new spot.", v: "1.0.0", page: F + 'habits/habits.html' },
        { id: "hive-coach", icon: "🧭", title: "Hive Coach", cat: "Tasks", text: "A daily you keep missing gets a card from Eve. She offers a fix: less often, more time, smaller, or a 6:30 PM reminder. Any choice hides the card for 2 weeks.", v: "1.0.4", page: F + 'dailies/dailies.html' },
        { id: "reminders", icon: "⏰", title: "Reminders", cat: "Tasks", text: "Add reminder times to a daily or To-Do. They ring in the Android app only.", v: "1.0.4", page: F + 'notifications/notifications.html' },
        { id: "steps-dailies", icon: "👟", title: "Step dailies", cat: "Tasks", text: "Android app only. A daily named like \"Walk 8000 steps\" checks itself off when your phone's step count gets there.", v: "1.0.4", page: F + 'settings/settings.html' },
        { id: "time-xp", icon: "⏱️", title: "XP is time", cat: "XP & levels", text: "XP = minutes × a difficulty bonus: Trivial ×0.75, Easy ×1, Medium ×1.25, Hard ×1.5. Minutes come from the time you set, a time in the title (\"for 20 minutes\"), or the difficulty's default.", v: "1.0.4", page: F + 'dailies/dailies.html' },
        { id: "time-log", icon: "📝", title: "How long did it take?", cat: "XP & levels", text: "After a check-off, a pop-up asks the real minutes. Saving counts those instead of the plan. Skip keeps the plan. Turn it off in Settings › Tracking.", v: "1.0.4", page: F + 'settings/settings.html' },
        { id: "levels", icon: "⭐", title: "Levels", cat: "XP & levels", text: "The top bar fills with XP. When it's full, tap LEVEL UP to claim the level. Each level costs a little more XP. The bar changes colour every 10 levels.", v: "1.0.0", page: F + 'home/home.html' },
        { id: "levelup-rewards", icon: "🎁", title: "Level-up rewards", cat: "XP & levels", text: "Every level gives a bee egg, gacha tickets, a random material and full Queen health. Each working Queen's Attendant adds a Royal Nectar.", v: "1.0.0", page: F + 'home/home.html' },
        { id: "past-50", icon: "✦", title: "Past level 50", cat: "XP & levels", text: "After level 50 the number keeps going (LV 51, 52…). Each of these levels also gives a hatched Epic bee, 5 tickets and a Royal Jelly.", v: "1.0.5", page: F + 'home/home.html' },
        { id: "ranks", icon: "🎖️", title: "Ranks", cat: "XP & levels", text: "A new rank every 5 levels, and Tiers past level 50 (one every 5 levels). Each rank stays a secret until you reach it. Press Rank up on Home to claim its badge and reward.", v: "1.0.5", page: F + 'home/home.html' },
        { id: "messages", icon: "💬", title: "Messages", cat: "App & settings", text: "Short messages pop up at the top and go away after 2.5 seconds, or tap anywhere to close them. Errors and messages with a button (like Undo) stay longer.", v: "1.0.5" },
        { id: "rank-ladder", icon: "🎖️", title: "Rank ladder", cat: "XP & levels", text: "Ranks & Titles shows every level as a step you climb from the bottom, opening at yours. Each level has its own badge: every rank has its own emblem, and the metal changes each level (Bronze, Silver, Gold, Platinum, Obsidian). Levels you haven't reached show ???.", v: "1.0.5", page: F + 'titles/titles.html' },
        { id: "support", icon: "🛟", title: "Contact support", cat: "App & settings", text: "Something wrong? Settings › Contact support (also in the menu and at the bottom of the Guide). Pick a topic, say what happened and add your email. You get a reply by email. It sends the app version, the page you came from and your bee name, never your tasks, notes or save.", v: "1.0.5", page: F + 'support/support.html' },
        { id: "daily-bonus", icon: "🎁", title: "Daily bonus", cat: "XP & levels", text: "Open the app each day for a bonus, right after Start My Day. Each day moves you along a 7-day week: coins, Pollen, Royal Nectar, and a Gacha ticket on day 7. Miss a day and it starts again at day 1.", v: "1.0.5", intro: true, page: F + 'home/home.html' },
        { id: "app-copy", icon: "📲", title: "The app runs from your phone", cat: "App & settings", text: "The Android app keeps its own copy of BizzyBee, so pages open from your phone, not the internet. After each update it downloads only the files that changed. A new version opens the next time you start the app (or tap Restart now). If one ever fails to start, the app goes back to the last good one by itself. Sign-in and cloud sync still use the internet.", v: "1.0.5" },
        { id: "settings-groups", icon: "⚙️", title: "Settings groups", cat: "App & settings", text: "Settings is a short list of groups: Account & cloud, Notifications & phone, Look & feel, Eve & help, Tracking, Your data and About. Tap one to open it, ← to go back. Search finds any setting. A red dot means something there needs you.", v: "1.0.5", page: F + 'settings/settings.html' },
        // Nov 1 2026 (Craft): Batch 13 (brought back from 1.0.7).
        // Nov 1 2026 (Craft): Batch 13 (B).
        { id: "hand", icon: "✋", title: "Left or right hand", cat: "App & settings", text: "Settings › Look & feel › Buttons on: Left or Right. Check boxes, + and − move to your thumb's side.", v: "1.0.5", intro: true, page: F + 'settings/settings.html' },
        { id: "hive-slots", icon: "🐝", title: "A hive that grows", cat: "Hive Mind", text: "Each job takes more bees as your hive grows, like a real colony: about 4 in 5 bees work. Merging two bees can give a talent your hive is missing.", v: "1.0.5", page: F + 'hive-mind/hive-mind.html' },   // Nov 3 2026 (Craft)
        { id: "hive-defense", icon: "⚔️", title: "Hive Defense", cat: "Bees & eggs", text: "A plugin battle with your bees. Tap a bee, move (blue), sting (red), heal (green). Hills hit harder, hive points give honey, call bees at your base, take the wasp nest to win. Practice mode for now.", v: "1.0.5", page: PL + 'hive-defense/hive-defense.html' },   // Nov 6 2026 (Craft)
        { id: "merge-picker", icon: "🧬", title: "Merge picker", cat: "Bees & eggs", text: "Gacha › Combine groups bees by talent. Spare = its job is full or not open yet: good to merge. No job = a slot is free, so give it the job instead. Weakest bees are listed first.", v: "1.0.5", page: F + 'gacha/gacha.html' },   // Nov 3 2026 (Craft)
        { id: "auto-swap", icon: "🔄", title: "Auto-swap", cat: "Hive Mind", text: "Tired bees hand their job to a rested bee with the same talent. Set the stamina % in Hive Life. Comes with auto-manage, or from the Honey Mart.", v: "1.0.5", page: F + 'hive-mind/hive-mind.html' },
        { id: "honey-mart", icon: "🍯", title: "Honey Mart", cat: "Store & items", text: "Buy and sell like a real shop. Flip pockets with ◀ ▶, pick how many with ▲ ▼. Selling gives half an item's worth. Items bees hold can be sent to a friend as a gift; it arrives in their Mailbox.", v: "1.0.5", intro: true, page: F + 'honey-store/honey-store.html' },
        { id: "eve-popup", icon: "👸", title: "Eve on Home", cat: "Getting started", text: "When bees need help, Eve (or Adam, if your royal is a King) pops up for a moment. Tap her to check on them.", v: "1.0.5", page: F + 'home/home.html' },
        { id: "home-tiles", icon: "📌", title: "Your Home tiles", cat: "Getting started", text: "Hold a Home tile to edit Home: ✕ removes a tile, ＋ adds any page, Reset Home goes back. In the menu, hold a page to pin it to Home.", v: "1.0.5", intro: true, page: F + 'home/home.html', steps: [{ page: 'home', sel: '#home-app-grid', text: 'Hold any tile here to edit your Home.' }] },
        { id: "title-perks", icon: "🎁", title: "Title perks", cat: "XP & levels", text: "Wear a special title and it adds a little to every Daily bonus.", v: "1.0.5", intro: true, page: F + 'titles/titles.html' },
        { id: "hive-auto", icon: "🐝", title: "A growing hive", cat: "Hive Mind", text: "Your hive grows as you level up. Each job takes one bee, and only a bee with the talent for it. A red dot means a job is waiting. Fill them all and see what happens.", v: "1.0.5", intro: true, page: F + 'hive-mind/hive-mind.html' },
        { id: "thumb-pad", icon: "💎", title: "Thumb pad", cat: "Getting started", text: "Press and hold the gold ＋ to pull out a see-through pad: Back, Home, Dailies, New, To-Dos and Habits. Drag it anywhere. Tap the middle to fold it. Triple-tap it, or tap the empty ＋, to put it back.", v: "1.0.5", intro: true, page: F + 'home/home.html', steps: [{ page: 'home', sel: '.dk-add', text: 'Press and hold this ＋ to pull out your thumb pad.' }] },
        { id: "calendar-alarm", icon: "📅", title: "Add to calendar, set alarm", cat: "Tasks", text: "A To-Do with a due date, or a Quest with a deadline, gets Add to calendar and Set alarm. In the Android app they open your phone's calendar and Clock. On the website you get a calendar file; alarms are app only.", v: "1.0.5", intro: true, page: F + 'todos/todos.html' },
        { id: "terminal-shell", icon: "💻", title: "Terminal commands", cat: "Plugins", text: "For people who know terminals: ls, cd, cat, find, grep, head, wc, pipes with |, and Tab to complete. A backup is made when it opens; Revert puts it back. Cloud sync pauses while it's open.", v: "1.0.5", page: PL + 'terminal/terminal.html' },
        { id: "quest-history", icon: "🕘", title: "Quest history", cat: "Tasks", text: "Each quest has a History section: every task you finished, day by day, with the time and XP, plus totals. Tap it to open.", v: "1.0.5", intro: true, page: F + 'quests/quests.html' },
        { id: "text-look", icon: "🔤", title: "Text presets and fonts", cat: "App & settings", text: "Settings › Look & feel: one-tap presets (Default, Easy read, Big & bold, Compact) and a font for reading text. Fine-tune colors and sizes below them.", v: "1.0.5", intro: true, page: F + 'settings/settings.html' },
        { id: "tips-hide", icon: "💡", title: "Hide a page's tips", cat: "Getting started", text: "On one of Eve's tips, Got it hides them until you reopen the app. Don't show again hides that page's tips for good. Settings › Eve & help › Show tips again brings them all back. The Guide puts a ✓ on features you've seen.", v: "1.0.5", page: F + 'guide/guide.html' },
        { id: "dictionary-links", icon: "📖", title: "Dictionary links", cat: "Plugins", text: "Each term links to MDN, the free open-source web reference. Fill from MDN copies the meaning and code, with a credit line.", v: "1.0.5", page: PL + 'dictionary/dictionary.html' },
        { id: "limited-gifts", icon: "🎁", title: "Gifts and limited bees", cat: "Bees & eggs", text: "Limited bees like Grimzy (Halloween 2026) are numbered: only 50 exist. The creator can send one as a gift with a letter. It pops up the next time you open BizzyBee, and waits in your Mailbox until you add it. Limited bees never die and keep their name.", v: "1.0.5", page: F + 'mailbox/mailbox.html' },
        { id: "titles", icon: "🏅", title: "Titles", cat: "XP & levels", text: "Earn titles by doing things, like finishing quests or keeping a streak. Equip one and it shows next to your rank. Titles you haven't earned stay a secret (???).", v: "1.0.5", intro: true, page: F + 'titles/titles.html' },
        { id: "checklist-edit", icon: "☑️", title: "Tick steps while editing", cat: "Tasks", text: "On a To-Do or Daily edit screen, tick checklist steps off right there.", v: "1.0.5", page: F + 'todos/todos.html' },
        { id: "mailbox-updates", icon: "🆕", title: "Updates in the Mailbox", cat: "Social", text: "The Mailbox has two tabs: Letters, and Updates (every What's New, newest first).", v: "1.0.5", page: F + 'mailbox/mailbox.html' },
        { id: "queen-health", icon: "❤️", title: "Queen health", cat: "XP & levels", text: "Your Queen has 50 health. Missed dailies and bad habits hurt her; harder tasks hurt more. Each finished task heals 1. Leveling up refills her.", v: "1.0.0", page: F + 'home/home.html' },
        { id: "queen-faint", icon: "😵", title: "If your Queen faints", cat: "XP & levels", text: "At 0 health she faints. You lose 10% of your coins and this level's XP progress (never a level). She comes back at half health and every bee gets sadder.", v: "1.0.0", page: F + 'home/home.html' },
        { id: "coins", icon: "🪙", title: "Honey coins", cat: "XP & levels", text: "Finishing tasks earns coins: Trivial 1, Easy 2, Medium 3, Hard 5. Unchecking takes them back. Spend them on Streak Charms and incubators.", v: "1.0.0", page: F + 'honey-store/honey-store.html' },
        { id: "streak-savers", icon: "🛡️", title: "Streak savers", cat: "XP & levels", text: "In Start My Day a missed daily's streak can be saved. Guard Bees go first, then Streak Charms. A saved day keeps the streak but gives no XP.", v: "1.0.0", page: F + 'honey-store/honey-store.html' },
        { id: "done-today", icon: "✨", title: "Done today", cat: "XP & levels", text: "Tap XP today on Home to see everything you finished today, with times. Tap a row to open that task. History shows any past day.", v: "1.0.4", page: F + 'home/home.html' },
        { id: "home-strip", icon: "📊", title: "Home stats", cat: "XP & levels", text: "Hive Mind (with your bee count), XP today, current streak and your focus quest. Weather shows too when it's on, and steps in the Android app.", v: "1.0.4", page: F + 'home/home.html' },
        { id: "history", icon: "🕘", title: "History", cat: "XP & levels", text: "Everything you finished on any day, with the time. Use ‹ › to step through days. Tap a row to open that task.", v: "1.0.5", intro: true, page: F + 'history/history.html' },
        { id: "dashboard", icon: "📈", title: "Dashboard", cat: "XP & levels", text: "Total XP, level, best streak and quests. Claim a level up right here. Hours per skill on the road to 10,000, and XP for the last 14 days.", v: "1.0.0", page: F + 'dashboard/dashboard.html' },
        { id: "map", icon: "🧭", title: "Map", cat: "XP & levels", text: "Your quests as a hex trail: finished ones at the bottom, the current one in red, the rest ahead.", v: "1.0.0", page: F + 'map/map.html' },
        { id: "profile", icon: "🪪", title: "Profile", cat: "XP & levels", text: "Your photo, royal, bees, quests done, skills mastered, active days and what's in progress.", v: "1.0.0", page: F + 'profile/profile.html' },
        { id: "skills-honeycomb", icon: "🌱", title: "Skills honeycomb", cat: "Skills", text: "Each skill is a hex cell with its level and bar. Tap one for real and estimated time, XP, recent check-offs, Level up, its path and Merge.", v: "1.0.5", intro: true, page: F + 'skills/skills.html' },
        { id: "skill-counting", icon: "🔗", title: "What counts toward a skill", cat: "Skills", text: "A task counts through its tags, or through a Dictionary word for that skill in its title or notes. Only good (+) habit taps count. You can switch a skill off for one task.", v: "1.0.4", page: F + 'skills/skills.html' },
        { id: "skill-measure", icon: "🔢", title: "Time or times done", cat: "Skills", text: "A skill counts your hours, or how often you do it. Pick it under Counts by. For times done, time is optional.", v: "1.0.5", page: F + 'skills/skills.html' },
        { id: "everyday-skills", icon: "💡", title: "Smart everyday skills", cat: "Skills", text: "14 built-in skills (Fitness, Study, Coding, Home…) know everyday words: \"Go for a run\" counts toward Fitness. Do 2 things that fit one you don't have, and Eve asks if you want it. No means she won't ask again.", v: "1.0.5", page: F + 'skills/skills.html' },
        { id: "skill-levels", icon: "🆙", title: "Skill levels", cat: "Skills", text: "Each level needs more hours. Stages: Novice, Apprentice, Practitioner, Expert, Master, Grandmaster. A full bar waits until you tap Level up. Each level-up gives Pollen and a material.", v: "1.0.4", page: F + 'skills/skills.html' },
        { id: "skill-paths", icon: "🛤️", title: "Skill paths", cat: "Skills", text: "Each skill has a row of milestones, each claimed once. Rewards climb from Pollen to Royal Jelly, with a bee near the end. A red dot means one is waiting.", v: "1.0.5", page: F + 'skills/skills.html' },
        { id: "skill-merge", icon: "🔀", title: "Merge skills", cat: "Skills", text: "Join two look-alike skills, like \"JS\" into JavaScript. Only skill names change. A backup is made first, and Undo is right there.", v: "1.0.5", page: F + 'skills/skills.html' },
        { id: "starter-skills", icon: "🎯", title: "Pick your skills", cat: "Skills", text: "\"What are you working on?\" shows after your egg hatches, and on the Dashboard while you have no skills.", v: "1.0.4", page: F + 'dashboard/dashboard.html' },
        { id: "skills-mastered", icon: "🏆", title: "Skills mastered", cat: "Skills", text: "Codex skills master themselves once their skill has enough hours. They show on your Profile and on coding skill paths.", v: "1.0.0", page: F + 'profile/profile.html' },
        { id: "dictionary", icon: "📖", title: "Dictionary", cat: "Skills", text: "A plugin. Your words, with meaning, code, examples and links. Each category is a skill. A new tag next to a skill asks \"Add to Dictionary?\" first.", v: "1.0.5", intro: true, page: PL + 'dictionary/dictionary.html' },
        { id: "eggs", icon: "🥚", title: "Eggs", cat: "Bees & eggs", text: "New bees start as eggs in the Nursery for 7 days (6 with a Nurse). An egg hides what's inside. After 2 more days a ready egg hatches by itself.", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "hatch", icon: "🐣", title: "Tap to hatch", cat: "Bees & eggs", text: "A ready egg waits for you. Tap it to crack it open and meet your new bee.", v: "1.0.5", intro: true, page: F + 'home/home.html', steps: [{ page: 'home', sel: '#home-ready', text: 'When an egg is ready, tap here to hatch it.' }] },
        { id: "hive-bees", icon: "🐝", title: "Hive Bees", cat: "Bees & eggs", text: "Your card binder, in Cover Flow. Drag or use the click wheel; flick fast to jump by codex number. Sort by Codex No., Name, Rarity or Newest, search, or open the GRID (the wheel works there too). Tap the middle card to see it big; Care & details has its stats, bed and items.", v: "1.0.0", page: F + 'hive-bees/hive-bees.html' },
        { id: "rarities", icon: "💎", title: "Rarities", cat: "Bees & eggs", text: "Common 92%, Rare 7%, Epic 0.9%, Legendary 0.1%. Named Beasts come only from 10 tickets or an Identity Card. Your Royal is your Queen or King.", v: "1.0.0", page: F + 'gacha/gacha.html' },
        { id: "bee-stats", icon: "📋", title: "Bee stats", cat: "Bees & eggs", text: "Each bee rolls HP, offense, defense, speed and power by rarity, with one strong and one weak stat. It also gets an element and a weight.", v: "1.0.0", page: F + 'hive-bees/hive-bees.html' },
        { id: "bee-sex-talent", icon: "⭐", title: "Sex and talent", cat: "Bees & eggs", text: "About 1 in 10 bees is male; males can only be Drones. Each bee is born with a talent: 20% better at that job (⭐).", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "birth-traits", icon: "🧬", title: "Birth traits", cat: "Bees & eggs", text: "Some bees are born with a trait, like a slower hunger, faster foraging or extra raid defense.", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "bee-jobs", icon: "🛠️", title: "Bee jobs", cat: "Bees & eggs", text: "Foragers find materials when you finish tasks. Scouts find tickets. Guards fight raids and save streaks. Honey Makers make Honey Drops. Nurses heal and hatch. Each job helps in its own way; its card says how.", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "bee-vitals", icon: "🐝", title: "Bee stats, hour by hour", cat: "Bees & eggs", text: "Health, stamina, fatigue, food and mood change every hour. Bees work 7 AM–10 PM and sleep at night. Not-well bees work worse and tire faster.", v: "1.0.5", intro: true, page: F + 'hive-bees/hive-bees.html', steps: [{ page: 'hive-bees', sel: '.cb-tile, .row[data-bee]', text: 'Tap a bee to see what is changing right now, with ▲ and ▼ per hour.' }] },
        { id: "feeding", icon: "🍯", title: "Feeding the hive", cat: "Bees & eggs", text: "Every finished task feeds all your bees a little and cheers them up. Resting bees eat too.", v: "1.0.5", page: F + 'hive-mind/hive-mind.html' },
        { id: "no-job", icon: "😠", title: "Bees need a job", cat: "Bees & eggs", text: "A bee with no job for 3 days gets upset. Give jobs inside the Hive Mind (tap a comb). Recuperate is a job with no work: the bee eats, sleeps and heals slowly.", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "not-well", icon: "🤒", title: "Not well", cat: "Bees & eggs", text: "Hungry, tired, sick or hurt bees work worse and tire faster. Two problems or more make it worse. A severely hurt bee can't work.", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "fatigue", icon: "💤", title: "Forced rest", cat: "Bees & eggs", text: "Fatigue builds while a bee works. At 100 it must rest for 2 days.", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "nursery", icon: "🛏️", title: "Nursery beds", cat: "Bees & eggs", text: "Sick or hurt bees can take a bed: 2 beds, +1 per Nurse. In bed, health comes back 4× faster and sickness 2× faster. A bee leaves its bed at 90 health.", v: "1.0.5", intro: true, page: F + 'hive-bees/hive-bees.html' },
        { id: "fainting", icon: "😵‍💫", title: "Fainted bees", cat: "Bees & eggs", text: "A bee at 0 health faints and can't work. Revive it for 10 Honey Drops.", v: "1.0.5", page: F + 'hive-mind/hive-mind.html' },
        { id: "bees-need-help", icon: "🆘", title: "Bees need help", cat: "Bees & eggs", text: "Home lists which bees need what, and how to fix it.", v: "1.0.5", page: F + 'home/home.html' },
        { id: "named-beasts", icon: "🦁", title: "Named Beasts", cat: "Bees & eggs", text: "A Named Beast keeps its name and gets a title with a small power. Some titles lock the bee's job.", v: "1.0.0", page: F + 'gacha/gacha.html' },
        { id: "rename", icon: "✏️", title: "Name your bee", cat: "Bees & eggs", text: "Every bee gets a random name. Rename it with the ✏️ on its big card (Hive Bees), or tap 🎲 for another.", v: "1.0.0", page: F + 'hive-bees/hive-bees.html' },
        { id: "card-glare", icon: "✨", title: "Shiny cards", cat: "Bees & eggs", text: "Rare and better bee cards catch the light as you tilt your phone. On a computer, move the mouse over the card. Common cards don't shine.", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "card-memories", icon: "💭", title: "Card memories", cat: "Bees & eggs", text: "Rare and better cards remember when they came, how (a pull, level up, rank up, skill reward…) and the last task you finished. Flip the big card to read it. Cards from before this update say \"From before memories.\"", v: "1.0.5", intro: true, page: F + 'hive-bees/hive-bees.html' },
        { id: "card-stats", icon: "📏", title: "Height and Recovery", cat: "Bees & eggs", text: "Each card shows height and weight, and Recovery (how well the bee recovers, 1 to 100). Recovery does nothing yet; it will later.", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "bee-serials", icon: "🔖", title: "Serial numbers", cat: "Bees & eggs", text: "Every bee has its own serial number (like BZ-7K3M-Q9TD) on the silver plate at the bottom of its card. It never changes.", v: "1.0.5", page: F + 'hive-bees/hive-bees.html' },
        { id: "keeperdex", icon: "📇", title: "KeeperDex", cat: "Bees & eggs", text: "A card for every rarity and element. Cards you haven't found are greyed out and face-down on both sides. Tap a found card to see it big, tap again to flip it.", v: "1.0.0", page: F + 'keeperdex/keeperdex.html' },
        { id: "models", icon: "🧩", title: "Bee Models", cat: "Bees & eggs", text: "Every kind of bee stays a silhouette until you meet it. Tap a locked one to learn how to find it.", v: "1.0.0", page: F + 'models/models.html' },
        { id: "incubator", icon: "🥚", title: "Egg Incubator", cat: "Bees & eggs", text: "Buy one in the Honey Store with Honey coins; that turns its page on. Your steps and finished dailies hatch eggs inside faster.", v: "1.0.5", intro: true, page: PL + 'incubator/incubator.html' },
        { id: "hive-mind", icon: "🏰", title: "Hive Mind", cat: "Hive Mind", text: "Your hive outside and in. Inside, Hive Life shows six combs: tap one to manage its bees. Classic shows the honey cells.", v: "1.0.0", page: F + 'hive-mind/hive-mind.html' },
        { id: "hive-growth", icon: "🍯", title: "Hive growth", cat: "Hive Mind", text: "The hive grows at levels 5, 10, 20 and 35. More honey cells light up as you level. Missed tasks and bad habits hollow some out for 2 weeks.", v: "1.0.0", page: F + 'hive-mind/hive-mind.html' },
        { id: "missed-work", icon: "⚠️", title: "Missed work hurts the hive", cat: "Hive Mind", text: "Each missed daily or late To-Do costs every bee some health and mood. Bees may get sick or hurt.", v: "1.0.5", page: F + 'hive-mind/hive-mind.html' },
        { id: "raids", icon: "⚔️", title: "Raids", cat: "Hive Mind", text: "Each day there's a chance of a raid, higher on a missed-days streak. Guards and Sealers defend. A win gives Pollen; a loss hurts up to 2 bees.", v: "1.0.5", page: F + 'hive-mind/hive-mind.html' },
        { id: "counter-raid", icon: "🗡️", title: "Counter-raid", cat: "Hive Mind", text: "Once a day, send your 3 strongest bees out. A win gives 2 Royal Nectar. A loss costs health and stamina.", v: "1.0.5", page: F + 'hive-mind/hive-mind.html' },
        { id: "hive-streak", icon: "📈", title: "Hive streak and mood", cat: "Hive Mind", text: "+N is days in a row with every daily done; −N is days missing one. A good streak cheers bees up and lowers raid risk.", v: "1.0.5", page: F + 'hive-mind/hive-mind.html' },
        { id: "hive-news", icon: "📰", title: "Hive news", cat: "Hive Mind", text: "Raids, faints, hatches and honey are logged on the Hive Mind. News since your last visit pops up when you open the app.", v: "1.0.5", page: F + 'hive-mind/hive-mind.html' },
        { id: "live-sky", icon: "🌧️", title: "Live sky", cat: "Hive Mind", text: "The Hive Mind follows the time of day and your real weather. Set the weather in Settings › Weather.", v: "1.0.4", page: F + 'hive-mind/hive-mind.html' },
        { id: "gacha", icon: "🌼", title: "Pollination Chamber", cat: "Store & items", text: "1 ticket = 1 pull. Your 6th pull in a row without a Rare is a sure Rare or better. Pulled bees arrive as eggs.", v: "1.0.0", page: F + 'gacha/gacha.html' },
        { id: "named-beast-pull", icon: "🎫", title: "Named Beast pull", cat: "Store & items", text: "Spend 10 tickets and tear the foil for a sure Named Beast.", v: "1.0.0", page: F + 'gacha/gacha.html' },
        { id: "tickets", icon: "🎟️", title: "Where tickets come from", cat: "Store & items", text: "Level-ups, rank ups, big quests, every 5th skill level, skill path milestones and Scouts.", v: "1.0.0", page: F + 'gacha/gacha.html' },
        { id: "refine", icon: "♻️", title: "Destroy or combine", cat: "Store & items", text: "Destroy a bee for materials. Combine two bees into one with the better stats, and a small chance of a rarer bee. Your Royal can't be used.", v: "1.0.0", page: F + 'gacha/gacha.html' },
        { id: "materials", icon: "🌼", title: "Materials", cat: "Store & items", text: "Pollen, Royal Nectar, Honey Drop and Royal Jelly. From Foragers, level-ups, quests, skills, raids, Honey Makers and rank ups.", v: "1.0.0", page: F + 'inventory/inventory.html' },
        { id: "quest-loot", icon: "💰", title: "Quest loot", cat: "Store & items", text: "A finished quest gives material rolls by its size, with a bonus for finishing fast, and a small chance of an Evolution item.", v: "1.0.0", page: F + 'quests/quests.html' },
        { id: "evolution-items", icon: "💠", title: "Evolution items", cat: "Store & items", text: "Rare quest finds. Evolution Stone: one rarity up. Rebirth Stone: straight to Legendary. Others can add a trait. Use them from a bee's card.", v: "1.0.0", page: F + 'inventory/inventory.html' },
        { id: "honey-store", icon: "🏪", title: "Honey Store", cat: "Store & items", text: "Spend materials or coins on trait gear, the Identity Card (any bee becomes a Named Beast) and Streak Charms.", v: "1.0.0", page: F + 'honey-store/honey-store.html' },
        { id: "held-items", icon: "🍯", title: "Items bees hold", cat: "Store & items", text: "Rare and up hold items. Some get used up when needed (food, stamina, healing); gear stays on and helps in raids.", v: "1.0.5", intro: true, page: F + 'honey-store/honey-store.html', steps: [{ page: 'honey-store', sel: '#store-held-grid', text: 'Make items here. Then give one from a bee\'s card.' }] },
        { id: "inventory", icon: "🎒", title: "Inventory", cat: "Store & items", text: "What you own: materials, evolution items and store items. Items are used from a bee.", v: "1.0.0", page: F + 'inventory/inventory.html' },
        { id: "friends", icon: "🤝", title: "Friends' hives", cat: "Social", text: "Needs a cloud sign-in. Swap hive codes; when you both add each other, you can visit each other's Hive Mind. Look only. Friends' hives also show in the distance behind yours.", v: "1.0.5", intro: true, page: F + 'friends/friends.html' },
        { id: "mailbox", icon: "📬", title: "Mailbox", cat: "Social", text: "Letters from the creator. React with 👍 or 👎, and tap Connect to add his hive.", v: "1.0.5", intro: true, page: F + 'mailbox/mailbox.html' },
        { id: "suggestions", icon: "💬", title: "Send feedback", cat: "Social", text: "Send ideas and bug reports.", v: "1.0.0", page: F + 'suggestions/suggestions.html' },
        { id: "plugin-hub", icon: "🧩", title: "Plugins & Packs", cat: "Plugins", text: "Turn plugins on or off. On downloads its files to this device; off removes them, but your progress stays.", v: "1.0.4", page: F + 'plugin-hub/plugin-hub.html' },
        { id: "calendar", icon: "📅", title: "Calendar", cat: "Plugins", text: "Month, Week and Day views of your tasks, To-Do due dates and your own events. In the Android app, your phone's events too.", v: "1.0.0", page: PL + 'calendar/calendar.html' },
        { id: "study", icon: "📚", title: "Study", cat: "Plugins", text: "A queue of things to learn, with type, priority, status and link.", v: "1.0.0", page: PL + 'study/study.html' },
        { id: "projects", icon: "🛠️", title: "Projects", cat: "Plugins", text: "A gallery of your builds with previews and links.", v: "1.0.0", page: PL + 'projects/projects.html' },
        { id: "terminal", icon: "⌨️", title: "Terminal", cat: "Plugins", text: "For advanced users. Need help? Use Contact support instead. Type help to start. After support grants access, repair commands open up.", v: "1.0.0", page: PL + 'terminal/terminal.html' },
        { id: "clear-today", icon: "🧹", title: "Clear today", cat: "Plugins", text: "A Terminal repair command (needs access from support). Undoes today: check-offs, XP and level. A backup is made first.", v: "1.0.5", page: PL + 'terminal/terminal.html' },
        { id: "notifications", icon: "🔔", title: "Notifications", cat: "App & settings", text: "Android app only. To-Do deadlines, daily reminders, Start My Day and more. Tap a notification to open that task.", v: "1.0.4", page: F + 'notifications/notifications.html' },
        { id: "phone", icon: "📱", title: "Phone features", cat: "App & settings", text: "Android app: steps, face or fingerprint unlock, your phone calendar, vibration, daily phone backups and app updates.", v: "1.0.4", page: F + 'settings/settings.html' },
        { id: "permissions", icon: "🔐", title: "Permissions", cat: "App & settings", text: "Nothing is asked when the app opens. The first time a feature needs a permission, it explains why, then asks.", v: "1.0.4", page: F + 'settings/settings.html' },
        { id: "install", icon: "📲", title: "Install the app", cat: "App & settings", text: "A 📲 button appears when your browser can install BizzyBee. Pages load from your device after the first visit.", v: "1.0.4", page: F + 'home/home.html' },
        { id: "pull-refresh", icon: "🔄", title: "Pull to refresh", cat: "App & settings", text: "On a touch screen, pull down at the top to send changes, load a newer cloud copy and reload.", v: "1.0.4", page: F + 'home/home.html' },
        { id: "themes", icon: "🎨", title: "Themes", cat: "App & settings", text: "Change how the whole app looks. Halloween turns on by itself on Oct 31.", v: "1.0.5", intro: true, page: F + 'themes/themes.html' },
        { id: "appearance", icon: "🔠", title: "Text & look", cat: "App & settings", text: "Text colours, sizes, bold text and high contrast. Saved on this device.", v: "1.0.4", page: F + 'settings/settings.html' },
        { id: "phone-sync", icon: "🔗", title: "Phone Sync", cat: "App & settings", text: "Turn on a calendar feed link to see your own events and your Hard To-Dos (with a due date) in any calendar app. Dailies, habits and smaller To-Dos stay off it; their reminders cover them.", v: "1.0.4", page: F + 'sync/sync.html' },
        { id: "site-version", icon: "🔢", title: "Which version you're on", cat: "App & settings", text: "Settings › About › Website shows the update's date, batch and code. Send it with a problem report so it can be found fast.", v: "1.0.5", page: F + 'settings/settings.html' },   // Nov 2 2026 (Craft)
        { id: "whats-new", icon: "🆕", title: "What's New", cat: "App & settings", text: "Shows once after each update. Every update is listed in Settings › About.", v: "1.0.0", page: F + 'settings/settings.html' },
        { id: "habitica", icon: "⚔️", title: "Habitica sync", cat: "App & settings", text: "Add your Habitica User ID and API token, and Habits, Dailies and To-Dos sync both ways.", v: "1.0.0", page: F + 'account-info/account-info.html' },
        { id: "hive-archive", icon: "🗄️", title: "Hive Archive", cat: "App & settings", text: "Coming soon: a shelf for PDFs, books and articles.", v: "1.0.0", page: F + 'hive-archive/hive-archive.html' },
        { id: "sign-in", icon: "🔑", title: "Sign in", cat: "Account & saves", text: "Accounts are invite-only: tap Request access. Forgot your password? Reset it from the sign-in screen or Settings › Account.", v: "1.0.0", page: '/index.html' },
        { id: "one-device", icon: "📱", title: "One device at a time", cat: "Account & saves", text: "Your save is active on one device. Open BizzyBee somewhere else and that device takes over. The other shows \"Continue here\" and stops saving until you tap it.", v: "1.0.5", page: F + 'settings/settings.html' },
        { id: "cloud", icon: "☁️", title: "Cloud & sync", cat: "Account & saves", text: "An encrypted cloud copy of your save, uploaded as you go. Save to Cloud and Load from Cloud are in Settings › Cloud & sync.", v: "1.0.5", page: F + 'settings/settings.html' },
        { id: "daily-backups", icon: "🗄️", title: "Daily backups", cat: "Account & saves", text: "The cloud keeps one backup a day for the last 4 days, when your save changed. Restore one in Settings › Cloud & sync › More sync options.", v: "1.0.5", page: F + 'settings/settings.html' },
        { id: "device-backups", icon: "💾", title: "Device backups", cat: "Account & saves", text: "Your device keeps the last 3 recovery copies. One is made before imports, upgrades, merges and repairs, or when you tap Make a Copy.", v: "1.0.5", page: F + 'settings/settings.html' },
        { id: "export-import", icon: "📤", title: "Export & import", cat: "Account & saves", text: "Save your whole game as one file, with an optional PIN. Import replaces this device's save, after making a copy. The file name shows the save type.", v: "1.0.0", page: F + 'settings/settings.html' },
        { id: "save-folder", icon: "📁", title: "Save files folder", cat: "Account & saves", text: "On a computer (Chrome or Edge), pick a folder and your save file is kept up to date there.", v: "1.0.4", page: F + 'settings/settings.html' },
        { id: "account-info", icon: "🪪", title: "Account Info", cat: "Account & saves", text: "Your photo, name and details, locked behind a 6-digit PIN and encrypted with it.", v: "1.0.0", page: F + 'account-info/account-info.html' },
        { id: "security", icon: "🔒", title: "Security", cat: "Account & saves", text: "App Lock: a 4-digit PIN for this device, with face or fingerprint in the Android app. Plus the Account Info PIN.", v: "1.0.4", page: F + 'account-security/account-security.html' },
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
    function resetAll() { Vault.resetHints(); try { sessionStorage.removeItem(SNOOZE); } catch { /* storage off */ } step = 0; addAsk(); show(false); }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    return { show: () => { step = 0; show(true); }, setOn, resetAll, TIPS, GUIDE, seenGuide: () => seenGuide() };
})();
