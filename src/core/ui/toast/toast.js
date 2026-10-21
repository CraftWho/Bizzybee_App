console.log("/// TOAST MODULE ONLINE ///");

// Toast.show('message', 'positive' | 'negative' | 'neutral' [, ms])
// A pop-up message that stays long enough to read (Oct 2026):
//   - normal: 3.5s, plus more time for longer text (up to 8s)
//   - errors ('negative'): 8s, plus more for long text (up to 15s),
//     with a ✕ button. Tap any message to close it early.
// Hovering or pressing on a message pauses it. Messages stack above the dock.
const Toast = {
    stack: null,

    ensureStack() {
        if (this.stack && this.stack.isConnected) return this.stack;
        this.stack = document.createElement('div');
        this.stack.className = 'bizzybee-toast-stack';
        document.body.appendChild(this.stack);
        return this.stack;
    },

    duration(message, type) {
        const extra = Math.max(0, String(message).length - 40) * 60;
        return type === 'negative' ? Math.min(15000, 8000 + extra) : Math.min(8000, 3500 + extra);
    },

    show(message, type = 'positive', ms) {
        const stack = this.ensureStack();
        const el = document.createElement('div');
        el.className = `bizzybee-toast bizzybee-toast--${type}`;
        el.setAttribute('role', type === 'negative' ? 'alert' : 'status');
        const text = document.createElement('span');
        text.className = 'bizzybee-toast-text';
        text.textContent = message;
        el.appendChild(text);
        if (type === 'negative') {
            const x = document.createElement('button');
            x.type = 'button';
            x.className = 'bizzybee-toast-x';
            x.setAttribute('aria-label', 'Close message');
            x.textContent = '✕';
            el.appendChild(x);
        }
        stack.appendChild(el);
        while (stack.children.length > 4) stack.firstElementChild.remove();
        requestAnimationFrame(() => el.classList.add('bizzybee-toast--visible'));

        let left = ms || this.duration(message, type), started = Date.now(), timer = null;
        const close = () => {
            clearTimeout(timer);
            el.classList.remove('bizzybee-toast--visible');
            setTimeout(() => el.remove(), 300);
        };
        const run = () => { started = Date.now(); timer = setTimeout(close, left); };
        const pause = () => { clearTimeout(timer); left = Math.max(1500, left - (Date.now() - started)); };
        el.addEventListener('click', close);
        el.addEventListener('mouseenter', pause);
        el.addEventListener('mouseleave', run);
        el.addEventListener('pointerdown', pause);
        run();
        return close;
    }
};
