console.log("/// WAGGLE ONLINE ///");

// The top-right menu (Oct 2026 redesign, approved demo). A honey hex with
// the familiar 3-line icon opens a side drawer with every page grouped.
// Pages still call Waggle.setActions([...]); their own extras (e.g.
// "Add Daily") show under "This page", and an action with footer:true
// (Chat with Eve) sits at the bottom. The page links live here.
const WAGGLE_MENU = [
    ['Your hive', [
        { icon: '🏰', label: 'Hive Mind', path: 'src/features/colony/colony.html', fainted: true },
        { icon: '🌼', label: 'Pollination Chamber', path: 'src/features/gacha/gacha.html', tickets: true },
        { icon: '🐝', label: 'Colony Bees', path: 'src/features/colony-bees/colony-bees.html' },
        { icon: '🎒', label: 'Inventory', path: 'src/features/inventory/inventory.html' },
        { icon: '🥚', label: 'Egg Incubator', path: 'src/features/incubator/incubator.html', owned: 'incubator' },
        { icon: '📘', label: 'KeeperDex', path: 'src/features/keeperdex/keeperdex.html' },
        { icon: '🤝', label: "Friends' hives", path: 'src/features/friends/friends.html' }
    ]],
    ['Progress', [
        { icon: '📊', label: 'Dashboard', path: 'src/features/dashboard/dashboard.html' },
        { icon: '🗺️', label: 'Map', path: 'src/features/map/map.html' },
        { icon: '🌳', label: 'Skills', path: 'src/features/skills/skills.html' },
        { icon: '🕘', label: 'History', path: 'src/features/history/history.html' },
        { icon: '🎁', label: 'Daily bonus', path: 'src/features/daily-bonus/daily-bonus.html' },   // Oct 30 2026 (Craft)
        { icon: '👤', label: 'Profile', path: 'src/features/profile/profile.html' },
        { icon: '🏅', label: 'Titles', path: 'src/features/titles/titles.html' }   // Oct 30 2026 (Craft)
    ]],
    ['Tools', [
        { icon: '📅', label: 'Calendar', path: 'src/plugins/calendar/calendar.html', plugin: 'calendar' },
        { icon: '📖', label: 'Dictionary', path: 'src/plugins/dictionary/dictionary.html', plugin: 'dictionary' },
        { icon: '🎓', label: 'Study', path: 'src/plugins/study/study.html', plugin: 'study' },
        { icon: '💻', label: 'Terminal', path: 'src/plugins/terminal/terminal.html', plugin: 'terminal' },
        { icon: '🧩', label: 'Plugins & Packs', path: 'src/features/plugin-hub/plugin-hub.html' }
    ]],
    ['Account', [
        { icon: '📬', label: 'Mailbox', path: 'src/features/mailbox/mailbox.html', mail: true },
        { icon: '🎨', label: 'Themes', path: 'src/features/themes/themes.html' },
        { icon: '📘', label: 'Guide (Eve)', path: 'src/features/guide/guide.html' },
        { icon: '🛟', label: 'Contact support', path: 'src/features/support/support.html' },   // Oct 30 2026 (Craft)
        { icon: '🔔', label: 'Notifications', path: 'src/features/notifications/notifications.html' },
        { icon: '🔄', label: 'Phone Sync', path: 'src/features/sync/sync.html' },
        { icon: '🔐', label: 'Account Info', path: 'src/features/account-info/account-info.html' },
        { icon: '⚙️', label: 'Settings', path: 'src/features/settings/settings.html', settings: true }
    ]]
];

