// ============================================================================
// DEV TOOLS PANEL (Craft, 2026-10-09) - the 🛠 button and side panel.
//
// Who gets it (app.js's loadLocalDevTools decides whether to load this file,
// and this file double-checks before showing anything):
//   - This computer (PC LOCAL, Oct 31 2026): always, on the local test
//     account (Developer / Test Bee, see db.js). No login, no cloud.
//   - Live site: only when signed in to Cloud Sync with an owner account.
//     OWNER_HASHES holds SHA-256 hashes of the owner emails, so no address is
//     written in the code. This is a convenience lock, not real security -
//     anyone could fake it on their own device - which is why on live every
//     tool works ONLY on the test save below and can never touch a real save.
//
// Test save (live): a separate save under its own key ('bizzybee_user_data:
// devtest', see db.js) that never syncs to the cloud or backs up. Turning it
// on starts a fresh hive (the egg), so you can test things like the egg
// rumble on your phone. Turning it off puts your real save straight back.
// ============================================================================
(function () {
    // Oct 31 2026 (Craft): one list, in app.js (DEV_OWNER_HASHES).
    const OWNER_HASHES = typeof DEV_OWNER_HASHES !== 'undefined' ? DEV_OWNER_HASHES : [];
    const TEST_KEY = 'bizzybee_dev_test';

    const host = location.hostname;
    const isLocal = !window.BB_APP_COPY && (host === '' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]'   // Nov 1 2026 (Craft): the app's own copy isn't PC LOCAL
        || /^(10|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local'));
    const path = location.pathname;
    const nested = path.includes('/features/') || path.includes('/plugins/');
    if (!nested) return;
    const root = '../../..';
    // Oct 31 2026 (Craft): this computer = PC LOCAL, the local test account
    // (db.js). Tools always work here; no Hacker login any more.
    const localDev = typeof Vault !== 'undefined' ? !!Vault.pcLocal : isLocal;
    const testOn = () => localStorage.getItem(TEST_KEY) === '1';
    // On this computer (PC LOCAL) the tools work on the open save. Everywhere
    // else they need the test save.
    const canAct = () => localDev || testOn();

    async function isOwner() {
        try {
            if (localStorage.getItem('bizzybee_session') !== 'identity') return false;
            const user = JSON.parse(localStorage.getItem('gotrue.user') || 'null');
            const email = user && user.email && String(user.email).trim().toLowerCase();
            if (!email || !window.crypto || !crypto.subtle) return false;
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
            const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
            return OWNER_HASHES.includes(hex);
        } catch (error) { return false; }
    }

    // ---- helpers -----------------------------------------------------------
    const go = (p) => { location.href = `${root}/${p}`; };
    const reload = () => location.reload();
    const toast = (t) => { if (typeof Toast !== 'undefined') Toast.show(t, 'positive'); };
    const ready = () => (typeof Vault !== 'undefined' && Vault.state) ? Promise.resolve() : Vault.init();

    function setTestSave(on) {
        if (on) localStorage.setItem(TEST_KEY, '1'); else localStorage.removeItem(TEST_KEY);
        go('src/features/home/home.html');
    }
    function wipeTestSave() {
        if (!confirm('Wipe the test save and start a fresh egg?')) return;
        Object.keys(localStorage).filter(k => k.startsWith('bizzybee_user_data:devtest')).forEach(k => localStorage.removeItem(k));
        go('src/features/home/home.html');
    }

    function onboarding(patch, toEgg = true) {
        if (!Vault.state.onboarding) Vault.state.onboarding = freshOnboardingRecord();
        Object.assign(Vault.state.onboarding, patch);
        Vault.save();
        if (toEgg) go('src/features/onboarding/onboarding.html'); else reload();
    }
    const EGG_DONE = { tap: true, quote: true, walk: true, stretch: true };
    const EGG = {
        restart: () => { Vault.state.onboarding = freshOnboardingRecord(); Vault.save(); go('src/features/onboarding/onboarding.html'); },
        nearlyFull: () => onboarding({ stage: 'egg', bonded: true, step: 'open', taps: 4, done: { tap: true, quote: true }, unlocked: true, energy: 90 }),
        crack: () => onboarding({ stage: 'egg', bonded: true, step: 'crack', taps: 4, done: EGG_DONE, unlocked: true, energy: 100, crackTaps: 0 }),
        larva: () => onboarding({ stage: 'larva', bonded: true, step: 'crack', done: EGG_DONE, unlocked: true, energy: 0, crackTaps: 10, ltut: { intro: true } }),
        pupa: () => onboarding({ stage: 'pupa', bonded: true, done: EGG_DONE, unlocked: true, energy: 100, crackTaps: 10, ltut: { intro: true }, pupaEnd: Date.now() + 60000 }),
        ready: () => onboarding({ stage: 'ready', bonded: true, done: EGG_DONE, unlocked: true, crackTaps: 10, ltut: { intro: true }, pupaEnd: Date.now() - 1000, readyTaps: 0 }),
        skip: (kind) => { Vault.completeOnboarding({ royal: kind, name: kind === 'king' ? 'King Dev' : 'Queen Dev' }); go('src/features/home/home.html'); }
    };

    // XP comes from finished work, so "add XP" adds a finished To-Do named
    // "🛠 Dev XP" (easy to spot and remove with "Clear dev XP").
    // XP per To-Do now comes from its difficulty, so add Hard dev To-Dos
    // until enough XP has landed.
    function devTodo() {
        Vault.addTodo({ label: '🛠 Dev XP', difficulty: 'Hard', notes: 'Added by the dev panel.' });
        const todos = Vault.getTodos();
        Vault.toggleTodoComplete(todos[todos.length - 1].id);
    }
    function addXP(amount) {
        const start = Vault.getUser().totalXP;
        for (let i = 0; i < 200 && Vault.getUser().totalXP - start < amount; i++) devTodo();
        reload();
    }
    function fillBar() {
        for (let i = 0; i < 200 && !Vault.getCharacterLevelBar().maxed; i++) devTodo();
        reload();
    }
    function clearDevXP() {
        Vault.getTodos().filter(t => t.label === '🛠 Dev XP').forEach(t => Vault.removeTodo(t.id));
        reload();
    }

    function addBee(rarity) {
        const n = Vault.getHiveBees().filter(b => b.rarity !== 'Royal').length + 1;
        Vault.addHiveBee({
            id: generateBeeId(), name: `${rarity} Bee #${n}`, rarity, class: null,
            obtainedAt: new Date().toISOString(), source: 'dev',
            stats: rollBeeStats(rarity), weight: rollBeeWeight(rarity), dexNumber: n,
            element: rollBeeElement(), customNamed: false
        });
        toast(`🐝 Added a ${rarity} bee`);
    }
    // ---- previews (Oct 2026): play effects with made-up bees, nothing saved --
    const loaded = {};
    function need(files) {
        return Promise.all(files.map(f => loaded[f] || (loaded[f] = new Promise((res) => {
            const tail = f.replace(/^src\//, '');
            if (f.endsWith('.css')) {
                if (document.querySelector(`link[href$="${tail}"]`)) return res();
                const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `${root}/${f}`;
                l.onload = l.onerror = () => res(); document.head.appendChild(l);
            } else {
                if (document.querySelector(`script[src$="${tail}"]`)) return res();
                const sc = document.createElement('script'); sc.src = `${root}/${f}`;
                sc.onload = sc.onerror = () => res(); document.body.appendChild(sc);
            }
        }))));
    }
    const CARD_FILES = ['src/core/ui/bee-card/bee-card.css', 'src/core/ui/bee-card/bee-card.js'];
    const FX_FILES = [...CARD_FILES, 'src/features/gacha/gacha-fx.css', 'src/features/gacha/gacha-fx.js'];
    function fakeBee(rarity) {
        const bee = {
            id: 'dev-' + Math.random().toString(36).slice(2), rarity, class: null, sex: 'f',
            name: randomBeeName(Vault.getHiveBees().map(b => b.name)),
            obtainedAt: new Date().toISOString(), source: 'dev-preview', dexNumber: 99,
            stats: rollBeeStats(rarity), weight: rollBeeWeight(rarity), element: rollBeeElement(), customNamed: false
        };
        if (rarity === 'Named') { bee.title = rollNamedTitle(); bee.class = beeLockedJob(bee); }
        else bee.talent = pickBeeTalent(bee);
        return bee;
    }
    const nextUp = { Common: 'Rare', Rare: 'Epic', Epic: 'Legendary', Legendary: 'Legendary' };
    const PREVIEW = {
        pull: (r) => need(FX_FILES).then(() => GachaFX.pull(fakeBee(r))),
        destroy: () => need(FX_FILES).then(() => GachaFX.destroy(fakeBee('Rare'), ['pollen', 'royal-nectar', 'honey-drop'])),
        combine: (up) => need(FX_FILES).then(() => { const r = up ? 'Epic' : 'Rare'; return GachaFX.combine(fakeBee(r), fakeBee(r), fakeBee(up ? nextUp[r] : r), !!up); }),
        card: (r) => need(CARD_FILES).then(() => showCard(r === 'Royal' ? Vault.getRoyalBee() : fakeBee(r))),
        reward: (lvl) => need([...CARD_FILES, 'src/core/ui/level-bar/level-bar.css', 'src/core/ui/level-bar/level-bar.js']).then(() => {
            const newLevel = lvl || (Vault.getUser().level || 1) + 1;
            LevelBar.celebrate(AppShell.formatReward({ newLevel, awardedBees: [fakeBee(newLevel % 10 === 0 ? 'Epic' : 'Rare')], ticketsGranted: 1 + Math.floor(newLevel / 10), awardedMaterials: ['pollen', 'pollen', 'royal-nectar'] }));
        }),
        rewardSkill: () => need(['src/core/ui/level-bar/level-bar.css', 'src/core/ui/level-bar/level-bar.js']).then(() => LevelBar.celebrate({
            title: 'Coding reached Level 4!', lines: ['✨ Royal Nectar +1', '🌼 Pollen +1']
        })),
        dayStart: () => need(['src/core/ui/day-start/day-start.css', 'src/core/ui/day-start/day-start.js']).then(() => {
            const y = shiftISODate(todayISO(), -1);
            DayStart.open({
                today: todayISO(), yesterday: y,
                dailies: [{ id: 'dev-d1', label: 'Sample daily · Medium', difficulty: 'medium', xp: 30, streak: 4, checklist: [] },
                          { id: 'dev-d2', label: 'Sample daily · Hard', difficulty: 'hard', xp: 60, streak: 12, checklist: [] }],
                todos: [{ id: 'dev-t1', label: 'Sample To-Do', difficulty: 'easy', xp: 20 }],
                guards: [], charms: 1
            });
        }),
        toastGood: () => Toast.show('✅ A positive toast', 'positive'),
        toastBad: () => Toast.show('⚠️ A negative toast', 'negative')
    };
    function showCard(bee) {
        if (!bee) { toast('No royal yet - skip the egg first'); return; }
        const o = document.createElement('div');
        o.style.cssText = 'position:fixed;inset:0;z-index:2200;background:rgba(0,0,0,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px';
        o.innerHTML = '<div class="dev-card-host" style="width:min(300px,86vw)"></div><p style="margin:0;color:#a69a80;font:12px system-ui">Tap the card to flip · tap outside to close</p>';
        document.body.appendChild(o);
        BeeCard.render(o.querySelector('.dev-card-host'), bee, { editable: false });
        o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
    }

    // ---- hive life + tickets (these DO change the save) ---------------------
    const today = () => todayISO();
    const HIVE = {
        tickets: (n) => { Vault.state.hive.tickets = (Vault.state.hive.tickets || 0) + n; Vault.save(); toast(`🎟️ +${n} tickets (${Vault.getTicketCount()})`); },
        day: () => { Vault._ensureBeeLife(); Vault._lifeDay(today()); Vault.save(); reload(); },
        raid: () => { Vault._ensureBeeLife(); Vault._raid(today()); Vault.save(); reload(); },
        egg: () => { Vault.awardBee('gacha', 'Common'); toast('🥚 Egg added to the Nursery'); },
        hatch: () => {
            Vault._lifeBees().forEach(b => { if (b.life && b.life.hatchOn) b.life.hatchOn = today(); });
            Vault._lifeDay(today()); Vault.save(); reload();
        },
        set: (key, val) => { Vault._lifeBees().forEach(b => { if (b.life && !b.life.hatchOn) b.life[key] = val; }); Vault.save(); reload(); },
        heal: () => { Vault._lifeBees().forEach(b => { if (!b.life) return; Object.assign(b.life, { health: 100, stamina: 100, fullness: 100, happiness: 100, faintedAt: null }); }); Vault.save(); reload(); },
        review: () => { const q = Vault._ensureQueen(); if (q) { q.reviewedOn = null; Vault.save(); } reload(); }
    };

    function setRoyal(kind) {
        const royal = Vault.getRoyalBee();
        if (!royal) { toast('No royal yet - skip the egg first'); return; }
        royal.royal = kind;
        // Swap the dev placeholder name with the gender, keep a real name.
        if (/^(King|Queen)( Dev)?$/.test(royal.name || '')) royal.name = kind === 'king' ? 'King Dev' : 'Queen Dev';
        Vault.save();
        reload();
    }

    function addSamples() {
        const today = new Date();
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
        [['Trivial', 10, true, false], ['Easy', 20, true, false], ['Medium', 60, true, true], ['Hard', 120, false, true]].forEach(([difficulty, xp, positive, negative]) => {
            Vault.addHabit({ label: `Sample ${difficulty} habit`, xp, difficulty, notes: 'Dev sample', positive, negative, resetCounter: 'daily' });
        });
        Vault.addTodo({ label: 'Sample To-Do (today)', xp: 20, difficulty: 'Easy', dueDate: plus(0), checklist: [{ id: 'c1', text: 'Step one', done: false }, { id: 'c2', text: 'Step two', done: false }] });
        Vault.addTodo({ label: 'Sample To-Do (tomorrow)', xp: 20, difficulty: 'Easy', dueDate: plus(1) });
        Vault.addTodo({ label: 'Sample To-Do (overdue)', xp: 20, difficulty: 'Easy', dueDate: plus(-2) });
        reload();
    }

    function exportSave() {
        const text = Vault.exportForFile();   // Oct 31 2026 (Craft): typed file name
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = Vault.saveFileName();
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    function importSaveFile(file) {
        const reader = new FileReader();
        reader.onload = async () => {
            let text = reader.result;
            if (typeof CryptoLite !== 'undefined' && CryptoLite.isEncryptedEnvelope && CryptoLite.isEncryptedEnvelope(text)) {
                const pin = prompt('This save is encrypted. Enter its PIN:');
                if (!pin) return;
                try { text = await CryptoLite.decrypt(text, pin); } catch { alert('Wrong PIN, or the file is damaged.'); return; }
            }
            if (!Vault.confirmImportKind(text)) return;   // Oct 31 2026 (Craft): REAL/TEST/PCLOCAL check
            const result = Vault.importFullState(text);
            if (!result.ok) { alert(result.error); return; }
            go('src/features/home/home.html');
        };
        reader.readAsText(file);
    }
    function freshSave() {
        if (!confirm('Reset the PC test account? Its data is wiped and it starts over as Developer / Test Bee.')) return;
        localStorage.removeItem(Vault.storageKey);
        localStorage.removeItem('bizzybee_hive_hatched');
        go('src/features/home/home.html');
    }
    // Workshop pages only exist on this computer (gitignored).
    // ---- New in 1.0.4 (Oct 28 2026) ----
    const NEW = {
        // A real notification in 5 seconds. Tapping it should open a daily and make it glow.
        async notify() {
            const d = (Vault.state.dailyTasks || [])[0];
            if (!d) { toast('Add a daily first (Sample data).'); return; }
            const url = `/src/features/dailies/dailies.html?focus=${encodeURIComponent(d.id)}`;
            const C = window.Capacitor;
            if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins.LocalNotifications) {
                await C.Plugins.LocalNotifications.schedule({ notifications: [{ id: 424243, title: '🐝 Dev test', body: `Tap me: opens "${d.label}"`,
                    schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, smallIcon: 'ic_stat_bee', iconColor: '#FFCC00',
                    extra: { kind: 'daily', taskId: d.id, url } }] });
                toast('🔔 Notification in 5 seconds. Lock the phone, then tap it.');
                return;
            }
            toast('Notifications are Android-app only (Oct 31 2026).');
        },
        focus(kind) {
            const list = kind === 'todo' ? Vault.state.todos : kind === 'habit' ? Vault.state.habits : Vault.state.dailyTasks;
            const item = (list || []).find(x => !x.completed) || (list || [])[0];
            if (!item) { toast('Nothing to open. Add sample data first.'); return; }
            location.href = root + (typeof BizzyNotify !== 'undefined' ? BizzyNotify.urlFor(kind, item.id) : `/src/features/dailies/dailies.html?focus=${item.id}`);
        },
        plan() {
            if (typeof BizzyNotify === 'undefined') return;
            const p = BizzyNotify.plan({ days: 3 });
            toast(p.length ? `${p.length} coming up. Next: ${p[0].label || p[0].title} at ${p[0].at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Nothing coming up.');
        },
        starter() {
            Vault.state.starterSkills = null;
            Vault.save();
            const go = () => StarterSkills.open();
            if (typeof StarterSkills !== 'undefined') { go(); return; }
            const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = `${root}/src/core/ui/starter-skills/starter-skills.css`; document.head.appendChild(css);
            const js = document.createElement('script'); js.src = `${root}/src/core/ui/starter-skills/starter-skills.js`; js.onload = go; document.body.appendChild(js);
        },
        doneToday() {
            if (typeof openDoneToday === 'function') openDoneToday();
            else location.href = `${root}/src/features/home/home.html?devdone=1`;
        },
        // Merge two copies of the save. Nothing is saved: it only reports what would happen.
        merge() {
            if (typeof mergeSaves !== 'function') { toast('Merge code not loaded.'); return; }
            const a = JSON.parse(JSON.stringify(Vault.state)), b = JSON.parse(JSON.stringify(Vault.state));
            const now = Date.now();
            b.todos = [...(b.todos || []), { id: 'dev-merge-phone', label: 'Made on the phone', xp: 10, _mt: now }];
            a.todos = [...(a.todos || []), { id: 'dev-merge-pc', label: 'Made on the PC', xp: 10, _mt: now }];
            const d = (b.dailyTasks || [])[0], today = todayISO();
            if (d) { d.completedDates = [...new Set([...(d.completedDates || []), today])]; d._days = { ...(d._days || {}), [today]: { done: true, t: now } }; d._mt = now; }
            b.updatedAt = new Date(now).toISOString();
            const m = mergeSaves(a, b);
            const both = ['dev-merge-phone', 'dev-merge-pc'].every(id => m.todos.some(t => t.id === id));
            const daily = d ? (m.dailyTasks.find(x => x.id === d.id).completedDates || []).includes(today) : true;
            toast(both && daily ? '✓ Merge test passed: both new To-Dos kept, and the phone\'s check-off kept.' : '✗ Merge test failed. Check the console.');
            if (!(both && daily)) console.warn('merge test', m);
        },
        icons() {
            if (typeof BizzyPhone === 'undefined') { toast('Weather icons load on app pages.'); return; }
            const kinds = ['clear', 'mostly', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'heavy', 'snow', 'storm'];
            const s = document.createElement('div');
            s.style.cssText = 'position:fixed;inset:0;z-index:99990;display:grid;place-items:center;background:rgba(0,0,0,.7)';
            s.innerHTML = `<div style="background:#120d05;border:1px solid #ffcc00;border-radius:16px;padding:16px;display:grid;grid-template-columns:repeat(5,64px);gap:12px;color:#c2b48f;font:600 .7rem system-ui;text-align:center">
                ${kinds.map(k => `<div><div style="font-size:40px">${BizzyPhone.iconSVG(k, true)}</div>${k}</div>`).join('')}
                ${['clear', 'partly'].map(k => `<div><div style="font-size:40px">${BizzyPhone.iconSVG(k, false)}</div>${k} night</div>`).join('')}</div>`;
            s.onclick = () => s.remove();
            document.body.appendChild(s);
        },
    };
    const SKIES = [['Noon', 'clear', 12], ['Sunset', 'partly', 18], ['Night', 'clear', 23], ['Rain', 'rain', 21], ['Heavy rain', 'heavy', 14], ['Storm', 'storm', 16], ['Snow', 'snow', 10], ['Fog', 'fog', 7], ['Cloudy', 'cloudy', 13]];

    const LINKS = [
        ['Hive inside · Queen', 'workshop/harnesses/hive-mind-interior-harness.html?lvl=20&royal=queen'],
        ['Hive inside · King', 'workshop/harnesses/hive-mind-interior-harness.html?lvl=20&royal=king'],
        ['Hive outside', 'workshop/harnesses/hive-mind-exterior-harness.html?lvl=30'],
        ['Cards (incl. Queen & King)', 'workshop/harnesses/cards-harness.html'],
        ['Bee Action Lab', 'workshop/test-pages/bee-lab/bee-lab.html'],
        ['Card Lab', 'workshop/test-pages/card-lab/card-lab.html'],
        ['Workshop README', 'workshop/README.md']
    ];

    // ---- the panel -----------------------------------------------------------
    const css = `
    .dev-fab{position:fixed;top:calc(env(safe-area-inset-top) + 14px);right:70px;z-index:2000;width:40px;height:40px;border-radius:12px;border:1px solid #ff5a4a;background:#1a0606;color:#fff;font-size:20px;cursor:pointer;box-shadow:0 0 12px rgba(255,60,40,.5);padding:0}
    body.onboarding-page .dev-fab{right:12px}
    .dev-badge{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 4px);transform:translateX(-50%);z-index:2001;padding:4px 12px;border-radius:999px;border:0;color:#fff;font:800 11px/1.4 monospace;letter-spacing:.12em;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5)}
    .dev-badge.test{background:#b3121f}
    .dev-badge.pc{background:#1d5fd1}
    .dev-panel{position:fixed;inset:0 0 0 auto;width:min(380px,100vw);z-index:2100;background:#0d0a05;border-left:1px solid #ff5a4a;color:#f1ede2;font:14px system-ui,sans-serif;overflow-y:auto;padding:14px 14px 40px;box-sizing:border-box;box-shadow:-20px 0 40px rgba(0,0,0,.7);transform:translateX(105%);transition:transform .3s ease}
    .dev-panel.open{transform:none}
    .dev-panel h2{margin:0 0 4px;font:700 18px var(--font-main,monospace);color:#ff7a6a;background:none;border:0;padding:0;text-align:left}
    .dev-panel .dev-sub{margin:0 0 10px;color:#a69a80;font-size:12px}
    .dev-panel h3{margin:16px 0 6px;font:700 12px monospace;letter-spacing:.12em;color:#ffcc00;background:none;border:0;padding:0;text-align:left}
    .dev-row{display:flex;flex-wrap:wrap;gap:6px}
    .dev-row button,.dev-row a{flex:1 1 auto;min-width:96px;padding:8px 10px;border-radius:9px;border:1px solid rgba(255,204,0,.3);background:#1d1810;color:#f1ede2;font:600 12px system-ui,sans-serif;cursor:pointer;text-decoration:none;text-align:center;transform:none;box-shadow:none}
    .dev-row button:hover,.dev-row a:hover{background:#2a2213;transform:none;box-shadow:none}
    .dev-row .danger{border-color:#ff5a4a;color:#ff8a7a}
    .dev-row .go{border-color:#34c77b;color:#7be0a8}
    .dev-locked .dev-act{opacity:.35;pointer-events:none}
    .dev-note{margin:8px 0 0;padding:8px 10px;border-radius:9px;background:#1f0b0b;border:1px solid #5a1d1d;color:#ffb3a8;font-size:12px;line-height:1.45}
    .dev-state{padding:8px 10px;border-radius:9px;background:#16120b;color:#cdbb8a;font:12px/1.5 monospace;white-space:pre-wrap}
    .dev-close{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:50%;border:0;background:#1d1810;color:#fff;font-size:16px;cursor:pointer;padding:0}`;

    function stateText() {
        const user = Vault.getUser(), bar = Vault.getCharacterLevelBar(), o = Vault.getOnboarding(), royal = Vault.getRoyalBee();
        return [
            `Mode: ${localDev ? 'PC LOCAL (local test account, never syncs)' : testOn() ? 'TEST SAVE (never syncs)' : 'real save - tools locked'}`,
            `Save key: ${Vault.storageKey}`,
            `Level ${bar.level} · ${bar.xpIntoLevel}/${bar.cap} XP · total ${user.totalXP}`,
            `Egg: ${o ? o.stage : 'none'}${o && o.stage === 'egg' ? ` (${o.energy}/100)` : ''}`,
            `Royal: ${royal ? `${royal.royal} "${royal.name}"` : 'none'} · bees ${Vault.getHiveBees().length}`,
            `Tickets ${Vault.getTicketCount()} · eggs ${Vault.getHiveBees().filter(x => x.life && x.life.hatchOn).length}`,
            `Habits ${Vault.getHabits().length} · To-Dos ${Vault.getTodos().length} · Dailies ${Vault.getDailyTasks().length}`
        ].join('\n');
    }

    function build() {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        // Oct 31 2026 (Craft): a badge that always floats on a test save, so
        // you can tell it's not your real save at a glance. Real save: none.
        if (localDev || testOn()) {
            const badge = document.createElement('button');
            badge.type = 'button';
            badge.className = 'dev-badge ' + (localDev ? 'pc' : 'test');
            badge.textContent = localDev ? '💻 PC LOCAL' : '🧪 TEST SAVE';
            badge.addEventListener('click', () => toast(localDev
                ? 'PC LOCAL: a local test account on this computer (Developer / Test Bee). No cloud. Your real save is never touched.'
                : 'TEST SAVE: a separate save on this device. Never syncs. Switch back to your real save in 🛠.'));
            document.body.appendChild(badge);
        }

        const fab = document.createElement('button');
        fab.className = 'dev-fab';
        fab.type = 'button';
        fab.title = 'Dev tools';
        fab.setAttribute('aria-label', 'Dev tools');
        fab.textContent = '🛠';
        document.body.appendChild(fab);
        // Oct 27 2026: drag the 🛠 anywhere so it never covers a button.
        // The spot is remembered on this device. A short tap still opens it.
        (() => {
            const KEY = 'bizzybee_dev_fab_pos';
            const place = (x, y) => {
                const w = fab.offsetWidth || 40, h = fab.offsetHeight || 40;
                x = Math.max(4, Math.min(window.innerWidth - w - 4, x));
                y = Math.max(4, Math.min(window.innerHeight - h - 4, y));
                Object.assign(fab.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
                return { x, y };
            };
            try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); if (p) place(p.x * window.innerWidth, p.y * window.innerHeight); } catch {}
            let start = null, moved = false;
            fab.style.touchAction = 'none';
            fab.addEventListener('pointerdown', e => { const r = fab.getBoundingClientRect(); start = { px: e.clientX, py: e.clientY, x: r.left, y: r.top }; moved = false; fab.setPointerCapture(e.pointerId); });
            fab.addEventListener('pointermove', e => {
                if (!start) return;
                const dx = e.clientX - start.px, dy = e.clientY - start.py;
                if (!moved && Math.hypot(dx, dy) < 8) return;
                moved = true;
                place(start.x + dx, start.y + dy);
            });
            fab.addEventListener('pointerup', () => {
                if (start && moved) { const r = fab.getBoundingClientRect(); try { localStorage.setItem(KEY, JSON.stringify({ x: r.left / window.innerWidth, y: r.top / window.innerHeight })); } catch {} }
                start = null;
            });
            // A drag isn't a tap: swallow the click that follows it.
            fab.addEventListener('click', e => { if (moved) { e.stopImmediatePropagation(); e.preventDefault(); moved = false; } }, true);
            window.addEventListener('resize', () => { const r = fab.getBoundingClientRect(); if (fab.style.left) place(r.left, r.top); });
        })();

        const testBlock = localDev ? '' : `
            <h3>TEST SAVE</h3>
            <div class="dev-row">${testOn()
                ? '<button data-dev="test-off" class="go">Back to my real save</button><button data-dev="test-wipe" class="danger">Wipe test save</button>'
                : '<button data-dev="test-on" class="go">Switch to test save</button>'}</div>
            ${testOn() ? '' : '<p class="dev-note">Tools are locked on your real save. Switch to the test save to use them. It starts a fresh egg, never syncs, and your real save comes straight back when you switch off.</p>'}`;

        const panel = document.createElement('aside');
        panel.className = 'dev-panel' + (canAct() ? '' : ' dev-locked');
        panel.setAttribute('aria-label', 'Dev tools');
        panel.innerHTML = `
            <button class="dev-close" type="button" data-dev="close" aria-label="Close">✕</button>
            <h2>🛠 DEV TOOLS</h2>
            <p class="dev-sub">${localDev ? 'This computer only.' : 'Owner account only. Works on the test save.'}</p>
            <div class="dev-state" id="dev-state"></div>
            ${testBlock}

            <!-- Oct 31 2026 (Craft): Themes is locked on the real save too. -->
            <div class="dev-act">
            <h3>THEMES · NEW IN 1.0.5</h3>
            <div class="dev-row">
                <button data-dev="theme" data-t="auto">✨ Auto</button>
                <button data-dev="theme" data-t="bee">🐝 BizzyBee</button>
                <button data-dev="theme" data-t="halloween">🎃 Halloween</button>
                <button data-dev="theme-day" data-d="halloween" class="go">Pretend it's Oct 31</button>
                <button data-dev="theme-day">Back to today</button>
                <a href="${root}/src/features/themes/themes.html">Themes page</a>
                <a href="${root}/src/features/friends/friends.html">Friends' hives</a>
                <a href="${root}/src/features/mailbox/mailbox.html">Mailbox</a>
            </div>

            <h3>EGG</h3>
            <div class="dev-row">
                <button data-dev="egg-restart">Restart egg</button>
                <button data-dev="egg-nearly">Egg 90/100</button>
                <button data-dev="egg-crack">Ready to crack</button>
                <button data-dev="egg-larva">Larva</button>
                <button data-dev="egg-pupa">Pupa (1 min)</button>
                <button data-dev="egg-ready">Wax cap</button>
                <button data-dev="egg-skip-queen">Skip → Queen</button>
                <button data-dev="egg-skip-king">Skip → King</button>
                <a href="${root}/src/features/onboarding/onboarding.html?practice=1">Practice replay</a>
            </div>

            <h3>LEVEL</h3>
            <div class="dev-row">
                <button data-dev="xp-50">+50 XP</button>
                <button data-dev="xp-150">+150 XP</button>
                <button data-dev="xp-fill">Fill the bar</button>
                <button data-dev="xp-clear" class="danger">Clear dev XP</button>
            </div>

            <h3>BEES</h3>
            <div class="dev-row">
                ${['Common', 'Rare', 'Epic', 'Legendary', 'Named'].map(r => `<button data-dev="bee" data-r="${r}">+ ${r}</button>`).join('')}
                <button data-dev="royal-queen">Royal = Queen</button>
                <button data-dev="royal-king">Royal = King</button>
                <button data-dev="rehatch">Re-show bee hatching</button>
            </div>

            <h3>PREVIEW · NOTHING IS SAVED</h3>
            <div class="dev-row">
                ${['Common', 'Rare', 'Epic', 'Legendary', 'Named'].map(r => `<button data-dev="pv-pull" data-r="${r}">Pull · ${r}</button>`).join('')}
                <button data-dev="pv-destroy">Destroy</button>
                <button data-dev="pv-combine">Combine</button>
                <button data-dev="pv-combine-up">Combine ↑ rarity</button>
            </div>
            <div class="dev-row" style="margin-top:6px">
                ${['Common', 'Rare', 'Epic', 'Legendary', 'Named', 'Royal'].map(r => `<button data-dev="pv-card" data-r="${r}">Card · ${r}</button>`).join('')}
            </div>
            <div class="dev-row" style="margin-top:6px">
                <button data-dev="pv-reward">Level-up reward</button>
                <button data-dev="pv-reward-10">Reward · Level 10</button>
                <button data-dev="pv-reward-skill">Reward · skill</button>
                <button data-dev="pv-day">Start My Day (sample)</button>
                <button data-dev="pv-toast">Toast ✓</button>
                <button data-dev="pv-toast-bad">Toast ✗</button>
            </div>

            <h3>NEW IN 1.0.4</h3>
            <div class="dev-row">
                <button data-dev="n-notify" class="go">Test notification tap</button>
                <button data-dev="n-focus" data-k="daily">Open a daily (glow)</button>
                <button data-dev="n-focus" data-k="todo">Open a To-Do (glow)</button>
                <button data-dev="n-focus" data-k="habit">Open a habit (glow)</button>
                <button data-dev="n-plan">What's coming up</button>
                <a href="${root}/src/features/notifications/notifications.html">Notifications page</a>
            </div>
            <div class="dev-row" style="margin-top:6px">
                <button data-dev="n-starter">Starter skills</button>
                <button data-dev="n-done">Done today list</button>
                <button data-dev="n-merge">Sync merge test</button>
                <button data-dev="n-icons">Weather icons</button>
            </div>
            <div class="dev-row" style="margin-top:6px">
                ${SKIES.map(([label, sky, hour]) => `<a href="${root}/src/features/hive-mind/hive-mind.html?sky=${sky}&hour=${hour}">Sky · ${label}</a>`).join('')}
            </div>

            <h3>TICKETS</h3>
            <div class="dev-row">
                <button data-dev="tk-1">+1 ticket</button>
                <button data-dev="tk-10">+10 tickets</button>
                <a href="${root}/src/features/gacha/gacha.html">Pollination Chamber</a>
            </div>

            <h3>HIVE LIFE · CHANGES THE SAVE</h3>
            <div class="dev-row">
                <button data-dev="hv-day">Run a hive day</button>
                <button data-dev="hv-raid">Raid now</button>
                <button data-dev="hv-egg">+ Egg</button>
                <button data-dev="hv-hatch">Hatch eggs now</button>
                <button data-dev="hv-hungry">Hungry bees</button>
                <button data-dev="hv-tired">Tired bees</button>
                <button data-dev="hv-sad">Unhappy bees</button>
                <button data-dev="hv-heal" class="go">Heal all</button>
                <button data-dev="hv-review">Start My Day again</button>
            </div>

            <h3>SAMPLE DATA</h3>
            <div class="dev-row">
                <button data-dev="samples">Add sample habits + To-Dos</button>
            </div>

            <h3>SAVE</h3>
            <div class="dev-row">
                <button data-dev="export">Export save</button>
                <button data-dev="import">Load a save file</button>
                ${localDev ? `<button data-dev="fresh" class="danger">Reset PC test data</button>` : ''}
            </div>
            <input type="file" id="dev-import-input" hidden>
            </div>

            ${localDev ? `<h3>DEMOS &amp; TEST PAGES</h3>
            <div class="dev-row">${LINKS.map(([label, href]) => `<a href="${root}/${href}">${label}</a>`).join('')}</div>` : ''}`;
        document.body.appendChild(panel);

        const open = () => { document.getElementById('dev-state').textContent = stateText(); panel.classList.add('open'); };
        const close = () => panel.classList.remove('open');
        fab.addEventListener('click', () => (panel.classList.contains('open') ? close() : open()));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

        const fileInput = panel.querySelector('#dev-import-input');
        fileInput.addEventListener('change', () => { if (fileInput.files[0]) importSaveFile(fileInput.files[0]); });

        panel.addEventListener('click', (event) => {
            const b = event.target.closest('[data-dev]');
            if (!b) return;
            const a = b.dataset.dev;
            const always = {
                close, 'test-on': () => setTestSave(true), 'test-off': () => setTestSave(false), 'test-wipe': wipeTestSave,
                // Themes are safe on any save: they only change the look.
                theme: () => { if (typeof Themes !== 'undefined') { Themes.set(b.dataset.t); toast(`Theme: ${b.dataset.t}`); } },
                'theme-day': () => {
                    if (typeof Themes === 'undefined') return;
                    const y = new Date().getFullYear();
                    Themes.devDay(b.dataset.d === 'halloween' ? `${y}-10-31` : null);
                    toast(b.dataset.d ? 'Pretending it\'s Oct 31 (Auto shows Halloween)' : 'Back to today');
                }
            };
            if (always[a]) { always[a](); return; }
            if (!canAct()) return;   // real save: hands off
            const actions = {
                'egg-restart': EGG.restart, 'egg-nearly': EGG.nearlyFull, 'egg-crack': EGG.crack,
                'egg-larva': EGG.larva, 'egg-pupa': EGG.pupa, 'egg-ready': EGG.ready,
                'egg-skip-queen': () => EGG.skip('queen'), 'egg-skip-king': () => EGG.skip('king'),
                'xp-50': () => addXP(50), 'xp-150': () => addXP(150), 'xp-fill': fillBar, 'xp-clear': clearDevXP,
                bee: () => { addBee(b.dataset.r); open(); },
                'royal-queen': () => setRoyal('queen'), 'royal-king': () => setRoyal('king'),
                rehatch: () => { localStorage.setItem('bizzybee_hive_hatched', '[]'); toast('Bees will hatch again on the Hive page'); },
                samples: addSamples, export: exportSave, import: () => fileInput.click(),
                'pv-pull': () => { close(); PREVIEW.pull(b.dataset.r); }, 'pv-destroy': () => { close(); PREVIEW.destroy(); },
                'pv-combine': () => { close(); PREVIEW.combine(false); }, 'pv-combine-up': () => { close(); PREVIEW.combine(true); },
                'pv-card': () => { close(); PREVIEW.card(b.dataset.r); }, 'pv-reward': () => { close(); PREVIEW.reward(); },
                'pv-reward-10': () => { close(); PREVIEW.reward(10); }, 'pv-reward-skill': () => { close(); PREVIEW.rewardSkill(); },
                'pv-day': () => { close(); PREVIEW.dayStart(); }, 'pv-toast': PREVIEW.toastGood, 'pv-toast-bad': PREVIEW.toastBad,
                'tk-1': () => { HIVE.tickets(1); open(); }, 'tk-10': () => { HIVE.tickets(10); open(); },
                'hv-day': HIVE.day, 'hv-raid': HIVE.raid, 'hv-egg': () => { HIVE.egg(); open(); }, 'hv-hatch': HIVE.hatch,
                'hv-hungry': () => HIVE.set('fullness', 15), 'hv-tired': () => HIVE.set('stamina', 5), 'hv-sad': () => HIVE.set('happiness', 10),
                'hv-heal': HIVE.heal, 'hv-review': HIVE.review,
                'n-notify': () => { close(); NEW.notify(); }, 'n-focus': () => NEW.focus(b.dataset.k), 'n-plan': NEW.plan,
                'n-starter': () => { close(); NEW.starter(); }, 'n-done': () => { close(); NEW.doneToday(); },
                'n-merge': NEW.merge, 'n-icons': () => { close(); NEW.icons(); }
            };
            if (localDev) Object.assign(actions, { fresh: freshSave });
            if (actions[a]) actions[a]();
        });
    }

    // A test save stays reachable even if the owner check can't run (so
    // you can always switch back). Otherwise: this computer, or the owner.
    const allowed = localDev || testOn() ? Promise.resolve(true) : isOwner();
    // Settings asks this to show its Developer section (Oct 2026).
    window.BizzyDev = { allowed: () => allowed };
    const start = () => allowed.then(ok => ok ? ready().then(build) : null).catch(() => {});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
