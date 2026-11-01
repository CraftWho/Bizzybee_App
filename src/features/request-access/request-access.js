console.log("/// REQUEST ACCESS PROTOCOLS INITIALIZED ///");

// This page is deliberately lightweight - no Vault/db.js, no app.js shell,
// no Netlify Identity widget. It's a pre-account public page (anyone can
// land here without ever having logged in), and the form itself is a real,
// plain static Netlify Form - Netlify detects and stores/emails submissions
// entirely on its own at deploy time (see HANDOFF.md's "Request Access"
// entry). This script's only job is a nicer in-page experience on top of
// that: submit via fetch instead of a full page navigation, so a visitor
// sees a "Thanks!" state right here instead of bouncing to a separate
// Netlify-hosted success page.
//
// IMPORTANT: this fetch only succeeds once the site is actually deployed
// on Netlify with form detection having run against this exact HTML (it's
// a build/deploy-time scan, not a runtime API) - same "can't be exercised
// until deployed" situation as Cloud Sync elsewhere in this app. Locally
// or on a host that isn't Netlify, submitting will fail and show the error
// message below - that's expected, not a bug in this code.
document.addEventListener('DOMContentLoaded', () => {
    if (typeof NanoBee !== 'undefined') {
        NanoBee.render(document.querySelector('.hive-core-bg'), 'hero');
    }

    const form = document.getElementById('request-access-form');
    const errorEl = document.getElementById('request-access-error');
    const sentEl = document.getElementById('request-access-sent');
    const submitBtn = document.getElementById('request-access-submit-btn');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorEl.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            // URLSearchParams(new FormData(form)) picks up every named
            // field automatically - the hidden form-name input, the
            // honeypot bot-field, and name/email/reason - so this stays
            // correct if fields are ever added without touching this file.
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
                // A non-network failure - the request reached Netlify but
                // got rejected (404 most likely means form detection
                // hasn't run yet for this deploy, or ran against an older
                // HTML that didn't have this form - see HANDOFF.md's
                // Request Access entry). Worth a distinct message from the
                // generic connection error below, since the fix is
                // different (wait for/trigger a fresh deploy, not "check
                // your wifi").
                throw new Error(`http-${response.status}`);
            }

            // Belt-and-suspenders: the `hidden` attribute alone doesn't
            // reliably hide this element - login.css's `.auth-form {
            // display: flex }` (an author-stylesheet rule) overrides the
            // browser's own default `[hidden] { display: none }` (a
            // lower-precedence user-agent rule), so the form was staying
            // visible, stacked above the "Thanks!" message, even though
            // `hidden` was set correctly. Found via a live test while
            // debugging a "couldn't send" report - that specific test
            // actually got a 200 back, so the send itself worked; this
            // display bug was a separate, real issue found alongside it.
            // An inline style always wins over an external stylesheet, so
            // this closes it for good regardless of what CSS says.
            form.hidden = true;
            form.style.display = 'none';
            sentEl.hidden = false;
        } catch (error) {
            console.error('Request Access: submit failed', error);
            errorEl.textContent = error.message === 'http-404'
                ? "⚠️ Couldn't send your request - this page may still be deploying. Wait a minute and try again."
                : "⚠️ Couldn't send your request - check your connection and try again.";
            errorEl.hidden = false;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Request';
        }
    });
});
