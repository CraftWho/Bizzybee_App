// The launch screen (2026-10-09, Craft). The gold bee pulses on black
// while the app loads, for at least a moment so it can be seen. Then
// login.js decides what's next: a returning player is sent straight on
// (the first app page plays the opening), anyone else gets the login card
// - and that's when the crimson line draws out from the middle and the
// screen opens like a scroll (AppOpen in src/core/app.js).
(function () {
    const welcome = document.getElementById('welcome-loading');
    if (!welcome || typeof AppOpen === 'undefined') return;
    const MIN_LOGO_MS = 1800;
    const started = performance.now();
    // The logo lives on the cover too, so it stays up after login.js hides
    // #welcome-loading.
    const mark = welcome.cloneNode(true);
    mark.removeAttribute('id');
    mark.removeAttribute('hidden');
    mark.querySelectorAll('[id]:not(linearGradient)').forEach(n => n.removeAttribute('id'));
    mark.className = 'launch-cover';
    AppOpen.cover();
    AppOpen.setCenter(mark.outerHTML.replace(/ln-gold/g, 'ln-gold-cover'));
    let opened = false;
    const reveal = () => {
        if (opened) return; opened = true;
        setTimeout(() => AppOpen.open(), Math.max(0, MIN_LOGO_MS - (performance.now() - started)));
    };
    // Keep the cover's status line in step ("Welcome back...").
    const status = document.getElementById('welcome-loading-text');
    if (status) new MutationObserver(() => {
        const c = document.querySelector('.ao-center .welcome-loading-text');
        if (c) c.textContent = status.textContent;
    }).observe(status, { childList: true, characterData: true, subtree: true });
    if (welcome.hidden) { reveal(); return; }
    new MutationObserver((list, obs) => {
        if (welcome.hidden) { obs.disconnect(); reveal(); }
    }).observe(welcome, { attributes: true, attributeFilter: ['hidden'] });
    // Going straight on to the app: this visit's opening plays there.
    try { sessionStorage.removeItem('bizzybee_opened'); } catch (e) { /* storage off */ }
})();
