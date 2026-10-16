console.log("/// ACCOUNT INFO PROTOCOLS INITIALIZED ///");

// The PIN never touches localStorage/sessionStorage - it only lives in this
// variable, in memory, for as long as this page stays open. Reloading or
// navigating away clears it, which is exactly the "re-locks every time"
// behavior a real lock screen needs. It's also the actual encryption key
// (via CryptoLite) for everything Save writes below, not just a UI gate.
let unlockedPin = null;

// Strips anything non-digit and caps at 6 chars on every keystroke.
// inputmode="numeric" + pattern="[0-9]*" on the input already hint mobile
// browsers toward a numeric keypad and gate form submission, but neither
// actually stops someone from typing letters on a physical keyboard - this
// is what makes the field ACTUALLY digits-only as you type, not just on
// submit.
function sanitizePinInput(input) {
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
    });
}

function isValidPin(pin) {
    return /^\d{6}$/.test(pin);
}

// Reads the picked file, draws it onto an offscreen canvas capped at
// maxDim on its longest edge, and re-exports as a JPEG data URL - keeps a
// phone-camera-sized photo (often several MB) from bloating localStorage
// or a Full Save export file. Typical result: well under 200KB.
function downscaleImageFile(file, maxDim = 640, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width >= height) {
                        height = Math.round(height * (maxDim / width));
                        width = maxDim;
                    } else {
                        width = Math.round(width * (maxDim / height));
                        height = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('not-an-image'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('read-failed'));
        reader.readAsDataURL(file);
    });
}

// Photo itself is NOT part of the encrypted blob (see db.js's §7c comment
// for why) - this only needs Vault.getProfilePhoto(), no PIN involved.
function applyAccountAvatarPreview() {
    const img = document.getElementById('account-avatar-preview');
    const removeBtn = document.getElementById('account-avatar-remove-btn');
    const customPhoto = Vault.getProfilePhoto();

    if (customPhoto) {
        img.onerror = null;
        img.src = customPhoto;
        removeBtn.hidden = false;
        return;
    }

    removeBtn.hidden = true;
    img.onerror = () => { img.onerror = null; img.src = '../../assets/images/avatar-placeholder.svg'; };
    img.src = '../../assets/images/me.jpg';
}

// Whether the legacy, device-only fallback image (src/assets/images/me.jpg -
// gitignored, never part of any save) actually exists on THIS device. A
// plain HEAD request is enough - no need to pull the whole file just to
// check. Any failure (404, offline, whatever) just means "no", never
// throws - this only ever gates whether a button shows, it's not worth
// surfacing an error for.
async function localFallbackPhotoExists() {
    try {
        const res = await fetch('../../assets/images/me.jpg', { method: 'HEAD', cache: 'no-store' });
        return res.ok;
    } catch (error) {
        return false;
    }
}

// Shows "Use Existing Photo" only when it would actually do something: no
// real photo saved yet (Vault.getProfilePhoto() null) AND the legacy local
// file is actually sitting on this device to import. Re-run after every
// upload/remove so the button's visibility always reflects current state,
// same reasoning as applyAccountAvatarPreview being re-run after those too.
async function updateAvatarMigrateButton() {
    const btn = document.getElementById('account-avatar-migrate-btn');
    if (!btn) return;

    if (Vault.getProfilePhoto()) {
        btn.hidden = true;
        return;
    }
    btn.hidden = !(await localFallbackPhotoExists());
}

function populatePersonalInfoForm(info) {
    document.getElementById('pi-alias').value = info.alias || '';
    document.getElementById('pi-firstName').value = info.firstName || '';
    document.getElementById('pi-lastName').value = info.lastName || '';
    document.getElementById('pi-availability').value = info.availability || '';
    document.getElementById('pi-height').value = info.height || '';
    document.getElementById('pi-weight').value = info.weight || '';
    document.getElementById('pi-bmi').value = info.bmi || '';
    document.getElementById('pi-work').value = info.work || '';
    document.getElementById('pi-address').value = info.address || '';
    // Habitica credentials - functionally just two more fields in the same
    // encrypted blob, but kept in their own panel (see account-info.html)
    // rather than mixed in among name/address/etc., since they're a
    // different KIND of sensitive (an API token, not a personal fact).
    document.getElementById('pi-habiticaUserId').value = info.habiticaUserId || '';
    document.getElementById('pi-habiticaApiToken').value = info.habiticaApiToken || '';
}

function readPersonalInfoForm() {
    return {
        alias: document.getElementById('pi-alias').value.trim(),
        firstName: document.getElementById('pi-firstName').value.trim(),
        lastName: document.getElementById('pi-lastName').value.trim(),
        availability: document.getElementById('pi-availability').value.trim(),
        height: document.getElementById('pi-height').value.trim(),
        weight: document.getElementById('pi-weight').value.trim(),
        bmi: document.getElementById('pi-bmi').value.trim(),
        work: document.getElementById('pi-work').value.trim(),
        address: document.getElementById('pi-address').value.trim(),
        habiticaUserId: document.getElementById('pi-habiticaUserId').value.trim(),
        habiticaApiToken: document.getElementById('pi-habiticaApiToken').value.trim()
    };
}

