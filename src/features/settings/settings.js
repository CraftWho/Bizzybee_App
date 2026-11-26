console.log("/// SETTINGS PROTOCOLS INITIALIZED ///");

// Nov 20 2026 (Craft): in the Android app a browser download does nothing, so files go through Android's own
// Share / Save screen (BeeFiles.share, new in the app). An older app saves into the picked backup folder instead.
async function downloadFile(content, filename, mimeType) {
    const Cap = window.Capacitor;
    if (Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform()) {
        const f = Cap.Plugins && Cap.Plugins.BeeFiles;
        const text = typeof content === 'string' ? content : JSON.stringify(content);
        try { await f.share({ name: filename, text, mime: mimeType || 'application/json' }); return; }
        catch (e) {
            if (e && /cancel/i.test(String(e.message || e))) return;
            try { const r = await f.writeFile({ name: filename, text }); if (typeof Toast !== 'undefined') Toast.show(`💾 Saved ${filename} to ${r.folder}.`, 'positive'); return; }
            catch { /* no folder picked */ }
            if (typeof Toast !== 'undefined') Toast.show('Update the BizzyBee app to export files, or pick a backup folder in Settings › Notifications & phone › Phone features.', 'negative');
            return;
        }
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Appearance !== 'undefined') Appearance.mountSettings(document.getElementById('look-card'));
    try { await Vault.init(); } catch (error) { Toast.show(error.message, "negative"); }

    Waggle.setActions(baseWaggleActions());

    initCloudSync();
    LocalCloudDownload.init();
    initDeviceBackups();
    initFolderBackup();
    initPasswordReset();
    initTimeTracking();
    initHints();
    initPhoneFeatures();
    initAbout();
    initPermissions();
    initWeather();
    initHistoryImport();

    document.getElementById('export-conversations-btn').addEventListener('click', () => {
        const conversations = Vault.getConversations();
        const jsonl = conversations.map(entry => JSON.stringify(entry)).join('\n');
        downloadFile(jsonl, 'eevee-conversations.jsonl', 'application/jsonl');
        Toast.show('📤 Conversations exported.', 'positive');
    });

    document.getElementById('export-quests-btn').addEventListener('click', () => {
        const quests = Vault.getQuests();
        downloadFile(JSON.stringify(quests, null, 2), 'eevee-quest-data.json', 'application/json');
        Toast.show('📤 Quest data exported.', 'positive');
    });

    // Numeric-only, capped at 6 digits - same sanitization pattern as the
    // Account PIN inputs (account-info.js's sanitizePinInput), duplicated
    // here rather than shared across files per this codebase's existing
    // convention for this kind of small coupling.
    document.getElementById('full-save-password').addEventListener('input', (event) => {
        event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
    });

    document.getElementById('export-full-save-btn').addEventListener('click', async () => {
        const snapshot = Vault.exportForFile() || localStorage.getItem(Vault.storageKey);   // Oct 31 2026 (Craft): carries its save type
        if (!snapshot) {
            Toast.show('Nothing to export yet.', 'negative');
            return;
        }

        const pin = document.getElementById('full-save-password').value;
        if (pin) {
            if (!/^\d{4,6}$/.test(pin)) {
                Toast.show('⚠️ PIN must be 4-6 digits.', 'negative');
                return;
            }
            try {
                const encrypted = JSON.parse(await CryptoLite.encrypt(snapshot, pin));
                // The hint is deliberately plain text, sitting outside the
                // encrypted envelope - CryptoLite only ever encrypts the
                // `snapshot` string above, so this never touches the PIN
                // or your real data. Shown back on import to jog your
                // memory; never store the actual PIN in it.
                const hint = document.getElementById('full-save-hint').value.trim();
                if (hint) encrypted.hint = hint;
                downloadFile(JSON.stringify(encrypted), Vault.saveFileName('locked'), 'application/json');   // Oct 31 2026 (Craft): REAL/TEST/PCLOCAL in the name
                Toast.show('🔐 Full save exported (encrypted).', 'positive');
            } catch (error) {
                Toast.show('⚠️ Encryption failed - export cancelled.', 'negative');
            }
            return;
        }

        downloadFile(snapshot, Vault.saveFileName(), 'application/json');   // Oct 31 2026 (Craft): REAL/TEST/PCLOCAL in the name
        Toast.show('📤 Full save exported.', 'positive');
    });

    document.getElementById('import-full-save-input').addEventListener('change', () => {
        const input = document.getElementById('import-full-save-input');
        const hintDisplay = document.getElementById('import-full-save-hint-display');
        const file = input.files[0];
        hintDisplay.hidden = true;
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (parsed && parsed.bizzybeeEncrypted && parsed.hint) {
                    hintDisplay.textContent = `💡 Hint from export: "${parsed.hint}"`;
                    hintDisplay.hidden = false;
                }
            } catch (error) { /* not JSON, or no hint - nothing to preview */ }
        };
        reader.readAsText(file);
    });

    document.getElementById('import-full-save-btn').addEventListener('click', () => {
        const input = document.getElementById('import-full-save-input');
        const file = input.files[0];
        if (!file) {
            Toast.show('Choose a save file first.', 'negative');
            return;
        }

        const confirmed = confirm(
            'Replace this device’s progress with the imported file? A recovery copy will be kept first. Automatic cloud uploads will be paused for review.'
        );
        if (!confirmed) return;

        const reader = new FileReader();
        reader.onload = async () => {
            let plainText = reader.result;

            if (CryptoLite.isEncryptedEnvelope(plainText)) {
                const password = document.getElementById('full-save-password').value;
                if (!password) {
                    Toast.show('⚠️ This save is encrypted - enter its PIN above first.', 'negative');
                    return;
                }
                try {
                    plainText = await CryptoLite.decrypt(plainText, password);
                } catch (error) {
                    Toast.show('⚠️ Wrong PIN, or the file is corrupted.', 'negative');
                    return;
                }
            }

            if (!Vault.confirmImportKind(plainText)) return;   // Oct 31 2026 (Craft): REAL/TEST/PCLOCAL check
            localStorage.setItem('bizzybee_auto_sync', 'false');
            const result = Vault.importFullState(plainText);
            if (!result.ok) {
                Toast.show(`⚠️ ${result.error}`, 'negative');
                return;
            }
            Toast.show('📥 Save imported - reloading...', 'positive');
            setTimeout(() => window.location.reload(), 800);
        };
        reader.onerror = () => Toast.show('⚠️ Could not read that file.', 'negative');
        reader.readAsText(file);
    });

    // Hidden developer tools: tap the SETTINGS title 5 times to reveal.
    const devSection = document.getElementById('dev-section');
    const settingsTitle = document.querySelector('.settings-title');
    let devTaps = 0, devTapTimer = null;
    if (settingsTitle && devSection) settingsTitle.addEventListener('click', () => {
        devTaps += 1;
        clearTimeout(devTapTimer);
        devTapTimer = setTimeout(() => { devTaps = 0; }, 1500);
        if (devTaps >= 5 && devSection.hidden) {
            devSection.hidden = false;
            devSection.open = true;
            devSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            Toast.show('🛠 Developer tools shown.', 'positive');
        }
    });
    // Owners (and this computer's dev login) see Developer automatically.
    setTimeout(() => {
        if (window.BizzyDev) window.BizzyDev.allowed().then(ok => { if (ok) devSection.hidden = false; }).catch(() => {});
    }, 800);

    // Top card: your name, level and royal (Oct 2026 redesign).
    try {
        const royal = typeof Vault.getRoyalBee === 'function' ? Vault.getRoyalBee() : null;
        const bar = Vault.getCharacterLevelBar();
        document.getElementById('st-name').textContent = Vault.state.displayName || (royal && royal.name) || (Vault.getUser() || {}).name || 'Beekeeper';
        document.getElementById('st-level').textContent = bar ? levelName(bar.level) : '';
        if (royal) document.getElementById('st-avatar').textContent = royal.royal === 'king' ? '🤴' : '👑';
    } catch { /* keep defaults */ }

    document.getElementById('practice-egg-btn').addEventListener('click', () => {
        window.location.href = '../onboarding/onboarding.html?practice=1';
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        if (typeof netlifyIdentity !== 'undefined' && netlifyIdentity.currentUser()) await netlifyIdentity.logout();
        localStorage.removeItem('bizzybee_session');
        // Was '../login/login.html' - a leftover from before the index/login
        // swap (see HANDOFF.md §12). src/features/login/ was deleted when
        // login.html became the project's actual root index.html, which
        // left this pointing at a folder that no longer exists. Found and
        // fixed while working on this file for an unrelated reason.
        window.location.href = '../../../index.html';
    });
});

