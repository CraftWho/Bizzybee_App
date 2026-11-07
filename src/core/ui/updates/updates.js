// What's New + app updates (Oct 27 2026, approved demo).
//  - What's New: shows once after each website update, grouped New /
//    Improved / Fixed, with TRY buttons. Settings › About lists them all.
//  - App updates (Android app only): checks GitHub for a newer APK, then
//    downloads and installs it in the app (native BeeUpdater, app 1.0.6+).
//    The repo is private for now, so the app needs a read-only GitHub token
//    (Settings › About). When releases go public, no token is needed.
const APP_WEB_VERSION = '1.0.5';
const WHATS_NEW = [
    { id: 'w3', version: '1.0.5', date: 'Nov 2026',
      new: [
        { icon: '🥚', title: 'Egg Incubator', text: 'A plugin. Your steps and dailies hatch eggs faster.', href: 'plugins/incubator/incubator.html' },
        { icon: '🐣', title: 'Tap to hatch', text: 'Ready eggs wait for you. Tap to crack them open and meet your bee.', href: 'features/home/home.html' },
        { icon: '⏱️', title: 'Bees live hour by hour', text: 'Work drains stats by job. Everyone sleeps 10 PM to 7 AM.', href: 'features/hive-bees/hive-bees.html' },
        { icon: '🛏️', title: 'Nursery beds', text: 'Sick and hurt bees heal 4× faster in a bed.', href: 'features/hive-bees/hive-bees.html' },
        { icon: '🎒', title: 'Held items', text: 'Rare bees and up hold items from the Honey Store.', href: 'features/honey-store/honey-store.html' },
        { icon: '📘', title: 'Eve and the Guide', text: 'Eve is your coach. The Guide shows every feature, new ones first.', href: 'features/guide/guide.html' },
        { icon: '🎃', title: 'Themes and Halloween', text: 'Settings › Themes. Halloween turns on by itself on Oct 31, icon and all.', href: 'features/themes/themes.html' },
        { icon: '🤝', title: "Friends' hives", text: 'Swap hive codes and visit each other\'s Hive Mind. Look only.', href: 'features/friends/friends.html' },
        { icon: '📬', title: 'Mailbox', text: 'Letters from the creator. React and connect.', href: 'features/mailbox/mailbox.html' },
        // Nov 1 2026 (Craft): Batch 13 (B).
        // Nov 7 2026 (Craft): Batch 23.
        { icon: '🛟', title: 'Recover my account', text: 'On the egg screen, a small link opens Settings so you can get your cloud save back. It does not hatch or skip the egg.', href: 'features/settings/settings.html' },
        // Nov 6 2026 (Craft): Batch 22.
        { icon: '🎯', title: 'Real hours toward 10,000', text: 'Only time you log counts, everywhere: skills, levels, paths and titles. Nothing takes it away. Fill in later, an Archive for deleted tasks and a Change log in History.', href: 'features/dashboard/dashboard.html' },
        { icon: '🟥', title: 'XP debt shows on the bar', text: 'If penalties drop you below your level\'s start, the bar shows it in red with how much to recover.', href: 'features/home/home.html' },
        { icon: '🧬', title: 'Merge stuck bees first', text: 'The merge list puts bees that can\'t get a job first, weakest first. Tap 🧬 next to a stuck bee in the Rest Comb.', href: 'features/gacha/gacha.html' },
        // Nov 6 2026 (Craft): Batch 21.
        { icon: '🃏', title: 'Skills back on cards', text: 'Resting bees show their talent\'s skill again, dimmed until they work.', href: 'features/hive-bees/hive-bees.html' },
        { icon: '⚔️', title: 'Hive Defense (practice)', text: 'A new plugin: a hex battle with your own bees. Turn it on in the Plugin Hub.', href: 'plugins/hive-defense/hive-defense.html' },
        // Nov 3 2026 (Craft): Batch 20.
        { icon: '🧬', title: 'Merge picker', text: 'Combine shows bees by talent, marks spares and full jobs, weakest first. Rest Comb links straight to it.', href: 'features/gacha/gacha.html' },
        // Nov 3 2026 (Craft): Batch 19.
        { icon: '🐝', title: 'More bees at work', text: 'Each job takes more bees as your hive grows. Merges can bring a talent your hive is missing.', href: 'features/hive-mind/hive-mind.html' },
        // Nov 2 2026 (Craft): Batch 18.
        { icon: '🔢', title: 'Website version updates itself', text: 'Settings › About shows the date, batch and code of the version you are on.', href: 'features/settings/settings.html' },
        // Nov 2 2026 (Craft): Batch 17.
        { icon: '✋', title: 'Left or right hand', text: 'Settings › Look & feel: put check boxes and + / − on your thumb\'s side.', href: 'features/settings/settings.html' },
        { icon: '🐝', title: 'Element bees', text: 'Water, Fire, Wind and Earth bees each have their own look.', href: 'features/hive-bees/hive-bees.html' },
        // Nov 1 2026 (Craft): Batch 14.
        { icon: '📯', title: 'Something new in the Honey Mart', text: 'Look in the Special pocket.', href: 'features/honey-store/honey-store.html' },
        { icon: '📅', title: 'Quest deadlines remind you', text: 'Smart Notifications now cover Quests with a deadline.' },
        { icon: '👸', title: 'Eve and Adam, for real', text: 'Your own Queen or King pops up on Home.' },
        { icon: '🍯', title: 'Honey Mart', text: 'The store is a real shop now: Buy, Sell, pockets and a quantity box. Send bee items to friends; gifts arrive in the Mailbox.', href: 'features/honey-store/honey-store.html' },
        { icon: '👸', title: 'Eve on Home', text: 'Bees that need help no longer push your Home apps down. Eve pops up instead.' },
        { icon: '📌', title: 'Your Home, your tiles', text: 'Hold a tile to remove or add pages. Hold a page in the menu to pin it.', href: 'features/home/home.html' },
        { icon: '🎁', title: 'Title perks', text: 'A special title you wear adds a little to every Daily bonus.', href: 'features/titles/titles.html' },
        { icon: '🐝', title: 'A growing hive', text: 'New parts of your hive open as you level up. Each job needs a bee with the right talent.', href: 'features/hive-mind/hive-mind.html' },
        { icon: '💎', title: 'Thumb pad', text: 'Hold the gold ＋ to pull out a pad you can put anywhere: Back, Home, Dailies, New, To-Dos, Habits.' },
        { icon: '📅', title: 'Add to calendar, set alarm', text: 'On To-Dos with a due date and Quests with a deadline. Quests can have a deadline now.', href: 'features/todos/todos.html' },
        { icon: '💻', title: 'Terminal commands', text: 'ls, cd, find, grep, pipes and Tab. Revert puts your save back.', href: 'plugins/terminal/terminal.html' },
        // Nov 1 2026 (Craft): Batch 13, back from 1.0.7.
        { icon: '🕘', title: 'Quest history', text: 'Every quest shows what you finished, day by day, with time and XP.', href: 'features/quests/quests.html' },
        { icon: '🔤', title: 'Text presets and fonts', text: 'Settings › Look & feel: Easy read, Big & bold, Compact, and a font for reading.', href: 'features/settings/settings.html' },
        { icon: '💡', title: "Tips: Don't show again", text: "Hide one page's tips for good. Got it now only hides them until you reopen the app." },
        { icon: '🐝', title: 'Smoother bees', text: 'Hive Life bees walk and buzz more naturally, out of step with each other.' },
        { icon: '📖', title: 'Dictionary links to MDN', text: 'Terms link to MDN, the free open-source web reference.' },
        // Nov 1 2026 (Craft): Batch 12.
        { icon: '🎃', title: 'Grimzy', text: 'The numbered Halloween 2026 bee. Only 50 exist, sent as gifts with a letter.', href: 'features/mailbox/mailbox.html' },
        { icon: '⚙️', title: 'Settings in groups', text: 'A short list of groups instead of one long page, with search and red dots for anything that needs you.', href: 'features/settings/settings.html' },
        { icon: '🎃', title: 'Halloween is for Oct 31', text: 'The Halloween look turns on by itself on Halloween. The rest of the year it is BizzyBee.' },
        // Nov 1 2026 (Craft): Batch 11.
        { icon: '📲', title: 'Android: runs from your phone', text: 'The app keeps its own copy and downloads only what changed in each update. Faster, and less internet.' },
        // Nov 1 2026 (Craft): Batch 10.
        { icon: '🎁', title: 'Daily bonus', text: 'Open the app each day to move along a 7-day week of rewards. Day 7 gives a Gacha ticket.', href: 'features/home/home.html' },
        { icon: '🛟', title: 'Contact support', text: 'Something wrong? Settings › Contact support. You get a reply by email.', href: 'features/support/support.html' },
        { icon: '🔥', title: 'Streaks: 5 of anything', text: 'A day counts toward your streak once you finish 5 tasks: any mix of dailies, To-Dos and quest tasks. You don\'t have to finish everything. Every Sunday with a 7+ day streak: +75 XP.', href: 'features/home/home.html' },
        // Oct 31 2026 (Craft): Batch 9.
        { icon: '💬', title: 'Quicker messages', text: 'Messages go away after 2.5 seconds, or tap anywhere to close them.' },
        { icon: '🔤', title: 'New font', text: 'Courier Prime, built into the app, so it looks the same on every phone and computer.' },
        { icon: '📅', title: 'Calendar: only the big stuff', text: 'Your calendar now gets your own events and Hard To-Dos with a due date. Dailies, habits and small To-Dos stay off it.' },
        { icon: '🔁', title: 'Habitica fix', text: 'Dailies no longer show as done at midnight when Habitica hasn\'t started its new day yet.' },
        { icon: '🏅', title: 'Ranks & Titles', text: 'A ladder of every level, each with its own badge, opening at yours. Earn titles and equip one next to your rank. Past 50, a Tier every 5 levels.', href: 'features/titles/titles.html' },
        { icon: '☑️', title: 'Tick steps while editing', text: 'Check off checklist steps on the To-Do and Daily edit screens.', href: 'features/todos/todos.html' },
        { icon: '🥚', title: 'Incubators in the Honey Store', text: 'Buy an Egg Incubator with Honey coins, no plugin needed.', href: 'features/honey-store/honey-store.html' },
        { icon: '🆕', title: 'Mailbox updates', text: 'A new Updates tab lists every What\'s New.', href: 'features/mailbox/mailbox.html' },
        // Oct 31 2026 (Craft): Batch 7, the card binder.
        { icon: '💿', title: 'Hive Bees is your card binder', text: 'Cover Flow like the old iPod: drag, flick, or spin the click wheel. Sort, search, or switch to a grid of cards.', href: 'features/hive-bees/hive-bees.html' },
        { icon: '💭', title: 'Card memories', text: 'Rare and better cards remember how they came to you and the last task you finished. Flip the big card.', href: 'features/hive-bees/hive-bees.html' },
        { icon: '📏', title: 'New card stats', text: 'Height, Resistance and Recovery on every card. Jobs are set in the Hive Mind now.', href: 'features/hive-bees/hive-bees.html' },
        // Oct 31 2026 (Craft): Batch 6, Progress (from 1.0.6).
        { icon: '🕘', title: 'History', text: 'Everything you finished, day by day. Tap one to open it.', href: 'features/history/history.html' },
        { icon: '📊', title: 'Home stats', text: 'Weather and steps (Android app) join the stat strip. XP today and Done today now always match.', href: 'features/home/home.html' },
        { icon: '⬆️', title: 'Claim on the Dashboard', text: 'Level up ready? Claim it on the Dashboard too.', href: 'features/dashboard/dashboard.html' },
        { icon: '🔖', title: 'Serial numbers', text: 'Every bee card has its own serial number that never changes.', href: 'features/hive-bees/hive-bees.html' },
        { icon: '📇', title: 'Skill lines', text: 'KeeperDex skills now say what they do.', href: 'features/keeperdex/keeperdex.html' },
        { icon: '✨', title: 'Shiny cards', text: 'Rare and better cards catch the light as you tilt your phone.', href: 'features/hive-bees/hive-bees.html' },
        { icon: '🃏', title: 'KeeperDex cards flip', text: 'Cards you haven\'t found are greyed out and face-down. Tap a found card to see it big and flip it.', href: 'features/keeperdex/keeperdex.html' },
        // Oct 31 2026 (Craft): Batch 5, Skills (from 1.0.6, with ask-first).
        { icon: '🌱', title: 'Skills honeycomb', text: 'Each skill is a cell with its own path of milestones and rewards. A red dot means a reward is waiting.', href: 'features/skills/skills.html' },
        { icon: '💡', title: 'Smart skills', text: 'Plain words count: "Go for a run" counts toward Fitness. Skills count time or times done. Time is optional.', href: 'features/skills/skills.html' },
        { icon: '📖', title: 'Asks first', text: 'A new tag next to a skill asks before it goes in your Dictionary. New everyday skills ask too.', href: 'plugins/dictionary/dictionary.html' },
        { icon: '🔀', title: 'Merge skills', text: 'Join two look-alike skills, with Undo. A backup is made first.', href: 'features/skills/skills.html' },
        // Oct 31 2026 (Craft): Colony renamed Hive Mind everywhere.
        { icon: '🐝', title: 'Colony is now the Hive Mind', text: 'One name everywhere: Hive Mind and Hive Bees. Your bees, tickets and settings moved over by themselves.', href: 'features/hive-mind/hive-mind.html' },
        // Oct 31 2026 (Craft): ranks.
        { icon: '🎖️', title: 'Ranks', text: 'A rank and badge every 5 levels, Tiers after 50. Press Rank up on Home for tickets, materials and an egg.', href: 'features/home/home.html' },
        { icon: '📖', title: 'Richer Dictionary', text: 'Full term, code, examples, picture, MDN and W3Schools links.', href: 'plugins/dictionary/dictionary.html' },
      ],
      improved: [
        { icon: '🌅', title: 'Start My Day every morning', text: 'Even on a perfect day. See what you did and today\'s plan.' },
        { icon: '🩹', title: 'Hurt levels', text: 'Hurt, Badly hurt and Severely hurt replace Injured.' },
        { icon: '💤', title: 'Recuperate', text: 'A job with no work. Eat, sleep and heal.' },
        { icon: '🆘', title: 'Bee needs help', text: 'Home says exactly what each bee needs.' },
        { icon: '⬆️', title: 'Swipe up to go Home', text: 'Swipe up on the gold + button.' },
        // Oct 30 2026 (Craft): Terminal clear today.
        // Oct 31 2026 (Craft): Batch 1, stability.
        { icon: '📱', title: 'One device at a time', text: 'The device you open becomes active. Others show "Continue here", so saves never fight.' },
        { icon: '🗄️', title: 'Daily backups', text: 'One cloud backup a day, last 4 days kept. No more backups every few minutes.' },
        { icon: '🔔', title: 'Notifications in the app', text: 'Reminders ring in the Android app. The website no longer sends them.' },
        // Oct 31 2026 (Craft): speed.
        { icon: '⚡', title: 'Faster app', text: 'Pages load from your phone after the first visit, and the app opens offline.' },
        { icon: '🧹', title: 'Clear today', text: 'Terminal: type clear today to undo today\'s check-offs, XP and level.', href: 'plugins/terminal/terminal.html' },
      ],
      fixed: [
        // Nov 2 2026 (Craft): Batch 19.
        { icon: '🔐', title: 'Signing in on a new phone', text: 'Your hive loads before anything else. No more egg for an account that already has a hive.' },
        { icon: '👣', title: 'Steps', text: 'Now counts your whole day.' },
        // Oct 31 2026 (Craft): Batch 2.
        { icon: '🌙', title: 'Evening quest tasks', text: 'Quest tasks done after 8 PM now count on today, not tomorrow.' },
        { icon: '🎁', title: 'Fair rewards', text: 'A quest pays its loot once. Each task rolls materials once a day.' },
        { icon: '◀️', title: 'Back button', text: 'Goes back one page, not all the way Home.' },
        { icon: '🌤️', title: 'Header', text: 'The weather was removed from the header.' },
      ] },
    { id: 'w2', version: '1.0.4', date: 'Nov 2026',
      new: [
        { icon: '🔔', title: 'Notifications page', text: 'Everything that can remind you, in one place. See what\'s coming up.', href: 'features/notifications/notifications.html' },
        { icon: '👆', title: 'Tap a notification to open it', text: 'It opens that daily, To-Do or habit, and it glows.' },
        { icon: '🌅', title: 'Start My Day and habit reminders', text: 'A morning prompt, and a nudge for habits you haven\'t tapped.', href: 'features/notifications/notifications.html' },
        { icon: '🌧️', title: 'Live sky on the Hive Mind', text: 'Real day and night, sun, moon, clouds, rain, snow and storms.', href: 'features/hive-mind/hive-mind.html' },
        { icon: '🌤️', title: 'Weather in the header', text: 'A small animated icon and the temperature.', href: 'features/settings/settings.html#weather' },
        { icon: '✨', title: 'Done today', text: 'Tap XP today on Home to see everything you finished today.', href: 'features/home/home.html' },
        { icon: '🌱', title: 'Pick your skills', text: 'Choose what you\'re working on. Normal task names count toward it.', href: 'features/dashboard/dashboard.html' },
        { icon: '🔐', title: 'Face or fingerprint unlock', text: 'In the Android app, next to your App Lock PIN.', href: 'features/account-security/account-security.html' },
        { icon: '📅', title: 'Your phone calendar', text: 'Phone events in Calendar, and To-Do due dates in your phone.', href: 'features/settings/settings.html#phone-features' },
      ],
      improved: [
        { icon: '🔄', title: 'Cloud sync combines both copies', text: 'No more "both copies have changes". The newest change to each task wins.' },
        { icon: '🔥', title: 'Current streak on Home', text: 'Days in a row with every daily done.' },
        { icon: '💤', title: 'Resting bees eat', text: 'Bees in the Rest Comb fill back up.' },
      ],
      fixed: [] },
    { id: 'w1', version: '1.0.4', date: 'Oct 2026',
      new: [
        { icon: '🔔', title: 'Phone reminders', text: 'In the Android app. Work offline, with Done and Snooze on the alert.', href: 'features/settings/settings.html#phone-features' },
        { icon: '🌙', title: 'Evening check-in', text: '"3 dailies left today" at a time you pick. Works on the website too.', href: 'features/settings/settings.html#phone-features' },
        { icon: '🧠', title: 'Smart Notifications (beta)', text: 'Hard tasks and close deadlines keep after you.', href: 'features/settings/settings.html#phone-features' },
        { icon: '🔊', title: 'Alert sounds and rhythms', text: 'Pick your reminder sound, alarm sound and vibration rhythm.', href: 'features/settings/settings.html#phone-features' },
        { icon: '👟', title: 'Steps', text: 'From Health Connect. "Walk 8000 steps" dailies finish themselves.', href: 'features/settings/settings.html#permissions' },
        { icon: '🌦️', title: 'Weather on Home', text: 'Your area or a city you pick.', href: 'features/settings/settings.html#weather' },
        { icon: '📷', title: 'Profile photo', text: 'Tap your picture to take or choose a new one.', href: 'features/profile/profile.html' },
        { icon: '💾', title: 'Phone backups', text: 'A copy of your save goes to a folder you pick, once a day.', href: 'features/settings/settings.html#permissions' },
        { icon: '🛡️', title: 'Permissions', text: 'Asked only when a feature needs it. See them all in Settings.', href: 'features/settings/settings.html#permissions' },
        { icon: '⬆️', title: 'App updates', text: 'The Android app tells you when an update is out, and updates itself.', href: 'features/settings/settings.html#about' },
        { icon: '🛠️', title: 'Projects plugin', text: 'All your builds in one gallery.', href: 'features/plugin-hub/plugin-hub.html' },
        { icon: '✦', title: 'Prestige Tiers', text: 'Level 50 is the top. Then come Tiers.' },
        { icon: '💡', title: 'Hints and the Hive Coach', text: 'Tips on every page, and help when a task keeps getting missed.' },
        { icon: '⏰', title: 'To-Do deadline time', text: 'Give a To-Do a time. Smart Notifications count down to it.', href: 'features/todos/create-todo.html' },
      ],
      improved: [
        { icon: '↓', title: 'Pull down to refresh', text: 'And the app syncs when you come back to it.' },
        { icon: '🔥', title: 'Streak bonus XP', text: '+20 for all dailies, more at 3, 7, 30 and 100 days.' },
        { icon: '🐝', title: 'The whole hive feels missed work', text: 'Bees can get sick, hurt or worn out. Fatigue makes them rest.' },
        { icon: '🥚', title: 'Eggs keep their secrets', text: 'No rarity, stats or job until an egg hatches.' },
        { icon: '💬', title: 'New pop-up messages', text: 'Black and gold, from the top, with OK and Go to buttons.' },
        { icon: '🛠', title: 'Movable dev button', text: 'Drag it anywhere.' },
      ],
      fixed: [
        { icon: '🩹', title: 'Header flicker on short pages', text: 'Plus quest stats, form panels and Start My Day loading twice.' },
      ] },
];

