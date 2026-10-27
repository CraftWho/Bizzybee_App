console.log("/// SETTINGS PROTOCOLS INITIALIZED ///");

function downloadFile(content, filename, mimeType) {
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
    initPhoneReminders();
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
        const snapshot = Vault.exportFullState() || localStorage.getItem(Vault.storageKey);
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
                downloadFile(JSON.stringify(encrypted), 'bizzybee-full-save.json', 'application/json');
                Toast.show('🔐 Full save exported (encrypted).', 'positive');
            } catch (error) {
                Toast.show('⚠️ Encryption failed - export cancelled.', 'negative');
            }
            return;
        }

        downloadFile(snapshot, 'bizzybee-full-save.json', 'application/json');
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

// Phone reminders (src/core/services/push/push.js).
function initPhoneReminders() {
    const checkin = document.getElementById('push-checkin');
    if (checkin) {
        checkin.value = localStorage.getItem('bizzybee_checkin') || '20:00';
        checkin.addEventListener('change', () => { localStorage.setItem('bizzybee_checkin', checkin.value); localStorage.removeItem('bizzybee_push_hash'); if (typeof BizzyPush !== 'undefined') BizzyPush.refresh(); });
    }
    const toggle = document.getElementById('push-toggle');
    const names = document.getElementById('push-names-toggle');
    const test = document.getElementById('push-test-btn');
    const status = document.getElementById('push-status');
    if (!toggle || typeof BizzyPush === 'undefined') return;
    const render = (message) => {
        toggle.checked = BizzyPush.isOn();
        names.checked = BizzyPush.showNames();
        test.disabled = !BizzyPush.isOn();
        if (message) status.textContent = message;
        else if (!BizzyPush.supported()) status.textContent = 'This browser can\'t do phone notifications. Try Chrome.';
        else status.textContent = BizzyPush.isOn() ? 'On. Reminders arrive even when the app is closed.' : 'Off.';
    };
    render();
    toggle.addEventListener('change', async () => {
        toggle.disabled = true;
        try {
            if (toggle.checked) {
                const out = await BizzyPush.enable();
                render(`On. ${out.upcoming || 0} reminder${out.upcoming === 1 ? '' : 's'} coming up in the next 10 days.`);
                Toast.show('🔔 Phone reminders on.', 'positive');
            } else {
                await BizzyPush.disable();
                render();
            }
        } catch (error) {
            await BizzyPush.disable().catch(() => {});
            render(error.message);
            Toast.show(error.message, 'negative');
        } finally {
            toggle.disabled = false;
        }
    });
    names.addEventListener('change', () => BizzyPush.setShowNames(names.checked));
    test.addEventListener('click', async () => {
        test.disabled = true;
        try { await BizzyPush.test(); Toast.show('🔔 Test sent.', 'positive'); }
        catch (error) { Toast.show(error.message, 'negative'); }
        finally { test.disabled = !BizzyPush.isOn(); }
    });
}

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
}

