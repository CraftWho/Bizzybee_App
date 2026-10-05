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

// --- Habitica Import ------------------------------------------------------

// Habitica's task `priority` field: 0.1 trivial, 1 easy, 1.5 medium, 2 hard -
// mapped onto roughly the same DP scale the rest of this app already uses
// for difficulty (see llm-engine.js's own DP anchors), not a 1:1 formula,
// just a reasonable analogous scale.
function habiticaPriorityToDp(task) {
    const priority = task.priority;
    if (priority >= 2) return 100;
    if (priority >= 1.5) return 75;
    if (priority >= 1) return 50;
    return 25;
}

// Habitica's weekly Daily repeat shape ({ su, m, t, w, th, f, s }, each a
// bool) mapped onto Bizzybee's own { type, every, daysOfWeek } shape
// (db.js's isDailyDueOn - 0=Sun..6=Sat, matching Date#getDay()). Habits
// don't carry this at all, so they always import as a plain every-day
// Bizzybee daily - there's no real Habitica equivalent of a habit's own
// schedule to translate.
function habiticaRepeatToBizzybee(task) {
    if (task.type !== 'daily' || !task.repeat) {
        return { type: 'daily', every: 1, daysOfWeek: [] };
    }
    const order = ['su', 'm', 't', 'w', 'th', 'f', 's'];
    const daysOfWeek = order.map((key, i) => (task.repeat[key] ? i : null)).filter(i => i !== null);
    return { type: 'weekly', every: task.everyX || 1, daysOfWeek };
}

// Only kept to find (and migrate away from) an earlier version's standing
// import quest - see migrateMisplacedHabiticaImports below. No longer
// created for new imports.
const HABITICA_IMPORT_QUEST_ID = 'quest-habitica-import';

// addTask/addDailyTask/addHabit/addTodo all generate their own id from
// Date.now() with no collision-avoidance - fine for a single manual click,
// but this import can add many tasks back-to-back synchronously. A tiny
// delay between writes is a simple, low-risk way to guarantee each gets a
// distinct millisecond without touching any of those shared methods' id
// schemes (all used elsewhere in the app too).
function tinyDelay() {
    return new Promise(resolve => setTimeout(resolve, 2));
}

// One-time cleanup for accounts that ran an earlier version of this
// import: that version put every Habitica Habit into Bizzybee's Dailies
// (marked by a "Imported from Habitica (habit)." note) and every Habitica
// To-Do into a standing "Imported from Habitica" quest, instead of
// Bizzybee's own Habits/To-Dos. This finds anything still sitting in
// either wrong spot, moves it to where it actually belongs (preserving a
// To-Do's completed state), and removes the now-empty quest. Cheap no-op
// once nothing old is left to find, so it's safe to run on every import.
function migrateMisplacedHabiticaImports() {
    let migratedHabits = 0;
    for (const task of Vault.getDailyTasks()) {
        if (task.notes && task.notes.startsWith('Imported from Habitica (habit).')) {
            Vault.removeDailyTask(task.id);
            migratedHabits++;
        }
    }

    let migratedTodos = 0;
    const oldQuest = Vault.getQuests().find(q => q.id === HABITICA_IMPORT_QUEST_ID);
    if (oldQuest) {
        for (const task of [...(oldQuest.tasks || [])]) {
            const todos = Vault.addTodo({ label: task.label, dp: task.dp, notes: 'Imported from Habitica (todo).' });
            const newTodo = todos[todos.length - 1];
            if (task.completed && newTodo) Vault.toggleTodoComplete(newTodo.id);
            migratedTodos++;
        }
        Vault.removeQuest(oldQuest.id);
    }

    return { migratedHabits, migratedTodos };
}

