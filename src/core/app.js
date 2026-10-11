console.log("/// BIZZYBEE MOTHERBOARD ONLINE ///");

// Page titles used to live here (NAV_ITEMS / EXTRA_PAGE_META) for the old
// yellow header. That header was replaced by AppShell (below) on 2026-10-08:
// a top bar with your royal + level and a bottom dock.

// --- Install App (PWA) prompt --------------------------------------------
// Chromium-family browsers (Chrome, Edge, Samsung Internet, etc.) fire
// this once per page load when the manifest + HTTPS installability
// criteria (see manifest.json's icons/name/start_url/display) are met and
// the site isn't already installed. Has to be listened for at the top
// level, before DOMContentLoaded, since the event can fire early - by the
// time CodexSystem.init() runs, this either already caught it or it never
// will for this page load. preventDefault() suppresses the browser's own
// mini-infobar so injectInstallButton()'s own button drives it instead -
// the same standard beforeinstallprompt API big sites (Facebook included)
// build their custom install buttons on top of, not anything proprietary
// to them or to any one browser.
window.__bbInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__bbInstallPrompt = event;
    document.dispatchEvent(new CustomEvent('bb-install-available'));
});
window.addEventListener('appinstalled', () => {
    window.__bbInstallPrompt = null;
    document.dispatchEvent(new CustomEvent('bb-install-done'));
    if (typeof Toast !== 'undefined') Toast.show('🐝 Bizzybee installed!', 'positive');
});

