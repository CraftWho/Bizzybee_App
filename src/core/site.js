// Nov 1 2026 (Craft): where the live site is, for pages that run before
// boot.js (the login page). Same rule as boot.js: in the Android app's own
// copy (https://localhost, no port) sign-in, cloud and forms go to the site.
(function () {
    const appCopy = location.protocol === 'https:' && location.hostname === 'localhost' && !location.port;
    window.BB_APP_COPY = appCopy;
    // Nov 2 2026 (Craft): true only in "BizzyBee Dev", your own APK (tools/make-app-copy.mjs
    // flips it when BB_PERSONAL=1). Owner tools on, no updates from the live site.
    window.BB_PERSONAL = false;
    window.BB_SITE = appCopy ? 'https://bizzybeee.netlify.app' : '';
    if (appCopy) { try { localStorage.setItem('netlifySiteURL', window.BB_SITE); } catch (e) { /* storage off */ } }
})();