// Pulls the account's current Habits/Dailies/To-Dos and adds whatever
// isn't already here (tracked via Vault.getHabiticaImportedIds/
// markHabiticaImported, keyed by Habitica's own stable task _id - not
// Bizzybee's own generated ids, which aren't guaranteed unique enough for
// this - see tinyDelay above). Each Habitica task type lands in its
// matching Bizzybee feature: Habits into Habits (carrying over which of
// +/- is enabled), Dailies into Dailies, To-Dos into To-Dos - no more
// bucketing Habits under Dailies or To-Dos under a synthetic quest.
// Returns a small summary object for the caller to show the user; throws
// straight through any HabiticaAPI error (network/auth/CORS) for the
// caller to catch and display.
async function importFromHabitica(userId, apiToken) {
    const migration = migrateMisplacedHabiticaImports();

    const tasks = await HabiticaAPI.getTasks(userId, apiToken);

    const alreadyImported = new Set(Vault.getHabiticaImportedIds());
    const habits = tasks.filter(t => t.type === 'habit');
    const dailies = tasks.filter(t => t.type === 'daily');
    const todos = tasks.filter(t => t.type === 'todo' && !t.completed);

    const newlyImportedIds = [];
    let importedHabits = 0;
    let importedDailies = 0;
    let importedTodos = 0;

    for (const task of habits) {
        const key = `habit:${task._id}`;
        if (alreadyImported.has(key)) continue;

        // Habitica's own up/down flags say which button a Habit shows;
        // missing means "on" there too, matching addHabit's own default.
        Vault.addHabit({
            label: task.text,
            dp: habiticaPriorityToDp(task),
            notes: `Imported from Habitica (habit).${task.notes ? ' ' + task.notes : ''}`,
            positive: task.up !== false,
            negative: task.down !== false
        });
        newlyImportedIds.push(key);
        importedHabits++;
        await tinyDelay();
    }

    for (const task of dailies) {
        const key = `daily:${task._id}`;
        if (alreadyImported.has(key)) continue;

        Vault.addDailyTask({
            label: task.text,
            dp: habiticaPriorityToDp(task),
            notes: `Imported from Habitica (daily).${task.notes ? ' ' + task.notes : ''}`,
            repeats: habiticaRepeatToBizzybee(task)
        });
        newlyImportedIds.push(key);
        importedDailies++;
        await tinyDelay();
    }

    for (const task of todos) {
        const key = `todo:${task._id}`;
        if (alreadyImported.has(key)) continue;

        Vault.addTodo({
            label: task.text,
            dp: habiticaPriorityToDp(task),
            notes: `Imported from Habitica (todo).${task.notes ? ' ' + task.notes : ''}`
        });
        newlyImportedIds.push(key);
        importedTodos++;
        await tinyDelay();
    }

    if (newlyImportedIds.length > 0) {
        Vault.markHabiticaImported(newlyImportedIds);
    }

    const totalSeen = habits.length + dailies.length + todos.length;
    return {
        importedHabits, importedDailies, importedTodos,
        skipped: totalSeen - newlyImportedIds.length,
        migratedHabits: migration.migratedHabits,
        migratedTodos: migration.migratedTodos
    };
}

function showError(elId, message) {
    const el = document.getElementById(elId);
    el.textContent = message;
    el.hidden = false;
}

const HABITICA_AUTO_IMPORT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const HABITICA_AUTO_IMPORT_KEY = 'bizzybee_habitica_last_auto_import';

