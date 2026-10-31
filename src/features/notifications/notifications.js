// Notifications page (Oct 28 2026, approved demo). Everything that can
// notify you, in one place:
//   - one switch for this device (Android app: the phone sends them;
//     website: web push through the cloud account)
//   - "Coming up": the real list (services/notify/notify.js), tap to open
//   - a switch and options for each type
//   - Smart Notifications, sounds and vibration (sounds: app only)
const isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sw = (id, on, label) => `<label class="toggle-switch"><input type="checkbox" id="${id}" aria-label="${esc(label)}"${on ? ' checked' : ''}><span class="toggle-switch-track"><span class="toggle-switch-thumb"></span></span></label>`;
const LEVEL_COLOR = { 1: '#7d6d4d', 2: '#ffcc00', 3: '#ff9a3c', 4: '#dc143c' };
const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// The types and their options. Keys match BizzyNotify.prefs().
const TYPES = [
    { k: 'todo', ic: '✅', name: 'To-Do deadlines', sub: 'Before a To-Do is due. Times work when the To-Do has a due time.',
        chips: [['at', 'At the time'], ['m15', '15 min before'], ['h1', '1 hour before'], ['morning', 'Morning of (9 AM)']] },
    { k: 'daily', ic: '☀️', name: 'Dailies', sub: 'At the reminder times on each daily.',
        chips: [['nudge', 'Nudge at 6 PM if a daily has no time']] },
    { k: 'habit', ic: '🔁', name: 'Habits', sub: 'One nudge a day for good habits you haven\'t tapped.', time: true },
    { k: 'start', ic: '🌅', name: 'Start My Day', sub: 'A morning prompt. Skipped if you already did it.', time: true },
    { k: 'checkin', ic: '🌙', name: 'Evening check-in', sub: '"3 dailies left today"', time: true },
];

let N = null;   // BizzyNative in the app

// ------------------------------------------------------------ the master switch
async function masterState() {
    if (isApp) {
        const perm = await N.permission(false);
        if (perm !== 'granted') return { on: false, note: 'Notifications are blocked. Turn this on to allow them.' };
        return { on: N.prefs.reminders(), note: N.prefs.reminders() ? 'On. The phone sends them, even offline.' : 'Off. Nothing will notify you on this phone.' };
    }
    if (typeof BizzyPush === 'undefined' || !BizzyPush.supported()) return { on: false, note: 'This browser can\'t do notifications. Try Chrome, or the Android app.', disabled: true };
    return { on: BizzyPush.isOn(), note: BizzyPush.isOn() ? 'On. Sent by BizzyBee\'s server, even when the site is closed. Can be up to 2–3 minutes off.' : 'Off. Needs your cloud account.' };
}
async function renderMaster() {
    const s = await masterState();
    $('nt-master').checked = s.on;
    $('nt-master').disabled = !!s.disabled;
    $('nt-master-note').textContent = s.note;
    if (isApp) $('nt-exact').hidden = !(s.on && !(await N.exactAlarmsOk()));
}
function initMaster() {
    $('nt-master').addEventListener('change', async (e) => {
        const box = e.target;
        box.disabled = true;
        try {
            if (isApp) {
                if (box.checked && (await N.permission(true)) !== 'granted') { box.checked = false; Toast.show('Allow notifications for BizzyBee in Android settings.', 'negative'); }
                N.set('rem', box.checked);
            } else if (box.checked) {
                const out = await BizzyPush.enable();
                Toast.show(`🔔 On. ${out.upcoming || 0} coming up in the next 10 days.`, 'positive');
            } else {
                await BizzyPush.disable();
            }
        } catch (error) {
            if (!isApp) await BizzyPush.disable().catch(() => {});
            box.checked = false;
            Toast.show(error.message, 'negative');
        } finally {
            box.disabled = false;
            renderMaster(); renderUp();
        }
    });
    $('nt-exact-btn').addEventListener('click', () => N.openExactAlarmSettings());
}