// --- App Lock ----------------------------------------------------------
// A separate, DEVICE-ONLY 4-digit PIN that locks the whole app (not just
// Account Info, which has its own unrelated 6-digit PIN - see
// account-security.js) whenever this browser tab is closed and reopened,
// or the app is opened in a fresh tab. Deliberately NOT stored in
// Vault.state: this has to survive independently of your account data, so
// it never travels with Cloud Sync, Full Save Transfer, or anything else
// that moves progress between devices - each device you use gets its own
// App Lock PIN, set up separately. Lives here (not a separate file/script
// tag) so every page that already loads app.js - which is all of them -
// gets it for free, same reasoning as injectHeader/injectFooter below.
//
// Session-scoped unlock, not per-page: sessionStorage (unlike
// localStorage) persists across normal in-app navigation and page
// refreshes within the SAME tab, but is cleared when the tab actually
// closes - exactly the "stay unlocked while I'm using it, re-lock when I
// come back" behavior asked for, with zero event-listener plumbing
// (pagehide/visibilitychange were considered and rejected: pagehide fires
// on every internal navigation too, which would re-lock on literally every
// link click, and visibilitychange would re-lock on a simple tab switch -
// neither matches "on close/leave only").
const AppLock = {
    PIN_HASH_KEY: 'bizzybee_app_lock_pin_hash',
    SESSION_UNLOCK_KEY: 'bizzybee_app_lock_unlocked',

    async sha256Hex(text) {
        const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    hasPin() {
        return !!localStorage.getItem(this.PIN_HASH_KEY);
    },

    async setPin(pin) {
        localStorage.setItem(this.PIN_HASH_KEY, await this.sha256Hex(pin));
    },

    // Doesn't touch SESSION_UNLOCK_KEY - if this tab was already unlocked,
    // removing the PIN shouldn't retroactively lock it. The next tab that
    // opens simply finds hasPin() false and never shows the overlay at all.
    removePin() {
        localStorage.removeItem(this.PIN_HASH_KEY);
    },

    async verifyPin(pin) {
        const stored = localStorage.getItem(this.PIN_HASH_KEY);
        if (!stored) return false;
        return (await this.sha256Hex(pin)) === stored;
    },

    isUnlockedThisSession() {
        return sessionStorage.getItem(this.SESSION_UNLOCK_KEY) === 'true';
    },

    markUnlocked() {
        sessionStorage.setItem(this.SESSION_UNLOCK_KEY, 'true');
    }
};

// --- App shell: the top bar (your royal + level) and the bottom dock -------
// Replaced the old yellow header + nav strip (Craft, 2026-10-08). The top
// bar shows your King/Queen, name and level bar on every page: full size on
// Home (it shrinks to a slim bar as you scroll), slim everywhere else, where
// tapping it takes you Home. The dock is Habits / Dailies / [hex +] / To-Dos
// / Quests; the + creates whatever the current tab makes, and asks which on
// any other page. Dashboard, Map and the rest live in Home's app grid.
const DOCK_TABS = [
    { key: 'habits', label: 'Habits', href: 'src/features/habits/habits.html',
      icon: '<rect x="3" y="7" width="10" height="14" rx="2.5"/><rect x="15" y="7" width="10" height="14" rx="2.5"/><path d="M8 11.5v5M5.5 14h5M17.5 14h5"/>' },
    { key: 'dailies', label: 'Dailies', href: 'src/features/dailies/dailies.html',
      icon: '<rect x="4" y="6" width="20" height="18" rx="3"/><path d="M4 11h20M9 3.5v5M19 3.5v5"/><path d="M9 15.5h2M13 15.5h2M17 15.5h2M9 19.5h2M13 19.5h2"/>' },
    { key: 'todos', label: 'To-Dos', href: 'src/features/todos/todos.html',
      icon: '<circle cx="14" cy="14" r="10"/><path d="M9.5 14.5l3 3 6-6.5"/>' },
    { key: 'quests', label: 'Quests', href: 'src/features/quests/quests.html',
      icon: '<path d="M8 4h13a3 3 0 0 1 3 3a2 2 0 0 1-2 2h-2v13a3 3 0 0 1-3 3H7"/><path d="M7 25a3 3 0 0 1-3-3v-2h12v2a3 3 0 0 0 3 3"/><path d="M8 4a3 3 0 0 0-3 3v13M11 10h6M11 14h6"/>' }
];
// Which dock tab a page belongs to, and what its + creates.
const DOCK_PAGE_TAB = { habits: 'habits', 'create-habit': 'habits', dailies: 'dailies', 'create-daily': 'dailies', todos: 'todos', 'create-todo': 'todos', quests: 'quests', quest: 'quests', 'create-quest': 'quests' };
const CREATE_TARGETS = {
    habits: { label: 'Habit', href: 'src/features/habits/create-habit.html' },
    dailies: { label: 'Daily', href: 'src/features/dailies/create-daily.html' },
    todos: { label: 'To-Do', href: 'src/features/todos/create-todo.html' },
    quests: { label: 'Quest', href: 'src/features/quests/create-quest.html' }
};
const SHELL_HEX = '36,5 67,23 67,57 36,75 5,57 5,23';

const AppShell = {
    root: '../../..',
    key: 'home',
    head: null,
    dock: null,
    compact: false,
    _queued: false,
    _royalKind: null,

    mount(rootPrefix, pageKey) {
        this.root = rootPrefix;
        this.key = pageKey;
        this.isHome = pageKey === 'home';
        if (this.isHome) document.body.classList.add('is-home');
        this.injectHead();
        if (!pageKey.startsWith('create-')) this.injectDock();
        this.watchVault();
    },

    url(path) { return `${this.root}/${path}`; },

    injectHead() {
        const head = document.createElement('header');
        head.className = 'app-head' + (this.isHome ? '' : ' compact');
        head.id = 'app-head';
        head.innerHTML = `
            <div class="ah-in">
                <button type="button" class="ah-royal" aria-label="Your royal">
                    <svg class="ah-hex" viewBox="0 0 118 128" aria-hidden="true">
                        <defs>
                            <linearGradient id="ahEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#ffcc00"/><stop offset="1" stop-color="#8a6000"/></linearGradient>
                            <radialGradient id="ahIn" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#3a2604"/><stop offset=".7" stop-color="#140c02"/><stop offset="1" stop-color="#070401"/></radialGradient>
                        </defs>
                        <polygon class="ah-hex-glow" points="59,2 114,33 114,95 59,126 4,95 4,33"/>
                        <polygon points="59,4 112,34 112,94 59,124 6,94 6,34" fill="url(#ahIn)" stroke="url(#ahEdge)" stroke-width="2.4"/>
                        <polygon points="59,12 105,38 105,90 59,116 13,90 13,38" fill="none" stroke="rgba(255,204,0,.18)" stroke-width="1"/>
                    </svg>
                    <div class="ah-rstack"></div>
                </button>
                <div class="ah-info">
                    <p class="ah-hello"></p>
                    <h1 class="ah-name">&nbsp;</h1>
                    <p class="ah-line"></p>
                    <div class="ah-lvl">
                        <button type="button" class="ah-chip" aria-label="Level">LV 1</button>
                        <div class="ah-bar"><i></i></div>
                    </div>
                    <div class="ah-meta"><span class="ah-xp"></span><span class="ah-next"></span></div>
                    <button type="button" class="ah-levelup">LEVEL UP ✦</button>
                </div>
            </div>`;
        document.body.insertBefore(head, document.body.firstChild);
        document.body.classList.add('has-app-head');
        this.head = head;

        const h = new Date().getHours();
        head.querySelector('.ah-hello').textContent = h < 5 ? 'Up late,' : h < 12 ? 'Good morning,' : h < 18 ? 'Good afternoon,' : 'Good evening,';

        head.addEventListener('click', (event) => {
            if (event.target.closest('.ah-levelup')) { this.levelUp(); return; }
            const chip = event.target.closest('.ah-chip');
            if (chip && chip.classList.contains('ready')) {
                if (this.isHome) this.levelUp(); else this.goHome();
                return;
            }
            if (!this.isHome) { this.goHome(); return; }
            if (event.target.closest('.ah-royal')) {
                this.flutter();
                if (this.compact) window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        if (this.isHome) {
            window.addEventListener('scroll', () => {
                const want = this.compact ? window.scrollY > 24 : window.scrollY > 120;
                if (want !== this.compact) { this.compact = want; head.classList.toggle('compact', want); }
            }, { passive: true });
        }
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setTimeout(() => this.flutter(), 1200);
            setInterval(() => this.flutter(), 7000);
        }
    },

    goHome() { window.location.href = this.url('src/features/home/home.html'); },

    flutter() {
        const stack = this.head && this.head.querySelector('.ah-rstack');
        if (!stack) return;
        stack.classList.remove('flutter'); void stack.offsetWidth; stack.classList.add('flutter');
    },

    royalArt(kind) {
        const b = this.url('src/assets/bees/');
        return kind === 'king'
            ? `<img class="ah-body" src="${b}king/king-body.webp" alt="" draggable="false"><img class="ah-l ah-w ah-wf" src="${b}king/king-wings.webp" alt="" draggable="false">`
            : `<img class="ah-l ah-w ah-wb" src="${b}queen/queen-wing-back.webp" alt="" draggable="false"><img class="ah-body" src="${b}queen/queen-body.webp" alt="" draggable="false"><img class="ah-l ah-w ah-wf" src="${b}queen/queen-wing-front.webp" alt="" draggable="false">`;
    },

    // Re-reads the save into the top bar. Runs after Vault.init() and
    // (batched) after every save, so a + or check-off anywhere moves the bar.
    refresh() {
        if (typeof Vault !== 'undefined' && Vault.state && typeof Vault.isOnboarding === 'function' && Vault.isOnboarding()) {
            this.applyOnboarding();
            return;
        }
        if (!this.head || typeof Vault === 'undefined' || !Vault.state) return;
        const user = Vault.getUser();
        const bar = Vault.getCharacterLevelBar();
        if (!user || !bar) return;
        const royal = typeof Vault.getRoyalBee === 'function' ? Vault.getRoyalBee() : null;
        const kind = royal && royal.royal === 'king' ? 'king' : 'queen';
        const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const q = (sel) => this.head.querySelector(sel);

        if (this._royalKind !== kind) {
            q('.ah-rstack').innerHTML = this.royalArt(kind);
            q('.ah-rstack').classList.toggle('is-king', kind === 'king');
            this._royalKind = kind;
        }
        q('.ah-royal').setAttribute('aria-label', royal ? `${royal.name}, your ${kind === 'king' ? 'King' : 'Queen'}` : 'Your hive');
        // Your name is the big line; the title (King/Queen) sits small
        // under it (Craft, 2026-10-09). "Worker Bee" is only the blueprint's
        // placeholder, so a named royal wins over it.
        const title = kind === 'king' ? 'King' : 'Queen';
        const name = Vault.state.displayName || (royal && royal.name) || user.name || 'Beekeeper';
        q('.ah-name').textContent = name;
        q('.ah-line').innerHTML = !royal
            ? '🐝 Your hive awaits'
            : royal.name && royal.name !== name
                ? `👑 ${title} <b>${esc(royal.name)}</b> rules your hive`
                : `👑 <b>${title}</b> of the hive`;
        q('.ah-chip').textContent = `LV ${bar.level}`;
        q('.ah-bar i').style.width = `${Math.max(0, Math.min(100, bar.percentage))}%`;
        q('.ah-xp').innerHTML = `<b>${bar.xpIntoLevel}</b> / ${bar.cap} XP`;
        q('.ah-next').textContent = bar.maxed ? 'Ready to level up!' : `${Math.max(0, bar.cap - bar.xpIntoLevel)} XP to Level ${bar.level + 1}`;
        q('.ah-chip').classList.toggle('ready', !!bar.maxed);
        q('.ah-levelup').classList.toggle('show', !!bar.maxed && this.isHome);
    },

    queueRefresh() {
        if (this._queued) return;
        this._queued = true;
        setTimeout(() => { this._queued = false; this.refresh(); }, 0);
    },

    watchVault() {
        if (typeof Vault === 'undefined' || Vault.__shellWatched) return;
        Vault.__shellWatched = true;
        const init = Vault.init.bind(Vault);
        Vault.init = (...args) => init(...args).then((state) => { this.refresh(); return state; });
        const save = Vault.save.bind(Vault);
        Vault.save = (...args) => { const result = save(...args); this.queueRefresh(); return result; };
        if (Vault.state) this.refresh();
    },

    async levelUp() {
        const reward = Vault.levelUpCharacterBar();
        if (!reward) { this.refresh(); return; }
        this.refresh();
        this.flutter();
        this.burst();
        const formatted = this.formatReward(reward);
        if (typeof LevelBar !== 'undefined' && LevelBar.celebrate) LevelBar.celebrate(formatted);
        else if (typeof Toast !== 'undefined') Toast.show(`🎉 ${formatted.title}`, 'positive');
    },

    formatReward(reward) {
        const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const material = (id) => {
            const m = (typeof MATERIAL_CATALOG !== 'undefined' ? MATERIAL_CATALOG : []).find(x => x.id === id);
            return m ? `${m.icon} ${m.label}` : id;
        };
        const lines = [];
        if (reward.awardedBees.length > 0) {
            const label = reward.awardedBees.length === 1 ? esc(reward.awardedBees[0].name) : `${reward.awardedBees.length} bees`;
            lines.push(`🐝 ${label} joined your colony!`);
        }
        if (reward.ticketsGranted > 0) lines.push(`🎟️ +${reward.ticketsGranted} Gacha Ticket${reward.ticketsGranted === 1 ? '' : 's'}`);
        if (reward.awardedMaterials.length > 0) {
            const counts = {};
            reward.awardedMaterials.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
            Object.entries(counts).forEach(([id, n]) => lines.push(`${material(id)} +${n}`));
        }
        if (lines.length === 0) lines.push('Onward!');
        return { title: `Character reached Level ${reward.newLevel}!`, lines };
    },

    burst() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const chip = this.head.querySelector('.ah-chip').getBoundingClientRect();
        const colors = ['#ffcc00', '#fff2b0', '#e8a317', '#DC143C', '#ffffff'];
        for (let i = 0; i < 40; i++) {
            const c = document.createElement('i');
            c.className = 'ah-confetti';
            c.style.background = colors[i % colors.length];
            c.style.left = `${chip.left + chip.width / 2}px`;
            c.style.top = `${chip.top + chip.height / 2}px`;
            document.body.appendChild(c);
            const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 200;
            c.animate([
                { transform: 'translate(0,0) rotate(0)', opacity: 1 },
                { transform: `translate(${Math.cos(a) * v}px,${Math.sin(a) * v + 220}px) rotate(${(Math.random() - .5) * 900}deg)`, opacity: 0 }
            ], { duration: 1300 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => c.remove();
        }
    },

    injectDock() {
        const active = DOCK_PAGE_TAB[this.key] || null;
        const tab = (t) => `<a class="dk-tab${t.key === active ? ' on' : ''}" data-tab="${t.key}" href="${this.url(t.href)}"${t.key === active ? ' aria-current="page"' : ''}>
                <svg viewBox="0 0 28 28" aria-hidden="true">${t.icon}</svg><span>${t.label}</span></a>`;
        const target = CREATE_TARGETS[active];
        const dock = document.createElement('nav');
        dock.className = 'app-dock';
        dock.setAttribute('aria-label', 'Main');
        dock.innerHTML = `${tab(DOCK_TABS[0])}${tab(DOCK_TABS[1])}<span class="dk-gap"></span>${tab(DOCK_TABS[2])}${tab(DOCK_TABS[3])}
            <button type="button" class="dk-add" aria-label="${target ? `New ${target.label}` : 'Create new'}">
                <svg viewBox="0 0 72 80" aria-hidden="true">
                    <defs><linearGradient id="dkAddG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".45" stop-color="#ffcc00"/><stop offset="1" stop-color="#d08a00"/></linearGradient></defs>
                    <polygon class="dk-glow" points="36,3 69,22 69,58 36,77 3,58 3,22"/>
                    <polygon class="dk-body" points="${SHELL_HEX}"/>
                    <polygon class="dk-hi" points="36,9 63,25 63,40 36,24 9,40 9,25"/>
                    <path class="dk-plus" d="M36 26v28M22 40h28"/>
                </svg>
            </button>`;
        document.body.appendChild(dock);
        document.body.classList.add('has-app-dock');
        this.dock = dock;
        if (/[?&]dockdebug\b/.test(location.search)) setTimeout(() => this.dockReport(), 3000);
        // Same report from the installed app (no address bar): press and
        // hold the dock for 2 seconds.
        let holdTimer = null;
        const stopHold = () => { clearTimeout(holdTimer); holdTimer = null; };
        dock.addEventListener('pointerdown', () => { stopHold(); holdTimer = setTimeout(() => this.dockReport(), 2000); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => dock.addEventListener(t, stopHold));

        dock.querySelector('.dk-add').addEventListener('click', () => {
            if (active === 'quests' && typeof CreateQuestModal !== 'undefined') { CreateQuestModal.open(); return; }
            if (target) { window.location.href = this.url(target.href); return; }
            this.openChooser();
        });
    },

    // Bug hunt (2026-10-09): the dock's buttons don't draw on Craft's
    // Samsung Note 20 Ultra. Add ?dockdebug=1 to any page's address and,
    // after 3 seconds, a report of what the phone sees in the dock shows
    // at the top of the screen. Remove once the bug is fixed.
    dockReport() {
        const r = (el) => { const b = el.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`; };
        const cs = (el) => { const c = getComputedStyle(el); return `d:${c.display} v:${c.visibility} o:${c.opacity} col:${c.color} t:${c.transform === 'none' ? '-' : c.transform.slice(0, 30)}`; };
        const name = (el) => el ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}` : 'null';
        const docks = document.querySelectorAll('.app-dock');
        const d = this.dock;
        const lines = [
            `UA: ${navigator.userAgent}`,
            `view ${innerWidth}x${innerHeight} vv ${window.visualViewport ? Math.round(visualViewport.width) + 'x' + Math.round(visualViewport.height) : '-'} dpr ${devicePixelRatio} standalone ${matchMedia('(display-mode: standalone)').matches}`,
            `body: ${document.body.className}`,
            `docks in page: ${docks.length} · children: ${d ? d.children.length : '-'} · onboarding: ${typeof Vault !== 'undefined' && Vault.isOnboarding ? Vault.isOnboarding() : '?'}`,
            d ? `dock ${r(d)} ${cs(d)}` : 'no dock',
            ...(d ? [...d.children].map(c => `${name(c)} ${r(c)} ${cs(c)}`) : []),
            ...(d ? [...d.querySelectorAll('.dk-tab, .dk-add')].map(c => { const b = c.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return `top@${c.dataset.tab || 'add'}: ${name(top)}`; }) : [])
        ];
        const old = document.getElementById('dock-report');
        if (old) old.remove();
        const box = document.createElement('pre');
        box.id = 'dock-report';
        lines.push('', '(Screenshot this. Tap the box to close.)');
        box.textContent = lines.join('\n');
        box.style.cssText = 'position:fixed;left:4px;right:4px;top:4px;z-index:99999;margin:0;padding:8px;max-height:70vh;overflow:auto;background:#0a2a6a;color:#fff;font:10px/1.35 monospace;white-space:pre-wrap;word-break:break-all;border:2px solid #fff;border-radius:6px';
        box.addEventListener('click', () => box.remove());
        document.body.appendChild(box);
    },

    openChooser() {
        let sheet = document.getElementById('app-create-sheet');
        if (sheet) { this.closeChooser(); return; }
        const icons = { habits: DOCK_TABS[0].icon, dailies: DOCK_TABS[1].icon, todos: DOCK_TABS[2].icon, quests: DOCK_TABS[3].icon };
        sheet = document.createElement('div');
        sheet.id = 'app-create-sheet';
        sheet.className = 'app-create-sheet';
        sheet.innerHTML = `<div class="acs-card" role="dialog" aria-label="Create">
            <h3>CREATE</h3>
            <div class="acs-grid">${Object.entries(CREATE_TARGETS).filter(([k]) => !this.obTabs || this.obTabs.includes(k)).map(([k, t]) => `
                <a class="acs-opt" href="${this.url(t.href)}"><svg viewBox="0 0 28 28" aria-hidden="true">${icons[k]}</svg>${t.label}</a>`).join('')}
            </div></div>`;
        document.body.appendChild(sheet);
        this.dock.classList.add('open');
        sheet.addEventListener('click', (event) => { if (event.target === sheet) this.closeChooser(); });
        this._esc = (event) => { if (event.key === 'Escape') this.closeChooser(); };
        document.addEventListener('keydown', this._esc);
    },

    closeChooser() {
        const sheet = document.getElementById('app-create-sheet');
        if (sheet) sheet.remove();
        if (this.dock) this.dock.classList.remove('open');
        if (this._esc) document.removeEventListener('keydown', this._esc);
    },

    // ---- Onboarding mode (2026-10-09) ----
    // While the egg is being raised, the dock shows only the tabs unlocked
    // so far, and those tabs' real pages get a guide bar on top (instead
    // of the royal top bar) with the next tutorial step and a way back to
    // the egg. The steps themselves live in db.js (ONBOARDING_STEPS).
    obTabs: null,

    // The egg page has no top bar, just the dock (once a tab is unlocked).
    mountOnboardingDock(rootPrefix) {
        this.root = rootPrefix;
        this.key = 'onboarding';
        this.injectDock();
        this.watchVault();
        this.applyOnboarding();
    },

    applyOnboarding() {
        const tabs = Vault.getOnboardingTabs();
        const firstTime = this.obTabs === null;
        const added = firstTime ? [] : tabs.filter(t => !this.obTabs.includes(t));
        if (!firstTime && this.obTabs.length === 0 && tabs.length > 0 && this.dock) {
            this.dock.classList.remove('ob-arrive'); void this.dock.offsetWidth; this.dock.classList.add('ob-arrive');
        }
        this.obTabs = tabs;
        document.body.classList.add('ob-mode');
        document.body.classList.toggle('ob-nodock', tabs.length === 0);
        if (this.dock) {
            this.dock.querySelectorAll('.dk-tab').forEach(a => {
                const open = tabs.includes(a.dataset.tab);
                a.classList.toggle('ob-locked', !open);
                a.setAttribute('aria-hidden', String(!open));
                a.tabIndex = open ? 0 : -1;
                if (added.includes(a.dataset.tab)) { a.classList.remove('ob-new'); void a.offsetWidth; a.classList.add('ob-new'); }
            });
        }
        if (this.head) this.renderGuideBar();
    },

    renderGuideBar() {
        const tab = DOCK_PAGE_TAB[this.key];
        let bar = this.head.querySelector('.ob-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'ob-bar';
            this.head.appendChild(bar);
        }
        const steps = (typeof ONBOARDING_STEPS !== 'undefined' && ONBOARDING_STEPS[tab]) || [];
        const status = tab ? Vault.onboardingStepStatus(tab) : {};
        const doneCount = steps.filter(st => status[st.key]).length;
        const next = steps.find(st => !status[st.key]);
        const label = (DOCK_TABS.find(t => t.key === tab) || {}).label || 'Bizzybee';
        const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const egg = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 2C6.5 2 3 11 3 18a9 9 0 0 0 18 0C21 11 17.5 2 12 2z"/><path d="M8 14l2.5 2 3-3 2.5 2" fill="none"/></svg>';
        bar.innerHTML = `
            <div class="ob-in">
                <span class="ob-egg">${egg}</span>
                <div class="ob-text">
                    <span class="ob-tag">${tab ? `LEARNING ${esc(label.toUpperCase())}` : 'RAISING YOUR EGG'} <i>${steps.map(st => `<b class="${status[st.key] ? 'on' : ''}"></b>`).join('')}</i></span>
                    ${!tab
                        ? `<span class="ob-step">Your egg is waiting</span><span class="ob-why">It's still growing. Head back whenever you're ready.</span>`
                        : next
                        ? `<span class="ob-step">${esc(next.title)}</span><span class="ob-why">${esc(next.why)}</span>`
                        : `<span class="ob-step">✓ You've learned ${esc(label)}</span><span class="ob-why">Go back to your egg. It felt every bit of it.</span>`}
                </div>
                <a class="ob-back${next ? '' : ' ready'}" href="${this.url('src/features/onboarding/onboarding.html')}">Back to egg</a>
            </div>`;
        bar.dataset.done = String(doneCount === steps.length);
    }
};

class CodexSystem {
    constructor() {
        this.init();
    }

    init() {
        this.renderGlobalUI();
        this.initAppLock();
        this.initCloudSyncAuto();
        this.initFolderBackupAuto();
        this.injectInstallButton();
        this.loadLocalDevTools();
        this.loadHabiticaSync();
    }

    // Habitica two-way sync (src/core/habitica-sync/) - loads on every app
    // page once this device has the Habitica key (Account Info saves it).
    loadHabiticaSync() {
        const path = window.location.pathname;
        const nested = path.includes('features') || path.includes('plugins');
        if (!nested || path.includes('/onboarding/')) return;
        if (!localStorage.getItem('bizzybee_habitica_link') || localStorage.getItem('bizzybee_dev_test') === '1') return;
        const add = (src) => new Promise((resolve) => {
            if (document.querySelector(`script[src*="${src.split("/").pop()}"]`)) { resolve(); return; }
            const script = document.createElement('script');
            script.src = `../../../${src}`;
            script.onload = resolve;
            script.onerror = resolve;
            document.body.appendChild(script);
        });
        const apiReady = typeof HabiticaAPI !== 'undefined' ? Promise.resolve() : add('src/core/habitica-api.js');
        apiReady.then(() => add('src/core/habitica-sync/habitica-sync.js'));
    }

    // Dev tools (Craft, 2026-10-09).
    //  - This computer: src/local/admin.local.js (gitignored) adds the
    //    Hacker / password login; once signed in that way, the 🛠 panel
    //    (src/core/dev-tools/dev-tools.js) loads on every page.
    //  - Live site: the 🛠 panel loads only when signed in to Cloud Sync
    //    with the owner's account (DevTools.isOwner checks a SHA-256 of the
    //    email, so the address itself isn't in the code). On live, every
    //    tool works on a separate test save that never syncs.
    loadLocalDevTools() {
        const host = window.location.hostname;
        const isLocal = host === '' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
            || /^(10|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local');
        const path = window.location.pathname;
        const nested = path.includes('features') || path.includes('plugins');
        const root = nested ? '../../..' : '.';
        const add = (src) => {
            const script = document.createElement('script');
            script.src = `${root}/${src}`;
            script.onerror = () => script.remove();
            document.body.appendChild(script);
        };
        if (isLocal) add('src/local/admin.local.js');
        if (!nested) return;   // no panel on the login page
        const localDev = isLocal && localStorage.getItem('bizzybee_dev') === '1';
        const maybeOwner = localStorage.getItem('bizzybee_session') === 'identity' && !!localStorage.getItem('gotrue.user');
        if (localDev || maybeOwner || localStorage.getItem('bizzybee_dev_test') === '1') add('src/core/dev-tools/dev-tools.js');
    }

    renderGlobalUI() {
        // index.html (the project root) IS the login page now - login.js/
        // login.css/index.html moved here from src/features/login/ so the
        // real front door is the actual root, not a redirect target (see
        // HANDOFF.md §12 "index/login swap"). Every other page lives under
        // src/features/*/ or src/plugins/*/, so "not nested" reliably means
        // "this is the root/login page" - same depth check every other
        // rootPrefix computation in this file (and db.js/llm-engine.js)
        // already uses, just inverted.
        const path = window.location.pathname;
        const isNestedPage = path.includes('features') || path.includes('plugins');
        const isLoginPage = !isNestedPage;
        const rootPrefix = isNestedPage ? '../../..' : '.';

        // Login gate: every page except index.html itself requires the
        // 'bizzybee_session' flag (set by login.js on a successful demo or
        // personal login). This is a client-side-only check on a static
        // site - it keeps casual visitors on the front door, it isn't real
        // access control (anyone could clear the flag or skip straight to
        // a URL). Real protection would need an actual backend, which this
        // app deliberately doesn't have yet.
        if (!isLoginPage && !localStorage.getItem('bizzybee_session')) {
            window.location.href = `${rootPrefix}/index.html`;
            return;
        }

        // The egg page is a world of its own: no header, dock or buttons.
        const isOnboarding = path.includes('/onboarding/');

        if (!isLoginPage && !isOnboarding) {
            AppShell.mount(rootPrefix, this.getCurrentPageKey());
            this.injectBackButton();
        }

    }

    // --- App Lock ---------------------------------------------------------
    // See the AppLock object above for the storage/design notes. This just
    // decides WHEN to show it and builds the overlay itself.
    initAppLock() {
        // Only ever relevant on an actual post-login page - index.html (the
        // login page) has no session/Vault data to protect yet, and locking
        // someone OUT of the login screen would be nonsensical. Same
        // isNestedPage check renderGlobalUI() above already uses.
        const path = window.location.pathname;
        const isNestedPage = path.includes('features') || path.includes('plugins');
        if (!isNestedPage) return;

        if (!AppLock.hasPin()) return;
        if (AppLock.isUnlockedThisSession()) return;

        this.showAppLockOverlay();
    }

    // Built and injected the same way injectHeader/injectFooter are -
    // there's no separate HTML/CSS file for this, it's assembled here and
    // styled by the .app-lock-* rules in global.css (the one stylesheet
    // every page that can show this overlay already loads). A plain
    // fixed, full-viewport, high-z-index div is enough to block interacting
    // with the page underneath it - consistent with this app's existing,
    // openly-stated security level (a casual deterrent on a static site
    // with no backend, not real access control - see auth.js's comment).
    showAppLockOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'app-lock-overlay';
        overlay.innerHTML = `
            <div class="app-lock-card">
                <h1 class="gold-gradient-text">🔒 Locked</h1>
                <p class="app-lock-subtitle">Enter your 4-digit App Lock PIN to continue.</p>
                <div class="app-lock-pin-inputs">
                    <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="app-lock-pin-digit" autocomplete="off">
                    <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="app-lock-pin-digit" autocomplete="off">
                    <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="app-lock-pin-digit" autocomplete="off">
                    <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="app-lock-pin-digit" autocomplete="off">
                </div>
                <p class="app-lock-error" hidden>🐝 Incorrect PIN.</p>
            </div>
        `;
        document.body.appendChild(overlay);

        const card = overlay.querySelector('.app-lock-card');
        const digits = Array.from(overlay.querySelectorAll('.app-lock-pin-digit'));
        const errorEl = overlay.querySelector('.app-lock-error');

        const tryUnlock = async () => {
            const pin = digits.map(d => d.value).join('');
            if (pin.length !== 4) return;

            if (await AppLock.verifyPin(pin)) {
                AppLock.markUnlocked();
                overlay.remove();
                return;
            }

            errorEl.hidden = false;
            card.classList.remove('app-lock-card--shake');
            void card.offsetWidth; // force reflow so the shake can replay on a second wrong attempt in a row
            card.classList.add('app-lock-card--shake');
            digits.forEach((d) => { d.value = ''; });
            digits[0].focus();
        };

        digits.forEach((input, index) => {
            input.addEventListener('input', () => {
                input.value = input.value.replace(/\D/g, '').slice(0, 1);
                if (input.value && index < digits.length - 1) {
                    digits[index + 1].focus();
                }
                if (digits.every((d) => d.value)) tryUnlock();
            });
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Backspace' && !input.value && index > 0) {
                    digits[index - 1].focus();
                }
            });
        });

        digits[0].focus();
    }

    // --- Cloud Sync auto-engine loader ----------------------------------
    // Loads the Netlify Identity widget + cloud-sync.js on EVERY page (not
    // just Settings) when the signed-in method is Cloud Sync - so a change
    // made on any screen (Quests, Dailies, Dashboard...) still triggers the
    // debounced auto-push instead of only firing after a trip to Settings.
    // Only runs at all for 'identity' sessions - demo/personal sessions
    // never touch either script, so the app's normal weight is unchanged
    // for the common case. See HANDOFF.md's auto-sync entry and
    // src/core/cloud-sync/cloud-sync.js for the rest of the design notes.
    //
    // settings.html separately loads the Identity widget script itself
    // (statically, in its own <head>) for its manual Save/Load UI - that
    // tag executes before this runs (app.js is a plain body <script>, so it
    // always runs after head scripts), so by the time this method runs
    // there `netlifyIdentity` is already a real global and the guard below
    // skips straight to loading cloud-sync.js without re-injecting anything.
    // Loads FolderBackup on every nested page (not the root/login page,
    // same gate as initCloudSyncAuto above) so its throttled background
    // write can run no matter where the user is in the app. settings.html
    // also includes this script statically for its own UI - the guard
    // below skips re-injecting it there.
    initFolderBackupAuto() {
        if (typeof Vault !== 'undefined' && Vault.devTest) return;   // dev test save never backs up
        const path = window.location.pathname;
        const isNestedPage = path.includes('features') || path.includes('plugins');
        if (!isNestedPage) return;
        if (document.querySelector('script[src*="core/folder-backup.js"]')) return;
        const script = document.createElement('script');
        script.src = '../../../src/core/folder-backup.js';
        document.body.appendChild(script);
    }

    initCloudSyncAuto() {
        if (localStorage.getItem('bizzybee_session') !== 'identity') return;
        if (typeof Vault !== 'undefined' && Vault.devTest) return;   // dev test save never syncs

        const path = window.location.pathname;
        const isNestedPage = path.includes('features') || path.includes('plugins');
        if (!isNestedPage) return;
        const rootPrefix = isNestedPage ? '../../..' : '.';

        const loadCloudSyncModule = () => {
            if (document.querySelector('script[src*="cloud-sync/cloud-sync.js"]')) return;
            const script = document.createElement('script');
            script.src = `${rootPrefix}/src/core/cloud-sync/cloud-sync.js`;
            document.body.appendChild(script);
        };

        const existingWidget = document.querySelector('script[src*="netlify-identity-widget"]');
        if (existingWidget) {
            // Already present - either settings.html's own static tag (see
            // above, already finished loading by now) or a widget script
            // this same method injected on an earlier call. No reliable
            // 'load' event to hang off of after the fact, so just check
            // whether the global actually exists yet.
            if (typeof netlifyIdentity !== 'undefined') loadCloudSyncModule();
            else existingWidget.addEventListener('load', loadCloudSyncModule);
            return;
        }

        const widgetScript = document.createElement('script');
        widgetScript.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
        widgetScript.addEventListener('load', loadCloudSyncModule);
        document.body.appendChild(widgetScript);
    }

    getCurrentPageKey() {
        const path = window.location.pathname;
        if (path.includes('home.html')) return 'home';
        if (path.includes('dashboard.html')) return 'dashboard';
        if (path.includes('quests.html')) return 'quests';
        if (path.includes('create-quest.html')) return 'create-quest';
        if (path.includes('quest.html')) return 'quest';
        if (path.includes('skills.html')) return 'skills';
        if (path.includes('dictionary.html')) return 'dictionary';
        if (path.includes('profile.html')) return 'profile';
        if (path.includes('account-info.html')) return 'account-info';
        if (path.includes('account-security.html')) return 'account-security';
        if (path.includes('inventory.html')) return 'inventory';
        if (path.includes('keeperdex.html')) return 'keeperdex';
        if (path.includes('models.html')) return 'models';
        if (path.includes('settings.html')) return 'settings';
        if (path.includes('colony.html')) return 'colony';
        if (path.includes('gacha.html')) return 'gacha';
        if (path.includes('honey-store.html')) return 'honey-store';
        if (path.includes('plugin-hub.html')) return 'plugin-hub';
        if (path.includes('map.html')) return 'map';
        if (path.includes('hive-archive.html')) return 'hive-archive';
        if (path.includes('dailies.html')) return 'dailies';
        if (path.includes('create-daily.html')) return 'create-daily';
        if (path.includes('calendar.html')) return 'calendar';
        if (path.includes('create-habit.html')) return 'create-habit';
        if (path.includes('habits.html')) return 'habits';
        if (path.includes('create-todo.html')) return 'create-todo';
        if (path.includes('todos.html')) return 'todos';
        return 'home';
    }

    // A real "go back" button - lives as its own floating hexagon next to
    // the Waggle FAB (bottom of the screen) rather than in the header,
    // so it reads as a peer control to that FAB instead of another header
    // nav item. Present on every page this same header/footer pair is
    // (everywhere except the root index.html/login page) - the whole point
    // is there's no dead end anywhere, no matter how you got there (header
    // nav, Home's app grid, the Waggle FAB, a modal's own link, etc.).
    // Prefers actual browser history so it lands wherever you really came
    // from; only falls back to Home if there's nothing to go back to (e.g.
    // the very first page opened this session, or history was cleared).
    injectBackButton() {
        const btn = document.createElement('button');
        btn.className = 'back-fab-btn';
        btn.title = 'Go back';
        btn.setAttribute('aria-label', 'Go back');
        // Wrapped in its own span (z-index above the ::before ring layer
        // in global.css) so the arrow reliably paints on top of the
        // hexagon's inner obsidian fill rather than depending on default
        // stacking order between a text node and an absolutely-positioned
        // pseudo-element.
        btn.innerHTML = '<span class="back-fab-btn-icon">←</span>';

        btn.addEventListener('click', () => {
            if (window.history.length > 1) {
                window.history.back();
                return;
            }
            // Same nested-page check app.js/db.js/llm-engine.js all share
            // (src/features/*/ and src/plugins/*/ sit at the same depth).
            // Falls back to home.html now, NOT index.html - index.html is
            // the login page (see NAV_ITEMS comment above), landing a
            // logged-in user back there would just bounce them straight
            // through to Home anyway (see login.js), but going there
            // directly is more honest about where "back" actually means.
            const currentPath = window.location.pathname;
            const isNestedPage = currentPath.includes('features') || currentPath.includes('plugins');
            const rootPrefix = isNestedPage ? '../../..' : '.';
            window.location.href = `${rootPrefix}/src/features/home/home.html`;
        });

        document.body.appendChild(btn);
    }

    // Custom in-page "Install" button riding on the beforeinstallprompt
    // capture at the top of this file - hidden by default (see
    // .install-fab-btn[hidden] in global.css) and only revealed once the
    // browser actually confirms this page load is installable, so it
    // never shows a dead button on an already-installed app or a browser
    // that doesn't support this API at all (notably iOS Safari - there,
    // "Add to Home Screen" stays a manual Share-sheet action with no JS
    // hook, so this button simply never appears, which is correct, not a
    // bug). Sits in the same floating-hexagon row as the back button and
    // the Waggle FAB, mirrored to the opposite side (see
    // .install-fab-btn's left offset math in global.css).
    injectInstallButton() {
        const btn = document.createElement('button');
        btn.className = 'install-fab-btn';
        btn.title = 'Install Bizzybee as an app';
        btn.setAttribute('aria-label', 'Install Bizzybee as an app');
        btn.hidden = true;
        btn.innerHTML = '<span class="install-fab-btn-icon">📲</span>';

        const reveal = () => { btn.hidden = false; };
        const hide = () => { btn.hidden = true; };

        // Covers both orders: the event firing before this method ever
        // runs (checked directly) and it firing after (the custom event
        // the top-level listener dispatches).
        if (window.__bbInstallPrompt) reveal();
        document.addEventListener('bb-install-available', reveal);
        document.addEventListener('bb-install-done', hide);

        btn.addEventListener('click', async () => {
            const promptEvent = window.__bbInstallPrompt;
            if (!promptEvent) return;
            // A beforeinstallprompt event can only ever be used once -
            // consumed here regardless of what the user picks. The only
            // way to prompt again is a fresh event on a later page load.
            window.__bbInstallPrompt = null;
            hide();
            promptEvent.prompt();
            await promptEvent.userChoice;
        });

        document.body.appendChild(btn);
    }

}

// ---------------------------------------------------------------------------
// App opening (2026-10-09, Craft): a crimson line draws out from the middle
// of the screen, then the screen opens top and bottom like a scroll - the
// two halves carry the line away, echoing the red lines on the top bar and
// the dock. Plays on the login page (after the gold launch logo) and on the
// first app page of each visit. The cover stays up until the save has
// loaded, so nothing flashes underneath (like Home before the egg).
// ---------------------------------------------------------------------------
const AppOpen = {
    el: null,
    played: false,

    // Puts the cover up right away (call before the page paints).
    cover() {
        if (this.el) return this.el;
        const el = document.createElement('div');
        el.className = 'app-open';
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = '<div class="ao-half ao-top"></div><div class="ao-half ao-bot"></div><div class="ao-line"></div>';
        (document.body || document.documentElement).appendChild(el);
        this.el = el;
        return el;
    },

    // Line, then open. Resolves when the page is fully revealed.
    // Optional centre piece (the launch logo) that fades before the line.
    setCenter(html) {
        const el = this.cover();
        let c = el.querySelector('.ao-center');
        if (!c) { c = document.createElement('div'); c.className = 'ao-center'; el.appendChild(c); }
        c.innerHTML = html;
    },

    open() {
        if (this.played) return Promise.resolve();
        this.played = true;
        const el = this.cover();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const lead = el.querySelector('.ao-center') ? (reduce ? 50 : 520) : 0;
        if (lead) el.classList.add('fade-center');
        return new Promise(resolve => {
            setTimeout(() => requestAnimationFrame(() => {
                el.classList.add('draw');
                setTimeout(() => el.classList.add('open'), reduce ? 50 : 760);
                setTimeout(() => { el.remove(); this.el = null; resolve(); }, reduce ? 400 : 2100);
            }), lead);
        });
    },

    // First app page of this visit? (sessionStorage; private mode just skips it)
    firstOfVisit() {
        try {
            if (sessionStorage.getItem('bizzybee_opened')) return false;
            sessionStorage.setItem('bizzybee_opened', '1');
            return true;
        } catch (e) { return false; }
    }
};

(function setupAppOpen() {
    const path = window.location.pathname;
    const isApp = (path.includes('/features/') || path.includes('/plugins/')) && !path.includes('/onboarding/');
    if (!isApp || !localStorage.getItem('bizzybee_session') || !AppOpen.firstOfVisit()) return;
    AppOpen.cover();
    let done = false;
    const go = () => { if (!done) { done = true; AppOpen.open(); } };
    // Open once the save has loaded (and the page had a beat to draw).
    if (typeof Vault !== 'undefined' && typeof Vault.init === 'function' && !Vault.__openWatched) {
        Vault.__openWatched = true;
        const init = Vault.init.bind(Vault);
        Vault.init = (...args) => init(...args).then((state) => { setTimeout(go, 250); return state; });
    }
    setTimeout(go, 3000);   // never stay covered if a page doesn't load the save
})();

// Boot up the system globally
const bizzybeeApp = new CodexSystem();