// Oct 30 2026 (Craft): Home tiles you choose. Hold a page in this menu
// to pin it to Home (or take it off). Home's edit mode can remove tiles,
// add any page with ＋, and Reset Home. Saved as state.homeTiles
// { hidden: [keys], extra: [keys] } so it follows the cloud save.
const HOME_DEFAULT_TILES = ['colony', 'models', 'honey-store', 'skills', 'map', 'dashboard', 'profile', 'plugin-hub', 'hive-archive', 'notifications', 'settings'];
const HomeTiles = {
    keyOf: (path) => path.split('#')[0].split('/').pop().replace(/\.html$/, ''),
    state() {
        const v = typeof Vault !== 'undefined' && Vault.state ? Vault.state : null;
        if (!v) return { hidden: [], extra: [] };
        const t = v.homeTiles && typeof v.homeTiles === 'object' ? v.homeTiles : {};
        return { hidden: Array.isArray(t.hidden) ? t.hidden : [], extra: Array.isArray(t.extra) ? t.extra : [] };
    },
    put(t) { if (typeof Vault === 'undefined' || !Vault.state) return; Vault.state.homeTiles = t; Vault.save(); },
    // A default tile is on unless hidden; any other page is on only if added.
    isDefault(key) {
        if (HOME_DEFAULT_TILES.includes(key)) return true;
        return typeof Plugins !== 'undefined' && !['habits', 'todos'].includes(key) && Plugins.getCatalog().some(e => e.id === key && Plugins.isEnabled(e.id));
    },
    isOn(key) { const t = this.state(); return this.isDefault(key) ? !t.hidden.includes(key) : t.extra.includes(key); },
    set(key, on) {
        const t = this.state();
        t.hidden = t.hidden.filter(k => k !== key); t.extra = t.extra.filter(k => k !== key);
        if (this.isDefault(key) && !on) t.hidden.push(key);
        if (!this.isDefault(key) && on) t.extra.push(key);
        this.put(t);
    },
    reset() {
        if (typeof Vault === 'undefined' || !Vault.state) return;
        delete Vault.state.homeTiles; delete Vault.state.homeAppOrder; Vault.save();
    },
    // Every page in the menu, for Home's ＋ sheet: { key, label, icon, path }.
    menuPages() {
        const out = [], seen = new Set();
        WAGGLE_MENU.forEach(([, items]) => items.forEach(it => {
            const key = this.keyOf(it.path);
            if (seen.has(key) || (it.plugin && typeof Plugins !== 'undefined' && !Plugins.isEnabled(it.plugin))) return;
            seen.add(key); out.push({ key, label: it.label, icon: it.icon, path: it.path });
        }));
        return out;
    }
};