// --- Habitica sync -------------------------------------------------------
// The two-way sync itself lives in src/core/habitica-sync/ and runs on
// every page. This page only hands it the key: your Habitica User ID and
// API Token stay encrypted here under your PIN, and after you unlock, a
// copy is kept on this device (not in your save, not in the cloud) so the
// sync can run without the PIN. "Disconnect this device" removes that copy.
function connectHabiticaFromInfo(info) {
    if (typeof HabiticaSync === 'undefined') return;
    if (info && info.habiticaUserId && info.habiticaApiToken) HabiticaSync.connect(info.habiticaUserId, info.habiticaApiToken);
    renderHabiticaStatus();
}

function renderHabiticaStatus() {
    const el = document.getElementById('habitica-import-status');
    const btn = document.getElementById('habitica-disconnect-btn');
    if (!el || typeof HabiticaSync === 'undefined') return;
    const connected = HabiticaSync.isConnected();
    if (btn) btn.hidden = !connected;
    const st = HabiticaSync.getStatus();
    if (!connected) { el.textContent = 'Not connected on this device.'; el.hidden = false; return; }
    el.textContent = st ? `${st.ok ? '✅' : '⚠️'} ${st.message} (${new Date(st.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})` : 'Connected. First sync starting...';
    el.hidden = false;
}
window.addEventListener('habitica-sync-status', renderHabiticaStatus);

function showError(elId, message) {
    const el = document.getElementById(elId);
    el.textContent = message;
    el.hidden = false;
}

function showUnlockedContent(info, pin) {
    unlockedPin = pin;
    document.getElementById('account-pin-create-screen').hidden = true;
    document.getElementById('account-lock-screen').hidden = true;
    document.getElementById('account-content').hidden = false;

    populatePersonalInfoForm(info);
    applyAccountAvatarPreview();
    updateAvatarMigrateButton();
    connectHabiticaFromInfo(info);
}

// First-time setup - only reachable while Vault.hasAccountPin() is false.
// Creates the PIN, then unlocks straight through (a brand-new PIN has
// nothing encrypted under it yet, so this always resolves to {}).
async function attemptCreatePin() {
    const errorEl = 'pin-create-error';
    document.getElementById(errorEl).hidden = true;

    const pin = document.getElementById('pin-create-new').value;
    const confirmPin = document.getElementById('pin-create-confirm').value;

    if (!isValidPin(pin)) {
        showError(errorEl, 'PIN must be exactly 6 digits.');
        return;
    }
    if (pin !== confirmPin) {
        showError(errorEl, "PINs don't match.");
        return;
    }

    await Vault.setAccountPin(pin);
    const info = await Vault.getPersonalInfo(pin);
    showUnlockedContent(info, pin);
    Toast.show('🔢 PIN created.', 'positive');
}