const BizzyUpdates = (() => {
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const Cap = window.Capacitor;
    const isApp = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
    const P = (n) => (isApp && Cap.Plugins && Cap.Plugins[n]) || null;
    const REPO = 'CraftWho/Bizzybee_App';
    const TOKEN_KEY = 'bizzybee_gh_token', CHECK_KEY = 'bizzybee_update_checked', LATER_KEY = 'bizzybee_update_later';
    const root = () => { const i = location.pathname.indexOf('/src/'); return i >= 0 ? location.pathname.slice(0, i) : ''; };
    const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
    const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

    // ---------------- What's New ----------------
    const seenKey = () => (typeof Vault !== 'undefined' && Vault.state && Vault.state.whatsNewSeen) || null;
    function unseen() {
        const seen = seenKey();
        // By each entry's id, newest first (Oct 28 2026): two releases can share
        // a version number. An older save remembers a version instead of an
        // id; then only the newest entry is new.
        if (!seen) return WHATS_NEW;
        const i = WHATS_NEW.findIndex(e => e.id === seen);
        return WHATS_NEW.slice(0, i < 0 ? 1 : i);
    }
    function markSeen() {
        if (typeof Vault === 'undefined' || !Vault.state) return;
        Vault.state.whatsNewSeen = WHATS_NEW[0].id;
        Vault.save();
    }
    function itemHTML(it) {
        return `<div class="wn-it"><span class="wn-ic">${esc(it.icon)}</span><span class="wn-t">${esc(it.title)}<small>${esc(it.text)}</small></span>${it.href ? `<a class="wn-try" href="${root()}/src/${esc(it.href)}">TRY</a>` : ''}</div>`;
    }
    function entryHTML(e) {
        const grp = (cls, label, list) => list && list.length ? `<div class="wn-grp ${cls}"><h3>${label}</h3>${list.map(itemHTML).join('')}</div>` : '';
        return `<div class="wn-page"><div class="wn-top"><div class="wn-seal">🐝</div><h2>WHAT'S NEW</h2><div class="wn-sub">Version ${esc(e.version)} · ${esc(e.date)}</div></div>
            ${grp('new', '✦ NEW', e.new)}${grp('imp', '▲ IMPROVED', e.improved)}${grp('fix', '✚ FIXED', e.fixed)}</div>`;
    }
    function openWhatsNew(entries = unseen(), { onClose } = {}) {
        if (!entries.length || document.querySelector('.wn-scrim')) return;
        let i = 0;
        const s = document.createElement('div');
        s.className = 'wn-scrim';
        s.innerHTML = `<div class="wn" role="dialog" aria-modal="true" aria-label="What's new"><div class="wn-body"></div>
            <div class="wn-foot">${entries.length > 1 ? '<button type="button" class="wn-btn" data-k="prev">‹</button>' : ''}<button type="button" class="wn-btn go" data-k="ok">Got it</button>${entries.length > 1 ? '<button type="button" class="wn-btn" data-k="next">›</button>' : ''}</div>
            ${entries.length > 1 ? `<div class="wn-dots">${entries.map(() => '<i></i>').join('')}</div><p class="wn-more">Missed a few updates? Use ‹ › or swipe to see each one.</p>` : ''}</div>`;
        const body = s.querySelector('.wn-body');
        const draw = () => {
            body.innerHTML = entryHTML(entries[i]);
            s.querySelectorAll('.wn-dots i').forEach((d, n) => d.classList.toggle('on', n === i));
            const pv = s.querySelector('[data-k="prev"]'), nx = s.querySelector('[data-k="next"]');
            if (pv) pv.disabled = i === 0; if (nx) nx.disabled = i === entries.length - 1;
        };
        const close = () => { markSeen(); s.remove(); if (onClose) onClose(); };
        s.addEventListener('click', e => {
            const b = e.target.closest('[data-k]');
            if (e.target === s || (b && b.dataset.k === 'ok')) { close(); return; }
            if (b && b.dataset.k === 'prev' && i > 0) { i--; draw(); }
            if (b && b.dataset.k === 'next' && i < entries.length - 1) { i++; draw(); }
            if (e.target.closest('.wn-try')) markSeen();
        });
        let x0 = null;
        s.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
        s.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) { i = Math.max(0, Math.min(entries.length - 1, i + (dx < 0 ? 1 : -1))); draw(); } x0 = null; });
        draw();
        document.body.appendChild(s);
    }
    async function autoWhatsNew() {
        if (typeof Vault === 'undefined') return;
        await Vault.init();
        if (!Vault.state || (Vault.isOnboarding && Vault.isOnboarding())) return;
        // A brand-new player has nothing "new" to catch up on.
        if (!Vault.state.whatsNewSeen) {
            let xp = 0; try { xp = Vault.getUser().totalXP || 0; } catch {}
            if (xp === 0) { markSeen(); return; }
        }
        if (!unseen().length) return;
        // Wait for Start My Day / level-up screens to finish first.
        const busy = () => document.querySelector('.ds-scrim, .ss-scrim, .lvr, .gfx.on, dialog[open]');
        let tries = 0;
        const t = setInterval(() => { if (!busy() || ++tries > 120) { clearInterval(t); if (!busy()) openWhatsNew(); } }, 1000);
    }

    // ---------------- App updates (Android app) ----------------
    let latest = null;   // { version, size, notes, assetUrl, page }
    const token = () => get(TOKEN_KEY);
    async function installedVersion() {
        try { return (await P('App').getInfo()).version; } catch { return null; }
    }
    // Hidden build number. Always goes up, even if the version label doesn't.
    async function installedBuild() {
        try { return Number((await P('App').getInfo()).build) || 0; } catch { return 0; }
    }
    // Tags look like android-v1.0.9-b12. Older tags (android-v1.0.9) used the last number as the build.
    const buildOf = (tag, version) => { const b = String(tag).match(/-b(\d+)$/); return b ? Number(b[1]) : Number(String(version).split('.').pop()) || 0; };
    async function check({ quiet } = {}) {
        if (!isApp) return { state: 'web' };
        if (window.BB_PERSONAL) return { state: 'none' };   // Nov 2 2026 (Craft): BizzyBee Dev is rebuilt by hand
        const tk = token();
        const headers = { Accept: 'application/vnd.github+json' };
        if (tk) headers.Authorization = `Bearer ${tk}`;
        let r;
        try { r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers, cache: 'no-store' }); }
        catch { return { state: 'offline' }; }
        if (r.status === 404 || r.status === 401) return { state: tk ? 'bad-token' : 'no-token' };
        if (!r.ok) return { state: 'error', code: r.status };
        const rel = await r.json();
        const m = String(rel.tag_name || '').match(/(\d+\.\d+\.\d+)/);
        const apk = (rel.assets || []).find(a => /\.apk$/i.test(a.name));
        if (!m || !apk) return { state: 'none' };
        set(CHECK_KEY, String(Date.now()));
        const mine = await installedVersion();
        latest = { version: m[1], build: buildOf(rel.tag_name, m[1]), size: apk.size, notes: rel.body || '', assetUrl: apk.url, page: rel.html_url, date: rel.published_at };
        const myBuild = await installedBuild();
        const available = mine && (myBuild ? latest.build > myBuild : cmp(latest.version, mine) > 0);
        if (available && !quiet) offer();
        return { state: available ? 'available' : 'current', mine, latest };
    }
    function offer() {
        if (!latest || typeof Toast === 'undefined') return;
        if (get(LATER_KEY) === latest.version + '-' + latest.build) return;
        Toast.show(`⬆️ BizzyBee ${latest.version} is ready. Takes about a minute.`, 'neutral', { ms: 15000, action: { label: 'Update now', onClick: openUpdater } });
    }
    function mb(n) { return n ? `${(n / 1048576).toFixed(1)} MB` : ''; }
    async function openUpdater() {
        if (!latest) { const r = await check({ quiet: true }); if (r.state !== 'available' && r.state !== 'current') { if (typeof Toast !== 'undefined') Toast.show(problemText(r.state), 'negative'); return; } }
        if (document.querySelector('.up-scrim')) return;
        const mine = await installedVersion();
        const up = P('BeeUpdater');
        const s = document.createElement('div');
        s.className = 'up-scrim';
        s.innerHTML = `<div class="up-sheet" role="dialog" aria-modal="true" aria-label="App update">
            <h2>⬆️ APP UPDATE</h2>
            <div class="up-ver"><span class="old">${esc(mine || '?')}</span> → <span class="new">${esc(latest.version)}</span><span class="up-meta"> · ${mb(latest.size)}</span></div>
            <p class="up-meta">Your saves stay safe. They live in the cloud, not in the app.</p>
            <div class="up-bar"><i></i></div><p class="up-meta up-pct">${up ? 'Ready to download' : 'This app is too old to update itself. Use the GitHub page this one time.'}</p>
            <ol class="up-steps"><li><b>Download</b> happens right here.</li><li>Android asks <b>"Do you want to install this update?"</b> Tap <b>Update</b>.</li><li>BizzyBee reopens on the new version.</li></ol>
            <div class="up-btns"><button type="button" class="up-btn" data-k="close">Later</button><button type="button" class="up-btn go" data-k="go">${up ? 'Download &amp; install' : 'Open GitHub'}</button></div></div>`;
        document.body.appendChild(s);
        const bar = s.querySelector('.up-bar i'), pct = s.querySelector('.up-pct'), go = s.querySelector('[data-k="go"]');
        let file = null;
        s.addEventListener('click', async e => {
            const b = e.target.closest('[data-k]');
            if (e.target === s || (b && b.dataset.k === 'close')) { set(LATER_KEY, latest.version + '-' + latest.build); s.remove(); return; }
            if (!b || b.dataset.k !== 'go' || go.disabled) return;
            if (!up) { window.open(latest.page, '_blank'); return; }
            if (file) { await install(up); return; }
            go.disabled = true; go.textContent = 'Downloading…';
            const sub = await up.addListener('progress', p => {
                if (p.pct >= 0) { bar.style.width = p.pct + '%'; pct.textContent = `${p.pct}% · ${mb(p.done)} of ${mb(p.total)}`; }
                else pct.textContent = `${mb(p.done)} downloaded`;
            });
            try {
                const headers = { Accept: 'application/octet-stream' };
                if (token()) headers.Authorization = `Bearer ${token()}`;
                file = await up.download({ url: latest.assetUrl, headers });
                bar.style.width = '100%'; pct.textContent = 'Downloaded. Opening the Android installer…';
                go.textContent = 'Install'; go.disabled = false;
                await install(up);
            } catch (err) {
                pct.textContent = `Download failed: ${err && err.message ? err.message : 'try again'}.`;
                go.textContent = 'Try again'; go.disabled = false;
            } finally { try { sub.remove(); } catch {} }
        });
    }
    async function install(up) {
        const ok = await up.canInstall();
        if (!ok.allowed) {
            Toast.show('Android needs your OK once: allow BizzyBee to install updates, then come back and tap Install.', 'neutral', { ms: 20000, action: { label: 'Allow', onClick: () => up.openInstallSettings() } });
            return;
        }
        await up.install();
    }
    function problemText(state) {
        return state === 'no-token' ? 'Add your GitHub token in Settings › About to get app updates.'
            : state === 'bad-token' ? "GitHub didn't accept the token. Check it in Settings › About."
            : state === 'offline' ? "Couldn't reach GitHub. Check your connection."
            : "Couldn't check for updates right now.";
    }
    async function autoCheck() {
        if (!isApp || !token()) return;
        const last = Number(get(CHECK_KEY) || 0);
        if (Date.now() - last < 6 * 3600000) return;
        setTimeout(() => check().catch(() => {}), 6000);
    }

    // ---------------- Settings › About ----------------
    // Nov 2 2026 (Craft): the website version updates itself. Each deploy
    // writes /version.json (tools/stamp-version.mjs): date · batch · commit.
    // The commit points to the exact code on GitHub when something breaks.
    async function siteStamp() {
        const h = location.hostname;
        if (h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local') || (h === 'localhost' && !isApp)) return 'PC local';
        try {
            const v = await (await fetch(new URL('/version.json', location.origin), { cache: 'no-store' })).json();
            const day = v.builtAt ? new Date(v.builtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
            return [day, v.batch, v.commit ? String(v.commit).slice(0, 7) : ''].filter(Boolean).join(' · ') || 'unknown';
        } catch { return 'unknown'; }
    }
    async function renderAbout(host) {
        if (!host) return;
        const mine = isApp ? await installedVersion() : null;
        host.innerHTML = `
            <div class="row"><span class="hx">🐝</span><span class="mid"><b id="ab-title">BizzyBee ${esc(APP_WEB_VERSION)}</b><small id="ab-sub">Website …${mine ? ` · App ${esc(mine)}` : ''}</small></span><button type="button" class="btn" id="ab-update" hidden>Update</button></div>
            ${isApp ? `<div class="row"><span class="hx">🔁</span><span class="mid"><b>Check for updates</b><small id="ab-check-note">${get(CHECK_KEY) ? `Checked ${new Date(Number(get(CHECK_KEY))).toLocaleString()}` : 'Not checked yet'}</small></span><button type="button" class="btn" id="ab-check">Check</button></div>
            <div class="row ab-token"><span class="hx">🔑</span><span class="mid"><b>GitHub token</b><small>The app's releases are private for now. A read-only token lets this phone see them. It stays on this phone.</small>
                <span class="ab-tok-line"><input type="password" id="ab-token" autocomplete="off" placeholder="${token() ? 'Saved ✓ (paste to replace)' : 'github_pat_…'}"><button type="button" class="btn" id="ab-token-save">Save</button></span>
                <small><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Make one on GitHub</a>: Fine-grained → Only select repositories: Bizzybee_App → Repository permissions: Contents → Read-only.</small></span></div>` : ''}
            <button type="button" class="row" id="ab-news"><span class="hx">📰</span><span class="mid"><b>What's new</b><small>Every update and what changed</small></span><span class="chev">›</span></button>`;
        const $ = (id) => host.querySelector('#' + id);
        siteStamp().then(t => { $('ab-sub').textContent = `Website ${t}${mine ? ` · App ${mine}` : ''}`; });   // Nov 2 2026 (Craft)
        $('ab-news').addEventListener('click', () => openWhatsNew(WHATS_NEW));
        if (!isApp) return;
        const show = (r) => {
            $('ab-check-note').textContent = r.state === 'available' ? `Version ${r.latest.version} is ready.` : r.state === 'current' ? `You're on the newest version. Checked just now.` : problemText(r.state);
            $('ab-update').hidden = r.state !== 'available';
            $('ab-title').innerHTML = `BizzyBee ${esc(APP_WEB_VERSION)}${r.state === 'available' ? '<span class="ab-dot"></span>' : ''}`;
        };
        $('ab-check').addEventListener('click', async () => { $('ab-check-note').textContent = 'Checking…'; set(LATER_KEY, null); show(await check({ quiet: true })); });
        $('ab-update').addEventListener('click', openUpdater);
        $('ab-token-save').addEventListener('click', async () => {
            const v = $('ab-token').value.trim();
            if (!v) return;
            set(TOKEN_KEY, v); $('ab-token').value = ''; $('ab-token').placeholder = 'Saved ✓ (paste to replace)';
            Toast.show('🔑 Token saved on this phone.', 'positive');
            show(await check({ quiet: true }));
        });
        if (token()) show(await check({ quiet: true }));
    }

    function start() {
        const path = location.pathname;
        if (!/\/(features|plugins)\//.test(path) || /\/onboarding\//.test(path)) return;
        autoWhatsNew();
        autoCheck();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    return { version: APP_WEB_VERSION, entries: WHATS_NEW, openWhatsNew, check, openUpdater, renderAbout, isApp };
})();
