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
// The personal passcode login (craft@bizzybee.hive) was removed on
// 2026-10-08. Its jobs (load a save file / data.personal.json) moved to the
// local dev tools in src/local/admin.local.js, which is gitignored and only
// loads on localhost - so this form only ever opens anything on Craft's own
// computer. Everyone else signs in with Cloud Sync.

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

// --- Bizzybee sign-in (Oct 2026) -------------------------------------------
// Our own sign-in screen instead of Netlify's white pop-up. It talks to the
// same free Netlify Identity service through the widget's built-in GoTrue
// client (netlifyIdentity.gotrue), so sessions, Cloud Sync and every other
// page work exactly as before. Invite links get a "set your password" panel
// and then a short welcome before the egg. Password reset links go to
// reset-password.html (src/core/login/recovery-redirect.js).
const AUTH_PANELS = ['auth-signin', 'auth-invite', 'auth-forgot', 'auth-welcome'];
let authToken = null;   // invite/confirm token, kept in memory only

function showPanel(id) {
    AUTH_PANELS.forEach(p => { document.getElementById(p).hidden = p !== id; });
    const first = document.querySelector(`#${id} input, #${id} button`);
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 50);
}

function authStatus(text) {
    const el = document.getElementById('cloud-sync-invite-status');
    el.textContent = text || '';
    el.hidden = !text;
}

function setFormError(id, message) {
    const el = document.getElementById(id);
    el.textContent = message || '';
    el.hidden = !message;
}

// The GoTrue client lives inside the Identity widget. Clear any token from
// the address bar first so the widget never opens its own pop-up.
function identityClient() {
    if (typeof netlifyIdentity === 'undefined') return null;
    try { netlifyIdentity.init(); } catch { /* already started */ }
    return netlifyIdentity.gotrue || null;
}

// Turns GoTrue's error into a short, readable sentence.
function friendlyAuthError(error, fallback) {
    const raw = String((error && (error.json && (error.json.error_description || error.json.msg))) || (error && error.message) || '');
    if (/invalid|no user|password/i.test(raw)) return '🐝 That email and password don\'t match. Try again.';
    if (/not confirmed/i.test(raw)) return 'Confirm your email first - check your inbox for the link.';
    if (/expired|not found|invalid token|already/i.test(raw)) return 'This link has expired or was already used. Ask for a new invite.';
    if (/fetch|network|failed/i.test(raw)) return 'Can\'t reach the server. Check your connection and try again.';
    return fallback + (raw ? ` (${raw})` : '');
}

// Nov 2 2026 (Craft): a new device (or the BizzyBee Dev app, which has its
// own storage) has no save yet. Load the cloud save HERE, before Home, so
// the egg never shows for an account that already has a hive. Returns
// 'have' (already on this device), 'loaded', 'none' (new account) or
// 'error' (couldn't reach the cloud: don't open the app on a blank save).
async function pullCloudSave(user) {
    if (typeof Vault === 'undefined' || Vault.devTest || Vault.pcLocal) return 'have';
    const key = 'bizzybee_user_data:' + user.id;
    if (localStorage.getItem(key)) return 'have';
    try {
        const token = await user.jwt();
        const response = await fetch(((window.BB_SITE) || '') + '/.netlify/functions/load-state', {
            method: 'GET', cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(20000)
        });
        const result = await response.json();
        if (!response.ok || !result.ok) return 'error';
        if (!result.data) return 'none';
        const before = Vault.storageKey;
        Vault.storageKey = key;
        const imported = Vault.importFullState(result.data, { fromCloud: true, backup: false });
        if (!imported.ok) { Vault.storageKey = before; return 'error'; }
        localStorage.setItem(key + ':revision', JSON.stringify(result.revision ?? null));
        return 'loaded';
    } catch (error) {
        console.warn('Cloud save load failed', error && error.message);
        return 'error';
    }
}
const CLOUD_LOAD_ERROR = "🐝 Couldn't load your hive from the cloud. Check your connection and try again.";

function finishSignedIn(user, { welcome = false } = {}) {
    localStorage.setItem('bizzybee_cloud_owner', user.id);
    localStorage.setItem('bizzybee_session', 'identity');
    if (!welcome) { goHome(); return; }
    document.getElementById('auth-subtitle').hidden = true;
    authStatus('');
    document.getElementById('welcome-email').textContent = `Signed in as ${user.email}.`;
    showPanel('auth-welcome');
}