// Phone features (src/core/services/native/native.js). Only works in the
// Android app; the website shows a link to get it.
function initPhoneFeatures(tries = 0) {
    const host = document.getElementById('phone-features');
    if (!host) return;
    // In the app, native.js loads a moment after this page; wait for it.
    if (typeof BizzyNative === 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && tries < 40) {
        setTimeout(() => initPhoneFeatures(tries + 1), 100);
        return;
    }
    const N = typeof BizzyNative !== 'undefined' ? BizzyNative : null;
    if (!N || !N.isApp) {
        host.innerHTML = `<a class="row" href="https://github.com/CraftWho/Bizzybee_App/releases/latest" target="_blank" rel="noopener"><span class="hx">📱</span><span class="mid"><b>Get the Android app</b><small>Phone reminders that work offline, Smart Notifications, vibration and more.</small></span><span class="chev">›</span></a>`;
        return;
    }
    // In the app, the phone schedules reminders itself, so hide web push.
    const pushRow = document.getElementById('push-toggle')?.closest('.row');
    if (pushRow) { pushRow.hidden = true; const inner = pushRow.nextElementSibling; if (inner && inner.classList.contains('inner')) inner.hidden = true; }
    const sw = (id, on, label) => `<label class="toggle-switch"><input type="checkbox" id="${id}" aria-label="${label}"${on ? ' checked' : ''}><span class="toggle-switch-track"><span class="toggle-switch-thumb"></span></span></label>`;
    const soon = '<span class="pf-soon">NEXT UPDATE</span>';
    const p = N.prefs;
    host.innerHTML = `
        <div class="row"><span class="hx">🔔</span><span class="mid"><b>Phone reminders</b><small id="pf-rem-status">Your reminder times, sent by the phone. Tap Done or Snooze on the alert.</small></span>${sw('pf-rem', p.reminders(), 'Phone reminders')}</div>
        <div class="pf-sub" id="pf-sound-sub">
            <label>🔊 Reminder sound <span class="pf-pick"><select id="pf-sound"><option value="default">Phone default</option><option value="none">Silent</option></select><button type="button" class="pf-play" data-play="sound" aria-label="Play reminder sound">▶</button></span></label>
            <label>⏰ Alarm sound <span class="pf-pick"><select id="pf-alarm"><option value="default">Phone alarm</option><option value="none">Silent</option></select><button type="button" class="pf-play" data-play="alarm" aria-label="Play alarm sound">▶</button></span></label>
            <label>〰️ Vibration rhythm <span class="pf-pick"><select id="pf-rhythm"></select><button type="button" class="pf-play" data-play="rhythm" aria-label="Feel the rhythm">▶</button></span></label>
            <small id="pf-sound-note">Alarm sound is for To-Do deadlines with Smart Notifications.</small>
        </div>
        <div class="row"><span class="hx">🧠</span><span class="mid"><b>Smart Notifications <span class="pf-beta">BETA</span></b><small>Harder tasks and close deadlines remind you more, and louder, until they're done.</small></span>${sw('pf-smart', p.smart(), 'Smart Notifications')}</div>
        <div class="pf-sub" id="pf-smart-sub"${p.smart() ? '' : ' hidden'}>
            <label>Quiet hours <select id="pf-quiet"><option value="22-7">10 PM – 7 AM</option><option value="23-8">11 PM – 8 AM</option><option value="off">Off</option></select></label>
            <label>How much it nags <select id="pf-level"><option value="gentle">Gentle</option><option value="normal">Normal</option><option value="relentless">Relentless</option></select></label>
            <small>Quiet hours pause the nudges. A To-Do deadline alarm still rings. To-Dos with no reminder time count 9 PM on the due day as the deadline.</small>
        </div>
        <div class="row" id="pf-exact" hidden><span class="hx">⏰</span><span class="mid"><b>Exact timing is off</b><small>Android may delay reminders by a few minutes. Turn on "Alarms &amp; reminders" for BizzyBee.</small></span><button type="button" class="btn" id="pf-exact-btn">Fix</button></div>
        <div class="row"><span class="hx">🌙</span><span class="mid"><b>Evening check-in</b><small>"3 dailies left today", even with no reminder times set</small></span><select id="pf-checkin" aria-label="Evening check-in"><option value="off">Off</option><option value="18:00">6 PM</option><option value="19:00">7 PM</option><option value="20:00">8 PM</option><option value="21:00">9 PM</option><option value="22:00">10 PM</option></select></div>
        <div class="row"><span class="hx">🧪</span><span class="mid"><b>Send a test</b><small>A loud test alert in 5 seconds. Lock your phone to see it.</small></span><button type="button" class="btn" id="pf-test">Test</button></div>
        <div class="row"><span class="hx">📳</span><span class="mid"><b>Vibration</b><small>Feel the egg hatch, level-ups, pulls and finished tasks.</small></span>${sw('pf-buzz', p.vibration(), 'Vibration')}</div>
        <div class="row"><span class="hx">👆</span><span class="mid"><b>Fingerprint unlock</b><small>Open the app with your fingerprint instead of the PIN.</small></span>${soon}</div>
        <div class="row"><span class="hx">👟</span><span class="mid"><b>Steps</b><small>From Health Connect. Step dailies finish themselves and give Fitness XP.</small></span>${soon}</div>
        <div class="row"><span class="hx">📅</span><span class="mid"><b>Phone calendar</b><small>See your phone's events in Calendar. Add To-Do due dates to it.</small></span>${soon}</div>
        <div class="row"><span class="hx">⚡</span><span class="mid"><b>Shortcuts &amp; sharing</b><small>Long-press the icon for Start My Day or New To-Do. Share text from any app to make a To-Do.</small></span>${soon}</div>`;
    const $ = (id) => document.getElementById(id);
    $('pf-quiet').value = p.quiet(); $('pf-level').value = p.level();
    $('pf-checkin').value = localStorage.getItem('bizzybee_checkin') || '20:00';
    $('pf-checkin').addEventListener('change', e => { localStorage.setItem('bizzybee_checkin', e.target.value); N.reschedule(); });
    // Sound + rhythm (needs app 1.0.5+, which has the native BeeAlerts piece).
    $('pf-rhythm').innerHTML = Object.entries(N.RHYTHMS).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('');
    $('pf-rhythm').value = p.rhythm();
    if (!N.hasAlertSettings()) {
        $('pf-sound-sub').querySelectorAll('select, button').forEach(x => { x.disabled = true; });
        $('pf-sound-note').textContent = 'Update the app to the newest version on GitHub to pick sounds and rhythms.';
    } else {
        const q = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const fill = async (sel, kind, cur) => {
            const r = await N.sounds(kind);
            sel.insertAdjacentHTML('beforeend', (r.sounds || []).map(x => `<option value="${q(x.uri)}">${q(x.title)}</option>`).join(''));
            sel.value = cur;
            if (sel.value !== cur) sel.value = 'default';
        };
        fill($('pf-sound'), 'notification', p.sound());
        fill($('pf-alarm'), 'alarm', p.alarmSound());
    }
    $('pf-sound').addEventListener('change', e => { N.set('sound', e.target.value); N.previewSound(e.target.value, false); });
    $('pf-alarm').addEventListener('change', e => { N.set('alarmSound', e.target.value); N.previewSound(e.target.value, true); });
    $('pf-rhythm').addEventListener('change', e => { N.set('rhythm', e.target.value); N.previewRhythm(e.target.value); });
    $('pf-sound-sub').addEventListener('click', e => {
        const b = e.target.closest('[data-play]');
        if (!b) return;
        e.preventDefault();
        if (b.dataset.play === 'rhythm') N.previewRhythm($('pf-rhythm').value);
        else N.previewSound(b.dataset.play === 'alarm' ? $('pf-alarm').value : $('pf-sound').value, b.dataset.play === 'alarm');
    });
    const status = async () => {
        const perm = await N.permission(false);
        $('pf-rem-status').textContent = perm === 'granted' ? (p.reminders() ? 'On. Works offline. Tap Done or Snooze on the alert.' : 'Off.') : 'Notifications are blocked. Turn this on to allow them.';
        $('pf-exact').hidden = !(p.reminders() && !(await N.exactAlarmsOk()));
    };
    $('pf-rem').addEventListener('change', async e => {
        if (e.target.checked && (await N.permission(true)) !== 'granted') { e.target.checked = false; Toast.show('Allow notifications for BizzyBee in Android settings.', 'negative'); }
        N.set('rem', e.target.checked); status();
    });
    $('pf-smart').addEventListener('change', async e => {
        if (e.target.checked && (await N.permission(true)) !== 'granted') { e.target.checked = false; return; }
        N.set('smart', e.target.checked); $('pf-smart-sub').hidden = !e.target.checked;
        Toast.show(e.target.checked ? '🧠 Smart Notifications on. Hard tasks will keep after you.' : 'Smart Notifications off.', 'positive');
    });
    $('pf-quiet').addEventListener('change', e => N.set('quiet', e.target.value));
    $('pf-level').addEventListener('change', e => N.set('level', e.target.value));
    $('pf-buzz').addEventListener('change', e => { N.set('buzz', e.target.checked); Toast.show(e.target.checked ? '📳 Vibration on.' : 'Vibration off. Reopen the app to apply.', 'positive'); if (e.target.checked) N.buzz(60); });
    $('pf-exact-btn').addEventListener('click', () => N.openExactAlarmSettings());
    $('pf-test').addEventListener('click', async () => {
        if ((await N.permission(true)) !== 'granted') return;
        const ln = window.Capacitor.Plugins.LocalNotifications;
        await ln.schedule({ notifications: [{ id: 424242, title: '🐝 Test alert', body: 'Phone reminders work. Tap Done or Snooze to try them.', channelId: N.channelFor(3),
            schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, smallIcon: 'ic_stat_bee', iconColor: '#FFCC00', extra: { test: true } }] });
        Toast.show('🧪 Test alert in 5 seconds.', 'positive');
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') status(); });
    status();
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
