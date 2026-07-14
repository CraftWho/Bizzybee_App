console.log("/// BIZZYBEE MOTHERBOARD ONLINE ///");

class CodexSystem {
    constructor() {
        // We will load user data from db.js here later
        this.user = {
            level: 1,
            currentXP: 0,
            nextLevelXP: 1000
        };
        
        this.init();
    }

    init() {
        this.renderGlobalUI();
    }

    renderGlobalUI() {
        // 1. Detect if we are on the Login page
        const isLoginPage = window.location.pathname.includes('login.html');
        
        // 2. If it is NOT the login page, inject the Terminal Navigation Header
        if (!isLoginPage) {
            this.injectHeader();
        }
    }

    injectHeader() {
        // Create the header element
        const header = document.createElement('header');
        header.className = 'global-header';
        
        // Build the HTML for the header (Using the relative paths we established)
        header.innerHTML = `
            <div class="header-brand">
                <span style="color: #ffd700; font-weight: bold; letter-spacing: 2px;">🐝 BIZZYBEE</span>
                <span style="color: #444; font-size: 0.8rem; margin-left: 10px;">v0.1.0</span>
            </div>
            
            <nav class="header-nav">
                <a href="../dashboard/dashboard.html" class="nav-link">Dashboard</a>
                <a href="../quests/quests.html" class="nav-link">Quests</a>
                <a href="../skills/skills.html" class="nav-link">Skills</a>
                <a href="../dictionary/dictionary.html" class="nav-link">Dictionary</a>
                <a href="../profile/profile.html" class="nav-link">Profile</a>
            </nav>
            
            <div class="header-stats">
                <div class="level-badge" style="background: #222; border: 1px solid #ffd700; padding: 5px 10px; border-radius: 4px;">
                    <span style="color: #aaa; font-size: 0.8rem;">LVL</span>
                    <span style="color: #ffd700; font-weight: bold; margin-left: 5px;" id="global-level">${this.user.level}</span>
                </div>
            </div>
        `;

        // Inject it at the very top of the body
        document.body.insertBefore(header, document.body.firstChild);
    }
}

// Boot up the system globally
const bizzybeeApp = new CodexSystem();