// Handles #invite_token / #confirmation_token links. Returns true if one
// was found (the normal "returning device" path is then skipped).
function handleAuthTokenIfPresent() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const invite = params.get('invite_token');
    const confirmToken = params.get('confirmation_token');
    if (!invite && !confirmToken) return false;
    authToken = invite || confirmToken;
    history.replaceState(null, '', location.pathname + location.search);

    document.getElementById('welcome-loading').hidden = true;
    document.getElementById('login-content').hidden = false;
    const gotrue = identityClient();
    if (!gotrue) { authStatus('⚠️ Sign-in is unavailable right now. Check your connection and reload this link.'); showPanel('auth-signin'); return true; }

    if (invite) {
        document.getElementById('auth-subtitle').textContent = 'Finish your account';
        showPanel('auth-invite');
        return true;
    }
    authStatus('☁️ Confirming your email…');
    gotrue.confirm(authToken, true)
        .then(user => finishSignedIn(user, { welcome: true }))
        .catch(error => { authStatus(friendlyAuthError(error, 'Could not confirm your email.')); showPanel('auth-signin'); });
    return true;
}

function setupAuthForms() {
    document.querySelectorAll('.pw-eye').forEach(btn => btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.for);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }));
    document.querySelectorAll('[data-show]').forEach(btn => btn.addEventListener('click', () => {
        if (btn.dataset.show === 'auth-forgot') document.getElementById('forgot-email').value = document.getElementById('email').value.trim();
        authStatus('');
        showPanel(btn.dataset.show);
    }));

    // Sign in. (On this computer, PC LOCAL skips the login entirely.)
    document.getElementById('login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearError();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        if (!email || !password) { showError('Enter your email and password.'); return; }
        const gotrue = identityClient();
        if (!gotrue) { showError('Sign-in is unavailable right now. Check your connection.'); return; }
        const btn = document.getElementById('auth-submit-btn');
        btn.disabled = true; btn.textContent = 'Entering…';
        let user;
        try { user = await gotrue.login(email, password, true); }
        catch (error) { showError(friendlyAuthError(error, 'Sign-in didn\'t go through.')); btn.disabled = false; btn.textContent = 'Enter the Hive'; return; }
        // Nov 2 2026 (Craft): your hive first, then Home. Never the egg on a blank save.
        btn.textContent = 'Loading your hive…';
        const got = await pullCloudSave(user);
        if (got === 'error') { showError(CLOUD_LOAD_ERROR); try { await user.logout(); } catch { /* fine */ } }
        else finishSignedIn(user);
        btn.disabled = false; btn.textContent = 'Enter the Hive';
    });

    // Invite: set a password, then the welcome card.
    document.getElementById('invite-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setFormError('invite-error', '');
        const pw = document.getElementById('invite-password').value;
        if (pw.length < 12) { setFormError('invite-error', 'Use at least 12 characters.'); return; }
        if (pw !== document.getElementById('invite-password2').value) { setFormError('invite-error', 'The two passwords don\'t match.'); return; }
        const btn = document.getElementById('invite-submit-btn');
        btn.disabled = true; btn.textContent = 'Creating…';
        try { finishSignedIn(await identityClient().acceptInvite(authToken, pw, true), { welcome: true }); }
        catch (error) { setFormError('invite-error', friendlyAuthError(error, 'Could not finish your account.')); }
        finally { btn.disabled = false; btn.textContent = 'Create my account'; }
    });

    // Forgot password: always the same answer, so it never reveals who has an account.
    document.getElementById('forgot-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setFormError('forgot-error', '');
        const email = document.getElementById('forgot-email').value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) { setFormError('forgot-error', 'Enter the email you signed up with.'); return; }
        const btn = document.getElementById('forgot-submit-btn');
        btn.disabled = true;
        try {
            const gotrue = identityClient();
            if (gotrue) await gotrue.requestPasswordRecovery(email);
            else if (typeof AccountRecovery !== 'undefined') await AccountRecovery.send(email);
        } catch { /* same message either way */ }
        btn.disabled = false;
        authStatus('📬 If that account exists, a reset link is on its way. Check spam too.');
        showPanel('auth-signin');
    });

    document.getElementById('welcome-go-btn').addEventListener('click', goHome);
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

    setupAuthForms();
    if (handleAuthTokenIfPresent()) {
        return;
    }

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
        // Nov 2 2026 (Craft): signed in but this device has no save yet: load it first.
        const owner = localStorage.getItem('bizzybee_cloud_owner');
        if (localStorage.getItem('bizzybee_session') === 'identity' && owner && !localStorage.getItem('bizzybee_user_data:' + owner)) {
            const gotrue = identityClient();
            const user = gotrue && gotrue.currentUser();
            const got = user ? await pullCloudSave(user) : 'error';
            if (got === 'error') {
                await settleWelcome();
                document.getElementById('welcome-loading').hidden = true;
                document.getElementById('login-content').hidden = false;
                showError(CLOUD_LOAD_ERROR);
                return;
            }
        }
        await settleWelcome();
        goHome();
        return;
    }

    await settleWelcome();
    document.getElementById('welcome-loading').hidden = true;
    document.getElementById('login-content').hidden = false;

    identityClient();   // restore any saved cloud session quietly
});
