// ============================================================================
// DEV TOOLS PANEL (Craft, 2026-10-09) - the 🛠 button and side panel.
//
// Who gets it (app.js's loadLocalDevTools decides whether to load this file,
// and this file double-checks before showing anything):
//   - This computer: after the Hacker / password login, which lives in the
//     gitignored src/local/admin.local.js and never reaches GitHub or live.
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
    const OWNER_HASHES = [
        'cca1eb9e16323922a118e89aca369781ed00e145a60855b83b0c37398b70f10d'
    ];
    const DEV_KEY = 'bizzybee_dev';
    const TEST_KEY = 'bizzybee_dev_test';

    const host = location.hostname;
    const isLocal = host === '' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
        || /^(10|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local');
    const path = location.pathname;
    const nested = path.includes('/features/') || path.includes('/plugins/');
    if (!nested) return;
    const root = '../../..';
    const localDev = isLocal && localStorage.getItem(DEV_KEY) === '1';
    const testOn = () => localStorage.getItem(TEST_KEY) === '1';
    // On this computer (Hacker login) the tools work on the open save, as
    // before. Everywhere else they need the test save.
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
    function addXP(amount) {
        Vault.addTodo({ label: '🛠 Dev XP', xp: amount, difficulty: 'Easy', notes: 'Added by the dev panel.' });
        const id = Vault.getTodos()[Vault.getTodos().length - 1].id;
        Vault.toggleTodoComplete(id);
        reload();
    }
    function fillBar() {
        const bar = Vault.getCharacterLevelBar();
        addXP(Math.max(1, bar.cap - bar.xpIntoLevel));
    }
    function clearDevXP() {
        Vault.getTodos().filter(t => t.label === '🛠 Dev XP').forEach(t => Vault.removeTodo(t.id));
        reload();
    }

    function addBee(rarity) {
        const n = Vault.getColonyBees().filter(b => b.rarity !== 'Royal').length + 1;
        Vault.addColonyBee({
            id: generateBeeId(), name: `${rarity} Bee #${n}`, rarity, class: null,
            obtainedAt: new Date().toISOString(), source: 'dev',
            stats: rollBeeStats(rarity), weight: rollBeeWeight(rarity), dexNumber: n,
            element: rollBeeElement(), customNamed: false
        });
        toast(`🐝 Added a ${rarity} bee`);
    }
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
        const text = Vault.exportFullState();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = `bizzybee-dev-save-${Date.now()}.json`;
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
            const result = Vault.importFullState(text);
            if (!result.ok) { alert(result.error); return; }
            go('src/features/home/home.html');
        };
        reader.readAsText(file);
    }
    async function loadPersonalFile() {
        try {
            const response = await fetch(`${root}/src/core/data.personal.json`, { cache: 'no-store' });
            if (!response.ok) { alert('No src/core/data.personal.json on this computer.'); return; }
            const result = Vault.importFullState(await response.text());
            if (!result.ok) { alert(result.error); return; }
            go('src/features/home/home.html');
        } catch (error) { alert(error.message); }
    }
    function freshSave() {
        if (!confirm('Start a brand new local save? This one is wiped (export it first if you want it).')) return;
        localStorage.removeItem(Vault.storageKey);
        localStorage.removeItem('bizzybee_colony_hatched');
        go('src/features/home/home.html');
    }
    function signOut() {
        localStorage.removeItem('bizzybee_session');
        localStorage.removeItem(DEV_KEY);
        go('index.html');
    }

    // Workshop pages only exist on this computer (gitignored).
    const LINKS = [
        ['Egg demo', 'workshop/concepts/2026-10-onboarding/egg-opening.html'],
        ['Home demo', 'workshop/concepts/2026-10-home-redesign/home-v3-demo.html'],
        ['Hive inside (try ?lvl=20&n=12&lapses=5&fresh=1)', 'workshop/harnesses/colony-interior-harness.html'],
        ['Hive outside', 'workshop/harnesses/colony-exterior-harness.html'],
        ['Cards', 'workshop/harnesses/cards-harness.html'],
        ['Bee Action Lab', 'workshop/test-pages/bee-lab/bee-lab.html'],
        ['Card Lab', 'workshop/test-pages/card-lab/card-lab.html'],
        ['Card designs v2', 'workshop/concepts/2026-10-cards/bee-cards-v2.html'],
        ['Workshop README', 'workshop/README.md']
    ];

    // ---- the panel -----------------------------------------------------------
    const css = `
    .dev-fab{position:fixed;top:calc(env(safe-area-inset-top) + 14px);right:70px;z-index:2000;width:40px;height:40px;border-radius:12px;border:1px solid #ff5a4a;background:#1a0606;color:#fff;font-size:20px;cursor:pointer;box-shadow:0 0 12px rgba(255,60,40,.5);padding:0}
    body.onboarding-page .dev-fab{right:12px}
    .dev-ribbon{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 2px);transform:translateX(-50%);z-index:2000;padding:2px 10px;border-radius:0 0 8px 8px;background:#b3121f;color:#fff;font:700 10px/1.6 monospace;letter-spacing:.14em;pointer-events:none}
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
            `Mode: ${localDev ? 'this computer (Hacker login)' : testOn() ? 'TEST SAVE (never syncs)' : 'real save - tools locked'}`,
            `Save key: ${Vault.storageKey}`,
            `Level ${bar.level} · ${bar.xpIntoLevel}/${bar.cap} XP · total ${user.totalXP}`,
            `Egg: ${o ? o.stage : 'none'}${o && o.stage === 'egg' ? ` (${o.energy}/100)` : ''}`,
            `Royal: ${royal ? `${royal.royal} "${royal.name}"` : 'none'} · bees ${Vault.getColonyBees().length}`,
            `Habits ${Vault.getHabits().length} · To-Dos ${Vault.getTodos().length} · Dailies ${Vault.getDailyTasks().length}`
        ].join('\n');
    }

    function build() {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        if (testOn()) {
            const ribbon = document.createElement('div');
            ribbon.className = 'dev-ribbon';
            ribbon.textContent = 'TEST SAVE';
            document.body.appendChild(ribbon);
        }

        const fab = document.createElement('button');
        fab.className = 'dev-fab';
        fab.type = 'button';
        fab.title = 'Dev tools';
        fab.setAttribute('aria-label', 'Dev tools');
        fab.textContent = '🛠';
        document.body.appendChild(fab);

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

            <div class="dev-act">
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

            <h3>SAMPLE DATA</h3>
            <div class="dev-row">
                <button data-dev="samples">Add sample habits + To-Dos</button>
            </div>

            <h3>SAVE</h3>
            <div class="dev-row">
                <button data-dev="export">Export save</button>
                <button data-dev="import">Load a save file</button>
                ${localDev ? `<button data-dev="personal">Load data.personal.json</button>
                <button data-dev="fresh" class="danger">Fresh save</button>
                <button data-dev="signout" class="danger">Sign out</button>` : ''}
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
                close, 'test-on': () => setTestSave(true), 'test-off': () => setTestSave(false), 'test-wipe': wipeTestSave
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
                rehatch: () => { localStorage.setItem('bizzybee_colony_hatched', '[]'); toast('Bees will hatch again on the Hive page'); },
                samples: addSamples, export: exportSave, import: () => fileInput.click()
            };
            if (localDev) Object.assign(actions, { personal: loadPersonalFile, fresh: freshSave, signout: signOut });
            if (actions[a]) actions[a]();
        });
    }

    // A test save stays reachable even if the owner check can't run (so
    // you can always switch back). Otherwise: this computer, or the owner.
    const allowed = localDev || testOn() ? Promise.resolve(true) : isOwner();
    const start = () => allowed.then(ok => ok ? ready().then(build) : null).catch(() => {});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
