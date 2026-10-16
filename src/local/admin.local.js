// ============================================================================
// LOCAL DEV LOGIN - shared with collaborators through GitHub (Oct 2026).
// It only works on localhost / a local network address: app.js never loads
// it on the live site, and the 🛠 panel's "local dev" check also requires a
// local address. On the live site, dev access is by owner email instead
// (OWNER_HASHES in src/core/dev-tools/dev-tools.js).
//
//   Login:  Hacker / password  (opens the plain on-device account)
//   Then:   the 🛠 panel (src/core/dev-tools/dev-tools.js) on every page.
//
// The panel itself moved to src/core/dev-tools/ on 2026-10-09 so it can also
// run on the live site for the owner account (on a separate test save).
// Only this login stays local.
// ============================================================================
(function () {
    const DEV_KEY = 'bizzybee_dev';
    const LOGIN = { email: 'hacker', password: 'password' };
    const nested = location.pathname.includes('/features/') || location.pathname.includes('/plugins/');
    if (nested) return;

    // Runs in the capture phase so it answers before login.js's own handler.
    document.addEventListener('submit', (event) => {
        if (!event.target || event.target.id !== 'login-form') return;
        const email = (document.getElementById('email').value || '').trim().toLowerCase();
        const password = document.getElementById('password').value || '';
        if (email !== LOGIN.email || password !== LOGIN.password) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        localStorage.setItem('bizzybee_session', 'local');
        localStorage.setItem(DEV_KEY, '1');
        location.href = './src/features/home/home.html';
    }, true);
})();
