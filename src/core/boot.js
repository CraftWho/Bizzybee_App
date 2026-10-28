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
    const STYLES = ['global.css', 'ui/hive-mind/hive-mind.css', 'ui/hive-mind/nano-bee.css', 'ui/toast/toast.css', 'ui/llm-engine/llm-engine.css'];
    const before = ['db.js', 'plugins.js', 'services/notify/notify.js'];
    const after = ['app.js', 'ui/hive-mind/nano-bee.js', 'ui/hive-mind/hive-mind.js', 'ui/toast/toast.js', 'services/reminders/reminders.js', 'ui/llm-engine/llm-engine.js'];
    const extra = (me.dataset.with || '').split(/\s+/).filter(Boolean);
    if (me.dataset.load === 'styles') {
        document.write(STYLES.map(f => `<link rel="stylesheet" href="${core}${f}">`).join(''));
    } else {
        document.write([...before, ...extra, ...after].map(f => `<script src="${core}${f}"><\/script>`).join(''));
    }
})();
