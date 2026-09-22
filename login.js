console.log("/// AUTH TERMINAL ONLINE ///");

// --- Two front doors, nothing silent ----------------------------------------
// This is a static site with no server, so nothing typed into login.js can
// be a REAL secret - anyone who opens dev tools can read these constants.
// The "personal" side is only ever a casual-visitor deterrent, not real
// security. Don't put anything here you wouldn't be okay with a determined
// person eventually finding.
//
// A returning device with a valid session still goes straight to Home
// without retyping anything - but only via the visible #welcome-loading
// beat in the DOMContentLoaded handler below, never silently. See that
// handler's comment for why this isn't the same thing as the old
// auto-skip it replaced.
//
// The demo shared-credential login (guest@bizzybee.hive / worker-bee,
// pre-filled in the form so any visitor could one-click in) was RETIRED
// here - see HANDOFF.md's "UPDATE: retired demo login" entry for why. This
// form now only ever authenticates PERSONAL_EMAIL below; the other real
// front door is the explicit "☁️ Sign In with Cloud Sync" button, wired up
// in setupCloudSyncLoginButton() further down.
//
// The actual passcode hash + digest helper live in src/core/auth.js (the
// `Auth` object, loaded before this file) - factored out so
// src/features/account-info/'s own lock screen can check the SAME passcode
// without a second, easy-to-drift copy of the hash.
const PERSONAL_EMAIL = 'craft@bizzybee.hive';

function showError(message) {
    const el = document.getElementById('login-error');
    el.textContent = message;
    el.hidden = false;
}

function clearError() {
    const el = document.getElementById('login-error');
    el.hidden = true;
    el.textContent = '';
}

// This file now lives at the project ROOT (index.html IS the login page -
// see HANDOFF.md §12 "index/login swap"), so Home is one hop into
// src/features/ rather than three hops back up to a shared root.
function goHome() {
    window.location.href = './src/features/home/home.html';
}

// --- Cloud Sync invite/confirmation/recovery handoff ----------------------
// Netlify Identity invite, confirmation, and password-recovery emails link
// to this site's root by default - i.e. THIS page - with a token in the
// URL hash (#invite_token=..., #confirmation_token=..., etc). Netlify's own
// widget (loaded in index.html's <head>) is what actually knows how to
// read that token and pop open its own "set your password" modal - but
// only once `netlifyIdentity.init()` has run. Before this existed, that
// token was landing here and just sitting inert: this page's own unrelated
// passcode/session logic below would run instead (fall through to "already
// logged in" if this device had a session, or show the normal login form),
// giving zero indication anything Cloud Sync-related was even supposed to
// happen. Runs BEFORE (and, if a token is present, INSTEAD of) the normal
// login flow below - critical, since otherwise "already logged in, skip
// straight through" would navigate away and kill the identity modal before
// the user could ever see or use it.
function handleCloudSyncTokenIfPresent() {
    const hasIdentityToken = /(invite_token|confirmation_token|recovery_token|email_change_token)=/.test(window.location.hash);
    if (!hasIdentityToken || typeof netlifyIdentity === 'undefined') return false;

    // This path skips the #welcome-loading beat entirely (see the
    // DOMContentLoaded handler below) - the invite/confirm banner and the
    // widget's own modal need #login-content visible right away, not after
    // a loading delay that has nothing to do with this flow.
    document.getElementById('welcome-loading').hidden = true;
    document.getElementById('login-content').hidden = false;

    const status = document.getElementById('cloud-sync-invite-status');
    status.hidden = false;
    status.textContent = '☁️ Confirming your Cloud Sync account...';

    const finishConfirmed = () => {
        const user = netlifyIdentity.currentUser();
        if (!user) return;
        localStorage.setItem('bizzybee_cloud_owner', user.id);
        localStorage.setItem('bizzybee_session', 'identity');
        status.textContent = '✅ Cloud Sync account confirmed! Taking you to Settings...';
        netlifyIdentity.close();
        setTimeout(() => {
            window.location.href = './src/features/settings/settings.html';
        }, 1500);
    };

    netlifyIdentity.on('login', finishConfirmed);

    netlifyIdentity.on('error', (err) => {
        console.error('Netlify Identity error:', err);
        status.textContent = "⚠️ That link didn't work - it may have expired or already been used. Ask to be re-invited from the Netlify dashboard (Identity → Users) and try the fresh link.";
    });

    netlifyIdentity.init();

    // REAL BUG FOUND (live-debugged 2026-08-22, see HANDOFF.md): Identity
    // keeps its OWN persisted session (netlifyIdentity.currentUser()),
    // completely separate from our bizzybee_session flag. If this browser
    // already has a valid, confirmed session for this account - e.g. this
    // exact token was already used successfully in an earlier attempt, or
    // the account got confirmed via some other path (a recovery email,
    // etc.) - the widget just silently restores that session instead of
    // firing a fresh 'login' event, since nothing new actually happened.
    // Without this check, the banner above gets stuck on "Confirming..."
    // forever, because 'login' never fires for a session it's only
    // restoring, not establishing. Caught by directly inspecting
    // netlifyIdentity.currentUser() on a live tab that turned out to
    // already hold a fully confirmed session while the page sat there
    // looking blank/broken.
    if (netlifyIdentity.currentUser()) {
        finishConfirmed();
    }

    return true;
}

