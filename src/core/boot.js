// boot.js - loads the shared core files every app page needs, in order.
// (Oct 2026 cleanup.) A page used to repeat ~15 identical tags; now it has:
//
//   <head>  <script src="../../core/boot.js" data-load="styles"></script>
//   <body>  <script src="../../core/boot.js"></script>      (before its own scripts)
//
// data-with="crypto-lite.js login/auth.js" adds extra core files (paths from
// src/core/) right before app.js, for pages that need them loaded that early.
// document.write keeps the files in order and blocking, exactly like plain
// <script> tags, with no build step.
(function () {
    const me = document.currentScript;
    const core = me.src.replace(/boot\.js(?:\?.*)?$/, '');
    const STYLES = ['global.css', 'ui/themes/themes.css', 'ui/hive-mind/hive-mind.css', 'ui/hive-mind/nano-bee.css', 'ui/toast/toast.css', 'ui/llm-engine/llm-engine.css'];
    const before = ['db.js', 'plugins.js', 'services/notify/notify.js'];
    const after = ['app.js', 'ui/themes/themes.js', 'services/social/social.js', 'ui/skill-merge/skill-merge.js', 'ui/hive-mind/nano-bee.js', 'ui/hive-mind/hive-mind.js', 'ui/toast/toast.js', 'services/reminders/reminders.js', 'ui/llm-engine/llm-engine.js'];
    const extra = (me.dataset.with || '').split(/\s+/).filter(Boolean);
    // Themes (Oct 28 2026): set the theme before anything paints, so there's
    // no flash. 'auto' = BizzyBee, and Halloween on Oct 31 (your local day).
    if (me.dataset.load === 'styles') {
        let pick = 'auto';
        try { pick = localStorage.getItem('bizzybee_theme') || 'auto'; } catch (e) { /* storage off */ }
        let devDay = null;
        try { devDay = localStorage.getItem('bizzybee_dev_day'); } catch (e) { /* storage off */ }
        const d = devDay ? new Date(devDay + 'T12:00:00') : new Date();
        const auto = (d.getMonth() === 9 && d.getDate() === 31) ? 'halloween' : 'bee';
        const skin = pick === 'auto' ? auto : pick;
        if (skin && skin !== 'bee') document.documentElement.dataset.skin = skin;
    }
    if (me.dataset.load === 'styles') {
        document.write(STYLES.map(f => `<link rel="stylesheet" href="${core}${f}">`).join(''));
    } else {
        document.write([...before, ...extra, ...after].map(f => `<script src="${core}${f}"><\/script>`).join(''));
    }
})();
