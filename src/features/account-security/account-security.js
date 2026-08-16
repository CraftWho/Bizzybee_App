console.log("/// ACCOUNT SECURITY PROTOCOLS INITIALIZED ///");

// Same digits-only-as-you-type helper as account-info.js - duplicated
// rather than shared, same tradeoff noted in this app's other small
// page-local helpers (see account-info.js's own copy of this comment).
function sanitizePinInput(input) {
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
    });
}

function isValidPin(pin) {
    return /^\d{6}$/.test(pin);
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

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    HiveMind.setActions(baseHiveMindActions());

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
});
