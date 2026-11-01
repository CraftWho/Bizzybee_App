console.log("/// SUGGESTIONS PROTOCOLS INITIALIZED ///");

// Same lightweight, no-Vault/no-app.js pre-account pattern as
// request-access.js - see that file's header comment and HANDOFF.md's
// Request Access entry for the full rationale (real static Netlify Form,
// detected/handled entirely by Netlify at deploy time, no backend code
// here). This is a second, separate form (name="suggestions") landing as
// its own list in the Netlify Forms dashboard, distinct from
// "request-access".
//
// IMPORTANT: exactly like Request Access, this only actually sends once
// deployed on Netlify - locally (file://) or on any non-Netlify host, the
// fetch below will fail and show the error message, which is expected, not
// a bug. See HANDOFF.md's Request Access follow-up entry for why the error
// message here is split by failure type.
document.addEventListener('DOMContentLoaded', () => {
    if (typeof NanoBee !== 'undefined') {
        NanoBee.render(document.querySelector('.hive-core-bg'), 'hero');
    }

    const form = document.getElementById('suggestions-form');
    const errorEl = document.getElementById('suggestions-error');
    const sentEl = document.getElementById('suggestions-sent');
    const submitBtn = document.getElementById('suggestions-submit-btn');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorEl.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            const body = new URLSearchParams(new FormData(form)).toString();
            // Nov 1 2026 (Craft): from the Android app's own copy, post to the site.
            const site = window.BB_SITE || '';
            const response = await fetch(site + '/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                ...(site ? { mode: 'no-cors' } : {}),
            });

            if (!site && !response.ok) {
                throw new Error('http-' + response.status);
            }

            // form.style.display, not just form.hidden - login.css's
            // .auth-form{display:flex} (an author-stylesheet rule) beats
            // the browser's own default [hidden]{display:none} rule, so
            // hidden alone doesn't reliably hide this element. Found and
            // fixed on Request Access's identical form first - see
            // HANDOFF.md.
            form.hidden = true;
            form.style.display = 'none';
            sentEl.hidden = false;
        } catch (error) {
            console.error('Suggestions: submit failed', error);
            errorEl.textContent = error.message === 'http-404'
                ? "⚠️ Couldn't send - this page may still be deploying. Wait a minute and try again."
                : "⚠️ Couldn't send - check your connection and try again.";
            errorEl.hidden = false;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Feedback';
        }
    });
});