// Runs the same import the manual button does, but quietly and at most
// once a day. Habitica credentials only ever decrypt while this page is
// unlocked (see the PIN comment at the top of this file) - there's no way
// to read an encrypted personalInfo field without it, by design - so
// "automatic" here means "whenever you happen to open/unlock Account
// Info," not a true background sync reachable from anywhere else in the
// app. Failures are swallowed on purpose: this runs without a click, so a
// network hiccup shouldn't interrupt the page with an error the user
// didn't ask for. The manual Import button still surfaces failures as
// normal.
async function maybeAutoImportHabitica(info) {
    if (!info.habiticaUserId || !info.habiticaApiToken) return;
    const last = Number(localStorage.getItem(HABITICA_AUTO_IMPORT_KEY) || 0);
    if (Date.now() - last < HABITICA_AUTO_IMPORT_INTERVAL_MS) return;

    localStorage.setItem(HABITICA_AUTO_IMPORT_KEY, String(Date.now()));
    try {
        const result = await importFromHabitica(info.habiticaUserId, info.habiticaApiToken);
        const changed = result.importedHabits + result.importedDailies + result.importedTodos + result.migratedHabits + result.migratedTodos;
        if (changed > 0) {
            Toast.show(`🎮 Habitica auto-sync: ${changed} item${changed === 1 ? '' : 's'} updated.`, 'positive');
        }
    } catch (error) {
        console.warn('Habitica auto-import skipped:', error.message);
    }
}

function showUnlockedContent(info, pin) {
    unlockedPin = pin;
    document.getElementById('account-pin-create-screen').hidden = true;
    document.getElementById('account-lock-screen').hidden = true;
    document.getElementById('account-content').hidden = false;

    populatePersonalInfoForm(info);
    applyAccountAvatarPreview();
    updateAvatarMigrateButton();
    maybeAutoImportHabitica(info);
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
            errorEl.textContent = 'Alias is required - everything else is optional.';
            errorEl.hidden = false;
            return;
        }

        // unlockedPin is always set by this point - Save is only reachable
        // once #account-content is visible, which only happens after
        // showUnlockedContent() (called from either attemptCreatePin or
        // attemptUnlock) sets it.
        await Vault.setPersonalInfo(data, unlockedPin);
        Toast.show('💾 Saved and encrypted.', 'positive');
    });

    document.getElementById('habitica-import-btn').addEventListener('click', async () => {
        const statusEl = document.getElementById('habitica-import-status');
        const errorEl = document.getElementById('habitica-import-error');
        const btn = document.getElementById('habitica-import-btn');
        statusEl.hidden = true;
        errorEl.hidden = true;

        const userId = document.getElementById('pi-habiticaUserId').value.trim();
        const apiToken = document.getElementById('pi-habiticaApiToken').value.trim();

        if (!userId || !apiToken) {
            errorEl.textContent = 'Both Habitica User ID and API Token are required to import.';
            errorEl.hidden = false;
            return;
        }

        btn.disabled = true;
        btn.textContent = '🔄 Importing...';

        try {
            const result = await importFromHabitica(userId, apiToken);

            // Persist the credentials alongside the rest of Personal
            // Information (same encrypted blob, same PIN) so they don't
            // have to be re-typed next time - the whole form gets saved
            // here, not just the two Habitica fields, matching how the
            // Save button above behaves.
            const data = readPersonalInfoForm();
            if (data.alias) {
                await Vault.setPersonalInfo(data, unlockedPin);
            }

            const migratedTotal = result.migratedHabits + result.migratedTodos;
            statusEl.textContent = `✅ Imported ${result.importedHabits} habit${result.importedHabits === 1 ? '' : 's'}, ${result.importedDailies} daily${result.importedDailies === 1 ? '' : 's'}, and ${result.importedTodos} to-do${result.importedTodos === 1 ? '' : 's'}.` +
                (result.skipped > 0 ? ` (${result.skipped} already imported, skipped.)` : '') +
                (migratedTotal > 0 ? ` Also moved ${migratedTotal} item${migratedTotal === 1 ? '' : 's'} from an earlier import that landed in the wrong place.` : '');
            statusEl.hidden = false;
            Toast.show('🎮 Habitica import complete.', 'positive');
        } catch (error) {
            errorEl.textContent = error.message || 'Import failed - check your User ID and API Token.';
            errorEl.hidden = false;
        } finally {
            btn.disabled = false;
            btn.textContent = '🔄 Import';
        }
    });
});
