console.log("/// ACCOUNT SECURITY PROTOCOLS INITIALIZED ///");

// Same digits-only-as-you-type helper as account-info.js - duplicated
// rather than shared, same tradeoff noted in this app's other small
// page-local helpers (see account-info.js's own copy of this comment).
// maxLen defaults to 6 (the Account Info PIN) - App Lock's fields below
// pass 4 explicitly, so this stays a single shared helper rather than a
// second near-identical copy just for the different digit count.
function sanitizePinInput(input, maxLen = 6) {
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, maxLen);
    });
}

function isValidPin(pin) {
    return /^\d{6}$/.test(pin);
}

function isValidAppLockPin(pin) {
    return /^\d{4}$/.test(pin);
}

function showError(elId, message) {
    const el = document.getElementById(elId);
    el.textContent = message;
    el.hidden = false;
}

function refreshPinStatus() {
    const hasPin = Vault.hasAccountPin();
    document.getElementById('pin-status-text').textContent = hasPin ? '✅ Set' : '⚠️ Not set';
    document.getElementById('pin-create-section').hidden = hasPin;
    document.getElementById('pin-change-section').hidden = !hasPin;
}

async function attemptCreatePin() {
    const errorEl = 'pin-create-error';
    document.getElementById(errorEl).hidden = true;

    const pin = document.getElementById('create-pin-new').value;
    const confirmPin = document.getElementById('create-pin-confirm').value;

    if (!isValidPin(pin)) {
        showError(errorEl, 'PIN must be exactly 6 digits.');
        return;
    }
    if (pin !== confirmPin) {
        showError(errorEl, "PINs don't match.");
        return;
    }

    await Vault.setAccountPin(pin);
    document.getElementById('create-pin-new').value = '';
    document.getElementById('create-pin-confirm').value = '';
    refreshPinStatus();
    Toast.show('🔢 PIN created.', 'positive');
}

// The PIN doubles as the encryption key for state.personalInfoEncrypted
// (see db.js §7c/§7d) - changing it isn't just swapping a hash, any
// already-saved personal info has to be decrypted with the OLD PIN and
// re-encrypted under the NEW one, or it becomes permanently unreadable.
// This is the one place in the app that has to get that sequencing right.
async function attemptChangePin() {
    const errorEl = 'pin-change-error';
    document.getElementById(errorEl).hidden = true;

    const currentPin = document.getElementById('change-pin-current').value;
    const newPin = document.getElementById('change-pin-new').value;
    const confirmPin = document.getElementById('change-pin-confirm').value;

    if (!isValidPin(currentPin)) {
        showError(errorEl, 'Enter your current 6-digit PIN.');
        return;
    }
    if (!isValidPin(newPin)) {
        showError(errorEl, 'New PIN must be exactly 6 digits.');
        return;
    }
    if (newPin !== confirmPin) {
        showError(errorEl, "New PINs don't match.");
        return;
    }
    if (newPin === currentPin) {
        showError(errorEl, 'New PIN must be different from your current one.');
        return;
    }

    const correct = await Vault.verifyAccountPin(currentPin);
    if (!correct) {
        showError(errorEl, '🐝 Access Denied. Current PIN is incorrect.');
        return;
    }

    const hadInfo = Vault.hasPersonalInfo();
    let existingInfo = null;
    if (hadInfo) {
        try {
            existingInfo = await Vault.getPersonalInfo(currentPin);
        } catch (error) {
            showError(errorEl, '⚠️ Could not decrypt existing data with the current PIN - PIN not changed.');
            return;
        }
    }

    await Vault.setAccountPin(newPin);
    if (hadInfo) {
        await Vault.setPersonalInfo(existingInfo, newPin);
    }

    document.getElementById('change-pin-current').value = '';
    document.getElementById('change-pin-new').value = '';
    document.getElementById('change-pin-confirm').value = '';
    Toast.show('🔢 PIN changed.', 'positive');
}

// --- App Lock ------------------------------------------------------------
// Completely separate from the Account Info PIN above - see app.js's
// AppLock object for where this is actually enforced (the full-app lock
// overlay) and why it's stored outside Vault entirely (device-only, never
// synced). This page is just where it gets created/changed/removed; AppLock
// itself is defined in app.js, already loaded earlier on this same page.
function refreshAppLockStatus() {
    const hasPin = AppLock.hasPin();
    document.getElementById('app-lock-status-text').textContent = hasPin ? '✅ Set on this device' : '⚠️ Not set';
    document.getElementById('app-lock-create-section').hidden = hasPin;
    document.getElementById('app-lock-manage-section').hidden = !hasPin;
    refreshBio();
}

// Face / fingerprint (Android app 1.0.9+). Only with an App Lock PIN set.
async function refreshBio() {
    const row = document.getElementById('app-lock-bio-row');
    if (!row) return;
    const can = AppLock.hasPin() && await AppLock.bioAvailable();
    row.hidden = !AppLock.bioPlugin() || !AppLock.hasPin();
    const box = document.getElementById('app-lock-bio');
    box.checked = AppLock.bioOn();
    box.disabled = !can;
    if (!can && !row.hidden) document.getElementById('app-lock-bio-note').textContent = 'Set up a face or fingerprint in your phone settings first.';
}
function initBio() {
    const box = document.getElementById('app-lock-bio');
    if (!box) return;
    box.addEventListener('change', async () => {
        if (box.checked) {
            // Check once now, so it's known to work before it's needed.
            if (!(await AppLock.bioCheck('Turn on face or fingerprint unlock'))) { box.checked = false; return; }
            localStorage.setItem(AppLock.BIO_KEY, 'on');
            Toast.show('👆 Face or fingerprint unlock is on.', 'positive');
        } else {
            localStorage.removeItem(AppLock.BIO_KEY);
            Toast.show('Face or fingerprint unlock is off. The PIN still works.', 'neutral');
        }
    });
}

