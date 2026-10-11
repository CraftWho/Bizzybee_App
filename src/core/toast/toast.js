console.log("/// TOAST MODULE ONLINE ///");

// Generic, quest-agnostic notification bubble - anything can call
// Toast.show('some message', 'positive' | 'negative') for a brief,
// self-dismissing pop-up. Stacks vertically if more than one is active
// at once (e.g. an XP award followed immediately by a level-up).
const Toast = {
    activeCount: 0,

    show(message, type = 'positive') {
        const el = document.createElement('div');
        el.className = `bizzybee-toast bizzybee-toast--${type}`;
        el.textContent = message;
        el.style.bottom = `${30 + this.activeCount * 60}px`;

        document.body.appendChild(el);
        this.activeCount++;

        requestAnimationFrame(() => el.classList.add('bizzybee-toast--visible'));

        setTimeout(() => {
            el.classList.remove('bizzybee-toast--visible');
            setTimeout(() => {
                el.remove();
                this.activeCount--;
            }, 300);
        }, 1800);
    }
};
