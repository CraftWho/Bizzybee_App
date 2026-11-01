// Nov 1 2026 (Craft): where the live site is, for pages that run before
// boot.js (the login page). Same rule as boot.js: in the Android app's own
// copy (https://localhost, no port) sign-in, cloud and forms go to the site.
(function () {
    const appCopy = location.protocol === 'https:' && location.hostname === 'localhost' && !location.port;
    window.BB_APP_COPY = appCopy;
    window.BB_SITE = appCopy ? 'https://bizzybeee.netlify.app' : '';
    if (appCopy) { try { localStorage.setItem('netlifySiteURL', window.BB_SITE); } catch (e) { /* storage off */ } }
})();
