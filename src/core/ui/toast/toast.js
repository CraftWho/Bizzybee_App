console.log("/// TOAST MODULE ONLINE ///");

// Toast.show('message', 'positive' | 'negative' | 'neutral' [, ms | options])
// Pop-up messages (Oct 27 2026 redesign): a black-and-gold card that drops
// in from the top like a phone notification, with a hexagon ✕.
//   - normal: 3.5s, plus more time for longer text (up to 8s)
//   - errors ('negative'): 8s+ (up to 15s), and an OK button
//   - options: { ms, action: { label, href } or { label, onClick } } adds a
//     "Go to"-style button that leads straight to what the message is about.
// Hovering or pressing on a message pauses it. Up to 4 stack at once.
const Toast = {
    stack: null,
    ICON: { positive: '🐝', negative: '⚠️', neutral: '💡' },

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

    show(message, type = 'positive', opt) {
        const o = typeof opt === 'number' ? { ms: opt } : (opt || {});
        if (!this.ICON[type]) type = 'neutral';
        const stack = this.ensureStack();
        const el = document.createElement('div');
        el.className = `bizzybee-toast bizzybee-toast--${type}`;
        el.setAttribute('role', type === 'negative' ? 'alert' : 'status');

        const icon = document.createElement('span');
        icon.className = 'bizzybee-toast-ic';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = this.ICON[type];
        const body = document.createElement('div');
        body.className = 'bizzybee-toast-body';
        const text = document.createElement('p');
        text.className = 'bizzybee-toast-text';
        text.textContent = message;
        body.appendChild(text);

        const close = () => {
            clearTimeout(timer);
            el.classList.remove('bizzybee-toast--visible');
            setTimeout(() => el.remove(), 300);
        };
        const btns = [];
        if (o.action && o.action.label) btns.push({ label: o.action.label, go: true, run: () => { if (o.action.onClick) o.action.onClick(); else if (o.action.href) window.location.href = o.action.href; } });
        if (type === 'negative' || btns.length) btns.push({ label: 'OK', run: () => {} });
        if (btns.length) {
            const row = document.createElement('div');
            row.className = 'bizzybee-toast-btns';
            btns.forEach(b => {
                const el2 = document.createElement('button');
                el2.type = 'button';
                el2.className = 'bizzybee-toast-btn' + (b.go ? ' go' : '');
                el2.textContent = b.label;
                el2.addEventListener('click', (e) => { e.stopPropagation(); close(); b.run(); });
                row.appendChild(el2);
            });
            body.appendChild(row);
        }
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'bizzybee-toast-x';
        x.setAttribute('aria-label', 'Close message');
        x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
        x.addEventListener('click', (e) => { e.stopPropagation(); close(); });

        el.append(icon, body, x);
        stack.appendChild(el);
        while (stack.children.length > 4) stack.firstElementChild.remove();
        requestAnimationFrame(() => el.classList.add('bizzybee-toast--visible'));
        if (navigator.vibrate && type === 'negative') { try { navigator.vibrate(40); } catch {} }

        let left = o.ms || this.duration(message, type) + (btns.length ? 3000 : 0), started = Date.now(), timer = null;
        const run = () => { started = Date.now(); timer = setTimeout(close, left); };
        const pause = () => { clearTimeout(timer); left = Math.max(1500, left - (Date.now() - started)); };
        if (!btns.length) el.addEventListener('click', close);
        el.addEventListener('mouseenter', pause);
        el.addEventListener('mouseleave', run);
        el.addEventListener('pointerdown', pause);
        // Swipe it up to dismiss, like a phone notification.
        let y0 = null;
        el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
        el.addEventListener('touchend', e => { if (y0 !== null && e.changedTouches[0].clientY - y0 < -30) close(); y0 = null; });
        run();
        return close;
    }
};
