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
            const response = await fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });

            if (!response.ok) {
                throw new Error(`Request failed (${response.status})`);
            }

            form.hidden = true;
            sentEl.hidden = false;
        } catch (error) {
            console.error('Request Access: submit failed', error);
            errorEl.textContent = "⚠️ Couldn't send your request - check your connection and try again.";
            errorEl.hidden = false;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Request';
        }
    });
});