async function attemptUnlock() {
    const errorEl = 'account-unlock-error';
    document.getElementById(errorEl).hidden = true;

    const pin = document.getElementById('account-unlock-pin').value;
    if (!isValidPin(pin)) {
        showError(errorEl, 'Enter your 6-digit PIN.');
        return;
    }

    const correct = await Vault.verifyAccountPin(pin);
    if (!correct) {
        showError(errorEl, '🐝 Access Denied. Check your PIN.');
        return;
    }

    let info;
    try {
        info = await Vault.getPersonalInfo(pin);
    } catch (error) {
        // PIN hash matched but decryption still failed - only happens if
        // the stored envelope is corrupted somehow. Don't unlock on a
        // decrypt failure even though the PIN itself was right.
        showError(errorEl, '⚠️ Saved data could not be decrypted. It may be corrupted.');
        return;
    }

    showUnlockedContent(info, pin);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    Waggle.setActions(baseWaggleActions());

    const pinInputs = ['pin-create-new', 'pin-create-confirm', 'account-unlock-pin'];
    pinInputs.forEach(id => sanitizePinInput(document.getElementById(id)));

    if (Vault.hasAccountPin()) {
        document.getElementById('account-lock-screen').hidden = false;

        document.getElementById('account-unlock-btn').addEventListener('click', attemptUnlock);
        document.getElementById('account-unlock-pin').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') attemptUnlock();
        });
    } else {
        document.getElementById('account-pin-create-screen').hidden = false;

        document.getElementById('pin-create-btn').addEventListener('click', attemptCreatePin);
        document.getElementById('pin-create-confirm').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') attemptCreatePin();
        });
    }

    document.getElementById('account-avatar-edit-btn').addEventListener('click', () => {
        document.getElementById('account-avatar-input').click();
    });

    document.getElementById('account-avatar-input').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            Toast.show("That doesn't look like an image file.", 'negative');
            event.target.value = '';
            return;
        }

        try {
            const dataUrl = await downscaleImageFile(file);
            Vault.setProfilePhoto(dataUrl);
            applyAccountAvatarPreview();
            updateAvatarMigrateButton();
            Toast.show('🖼️ Photo updated.', 'positive');
        } catch (error) {
            Toast.show('Could not process that image.', 'negative');
        } finally {
            event.target.value = '';
        }
    });

    document.getElementById('account-avatar-remove-btn').addEventListener('click', () => {
        if (!confirm('Remove your custom photo? This falls back to the default avatar.')) return;
        Vault.clearProfilePhoto();
        applyAccountAvatarPreview();
        updateAvatarMigrateButton();
        Toast.show('Photo removed.', 'negative');
    });

    // One-click migration for the exact scenario that prompted this button:
    // a photo that LOOKS set (it's on screen right now) but is actually
    // just src/assets/images/me.jpg, a local fallback file that was never
    // part of the save and so never traveled with an export. Fetches that
    // same file this device is already rendering, runs it through the
    // SAME downscale/store path a manual upload uses (downscaleImageFile
    // happily takes any Blob, not just a <input type=file> File), so from
    // this point on it's real save data like any other uploaded photo.
    document.getElementById('account-avatar-migrate-btn').addEventListener('click', async () => {
        const btn = document.getElementById('account-avatar-migrate-btn');
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = '📥 Importing...';

        try {
            const res = await fetch('../../assets/images/me.jpg', { cache: 'no-store' });
            if (!res.ok) throw new Error('not-found');

            const blob = await res.blob();
            if (blob.type && !blob.type.startsWith('image/')) throw new Error('not-an-image');

            const dataUrl = await downscaleImageFile(blob);
            Vault.setProfilePhoto(dataUrl);
            applyAccountAvatarPreview();
            await updateAvatarMigrateButton();
            Toast.show('🖼️ Existing photo imported - it\'ll travel with your save from now on.', 'positive');
        } catch (error) {
            Toast.show("Couldn't find that photo on this device to import.", 'negative');
            btn.hidden = true;
        } finally {
            btn.disabled = false;
            btn.textContent = originalLabel;
        }
    });

    document.getElementById('save-account-info-btn').addEventListener('click', async () => {
        const errorEl = document.getElementById('account-info-error');
        errorEl.hidden = true;

        const data = readPersonalInfoForm();
        if (!data.alias) {
            errorEl.textContent = 'Add a name to show - everything else is optional.';
            errorEl.hidden = false;
            return;
        }

        // unlockedPin is always set by this point - Save is only reachable
        // once #account-content is visible, which only happens after
        // showUnlockedContent() (called from either attemptCreatePin or
        // attemptUnlock) sets it.
        await Vault.setPersonalInfo(data, unlockedPin);
        Toast.show('💾 Saved and encrypted.', 'positive');
        if (window.AccountInfoV2) AccountInfoV2.markSaved();
    });

    document.getElementById('habitica-import-btn').addEventListener('click', async () => {
        const errorEl = document.getElementById('habitica-import-error');
        const btn = document.getElementById('habitica-import-btn');
        errorEl.hidden = true;

        const userId = document.getElementById('pi-habiticaUserId').value.trim();
        const apiToken = document.getElementById('pi-habiticaApiToken').value.trim();
        if (!userId || !apiToken) {
            errorEl.textContent = 'Both Habitica User ID and API Token are required.';
            errorEl.hidden = false;
            return;
        }

        // Keep the credentials (encrypted, same PIN) so they don't have to
        // be re-typed - the whole form is saved, like the Save button does.
        const data = readPersonalInfoForm();
        if (data.alias) await Vault.setPersonalInfo(data, unlockedPin);

        btn.disabled = true;
        btn.textContent = '🔄 Syncing...';
        HabiticaSync.connect(userId, apiToken);
        const result = await HabiticaSync.run({ manual: true });
        const st = HabiticaSync.getStatus();
        if (!result && !(st && !st.ok)) {
            // A failure already shows in the status line; this is the "busy" case.
            errorEl.textContent = 'Sync is already running - try again in a moment.';
            errorEl.hidden = false;
        }
        renderHabiticaStatus();
        btn.disabled = false;
        btn.textContent = '🔄 Sync now';
    });

    document.getElementById('habitica-disconnect-btn').addEventListener('click', () => {
        HabiticaSync.disconnect();
        renderHabiticaStatus();
        Toast.show('Habitica disconnected on this device.', 'positive');
    });
});


