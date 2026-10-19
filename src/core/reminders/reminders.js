console.log("/// REMINDERS ENGINE ONLINE ///");

// Sitewide daily-reminder checker - loaded on every page (see the
// reminders.js <script> tag next to toast.js) so a reminder can fire no
// matter which page happens to be open, not just Dailies itself. This is
// real browser Notification delivery, but it only works while some tab of
// the app is open - there's no service worker registered here, so it
// can't wake up a closed browser or a machine that's asleep. That's a
// known, deliberate limitation (see create-daily.js's reminder-add flow
// for where this gets explained to the user), not a bug.
const Reminders = {
    CHECK_INTERVAL_MS: 30000,
    _timer: null,

    // Called from create-daily.js the moment the user adds their first
    // reminder time - lazy, only when a reminder is actually being set,
    // never on a bare page load, so nobody gets prompted before they've
    // asked for anything.
    requestPermissionIfNeeded() {
        if (!('Notification' in window)) {
            Toast.show('This browser doesn\'t support reminder notifications.', 'negative');
            return;
        }
        if (Notification.permission === 'granted') {
            if (localStorage.getItem('bizzybee_push_on') !== '1' && !sessionStorage.getItem('bizzybee_push_hint')) {
                sessionStorage.setItem('bizzybee_push_hint', '1');
                Toast.show('Tip: turn on Phone Reminders in Settings to get reminders while the app is closed.', 'positive');
            }
            return;
        }
        if (Notification.permission === 'denied') {
            Toast.show('Notifications are blocked - enable them in your browser\'s site settings for reminders to fire.', 'negative');
            return;
        }
        Notification.requestPermission().then(permission => {
            Toast.show(
                permission === 'granted' ? '🔔 Reminders enabled!' : 'Reminders need notification permission to actually fire.',
                permission === 'granted' ? 'positive' : 'negative'
            );
        });
    },

    // Fired reminders are tracked per-day in localStorage (not just an
    // in-memory Set) so a page reload mid-day - or the checker running on
    // a totally different page than the one that already fired it -
    // doesn't cause the same reminder to fire twice.
    _firedStorageKey(dateStr) {
        return `bizzybee_fired_reminders_${dateStr}`;
    },

    _hasFired(dateStr, key) {
        const raw = localStorage.getItem(this._firedStorageKey(dateStr));
        const fired = raw ? JSON.parse(raw) : [];
        return fired.includes(key);
    },

    _markFired(dateStr, key) {
        const raw = localStorage.getItem(this._firedStorageKey(dateStr));
        const fired = raw ? JSON.parse(raw) : [];
        fired.push(key);
        localStorage.setItem(this._firedStorageKey(dateStr), JSON.stringify(fired));
    },

    _currentHM() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    },

    // Pulls from Vault.getDueReminderItems() - a generic { id, label,
    // reminders } feed (see db.js) - rather than knowing "dailies" exist.
    // This module only ever deals in that generic shape, so it stays
    // reusable for whatever else Vault folds into that feed later.
    check() {
        if (typeof Vault === 'undefined' || !Vault.state) return;
        // Phone reminders (push.js) deliver these instead - no doubles.
        if (localStorage.getItem('bizzybee_push_on') === '1') return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const today = todayISO();
        const nowHM = this._currentHM();

        Vault.getDueReminderItems().forEach(item => {
            (item.reminders || []).forEach(reminder => {
                if (reminder.time !== nowHM) return;
                const key = `${item.id}-${reminder.id}`;
                if (this._hasFired(today, key)) return;

                new Notification('🐝 Bizzybee Reminder', {
                    body: item.label,
                    tag: key,
                    icon: '/src/assets/icons/icon-192x192.png',
                    badge: '/src/assets/icons/badge-96x96.png'
                });
                this._markFired(today, key);
            });
        });
    },

    start() {
        if (this._timer) return;
        this.check();
        this._timer = setInterval(() => this.check(), this.CHECK_INTERVAL_MS);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Reminders.start();
});
