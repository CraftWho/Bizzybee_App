console.log("/// BIZZYBEE MOTHERBOARD ONLINE ///");

// Single source of truth for every page reachable from the header nav.
// key doubles as the folder/file name (e.g. features/dashboard/dashboard.html).
// 'home' used to be a special-cased 'index' key pointing at the project
// root - Home moved to src/features/home/home.html so root index.html
// could become the login page instead (see HANDOFF.md §12 "index/login
// swap"), so it's now a completely normal entry like every other page here.
const NAV_ITEMS = [
    { key: 'home', icon: '🏠', label: 'Home' },
    { key: 'dashboard', icon: '👨🏾‍💻', label: 'Dashboard' },
    { key: 'quests', icon: '📜', label: 'Quests' },
    { key: 'dailies', icon: '☀️', label: 'Dailies' },
    { key: 'map', icon: '🗺️', label: 'Map' }
];

// Pages that exist and need a correct header title/icon, but are reached
// from the Home screen's app icon grid rather than a header nav link (see
// home.js's renderAppGrid) - Settings, Skills, Dictionary, and Profile
// were deliberately pulled from the header nav to declutter it. Honey
// Store and Plugin Hub are fully built now too (Hive Archive is still the
// one genuine WIP placeholder of the three) - none of them ever had a
// header nav link, so they've always lived here regardless.
const EXTRA_PAGE_META = {
    settings: { icon: '⚙️', label: 'Settings' },
    colony: { icon: '🏰', label: 'Hive Mind' },
    gacha: { icon: '🌼', label: 'Pollination Chamber' },
    'honey-store': { icon: '🍯', label: 'Honey Store' },
    'plugin-hub': { icon: '🧩', label: 'Plugins' },
    'hive-archive': { icon: '📚', label: 'The Hive Archive' },
    skills: { icon: '🌿', label: 'Skills' },
    dictionary: { icon: '📖', label: 'Dictionary' },
    profile: { icon: '🧘🏾', label: 'Profile' },
    'account-info': { icon: '🔐', label: 'Account Info' },
    'account-security': { icon: '🔐', label: 'Account Security' },
    inventory: { icon: '🎒', label: 'Inventory' },
    keeperdex: { icon: '📘', label: 'KeeperDex' },
    calendar: { icon: '📅', label: 'Calendar' },
    'create-daily': { icon: '☀️', label: 'Daily' }
};

class CodexSystem {
    constructor() {
        this.init();
    }

    init() {
        this.renderGlobalUI();
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

        if (!isLoginPage) {
            this.injectHeader();
            this.injectBackButton();
        }

        this.injectFooter();
    }

    getCurrentPageKey() {
        const path = window.location.pathname;
        if (path.includes('home.html')) return 'home';
        if (path.includes('dashboard.html')) return 'dashboard';
        if (path.includes('quests.html')) return 'quests';
        if (path.includes('skills.html')) return 'skills';
        if (path.includes('dictionary.html')) return 'dictionary';
        if (path.includes('profile.html')) return 'profile';
        if (path.includes('account-info.html')) return 'account-info';
        if (path.includes('account-security.html')) return 'account-security';
        if (path.includes('inventory.html')) return 'inventory';
        if (path.includes('keeperdex.html')) return 'keeperdex';
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
        return 'home';
    }

    injectHeader() {
        // Determine the correct relative path prefixes based on the current page location
        const currentPath = window.location.pathname;

        // NAV_ITEMS entries all live under src/features/*/ - a plugin page
        // is at the SAME depth (two levels under src/) but a DIFFERENT
        // parent folder, so reaching a feature page from one needs an
        // extra '..' to climb out of plugins/ first before dropping into
        // features/. Bug found + fixed during the index/login swap (see
        // HANDOFF.md §12): this used to collapse both cases to a single
        // '..', which is only correct from a features/ page - from a
        // plugins/ page it resolved one level short and 404'd.
        const isFeaturePage = currentPath.includes('features');
        const isPluginPage = currentPath.includes('plugins');
        const linkPrefix = isFeaturePage ? '..' : (isPluginPage ? '../../features' : './src/features');

        // 'home' is now a completely normal entry (src/features/home/) - no
        // more special-cased root path, see the NAV_ITEMS comment above.
        const hrefFor = (key) => `${linkPrefix}/${key}/${key}.html`;

        const currentKey = this.getCurrentPageKey();
        // Settings and every WIP page live outside NAV_ITEMS now (reached via
        // Home's icon grid instead) - fall back to EXTRA_PAGE_META, then a
        // generic default, so the header title never crashes on a page that
        // isn't in the nav strip itself.
        const currentItem = NAV_ITEMS.find(item => item.key === currentKey)
            || EXTRA_PAGE_META[currentKey]
            || { icon: '🐝', label: 'Bizzybee' };

        const navLinksHTML = NAV_ITEMS.map(item => `
            <a href="${hrefFor(item.key)}" class="nav-link${item.key === currentKey ? ' nav-link--active' : ''}">
                <span class="nav-link-icon">${item.icon}</span>
                <span class="nav-link-label">${item.label}</span>
            </a>
        `).join('');

        const header = document.createElement('header');
        header.className = 'global-header';

        header.innerHTML = `
            <div class="header-page-name">
                <span class="page-name-icon">${currentItem.icon}</span>
                <span class="page-name-text">${currentItem.label}</span>
            </div>

            <nav class="header-nav">
                ${navLinksHTML}
            </nav>
        `;

        // Inject it at the very top of the body
        document.body.insertBefore(header, document.body.firstChild);
    }

    // A real "go back" button - lives as its own floating hexagon next to
    // the Hive Mind FAB (bottom of the screen) rather than in the header,
    // so it reads as a peer control to that FAB instead of another header
    // nav item. Present on every page this same header/footer pair is
    // (everywhere except the root index.html/login page) - the whole point
    // is there's no dead end anywhere, no matter how you got there (header
    // nav, Home's app grid, the Hive Mind FAB, a modal's own link, etc.).
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

    injectFooter() {
        const footer = document.createElement('footer');
        footer.className = 'global-footer';

        footer.innerHTML = `
            <span class="footer-brand">🐝 BIZZYBEE</span>
            <span class="footer-version">v0.1.0</span>
        `;

        document.body.appendChild(footer);
    }
}

// Boot up the system globally
const bizzybeeApp = new CodexSystem();