// ---- Account Info v2 (Oct 2026 redesign - approved demo) -------------------
// PIN boxes + number pad, auto BMI, a Save bar that shows when something
// changed, Habitica status pill and Lock now. The old logic above is unchanged.
const AccountInfoV2 = (() => {
    const PI = ['pi-alias', 'pi-firstName', 'pi-lastName', 'pi-work', 'pi-address', 'pi-height', 'pi-weight', 'pi-bmi', 'pi-availability', 'pi-habiticaUserId', 'pi-habiticaApiToken'];
    let saved = null;
    const $ = (id) => document.getElementById(id);
    const snapshot = () => Object.fromEntries(PI.map(id => [id, $(id).value]));

    // Height: 5'10", 5 ft 10, 70 in, 178 cm, 1.78 m. Weight: 165 lbs, 75 kg.
    function meters(text) {
        const t = String(text).toLowerCase().trim();
        let m;
        if ((m = t.match(/(\d+(?:\.\d+)?)\s*cm/))) return +m[1] / 100;
        if ((m = t.match(/^(\d(?:\.\d+)?)\s*m\b/))) return +m[1];
        if ((m = t.match(/(\d+)\s*(?:'|ft|feet)\s*(\d+(?:\.\d+)?)?/))) return ((+m[1]) * 12 + (+m[2] || 0)) * 0.0254;
        if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:"|in)/))) return +m[1] * 0.0254;
        return null;
    }
    function kilos(text) {
        const t = String(text).toLowerCase().trim();
        const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|lb|lbs|pound)?/);
        if (!m) return null;
        return m[2] && m[2].startsWith('k') ? +m[1] : +m[1] * 0.453592;
    }
    function updateBmi() {
        const h = meters($('pi-height').value), w = kilos($('pi-weight').value);
        const bmi = h && w && h > 0.8 && h < 2.6 && w > 20 && w < 400 ? (w / (h * h)).toFixed(1) : '';
        if (bmi) $('pi-bmi').value = bmi;
    }
    function dirtyCheck() {
        if (!saved) return;
        const now = snapshot();
        $('ai-savebar').hidden = !PI.some(id => now[id] !== saved[id]);
    }
    function markSaved() { saved = snapshot(); $('ai-savebar').hidden = true; $('ai-name').textContent = $('pi-alias').value.trim() || 'You'; }

    function pinPad() {
        const input = $('account-unlock-pin');
        const boxes = [...document.querySelectorAll('.pin-boxes i')];
        const paint = () => boxes.forEach((b, i) => { b.textContent = i < input.value.length ? '•' : ''; b.classList.toggle('on', i === Math.min(input.value.length, 5)); });
        input.addEventListener('input', paint);
        const keys = $('ai-keys');
        keys.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map(k =>
            `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Delete' : k === '✓' ? 'Unlock' : k}">${k}</button>`).join('');
        keys.addEventListener('click', (e) => {
            const k = e.target.closest('[data-k]')?.dataset.k;
            if (!k) return;
            if (k === '⌫') input.value = input.value.slice(0, -1);
            else if (k === '✓') { $('account-unlock-btn').click(); return; }
            else if (input.value.length < 6) input.value += k;
            paint();
            if (input.value.length === 6) $('account-unlock-btn').click();
        });
        // A wrong PIN clears the boxes so you can try again.
        new MutationObserver(() => { if (!$('account-unlock-error').hidden) { input.value = ''; paint(); } }).observe($('account-unlock-error'), { attributes: true, attributeFilter: ['hidden'] });
        paint();
    }

    function habiticaPill() {
        const on = typeof HabiticaSync !== 'undefined' && HabiticaSync.isConnected();
        $('ai-hab-pill').textContent = on ? 'CONNECTED' : 'OFF';
        $('ai-hab-pill').classList.toggle('on', on);
        $('ai-hab-hx').classList.toggle('gold', on);
    }

    document.addEventListener('DOMContentLoaded', () => {
        pinPad();
        ['pi-height', 'pi-weight'].forEach(id => $(id).addEventListener('input', updateBmi));
        PI.forEach(id => $(id).addEventListener('input', dirtyCheck));
        $('ai-undo').addEventListener('click', () => { if (saved) PI.forEach(id => { $(id).value = saved[id]; }); dirtyCheck(); });
        $('ai-lock').addEventListener('click', () => location.reload());
        // When the page unlocks, remember what was loaded.
        new MutationObserver(() => {
            if (!$('account-content').hidden && !saved) setTimeout(() => { updateBmi(); markSaved(); habiticaPill(); }, 50);
        }).observe($('account-content'), { attributes: true, attributeFilter: ['hidden'] });
        window.addEventListener('habitica-sync-status', habiticaPill);
        setTimeout(habiticaPill, 1500);
    });
    return { markSaved };
})();
window.AccountInfoV2 = AccountInfoV2;
