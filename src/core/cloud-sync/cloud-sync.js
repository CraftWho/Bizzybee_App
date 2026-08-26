console.log("/// CLOUD SYNC AUTO ENGINE ONLINE ///");

// --- Auto Sync engine ------------------------------------------------------
// Silently pushes local progress to Netlify Blobs (a) a few seconds after
// any change, and (b) right before the tab closes/hides - so a signed-in
// Cloud Sync user doesn't have to remember to click "Save to Cloud"
// themselves. Built per explicit request: save while using, auto-save on
// close, manual "Load from Cloud" stays exactly as it was (see
// HANDOFF.md's "auto-sync" entry). Deliberately PUSH-only - this never
// pulls/overwrites anything locally on its own. Auto-pulling on load was
// considered and rejected: it risks silently clobbering a device's own
// newer progress with an older cloud copy. Manual Load from Cloud in
// Settings is still the only way data ever comes DOWN.
//
// Loaded dynamically by app.js's initCloudSyncAuto() on ANY page - not
// just Settings - since most play happens on Home/Dashboard/Quests/
// Dailies, not the Settings screen itself. Only ever loaded at all when
// localStorage.bizzybee_session === 'identity' (see app.js); demo/
// personal sessions never touch this file, so the app's normal weight is
// completely unchanged for the common case.
//
// localStorage keys are duplicated as plain string literals here AND in
// settings.js (for the toggle + "last synced" display) rather than shared
// via this module's exports - this file loads asynchronously and isn't
// guaranteed to be ready by the time settings.js's own DOMContentLoaded
// handler runs, so settings.js reads/writes these directly instead of
// depending on load order. Matches this codebase's existing "duplicate
// rather than share" convention for exactly this kind of small coupling.
const CloudSyncAuto = (() => {
    const AUTO_SYNC_KEY = 'bizzybee_auto_sync';
    const LAST_SYNCED_KEY = 'bizzybee_last_synced_at';
    const DEBOUNCE_MS = 6000;

    let debounceTimer = null;
    let pendingPush = false;

    // Defaults ON (absent key = enabled) - this WAS the actual ask, not an
    // opt-in extra on top of it. The Settings toggle exists so it can be
    // turned OFF per device, not because it starts off.
    function isEnabled() {
        return localStorage.getItem(AUTO_SYNC_KEY) !== 'false';
    }

    // Surfaces a failed auto-push to the user instead of leaving it as a
    // console-only error. Found while debugging a real report: a photo
    // uploaded on one device silently never showed up after "Load from
    // Cloud" on another - with zero error shown anywhere, there was no way
    // to tell auto-sync had failed versus not having run yet. `Toast` is
    // loaded on every page this script itself can run on (same core script
    // set as `Vault`), but this stays defensive since cloud-sync.js doesn't
    // control page markup directly.
    function notifyFailure(reason) {
        console.error('CloudSyncAuto: push failed -', reason);
        if (typeof Toast !== 'undefined' && typeof Toast.show === 'function') {
            Toast.show(`⚠️ Auto-sync failed (${reason}) - try Save to Cloud in Settings.`, 'negative');
        }
    }

    async function pushNow(options = {}) {
        if (typeof netlifyIdentity === 'undefined') return false;
        const user = netlifyIdentity.currentUser();
        if (!user) return false;
        if (typeof Vault === 'undefined' || !Vault.state) return false;

        const snapshot = Vault.exportFullState();
        if (!snapshot) return false;

        try {
            const token = await user.jwt();
            const response = await fetch('/.netlify/functions/save-state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ data: snapshot }),
                // keepalive lets this fetch survive the page actually
                // unloading right after - the whole point of the
                // pagehide/visibilitychange flush below. Not used for the
                // routine debounced push, only the on-leave one.
                keepalive: !!options.keepalive,
            });
            if (!response.ok) {
                // A keepalive request's response often can't be read for
                // detail (the page may already be gone) - avoid touching
                // .json()/.text() on it and just report the status.
                const reason = response.status === 413
                    ? 'save is too large - a photo may be over the limit'
                    : response.status === 401
                        ? 'signed out - sign back in to Cloud Sync'
                        : `save failed (${response.status})`;
                if (!options.keepalive) notifyFailure(reason);
                return false;
            }
            const result = await response.json();
            if (!result.ok) {
                if (!options.keepalive) notifyFailure(result.error || 'save failed');
                return false;
            }
            localStorage.setItem(LAST_SYNCED_KEY, result.updatedAt);
            pendingPush = false;
            return true;
        } catch (err) {
            if (!options.keepalive) notifyFailure(err.message || 'network error');
            else console.error('CloudSyncAuto: push failed', err);
            return false;
        }
    }

    function scheduleDebouncedPush() {
        if (!isEnabled()) return;
        pendingPush = true;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(pushNow, DEBOUNCE_MS);
    }

    function flushOnLeave() {
        if (!isEnabled() || !pendingPush) return;
        clearTimeout(debounceTimer);
        pushNow({ keepalive: true });
    }

    function init() {
        if (typeof netlifyIdentity !== 'undefined') netlifyIdentity.init();
        if (typeof Vault === 'undefined' || typeof Vault.save !== 'function') return;

        // The one hook point: every one of db.js's ~69 mutating methods
        // already ends by calling this.save() to persist locally - wrap
        // it once here rather than touching every call site, or db.js at
        // all (standing rule #4: don't split/touch db.js unless asked).
        // Local save always still happens first/normally; this just
        // piggybacks a debounced cloud push right after it.
        const originalSave = Vault.save.bind(Vault);
        Vault.save = function (...args) {
            const result = originalSave(...args);
            scheduleDebouncedPush();
            return result;
        };

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushOnLeave();
        });
        window.addEventListener('pagehide', flushOnLeave);

        // Closes a real gap found while debugging a report of a photo
        // upload never making it to another device: this script loads
        // ASYNCHRONOUSLY (injected by app.js, after the Identity widget
        // script finishes) - any Vault.save() that fires before the wrap
        // above is in place (e.g. a fast photo upload right after
        // navigating to Account Info) never scheduled a push at all, so
        // `pendingPush` stayed false and even the on-leave flush had
        // nothing to send. Treating "this engine just came online on a
        // signed-in device" as its own sync trigger catches that case (and
        // anything left over from a failed push on a previous page) - it's
        // one extra push per page load at most, and isEnabled()/pendingPush
        // still gate it exactly like any other call to this function.
        scheduleDebouncedPush();
    }

    // No DOMContentLoaded wrapper, deliberately: this script is injected
    // well after initial page parse (see app.js), so the DOM - and more
    // importantly `Vault`, loaded via a plain <script> tag earlier on
    // every page - is already there by the time this executes. Waiting
    // on an event that may have already fired would mean this never runs
    // at all.
    init();

    return { isEnabled, pushNow };
})();
