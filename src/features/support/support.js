// Contact support (Oct 30 2026, Craft). Sends a Netlify Form ("support").
// Filled in for the player: app version and phone type. Optional: a
// screenshot, and (opt-in) an encrypted save copy through support.mjs,
// which only the creator can open (Terminal: supportsaves / supportsave <n>).
document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const $ = (id) => document.getElementById(id);
    const Cap = window.Capacitor;
    const isApp = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
    const ua = navigator.userAgent;
    const phone = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other';
    let appBuild = '';
    try { if (isApp) appBuild = (await Cap.Plugins.App.getInfo()).version; } catch { /* old app */ }
    // updates.js (APP_WEB_VERSION) loads a moment after the page, so fill this in again later.
    const fillAuto = () => {
        const version = `Web ${typeof APP_WEB_VERSION !== 'undefined' ? APP_WEB_VERSION : '?'}${appBuild ? ` · App ${appBuild}` : ''}`;
        const device = `${phone} · ${isApp ? 'Android app' : 'Browser'} · ${screen.width}×${screen.height}`;
        $('sp-version').value = version; $('sp-device').value = device;
        $('sp-auto').textContent = `${version}, ${device}`;
    };
    fillAuto(); setTimeout(fillAuto, 1500);

    // Prefill the email from the cloud account, if signed in.
    const signedIn = () => typeof netlifyIdentity !== 'undefined' && netlifyIdentity.currentUser && netlifyIdentity.currentUser();
    setTimeout(() => { const u = signedIn(); if (u && u.email && !$('sp-email').value) $('sp-email').value = u.email; }, 1200);
    // Topic from the link (e.g. ?topic=Lost progress)
    const want = new URLSearchParams(location.search).get('topic');
    if (want) { const r = document.querySelector(`.sp-topics input[value="${CSS.escape(want)}"]`); if (r) r.checked = true; }

    $('sp-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('sp-err'), btn = $('sp-send');
        err.hidden = true;
        const shot = $('sp-shot').files[0];
        if (shot && shot.size > 5 * 1024 * 1024) { err.textContent = 'That screenshot is over 5 MB. Try a smaller one.'; err.hidden = false; return; }
        fillAuto();
        btn.disabled = true; btn.textContent = 'Sending…';
        try {
            $('sp-save-id').value = '';
            if ($('sp-attach').checked) {
                if (typeof CloudSyncAuto === 'undefined' || !CloudSyncAuto.isReady || !CloudSyncAuto.isReady()) throw new Error('Sign in to your cloud account to attach your save, or untick it.');
                const r = await CloudSyncAuto.request('support', { action: 'attach', data: Vault.exportFullState() });
                $('sp-save-id').value = r.id;
            }
            const res = await fetch('/', { method: 'POST', body: new FormData($('sp-form')) });
            if (!res.ok) throw new Error(res.status === 404 ? 'Support is still being set up. Try again in a minute.' : "That didn't send. Check your connection and try again.");
            $('sp-form').hidden = true; $('sp-done').hidden = false;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (x) {
            err.textContent = x.message || "That didn't send. Try again."; err.hidden = false;
        } finally { btn.disabled = false; btn.textContent = 'Send to support'; }
    });
    if (typeof Waggle !== 'undefined') Waggle.setActions(typeof baseWaggleActions === 'function' ? baseWaggleActions() : []);
});