// History import (Vault.importHistoryPack).
function initHistoryImport() {
    const btn = document.getElementById('history-import-btn');
    const file = document.getElementById('history-import-file');
    const status = document.getElementById('history-import-status');
    if (!btn || !file) return;
    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        file.value = '';
        if (!f) return;
        try {
            const pack = JSON.parse(await f.text());
            const c = Vault.importHistoryPack(pack, { dryRun: true });
            const list = [`${c.quests} quests (${c.tasks} tasks)`, `${c.terms} dictionary terms`, `${c.projects} projects`, `${c.timeline} timeline entries`, `${c.titles} titles`, `${c.study} study items`];
            if (!c.quests && !c.terms && !c.projects && !c.timeline && !c.titles && !c.study) { status.textContent = 'Nothing new in that file - it was already imported.'; return; }
            if (!confirm(`Import from ${pack.source || 'this file'}?\n\n${list.join('\n')}\n\nNothing is replaced. A device backup is made first.`)) return;
            if (typeof Vault.createLocalBackup === 'function') { try { Vault.createLocalBackup('before history import'); } catch (e) { /* best effort */ } }
            Vault.importHistoryPack(pack);
            // Say where it went: the cloud account (auto upload) or this device only.
            const cloud = localStorage.getItem('bizzybee_session') === 'identity' && localStorage.getItem('bizzybee_auto_sync') !== 'false';
            status.textContent = `✅ Imported: ${list.join(', ')}. ${cloud ? 'Uploading to your cloud account now.' : 'Saved on THIS DEVICE ONLY - you are not signed in to the cloud here. Sign in on the live site and import again to put it in your cloud save.'}`;
            Toast.show('📥 History imported.', 'positive');
        } catch (error) {
            status.textContent = error.message || 'Could not read that file.';
            Toast.show(status.textContent, 'negative');
        }
    });
}

