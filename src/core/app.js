console.log("/// BIZZYBEE MOTHERBOARD ONLINE ///");

// Single source of truth for every page reachable from the header nav.
// key doubles as the folder/file name (e.g. features/dashboard/dashboard.html).
const NAV_ITEMS = [
    { key: 'index', icon: '🏠', label: 'Home' },
    { key: 'dashboard', icon: '👨🏾‍💻', label: 'Dashboard' },
    { key: 'quests', icon: '📜', label: 'Quests' },
    { key: 'dailies', icon: '☀️', label: 'Dailies' },
    { key: 'map', icon: '🗺️', label: 'Map' }
];

// Pages that exist and need a correct header title/icon, but are reached
// from the Home screen's app icon grid rather than a header nav link (see
// index.js's renderAppGrid) - Settings, Skills, Dictionary, and Profile
// were deliberately pulled from the header nav to declutter it, and the
// WIP pages (Honey Store, Plugins, The Hive Archive) never had one.
const EXTRA_PAGE_META = {
    settings: { icon: '⚙️', label: 'Settings' },
    colony: { icon: '🏰', label: 'Hive Mind' },
    'honey-store': { icon: '🍯', label: 'Honey Store' },
    'plugin-hub': { icon: '🧩', label: 'Plugins' },
    'hive-archive': { icon: '📚', label: 'The Hive Archive' },
    skills: { icon: '🌿', label: 'Skills' },
    dictionary: { icon: '📖', label: 'Dictionary' },
    profile: { icon: '🧘🏾', label: 'Profile' }
};

class CodexSystem {
    constructor() {
        this.init();
    }

    init() {
        this.renderGlobalUI();
    }

    renderGlobalUI() {
        const isLoginPage = window.location.pathname.includes('login.html');

        if (!isLoginPage) {
            this.injectHeader();
        }

        this.injectFooter();
    }

    getCurrentPageKey() {
        const path = window.location.pathname;
        if (path.includes('dashboard.html')) return 'dashboard';
        if (path.includes('quests.html')) return 'quests';
        if (path.includes('skills.html')) return 'skills';
        if (path.includes('dictionary.html')) return 'dictionary';
        if (path.includes('profile.html')) return 'profile';
        if (path.includes('settings.html')) return 'settings';
        if (path.includes('colony.html')) return 'colony';
        if (path.includes('honey-store.html')) return 'honey-store';
        if (path.includes('plugin-hub.html')) return 'plugin-hub';
        if (path.includes('map.html')) return 'map';
        if (path.includes('hive-archive.html')) return 'hive-archive';
        if (path.includes('dailies.html')) return 'dailies';
        return 'index';
    }

    injectHeader() {
        // Determine the correct relative path prefixes based on the current page location
        const currentPath = window.location.pathname;

        // linkPrefix handles hopping between the different feature folders
        const linkPrefix = currentPath.includes('features') ? '..' : './src/features';

        // rootPrefix handles jumping all the way back to the main project folder
        const rootPrefix = currentPath.includes('features') ? '../../..' : '.';

        const hrefFor = (key) => key === 'index'
            ? `${rootPrefix}/index.html`
            : `${linkPrefix}/${key}/${key}.html`;

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
