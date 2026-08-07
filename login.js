console.log("/// AUTH TERMINAL ONLINE ///");

// --- Two front doors behind one form -------------------------------------
// This is a static site with no server, so nothing typed into login.js can
// be a REAL secret - anyone who opens dev tools can read these constants.
// That's fine for the demo credentials (they're meant to be public/shown),
// but the "personal" side is only ever a casual-visitor deterrent, not real
// security. Don't put anything here you wouldn't be okay with a determined
// person eventually finding.
//
// DEMO_CREDENTIALS: shown pre-filled in the form. Any visitor just clicks
// Enter Hive - they land in the generic starter Hive (data.json content).
//
// PERSONAL_PASSWORD_HASH: a SHA-256 hex digest, not a plaintext password -
// a plain "view source" doesn't hand someone the real passcode, though it's
// still crackable offline by anyone motivated enough. To change your
// passcode: open a browser console anywhere and run
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-new-passcode'))
//     .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')))
// then paste the result in below.
const DEMO_CREDENTIALS = {
    email: 'guest@bizzybee.hive',
    password: 'worker-bee'
};

const PERSONAL_EMAIL = 'craft@bizzybee.hive';
const PERSONAL_PASSWORD_HASH = '11ada1226bd5231a3b45a5f5132bd27f989daea4eaab2d8fee809012133f3ea7';
// (default passcode is "hivekeeper" - change it, see instructions above)

async function sha256Hex(text) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

document.addEventListener('DOMContentLoaded', async () => {
    NanoBee.render(document.querySelector('.hive-core-bg'), 'hero');

    await Vault.init();

    // Pre-fill the demo credentials right in the fields, so a visiting
    // client's whole interaction really is just clicking Enter Hive.
    document.getElementById('email').value = DEMO_CREDENTIALS.email;
    document.getElementById('password').value = DEMO_CREDENTIALS.password;

    // Already logged in on this device? Skip straight through.
    if (localStorage.getItem('bizzybee_session')) {
        goHome();
        return;
    }

    document.getElementById('login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearError();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;

        if (email === DEMO_CREDENTIALS.email && password === DEMO_CREDENTIALS.password) {
            localStorage.setItem('bizzybee_session', 'demo');
            goHome();
            return;
        }

        if (email === PERSONAL_EMAIL) {
            const hash = await sha256Hex(password);
            if (hash === PERSONAL_PASSWORD_HASH) {
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
        reader.onload = () => {
            const result = Vault.importFullState(reader.result);
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
