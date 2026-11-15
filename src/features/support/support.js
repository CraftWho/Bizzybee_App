// Contact support (Nov 1 2026, Craft, approved demo "Support & Daily Bonus").
// Sends a Netlify Form named "support"; replies go out by email from the
// support inbox (the "email" field is the Reply-To). Sends the app version,
// where you came from and your bee name. Never your tasks, notes or save.
document.addEventListener('DOMContentLoaded', async () => {
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    try { if (typeof Vault !== 'undefined') await Vault.init(); } catch { /* the form still works */ }

    const isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    let version = '';
    try { version = (await (await fetch('../../../version.json', { cache: 'no-store' })).json()).version || ''; } catch { /* local copy */ }
    const from = (() => { try { const r = new URL(document.referrer); return r.origin === location.origin ? r.pathname.split('/').pop().replace('.html', '') : ''; } catch { return ''; } })();
    let bee = '';
    try { const u = Vault.getUser && Vault.getUser(); bee = (u && u.name) || ''; } catch { /* no save */ }
    $('sp-app').value = `${version || 'unknown version'} · ${isApp ? 'Android app' : 'Website'}`;
    $('sp-page').value = from || 'unknown';
    $('sp-bee').value = bee;
    $('sp-sends').innerHTML = `<div><b>Sent with it, so we can help:</b></div><div>· App ${esc($('sp-app').value)}</div><div>· The page you came from (${esc($('sp-page').value)})</div>${bee ? `<div>· Your bee name (${esc(bee)})</div>` : ''}<div>Never sent: your tasks, notes or save.</div>`;
    try { const m = (Vault.state && Vault.state.supportEmail) || localStorage.getItem('bb_support_email'); if (m) $('sp-mail').value = m; } catch { /* fine */ }

    document.querySelectorAll('.sp-chip').forEach(c => c.addEventListener('click', () => {
        document.querySelectorAll('.sp-chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
        $('sp-topic').value = c.dataset.t;
    }));

    const form = $('sp-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('sp-err');
        err.hidden = true;
        const msg = $('sp-msg').value.trim(), mail = $('sp-mail').value.trim();
        if (!msg) { err.textContent = 'Tell us what happened first.'; err.hidden = false; $('sp-msg').focus(); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { err.textContent = 'Add your email so we can reply.'; err.hidden = false; $('sp-mail').focus(); return; }
        const go = $('sp-go');
        go.disabled = true; go.textContent = 'Sending…';
        try {
            const body = new URLSearchParams(new FormData(form)).toString();
            // The live site takes the form. From the app's own copy (APK), post to the site.
            const site = window.BB_SITE ? window.BB_SITE + '/' : '/';
            const opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body };
            if (site !== '/') opts.mode = 'no-cors';
            const r = await fetch(site, opts);
            if (site === '/' && !r.ok) throw new Error('http-' + r.status);
            // Nov 2026 (Craft): a copy goes to the developer's Discord (netlify/functions/report.mjs).
            // Best effort: the form above is the one that must work.
            try {
                const kind = $('sp-topic').value.startsWith('Something') ? 'bug' : 'other';
                const logs = $('sp-logs') && $('sp-logs').checked && window.BBLog ? window.BBLog.get() : [];
                await fetch((window.BB_SITE || '') + '/.netlify/functions/report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind, message: `${$('sp-topic').value}: ${msg}`, page: $('sp-page').value, app: $('sp-app').value, logs }), signal: AbortSignal.timeout(8000) });
            } catch { /* the form already went out */ }
            try { localStorage.setItem('bb_support_email', mail); } catch { /* fine */ }
            form.hidden = true; form.style.display = 'none';
            $('sp-sent-mail').textContent = mail;
            $('sp-sent').hidden = false;
        } catch (ex) {
            err.textContent = ex.message === 'http-404' ? "Couldn't send. This page may still be updating; try again in a minute." : "Couldn't send. Check your connection and try again.";
            err.hidden = false;
        } finally { go.disabled = false; go.textContent = 'Send to support'; }
    });
    $('sp-again').addEventListener('click', () => { form.reset(); form.hidden = false; form.style.display = ''; $('sp-sent').hidden = true; $('sp-topic').value = "Something's broken"; document.querySelectorAll('.sp-chip').forEach((x, i) => x.setAttribute('aria-pressed', String(i === 0))); });
});
