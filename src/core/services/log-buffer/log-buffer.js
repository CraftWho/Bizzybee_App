// Recent error log (Nov 2026, Craft). Keeps the last few errors in this tab's session
// storage, so "Report a problem" can attach them if the person allows it. Nothing is
// sent anywhere from here. Messages are short, and the server blanks keys and tokens too.
(function () {
    const KEY = 'bizzybee_errlog', MAX = 40;
    const push = (kind, msg) => {
        try {
            const list = JSON.parse(sessionStorage.getItem(KEY) || '[]');
            const page = (location.pathname.split('/').pop() || 'index').replace('.html', '');
            list.push(`${new Date().toISOString().slice(11, 19)} ${page} ${kind}: ${String(msg).replace(/\s+/g, ' ').slice(0, 300)}`);
            sessionStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
        } catch (e) { /* storage off: no log, nothing breaks */ }
    };
    window.addEventListener('error', (e) => push('error', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno || 0})`));
    window.addEventListener('unhandledrejection', (e) => push('promise', e.reason && e.reason.message ? e.reason.message : e.reason));
    window.BBLog = { push, get() { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { return []; } } };
})();