// ------------------------------------------------------------------ coming up
let showAll = false;
const dayWord = (d) => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const n = Math.round((x - t) / 86400000);
    return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' });
};
async function renderUp() {
    const list = $('nt-up');
    const on = (await masterState()).on;
    if (!on) { list.innerHTML = '<li class="nt-empty">Notifications are off on this device.</li>'; return; }
    const items = BizzyNotify.plan({ days: isApp ? 3 : 10, limit: 120 });
    if (!items.length) { list.innerHTML = '<li class="nt-empty">Nothing coming up. Turn a type on below, or give a task a reminder time.</li>'; return; }
    const shown = showAll ? items : items.slice(0, 8);
    list.innerHTML = shown.map(a => `<li><a href="${esc(a.url)}">
        <span class="lvl" style="background:${LEVEL_COLOR[a.level] || LEVEL_COLOR[2]}" title="Level ${a.level}"></span>
        <span class="when">${dayWord(a.at)}<br>${a.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        <span class="what"><b>${esc(a.label || a.title)}</b><small>${esc(a.title.replace(/^🐝\s*/, ''))}${a.note ? ' · ' + esc(a.note) : ''}${a.level === 4 ? ' · alarm' : ''}</small></span>
        <span class="chev" aria-hidden="true">›</span></a></li>`).join('')
        + (items.length > 8 ? `<li><button type="button" class="nt-more" id="nt-more">${showAll ? 'Show less' : `Show all ${items.length}`}</button></li>` : '');
    const more = $('nt-more');
    if (more) more.onclick = () => { showAll = !showAll; renderUp(); };
}

// ---------------------------------------------------------------- the types
function renderTypes() {
    const P = BizzyNotify.prefs();
    $('nt-types').innerHTML = TYPES.map(t => {
        const p = P[t.k];
        const body = t.chips
            ? `<div class="nt-chips">${t.chips.map(([key, label]) => `<button type="button" class="nt-chip" data-t="${t.k}" data-opt="${key}" aria-pressed="${!!p[key]}">${esc(label)}</button>`).join('')}</div>`
            : `<div class="row"><span class="mid"><b>Time</b><small>Every day</small></span><input type="time" data-time="${t.k}" value="${esc(p.time)}" aria-label="${esc(t.name)} time"></div>`;
        return `<section class="card nt-type${p.on ? '' : ' off'}" data-card="${t.k}">
            <div class="row"><span class="hx">${t.ic}</span><span class="mid"><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></span>${sw('nt-on-' + t.k, p.on, t.name)}</div>
            <div class="nt-body">${body}</div></section>`;
    }).join('');
}
function changed() {
    if (isApp && N) N.reschedule();
    if (typeof BizzyPush !== 'undefined' && BizzyPush.isOn()) { localStorage.removeItem('bizzybee_push_hash'); BizzyPush.refresh(); }
    renderUp();
}
function initTypes() {
    renderTypes();
    const host = $('nt-types');
    host.addEventListener('change', (e) => {
        const on = e.target.id && e.target.id.startsWith('nt-on-') ? e.target.id.slice(6) : null;
        if (on) {
            BizzyNotify.setPref(on, { on: e.target.checked });
            e.target.closest('.nt-type').classList.toggle('off', !e.target.checked);
            changed(); return;
        }
        const t = e.target.dataset.time;
        if (t && /^\d{2}:\d{2}$/.test(e.target.value)) { BizzyNotify.setPref(t, { time: e.target.value }); changed(); }
    });
    host.addEventListener('click', (e) => {
        const c = e.target.closest('.nt-chip');
        if (!c) return;
        const now = c.getAttribute('aria-pressed') !== 'true';
        c.setAttribute('aria-pressed', String(now));
        BizzyNotify.setPref(c.dataset.t, { [c.dataset.opt]: now });
        changed();
    });
}

// ------------------------------------------------------------------- smart
function initSmart() {
    const smart = get('bizzybee_smart_notify', 'off') === 'on';
    $('nt-smart').checked = smart;
    $('nt-smart-card').classList.toggle('off', !smart);
    $('nt-quiet').value = get('bizzybee_smart_quiet', '22-7');
    $('nt-level').value = get('bizzybee_smart_level', 'normal');
    // Smart plans replace the To-Do chips, so grey those out while it's on.
    const chipsLock = () => document.querySelectorAll('[data-t="todo"].nt-chip').forEach(c => { c.disabled = $('nt-smart').checked; });
    chipsLock();
    const save = (key, val) => { if (isApp && N) N.set(key, val); else put({ smart: 'bizzybee_smart_notify', quiet: 'bizzybee_smart_quiet', level: 'bizzybee_smart_level' }[key], typeof val === 'string' ? val : (val ? 'on' : 'off')); changed(); };
    $('nt-smart').addEventListener('change', (e) => {
        save('smart', e.target.checked);
        $('nt-smart-card').classList.toggle('off', !e.target.checked);
        chipsLock();
        Toast.show(e.target.checked ? '🧠 Smart Notifications on. Hard tasks will keep after you.' : 'Smart Notifications off.', 'positive');
    });
    $('nt-quiet').addEventListener('change', (e) => save('quiet', e.target.value));
    $('nt-level').addEventListener('change', (e) => save('level', e.target.value));
}

