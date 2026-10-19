console.log("/// WAGGLE ONLINE ///");

// The top-right menu (Oct 2026 redesign, approved demo). A honey hex with
// the familiar 3-line icon opens a side drawer with every page grouped.
// Pages still call Waggle.setActions([...]); their own extras (e.g.
// "Add Daily") show under "This page", and an action with footer:true
// (Chat with Eevee) sits at the bottom. The page links live here.
const WAGGLE_MENU = [
    ['Your hive', [
        { icon: '🏰', label: 'Hive Mind', path: 'src/features/colony/colony.html', fainted: true },
        { icon: '🌼', label: 'Pollination Chamber', path: 'src/features/gacha/gacha.html', tickets: true },
        { icon: '🐝', label: 'Colony Bees', path: 'src/features/colony-bees/colony-bees.html' },
        { icon: '🎒', label: 'Inventory', path: 'src/features/inventory/inventory.html' },
        { icon: '📘', label: 'KeeperDex', path: 'src/features/keeperdex/keeperdex.html' }
    ]],
    ['Progress', [
        { icon: '📊', label: 'Dashboard', path: 'src/features/dashboard/dashboard.html' },
        { icon: '🗺️', label: 'Map', path: 'src/features/map/map.html' },
        { icon: '🌳', label: 'Skills', path: 'src/features/skills/skills.html' },
        { icon: '👤', label: 'Profile', path: 'src/features/profile/profile.html' }
    ]],
    ['Tools', [
        { icon: '📅', label: 'Calendar', path: 'src/plugins/calendar/calendar.html', plugin: 'calendar' },
        { icon: '📖', label: 'Dictionary', path: 'src/plugins/dictionary/dictionary.html', plugin: 'dictionary' },
        { icon: '🎓', label: 'Study', path: 'src/plugins/study/study.html', plugin: 'study' },
        { icon: '💻', label: 'Terminal', path: 'src/plugins/terminal/terminal.html', plugin: 'terminal' },
        { icon: '🧩', label: 'Plugins & Packs', path: 'src/features/plugin-hub/plugin-hub.html' }
    ]],
    ['Account', [
        { icon: '🔄', label: 'Phone Sync', path: 'src/features/sync/sync.html' },
        { icon: '🔐', label: 'Account Info', path: 'src/features/account-info/account-info.html' },
        { icon: '⚙️', label: 'Settings', path: 'src/features/settings/settings.html' }
    ]]
];

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

        document.body.append(b, scrim, menu);
        this.button = b; this.menu = menu; this.scrim = scrim;
        if (typeof Vault !== 'undefined' && Vault.save && !Vault.__waggleWatched) {
            Vault.__waggleWatched = true;
            const save = Vault.save.bind(Vault);
            Vault.save = (...args) => { const r = save(...args); setTimeout(() => this.updateDot(), 0); return r; };
        }
        setTimeout(() => this.updateDot(), 500);
    },

    // Red dot: a level-up or tickets are waiting.
    status() {
        const v = typeof Vault !== 'undefined' && Vault.state ? Vault : null;
        let bar = null, tickets = 0;
        try { bar = v ? v.getCharacterLevelBar() : null; } catch { /* not ready */ }
        try { tickets = v && v.getTicketCount ? v.getTicketCount() : 0; } catch { /* not ready */ }
        let fainted = 0;
        try { fainted = v ? v.getColonyBees().filter(b => b.life && b.life.faintedAt).length : 0; } catch { /* not ready */ }
        return { levelUp: !!(bar && bar.maxed), level: bar ? bar.level : null, tickets, fainted };
    },

    updateDot() {
        if (!this.button) return;
        const s = this.status();
        this.button.querySelector('.wg-dot').hidden = !(s.levelUp || s.tickets > 0 || s.fainted > 0);
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
            const shown = items.filter(it => !it.plugin || pluginOn(it.plugin));
            if (!shown.length) return;
            html += `<div class="wg-sec">${sec}</div>` + shown.map(it => {
                const file = it.path.split('#')[0].split('/').pop();
                const on = !it.key && here.endsWith(file);
                const extra = it.tickets && s.tickets > 0 ? `${s.tickets} ticket${s.tickets === 1 ? '' : 's'} ready`
                    : it.fainted && s.fainted > 0 ? `${s.fainted} bee${s.fainted === 1 ? ' has' : 's have'} fainted` : '';
                return row(it.icon, it.label, extra, `href="${root}/${it.path}"${it.key ? ` data-key="${it.key}"` : ''}`, on);
            }).join('');
        });
        html += '</div>';
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