// About: versions, app updates, What's New (src/core/ui/updates/updates.js).
function initAbout(tries = 0) {
    const host = document.getElementById('about-card');
    if (!host) return;
    if (typeof BizzyUpdates === 'undefined') { if (tries < 50) setTimeout(() => initAbout(tries + 1), 100); return; }
    BizzyUpdates.renderAbout(host);
    // Nov 25 2026 (Craft): the old "Updates" row that was added here is gone. It was drawn before its code had
    // loaded, so it never showed. About's one Check (BizzyUpdates.renderAbout) covers the app files now.
}

// Phone features (Android app). Notifications moved to their own page
// (features/notifications/, Oct 28 2026). Here: vibration, steps, face or
// fingerprint, and the phone calendar.
function initPhoneFeatures(tries = 0) {
    const host = document.getElementById('phone-features');
    if (!host) return;
    const app = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    // In the app, native.js and phone.js load a moment after this page; wait for them.
    if (app && (typeof BizzyNative === 'undefined' || typeof BizzyPhone === 'undefined') && tries < 50) {
        setTimeout(() => initPhoneFeatures(tries + 1), 100);
        return;
    }
    const N = typeof BizzyNative !== 'undefined' ? BizzyNative : null;
    if (!app || !N) {
        host.innerHTML = `<a class="row" href="https://github.com/CraftWho/Bizzybee_App/releases/latest" target="_blank" rel="noopener"><span class="hx">📱</span><span class="mid"><b>Get the Android app</b><small>Offline reminders, steps, face or fingerprint unlock, your phone calendar and more.</small></span><span class="chev">›</span></a>`;
        return;
    }
    const sw = (id, on, label) => `<label class="toggle-switch"><input type="checkbox" id="${id}" aria-label="${label}"${on ? ' checked' : ''}><span class="toggle-switch-track"><span class="toggle-switch-thumb"></span></span></label>`;
    const C = BizzyPhone.Calendar;
    host.innerHTML = `
        <div class="row"><span class="hx">📳</span><span class="mid"><b>Vibration</b><small>Feel the egg hatch, level-ups, pulls and finished tasks.</small></span>${sw('pf-buzz', N.prefs.vibration(), 'Vibration')}</div>
        <div class="row"><span class="hx">👟</span><span class="mid"><b>Step counter</b><small id="pf-steps-note">Checking…</small></span><span id="pf-steps-act"></span></div>
        <a class="row" href="../account-security/account-security.html"><span class="hx">👆</span><span class="mid"><b>Face or fingerprint</b><small id="pf-bio-note">Unlock with your face or fingerprint instead of the App Lock PIN.</small></span><span class="chev">›</span></a>
        <div class="row"><span class="hx">📅</span><span class="mid"><b>Phone events in Calendar</b><small>Your phone's events show in the Calendar plugin. Read only.</small></span>${sw('pf-cal-show', C.showOn(), 'Phone events in Calendar')}</div>
        <div class="row"><span class="hx">🗓️</span><span class="mid"><b>To-Dos in your phone calendar</b><small>Due dates show in your phone's calendar app. They update and leave when done.</small></span>${sw('pf-cal-add', C.addOn(), 'To-Dos in phone calendar')}</div>`;
    const $ = (id) => document.getElementById(id);
    const steps = async () => {
        const st = await BizzyPhone.status('steps');
        const note = $('pf-steps-note'), act = $('pf-steps-act');
        if (st === 'granted') {
            const n = await BizzyPhone.Steps.sync().catch(() => null);
            note.textContent = `${n != null ? n.toLocaleString() : (BizzyPhone.Steps.today() || 0).toLocaleString()} steps today. Shows on Home. Dailies like "Walk 8000 steps" finish themselves.`;
            act.innerHTML = '';
        } else if (st === 'unsupported') {
            note.textContent = 'Needs the Health Connect app (built in on Android 14+).';
            act.innerHTML = '';
        } else {
            note.textContent = st === 'denied' ? 'Turned off for BizzyBee in Health Connect.' : 'Reads only your step count from Health Connect.';
            act.innerHTML = `<button type="button" class="btn" id="pf-steps-btn">${st === 'denied' ? 'Settings' : 'Turn on'}</button>`;
            $('pf-steps-btn').onclick = async () => {
                if (st === 'denied') BizzyPhone.openSettings('steps');
                else if ((await BizzyPhone.ask('steps', { force: true })) === 'granted') Toast.show('👟 Steps on. They show on Home.', 'positive');
                steps();
            };
        }
    };
    steps();
    if (typeof AppLock !== 'undefined') AppLock.bioAvailable().then(ok => {
        $('pf-bio-note').textContent = !ok ? 'Set up a face or fingerprint in your phone settings first.'
            : AppLock.bioOn() ? 'On. Unlocks the app with your face or fingerprint.'
            : AppLock.hasPin() ? 'Off. Tap to turn it on next to your App Lock PIN.' : 'Set an App Lock PIN first, then turn this on.';
    });
    $('pf-buzz').addEventListener('change', e => { N.set('buzz', e.target.checked); Toast.show(e.target.checked ? '📳 Vibration on.' : 'Vibration off. Reopen the app to apply.', 'positive'); if (e.target.checked) N.buzz(60); });
    $('pf-cal-show').addEventListener('change', async e => {
        const ok = await C.setShow(e.target.checked);
        if (!ok) { e.target.checked = false; return; }
        Toast.show(e.target.checked ? '📅 Phone events now show in Calendar.' : 'Phone events hidden from Calendar.', 'positive');
    });
    $('pf-cal-add').addEventListener('change', async e => {
        const box = e.target; box.disabled = true;
        const ok = await C.setAdd(box.checked);
        box.disabled = false;
        if (!ok) { box.checked = false; return; }
        Toast.show(box.checked ? '🗓️ Hard To-Do due dates added to your phone calendar.' : 'Removed BizzyBee To-Dos from your phone calendar.', 'positive');
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') steps(); });
}

// Hints + Hive Coach (src/core/ui/hints/hints.js).
function initHints() {
    const toggle = document.getElementById('hints-toggle');
    if (!toggle) return;
    toggle.checked = Vault.hintsOn();
    toggle.addEventListener('change', () => {
        if (typeof Hints !== 'undefined') Hints.setOn(toggle.checked); else Vault.setHintsOn(toggle.checked);
        Toast.show(toggle.checked ? '💡 Hints on.' : 'Hints off.', 'positive');
    });
    document.getElementById('hints-reset').addEventListener('click', () => {
        if (typeof Hints !== 'undefined') Hints.resetAll(); else Vault.resetHints();
        toggle.checked = true;
        Toast.show('💡 Every page will show its tips again.', 'positive');
    });
}

// Time tracking: the "how long did it take?" pop-up (time-log.js).
function initTimeTracking() {
    const toggle = document.getElementById('timelog-toggle');
    if (!toggle) return;
    // Nov 7 2026 (Craft): it always asks now (real hours), so no switch.
    const row = toggle.closest('.row'); if (row) { row.querySelector('small').textContent = 'Always on: log real minutes, or fill them in later from the 🔴 list.'; toggle.closest('label').hidden = true; }
    toggle.checked = localStorage.getItem('bizzybee_ask_time') !== 'off';
    toggle.addEventListener('change', () => {
        localStorage.setItem('bizzybee_ask_time', toggle.checked ? 'on' : 'off');
        Toast.show(toggle.checked ? '⏱️ Will ask how long things take.' : 'Planned times will count.', 'positive');
    });
}

// Permissions + Weather (src/core/services/phone/phone.js, Oct 27 2026).
function initPermissions(tries = 0) {
    const host = document.getElementById('permissions-card');
    if (!host) return;
    if (typeof BizzyPhone === 'undefined') { if (tries < 50) setTimeout(() => initPermissions(tries + 1), 100); return; }
    BizzyPhone.renderPage(host);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') BizzyPhone.renderPage(host); });
}

function initWeather(tries = 0) {
    const host = document.getElementById('weather-card');
    if (!host) return;
    if (typeof BizzyPhone === 'undefined') { if (tries < 50) setTimeout(() => initWeather(tries + 1), 100); return; }
    const W = BizzyPhone.Weather;
    const q = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const city = W.city();
    host.innerHTML = `
        <div class="row"><span class="hx">🌦️</span><span class="mid"><b>Weather on Home</b><small id="wx-now">Off</small></span>
            <select id="wx-mode" aria-label="Weather"><option value="off">Off</option><option value="area">My area</option><option value="city">A city</option></select></div>
        <div class="pf-sub" id="wx-city-box" hidden>
            <label>City <span class="pf-pick"><input id="wx-city" placeholder="e.g. Kissimmee" value="${q(city ? city.name.split(',')[0] : '')}"><button type="button" class="btn" id="wx-find">Find</button></span></label>
            <div id="wx-results"></div>
            <small>No permission needed when you pick a city.</small>
        </div>
        <div class="row"><span class="hx">🌡️</span><span class="mid"><b>Units</b><small>Fahrenheit or Celsius</small></span>
            <select id="wx-unit" aria-label="Units"><option value="F">°F</option><option value="C">°C</option></select></div>`;
    const $ = (id) => document.getElementById(id);
    $('wx-mode').value = W.mode(); $('wx-unit').value = W.unit();
    const refresh = async () => {
        $('wx-city-box').hidden = $('wx-mode').value !== 'city';
        if (W.mode() === 'off') { $('wx-now').textContent = 'Off'; return; }
        $('wx-now').textContent = 'Checking…';
        const w = await W.now().catch(() => null);
        $('wx-now').textContent = w ? `${w.icon} ${w.temp}°${w.unit} · ${w.text} · ${w.place}` : (W.mode() === 'city' ? 'Pick a city below.' : 'Allow approximate location to see it.');
    };
    $('wx-mode').addEventListener('change', async e => {
        const m = e.target.value;
        if (m === 'area') {
            const r = await BizzyPhone.ask('location', { force: true });
            if (r !== 'granted') { e.target.value = W.mode(); Toast.show('Pick "A city" instead. No permission needed.', 'neutral'); return; }
        }
        if (m === 'city' && !W.city()) { W.setMode('off'); $('wx-city-box').hidden = false; $('wx-city').focus(); return; }
        W.setMode(m); refresh();
    });
    $('wx-unit').addEventListener('change', e => { W.setUnit(e.target.value); refresh(); });
    $('wx-find').addEventListener('click', async () => {
        const v = $('wx-city').value.trim();
        if (!v) return;
        $('wx-results').innerHTML = '<small>Searching…</small>';
        const list = await W.findCity(v).catch(() => []);
        $('wx-results').innerHTML = list.length ? list.map((c, i) => `<button type="button" class="btn wx-pick" data-i="${i}">${q(c.name)}</button>`).join('') : '<small>No match. Try another spelling.</small>';
        $('wx-results').onclick = (e) => {
            const b = e.target.closest('.wx-pick');
            if (!b) return;
            W.setCity(list[Number(b.dataset.i)]);
            $('wx-mode').value = 'city';
            $('wx-results').innerHTML = '';
            refresh();
        };
    });
    refresh();
}