// ------------------------------------------------------------ sound & vibration
function initSound() {
    $('nt-names').checked = get('bizzybee_push_names', '1') !== '0';
    $('nt-names').addEventListener('change', (e) => {
        if (typeof BizzyPush !== 'undefined') BizzyPush.setShowNames(e.target.checked); else put('bizzybee_push_names', e.target.checked ? '1' : '0');
        changed();
    });
    const appRows = document.querySelectorAll('.nt-app');
    if (!isApp || !N) {
        appRows.forEach(r => { r.classList.add('web'); r.querySelector('small').textContent = 'In the Android app.'; });
        $('nt-rhythm').innerHTML = '<option>Double buzz</option>';
        return;
    }
    const p = N.prefs;
    $('nt-rhythm').innerHTML = Object.entries(N.RHYTHMS).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join('');
    $('nt-rhythm').value = p.rhythm();
    if (!N.hasAlertSettings()) {
        appRows.forEach(r => { r.classList.add('web'); r.querySelector('small').textContent = 'Update the app to pick sounds.'; });
        return;
    }
    const fill = async (sel, kind, cur) => {
        const r = await N.sounds(kind);
        sel.insertAdjacentHTML('beforeend', (r.sounds || []).map(x => `<option value="${esc(x.uri)}">${esc(x.title)}</option>`).join(''));
        sel.value = cur;
        if (sel.value !== cur) sel.value = 'default';
    };
    fill($('nt-sound'), 'notification', p.sound());
    fill($('nt-alarm'), 'alarm', p.alarmSound());
    $('nt-sound').addEventListener('change', e => { N.set('sound', e.target.value); N.previewSound(e.target.value, false); });
    $('nt-alarm').addEventListener('change', e => { N.set('alarmSound', e.target.value); N.previewSound(e.target.value, true); });
    $('nt-rhythm').addEventListener('change', e => { N.set('rhythm', e.target.value); N.previewRhythm(e.target.value); });
    $('nt-sound-card').addEventListener('click', e => {
        const b = e.target.closest('[data-play]');
        if (!b) return;
        if (b.dataset.play === 'rhythm') N.previewRhythm($('nt-rhythm').value);
        else N.previewSound(b.dataset.play === 'alarm' ? $('nt-alarm').value : $('nt-sound').value, b.dataset.play === 'alarm');
    });
}

// ------------------------------------------------------------------ buttons
function initButtons() {
    $('nt-sys').textContent = isApp ? 'Phone settings' : 'Browser help';
    $('nt-test').addEventListener('click', async () => {
        const b = $('nt-test');
        b.disabled = true;
        try {
            if (isApp) {
                if ((await N.permission(true)) !== 'granted') return;
                await window.Capacitor.Plugins.LocalNotifications.schedule({ notifications: [{ id: 424242, title: '🐝 Test alert', body: 'Notifications work. Tap to open Notifications.', channelId: N.channelFor(3),
                    schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, smallIcon: 'ic_stat_bee', iconColor: '#FFCC00',
                    extra: { test: true, kind: 'test', url: '/src/features/notifications/notifications.html' } }] });
                Toast.show('🧪 Test alert in 5 seconds. Lock your phone to see it.', 'positive');
            } else {
                if (!BizzyPush.isOn()) { Toast.show('Turn notifications on first.', 'neutral'); return; }
                await BizzyPush.test();
                Toast.show('🔔 Test sent. It arrives in a few seconds.', 'positive');
            }
        } catch (error) { Toast.show(error.message, 'negative'); }
        finally { b.disabled = false; }
    });
    $('nt-sys').addEventListener('click', () => {
        if (isApp && typeof BizzyPhone !== 'undefined') BizzyPhone.openSettings('notifications');
        else Toast.show('Click the lock icon next to the web address, then allow Notifications.', 'neutral', { ms: 7000 });
    });
    $('nt-foot').textContent = isApp
        ? 'Tap a notification to open that task. Done and Snooze work right on the alert.'
        : 'Tap a notification to open that task. The Android app adds sounds, alarms and offline reminders.';
}

async function start(tries = 0) {
    // In the app, native.js loads a moment after this page. Wait for it.
    if (isApp && typeof BizzyNative === 'undefined' && tries < 50) { setTimeout(() => start(tries + 1), 100); return; }
    N = isApp && typeof BizzyNative !== 'undefined' ? BizzyNative : null;
    await Vault.init();
    $('nt-device').textContent = isApp ? 'This phone · Android app' : 'This browser · Website';
    initMaster(); initTypes(); initSmart(); initSound(); initButtons();
    await renderMaster();
    renderUp();
    window.addEventListener('vault-saved', () => renderUp());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderMaster(); renderUp(); } });
}
document.addEventListener('DOMContentLoaded', () => start());