async function attemptCreateAppLockPin() {
    const errorEl = 'app-lock-create-error';
    document.getElementById(errorEl).hidden = true;

    const pin = document.getElementById('app-lock-create-new').value;
    const confirmPin = document.getElementById('app-lock-create-confirm').value;

    if (!isValidAppLockPin(pin)) {
        showError(errorEl, 'PIN must be exactly 4 digits.');
        return;
    }
    if (pin !== confirmPin) {
        showError(errorEl, "PINs don't match.");
        return;
    }

    await AppLock.setPin(pin);
    // Setting the PIN up shouldn't immediately lock you out of the very
    // page you're standing on - mark this tab unlocked right away, same as
    // if you'd just entered it correctly. Only a future close-and-reopen
    // (or a fresh tab) will actually ask for it.
    AppLock.markUnlocked();
    document.getElementById('app-lock-create-new').value = '';
    document.getElementById('app-lock-create-confirm').value = '';
    refreshAppLockStatus();
    Toast.show('🔒 App Lock PIN created.', 'positive');
}

async function attemptChangeAppLockPin() {
    const errorEl = 'app-lock-manage-error';
    document.getElementById(errorEl).hidden = true;

    const currentPin = document.getElementById('app-lock-current').value;
    const newPin = document.getElementById('app-lock-new').value;
    const confirmPin = document.getElementById('app-lock-confirm').value;

    if (!isValidAppLockPin(currentPin)) {
        showError(errorEl, 'Enter your current 4-digit App Lock PIN.');
        return;
    }
    if (!(await AppLock.verifyPin(currentPin))) {
        showError(errorEl, '🐝 Access Denied. Current PIN is incorrect.');
        return;
    }
    if (!isValidAppLockPin(newPin)) {
        showError(errorEl, 'New PIN must be exactly 4 digits.');
        return;
    }
    if (newPin !== confirmPin) {
        showError(errorEl, "New PINs don't match.");
        return;
    }
    if (newPin === currentPin) {
        showError(errorEl, 'New PIN must be different from your current one.');
        return;
    }

    await AppLock.setPin(newPin);
    document.getElementById('app-lock-current').value = '';
    document.getElementById('app-lock-new').value = '';
    document.getElementById('app-lock-confirm').value = '';
    Toast.show('🔒 App Lock PIN changed.', 'positive');
}

async function attemptRemoveAppLockPin() {
    const errorEl = 'app-lock-manage-error';
    document.getElementById(errorEl).hidden = true;

    const currentPin = document.getElementById('app-lock-current').value;
    if (!isValidAppLockPin(currentPin)) {
        showError(errorEl, 'Enter your current 4-digit App Lock PIN.');
        return;
    }
    if (!(await AppLock.verifyPin(currentPin))) {
        showError(errorEl, '🐝 Access Denied. Current PIN is incorrect.');
        return;
    }

    const confirmed = confirm('Remove App Lock from this device? Bizzybee will no longer ask for a PIN here when you reopen it.');
    if (!confirmed) return;

    AppLock.removePin();
    document.getElementById('app-lock-current').value = '';
    document.getElementById('app-lock-new').value = '';
    document.getElementById('app-lock-confirm').value = '';
    refreshAppLockStatus();
    Toast.show('🔓 App Lock removed from this device.', 'negative');
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    // Forgot PIN (Oct 2026): erase the encrypted details and start over.
    const forgot = document.getElementById('pin-forgot-btn');
    if (forgot) forgot.addEventListener('click', () => {
        if (!confirm('Forgot your PIN? It can\'t be recovered, because it is also the key that locks your saved details.\n\nResetting erases your encrypted personal details and saved Habitica login on this save. Your bees, tasks and progress are NOT touched. A backup is made first.\n\nReset your PIN?')) return;
        Vault.resetAccountPin();
        Toast.show('🔢 PIN reset. Create a new one.', 'positive');
        setTimeout(() => window.location.reload(), 600);
    });

    Waggle.setActions(baseWaggleActions());

    ['create-pin-new', 'create-pin-confirm', 'change-pin-current', 'change-pin-new', 'change-pin-confirm']
        .forEach(id => sanitizePinInput(document.getElementById(id)));

    refreshPinStatus();

    document.getElementById('create-pin-btn').addEventListener('click', attemptCreatePin);
    document.getElementById('create-pin-confirm').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') attemptCreatePin();
    });

    document.getElementById('change-pin-btn').addEventListener('click', attemptChangePin);
    document.getElementById('change-pin-confirm').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') attemptChangePin();
    });

    ['app-lock-create-new', 'app-lock-create-confirm', 'app-lock-current', 'app-lock-new', 'app-lock-confirm']
        .forEach(id => sanitizePinInput(document.getElementById(id), 4));

    refreshAppLockStatus();
    initBio();

    document.getElementById('app-lock-create-btn').addEventListener('click', attemptCreateAppLockPin);
    document.getElementById('app-lock-create-confirm').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') attemptCreateAppLockPin();
    });

    document.getElementById('app-lock-change-btn').addEventListener('click', attemptChangeAppLockPin);
    document.getElementById('app-lock-remove-btn').addEventListener('click', attemptRemoveAppLockPin);
    document.getElementById('app-lock-confirm').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') attemptChangeAppLockPin();
    });
});
