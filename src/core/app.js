console.log("/// BIZZYBEE MOTHERBOARD ONLINE ///");

// Single source of truth for every page reachable from the header nav.
// key doubles as the folder/file name (e.g. features/dashboard/dashboard.html).
const NAV_ITEMS = [
    { key: 'index', icon: '🏠', label: 'Home' },
    { key: 'dashboard', icon: '👨🏾‍💻', label: 'Dashboard' },
    { key: 'quests', icon: '📜', label: 'Quests' },
    { key: 'skills', icon: '🌿', label: 'Skills' },
    { key: 'dictionary', icon: '📖', label: 'Dictionary' },
    { key: 'profile', icon: '🧘🏾', label: 'Profile' },
    { key: 'settings', icon: '⚙️', label: 'Settings' }
];

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
        const currentItem = NAV_ITEMS.find(item => item.key === currentKey);

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