const Waggle = {
    actions: [],
    isOpen: false,
    button: null,
    menu: null,
    scrim: null,

    setActions(actions) {
        this.actions = actions || [];
        this.render();
    },

    root() {
        if (typeof AppShell !== 'undefined' && AppShell.root) return AppShell.root;
        return /\/src\/(features|plugins)\//.test(window.location.pathname) ? '../../..' : '.';
    },

    esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

    render() {
        if (window.location.pathname.includes('login.html')) { this.destroy(); return; }
        if (!this.button) this.build();
        this.renderMenu();
    },

    build() {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mobile-waggle-btn';
        b.setAttribute('aria-label', 'Open menu');
        b.setAttribute('aria-expanded', 'false');
        b.setAttribute('aria-controls', 'waggle-drawer');
        b.innerHTML = '<span class="wg-hex"></span><span class="wg-bars"><i></i><i></i><i></i></span><span class="wg-dot" hidden></span>';
        b.addEventListener('click', () => this.toggle());

        const scrim = document.createElement('div');
        scrim.className = 'waggle-scrim';
        scrim.addEventListener('click', () => this.close());

        const menu = document.createElement('aside');
        menu.className = 'waggle-menu';
        menu.id = 'waggle-drawer';
        menu.setAttribute('aria-label', 'Menu');
        menu.setAttribute('aria-hidden', 'true');
        menu.inert = true;
        menu.addEventListener('click', (e) => {
            if (e.target.closest('.wg-x')) { this.close(); return; }
            const act = e.target.closest('[data-action]');
            if (act) {
                const a = this.actions[Number(act.dataset.action)];
                this.close();
                if (a && a.onClick) a.onClick();
                return;
            }
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
        // Oct 30 2026 (Craft): hold a page row (0.5s) to pin it to Home or take it off.
        let pinTimer = null, pinned = false;
        menu.addEventListener('pointerdown', (e) => {
            const row = e.target.closest('a.wg-row[href]');
            if (!row) return;
            pinned = false;
            const start = { x: e.clientX, y: e.clientY };
            const stop = (ev) => {
                if (ev && ev.type === 'pointermove' && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return;
                clearTimeout(pinTimer); pinTimer = null;
                ['pointermove', 'pointerup', 'pointercancel'].forEach(t => window.removeEventListener(t, stop));
            };
            ['pointermove', 'pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, stop));
            pinTimer = setTimeout(() => {
                pinTimer = null; pinned = true;
                const key = HomeTiles.keyOf(row.getAttribute('href'));
                const label = (row.querySelector('.wg-t') || row).firstChild.textContent.trim();
                if (key === 'home') return;
                const on = !HomeTiles.isOn(key);
                HomeTiles.set(key, on);
                if (navigator.vibrate) navigator.vibrate(15);
                if (typeof Toast !== 'undefined') Toast.show(on ? `📌 ${label} added to Home` : `${label} removed from Home`, on ? 'positive' : 'neutral');
                window.dispatchEvent(new Event('home-tiles-changed'));
            }, 500);
        });
        menu.addEventListener('click', (e) => { if (pinned && e.target.closest('a.wg-row')) { e.preventDefault(); e.stopPropagation(); pinned = false; } }, true);
        menu.addEventListener('contextmenu', (e) => { if (e.target.closest('a.wg-row')) e.preventDefault(); });

        document.body.append(b, scrim, menu);
        this.button = b; this.menu = menu; this.scrim = scrim;
        if (typeof Vault !== 'undefined' && Vault.save && !Vault.__waggleWatched) {
            Vault.__waggleWatched = true;
            const save = Vault.save.bind(Vault);
            Vault.save = (...args) => { const r = save(...args); setTimeout(() => this.updateDot(), 0); return r; };
        }
        setTimeout(() => this.updateDot(), 500);
        window.addEventListener('mail-changed', () => this.updateDot());
        window.addEventListener('settings-attention', () => this.updateDot());
    },

    // Red dot: a level-up or tickets are waiting.
    status() {
        const v = typeof Vault !== 'undefined' && Vault.state ? Vault : null;
        let bar = null, tickets = 0;
        try { bar = v ? v.getCharacterLevelBar() : null; } catch { /* not ready */ }
        try { tickets = v && v.getTicketCount ? v.getTicketCount() : 0; } catch { /* not ready */ }
        let fainted = 0;
        try { fainted = v ? v.getColonyBees().filter(b => b.life && b.life.faintedAt).length : 0; } catch { /* not ready */ }
        let settings = 0;
        try { settings = Number(localStorage.getItem('bizzybee_settings_attn')) || 0; } catch { /* storage off */ }
        let mail = 0;
        try { mail = typeof Social !== 'undefined' ? Social.unread() : 0; } catch { /* not ready */ }
        return { levelUp: !!(bar && bar.maxed), level: bar ? bar.level : null, tickets, fainted, mail, settings };
    },

    updateDot() {
        if (!this.button) return;
        const s = this.status();
        this.button.querySelector('.wg-dot').hidden = !(s.levelUp || s.tickets > 0 || s.fainted > 0 || s.mail > 0 || s.settings > 0);
    },

    renderMenu() {
        const root = this.root();
        const here = window.location.pathname;
        const s = this.status();
        const v = typeof Vault !== 'undefined' && Vault.state ? Vault : null;
        const name = v ? (v.state.displayName || (v.getRoyalBee && v.getRoyalBee() || {}).name || (v.getUser() || {}).name || 'Beekeeper') : 'Beekeeper';
        const bees = v && v.getColonyBees ? v.getColonyBees().length : 0;
        const pluginOn = (id) => typeof Plugins === 'undefined' || Plugins.isEnabled(id);

        const pageActs = this.actions.map((a, i) => ({ a, i })).filter(x => !x.a.footer);
        const footer = this.actions.map((a, i) => ({ a, i })).filter(x => x.a.footer);
        const row = (ic, label, extra, attrs, on) => `<${attrs.startsWith('href') ? 'a' : 'button type="button"'} class="wg-row${on ? ' on' : ''}" ${attrs}${on ? ' aria-current="page"' : ''}>
            <span class="wg-ic">${ic}</span><span class="wg-t">${this.esc(label)}${extra ? `<small>${extra}</small>` : ''}</span>${extra ? '<span class="wg-badge">!</span>' : '<span class="wg-chev">›</span>'}</${attrs.startsWith('href') ? 'a' : 'button'}>`;

        let html = `<div class="wg-head"><div class="wg-av">🐝</div><div class="wg-who"><b>${this.esc(name)}</b><small>${s.level ? `Level ${s.level}` : ''}${bees ? ` · ${bees} bee${bees === 1 ? '' : 's'}` : ''}</small></div><button type="button" class="wg-x" aria-label="Close menu">✕</button></div><div class="wg-body">`;
        if (s.levelUp) html += `<a class="wg-alert" href="${root}/src/features/home/home.html">✦ Level up ready! Tap to claim</a>`;
        if (pageActs.length) html += `<div class="wg-sec">This page</div>` + pageActs.map(({ a, i }) => row(a.icon, a.label, '', `data-action="${i}"`, false)).join('');
        WAGGLE_MENU.forEach(([sec, items]) => {
            const shown = items.filter(it => (!it.plugin || pluginOn(it.plugin)) && (!it.owned || (v && v.state && v.state.incubator && (v.state.incubator.owned || []).length)));
            if (!shown.length) return;
            html += `<div class="wg-sec">${sec}</div>` + shown.map(it => {
                const file = it.path.split('#')[0].split('/').pop();
                const on = !it.key && here.endsWith(file);
                const extra = it.tickets && s.tickets > 0 ? `${s.tickets} ticket${s.tickets === 1 ? '' : 's'} ready`
                    : it.fainted && s.fainted > 0 ? `${s.fainted} bee${s.fainted === 1 ? ' has' : 's have'} fainted`
                    : it.mail && s.mail > 0 ? `${s.mail} new letter${s.mail === 1 ? '' : 's'}`
                    : it.settings && s.settings > 0 ? `${s.settings} thing${s.settings === 1 ? '' : 's'} need${s.settings === 1 ? 's' : ''} you` : '';
                return row(it.icon, it.label, extra, `href="${root}/${it.path}"${it.key ? ` data-key="${it.key}"` : ''}`, on);
            }).join('');
        });
        html += `<p class="wg-tip">Tip: hold a page to pin it to Home.</p></div>`;
        if (footer.length) html += `<div class="wg-foot">${footer.map(({ a, i }) => `<button type="button" data-action="${i}">${a.icon} ${this.esc(a.label)}</button>`).join('')}</div>`;
        this.menu.innerHTML = html;
        this.updateDot();
    },

    toggle() { this.isOpen ? this.close() : this.open(); },

    open() {
        if (!this.menu) return;
        this.renderMenu();
        this.isOpen = true;
        this.menu.inert = false;
        this.menu.classList.add('is-open');
        this.menu.setAttribute('aria-hidden', 'false');
        this.scrim.classList.add('is-open');
        this.button.classList.add('is-active');
        this.button.setAttribute('aria-expanded', 'true');
        this.button.setAttribute('aria-label', 'Close menu');
        document.body.classList.add('waggle-open');
        (this.menu.querySelector('.wg-row.on') || this.menu.querySelector('.wg-row, .wg-x')).focus({ preventScroll: true });
    },

    close() {
        if (!this.menu) return;
        const wasOpen = this.isOpen;
        this.isOpen = false;
        this.menu.classList.remove('is-open');
        this.menu.setAttribute('aria-hidden', 'true');
        this.menu.inert = true;
        this.scrim.classList.remove('is-open');
        this.button.classList.remove('is-active');
        this.button.setAttribute('aria-expanded', 'false');
        this.button.setAttribute('aria-label', 'Open menu');
        document.body.classList.remove('waggle-open');
        if (wasOpen) this.button.focus({ preventScroll: true });
    },

    destroy() {
        [this.button, this.menu, this.scrim].forEach(el => el && el.remove());
        this.button = this.menu = this.scrim = null;
        this.isOpen = false;
    }
};

// Every page gets the menu (Oct 29 2026 fix: Notifications, Guide and Study
// had none because they never called Waggle.setActions). Pages that set
// their own actions still win, since they call setActions themselves.
document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
    const p = window.location.pathname;
    if (Waggle.button || !/\/src\/(features|plugins)\//.test(p) || /hive-visit|onboarding|request-access|suggestions/.test(p)) return;
    Waggle.setActions(typeof baseWaggleActions === 'function' ? baseWaggleActions() : []);
}, 1500));