// --- Cloud Sync front-door sign-in (invited testers) -----------------------
// A second, explicit way into the app alongside PERSONAL_EMAIL above:
// opens Netlify Identity's own login modal so an
// already-invited tester can sign in with their real Cloud Sync account, on
// any ordinary return visit (not just the one-time invite/confirm/recovery
// link handleCloudSyncTokenIfPresent() handles above). Mutually exclusive
// with that function - this is only ever wired up when there's NO identity
// token in the URL hash, since the caller below returns early in that case.
// Decisions confirmed with the user before building:
//   - The personal passcode stays exactly as it was - redacted's own back door.
//     (The demo login this comment originally also promised to leave alone
//     was itself retired in a later update - see HANDOFF.md.)
//   - A brand-new tester's first sign-in here still starts from the
//     generic blueprint (same as the old demo default was) - no auto-pull
//     from the cloud. They press "Load from Cloud" in Settings themselves
//     when they want their prior progress.
//   - Tags the session as 'identity' (a new, third value alongside 'demo'
//     and 'personal') - grepped the whole repo first; nothing checks for a
//     specific session-value string except truthiness, so this can't break
//     any existing check.
function setupCloudSyncLoginButton() {
    const btn = document.getElementById('cloud-sync-login-btn');
    if (!btn) return;

    if (typeof netlifyIdentity === 'undefined') {
        // Widget script didn't load (offline, blocked, etc.) - hide rather
        // than leave a button on the page that can't do anything.
        btn.hidden = true;
        return;
    }

    netlifyIdentity.init();

    netlifyIdentity.on('login', (user) => {
        localStorage.setItem('bizzybee_cloud_owner', user.id);
        netlifyIdentity.close();
        localStorage.setItem('bizzybee_session', 'identity');
        goHome();
    });

    netlifyIdentity.on('error', (err) => {
        console.error('Netlify Identity error:', err);
        showError("⚠️ Cloud Sync sign-in didn't go through. Check your credentials and try again.");
    });

    btn.addEventListener('click', () => {
        // Same root cause as the fix in handleCloudSyncTokenIfPresent()
        // above: netlifyIdentity.currentUser() can already be populated
        // from a session this browser established earlier (a previous
        // Cloud Sync sign-in, or an invite/recovery that actually
        // succeeded even if the page never showed it). Opening the login
        // modal in that case just makes someone re-enter credentials for
        // a session that's already valid - or, worse, shows a confusing
        // fallback screen, which is exactly what was reported and
        // live-debugged on 2026-08-22 (see HANDOFF.md). If we're already
        // signed in, honor that immediately instead of prompting again.
        if (netlifyIdentity.currentUser()) {
            localStorage.setItem('bizzybee_cloud_owner', netlifyIdentity.currentUser().id);
            localStorage.setItem('bizzybee_session', 'identity');
            goHome();
            return;
        }
        netlifyIdentity.open('login');
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    NanoBee.render(document.querySelector('.hive-core-bg'), 'hero');

    const welcomeStartedAt = Date.now();
    const MIN_WELCOME_MS = 500;

    // The #welcome-loading state in index.html is shown by default, before
    // any of this has run. Checking bizzybee_session is just a localStorage
    // read - effectively instant - so without this, "returning device"
    // would resolve into Home in the same frame the loading text appears,
    // reading as a flicker rather than an actual loading step. This just
    // waits out whatever's left of MIN_WELCOME_MS so it reads as
    // deliberate. Only relevant on the no-token path below - the
    // invite/confirm path in handleCloudSyncTokenIfPresent() skips
    // #welcome-loading entirely, since that's a distinct multi-second flow
    // with its own status text.
    const settleWelcome = () => {
        const elapsed = Date.now() - welcomeStartedAt;
        return elapsed >= MIN_WELCOME_MS
            ? Promise.resolve()
            : new Promise(resolve => setTimeout(resolve, MIN_WELCOME_MS - elapsed));
    };

    try { await Vault.init(); } catch (error) { showError(error.message); }

    if (handleCloudSyncTokenIfPresent()) {
        return;
    }

    setupCloudSyncLoginButton();

    // Replaces the old SILENT "already logged in? skip straight through"
    // shortcut (retired earlier today - see HANDOFF.md's "UPDATE: retired
    // demo login" entry) with a VISIBLE one. The actual complaint "no more
    // auto login" was about was a device silently completing a sign-in
    // with zero on-screen indication anything happened - not that a
    // recognized returning device should have to fully retype credentials
    // on every single visit. So: a session that already exists still goes
    // straight to Home, but only after this page visibly shows it's doing
    // that; a device with no session gets the real #login-content form
    // instead, same as before - nothing to auto-continue there. This does
    // NOT change anything about the rest of the app: every other page
    // still just checks bizzybee_session truthy (via app.js's
    // renderGlobalUI()) and proceeds without re-prompting - this only
    // touches what happens when you land back on the root/login page.
    if (localStorage.getItem('bizzybee_session')) {
        document.getElementById('welcome-loading-text').textContent = '✅ Welcome back! Entering the Hive...';
        await settleWelcome();
        goHome();
        return;
    }

    await settleWelcome();
    document.getElementById('welcome-loading').hidden = true;
    document.getElementById('login-content').hidden = false;

    document.getElementById('login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearError();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;

        if (email === PERSONAL_EMAIL) {
            if (await Auth.checkPersonalPasscode(password)) {
                if (Vault.getBlueprintSource() === 'personal') {
                    // This device already has the real data (e.g. your own
                    // dev machine, or a phone that's already imported a save).
                    localStorage.setItem('bizzybee_session', 'personal');
                    goHome();
                } else {
                    // Right credentials, but this device is still on generic
                    // data - reveal the import step instead of going further.
                    document.getElementById('load-save-section').hidden = false;
                }
                return;
            }
        }

        showError('🐝 Access Denied. Check your credentials, Worker Bee.');
    });

    document.getElementById('load-save-btn').addEventListener('click', () => {
        const input = document.getElementById('load-save-input');
        const status = document.getElementById('load-save-status');
        const file = input.files[0];

        status.hidden = false;
        if (!file) {
            status.textContent = 'Choose a save file first.';
            return;
        }

        status.textContent = 'Loading...';
        const reader = new FileReader();
        reader.onload = async () => {
            let plainText = reader.result;

            if (CryptoLite.isEncryptedEnvelope(plainText)) {
                const password = document.getElementById('load-save-password').value;
                if (!password) {
                    status.textContent = '⚠️ This save is encrypted - enter its password above first.';
                    return;
                }
                try {
                    plainText = await CryptoLite.decrypt(plainText, password);
                } catch (error) {
                    status.textContent = '⚠️ Wrong password, or the file is corrupted.';
                    return;
                }
            }

            const result = Vault.importFullState(plainText);
            if (!result.ok) {
                status.textContent = `⚠️ ${result.error}`;
                return;
            }
            localStorage.setItem('bizzybee_session', 'personal');
            status.textContent = '📥 Save loaded - entering the Hive...';
            setTimeout(goHome, 800);
        };
        reader.onerror = () => { status.textContent = '⚠️ Could not read that file.'; };
        reader.readAsText(file);
    });
});
