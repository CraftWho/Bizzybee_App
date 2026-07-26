console.log("/// HIVE MIND ONLINE ///");

// Global FAB shell. Owns appearance, positioning, and open/close mechanics only.
// Each feature page decides its own actions by calling HiveMind.setActions([...])
// from its own <feature>.js - the shell never knows what a given page's actions do.
const HiveMind = {
    actions: [],
    isOpen: false,
    button: null,
    menu: null,

    // Called by a feature's own JS with that page's specific functions.
    // action shape: { icon: '📅', label: 'Add Event', onClick: () => {...} }
    setActions(actions) {
        this.actions = actions || [];
        this.render();
    },

    render() {
        const isLoginPage = window.location.pathname.includes('login.html');

        if (isLoginPage || this.actions.length === 0) {
            this.destroy();
            return;
        }

        if (!this.button) {
            this.build();
        }

        this.renderMenuItems();
    },

    build() {
        this.button = document.createElement('button');
        this.button.className = 'mobile-hive-btn';
        this.button.addEventListener('click', () => this.toggle());

        this.menu = document.createElement('div');
        this.menu.className = 'hive-menu';

        document.body.appendChild(this.button);
        document.body.appendChild(this.menu);

        NanoBee.render(this.button, 'mini');
    },

    renderMenuItems() {
        this.menu.innerHTML = this.actions.map((action, i) => `
            <button class="hive-menu-item" data-index="${i}">
                <span class="hive-menu-icon">${action.icon}</span>
                <span class="hive-menu-label">${action.label}</span>
            </button>
        `).join('');

        this.actions.forEach((action, i) => {
            const el = this.menu.querySelector(`[data-index="${i}"]`);
            if (el) {
                el.addEventListener('click', () => {
                    action.onClick();
                    this.close();
                });
            }
        });
    },

    toggle() {
        this.isOpen ? this.close() : this.open();
    },

    open() {
        this.isOpen = true;
        this.menu.classList.add('is-open');
        this.button.classList.add('is-active');
    },

    close() {
        this.isOpen = false;
        this.menu.classList.remove('is-open');
        this.button.classList.remove('is-active');
    },

    destroy() {
        if (this.button) {
            this.button.remove();
            this.button = null;
        }
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
        this.isOpen = false;
    }
};
