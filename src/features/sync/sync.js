console.log("/// PHONE SYNC ONLINE ///");

// Phone Sync (Oct 2026, approved demo). The calendar feed link works now
// (netlify/functions/calendar-feed.mjs). Google Calendar / Tasks two-way
// sync needs a Google Cloud setup first, so those show "Setup needed".
let feed = { enabled: false, url: null, items: { events: true, todos: true, dailies: false } };

function waitForCloud(ms = 8000) {
    return new Promise(resolve => {
        const start = Date.now();
        (function check() {
            if (typeof CloudSyncAuto !== 'undefined') return resolve(CloudSyncAuto);
            if (Date.now() - start > ms) return resolve(null);
            setTimeout(check, 200);
        })();
    });
}

function renderFeed(message) {
    const sw = document.getElementById('sy-feed-sw');
    sw.setAttribute('aria-checked', String(feed.enabled));
    document.getElementById('sy-feed').classList.toggle('on', feed.enabled);
    document.getElementById('sy-feed-on').hidden = !feed.enabled;
    document.getElementById('sy-feed-status').textContent = message || (feed.enabled ? 'On.' : 'Off.');
    if (feed.enabled) {
        document.getElementById('sy-feed-url').value = feed.url;
        const webcal = feed.url.replace(/^https:/, 'webcal:');
        document.getElementById('sy-google').href = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
        document.querySelectorAll('[data-item]').forEach(cb => { cb.checked = !!feed.items[cb.dataset.item]; });
    }
}

function confirmBox(title, text, yes) {
    return new Promise(resolve => {
        const m = document.getElementById('sy-modal');
        m.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="sy-mt"><h3 id="sy-mt">${title}</h3><p>${text}</p>
            <div class="row2"><button type="button" class="btn" data-a="no">Cancel</button><button type="button" class="btn solid" data-a="yes">${yes}</button></div></div>`;
        m.hidden = false;
        m.querySelector('[data-a=yes]').focus();
        const done = (ok) => { m.hidden = true; document.removeEventListener('keydown', key); resolve(ok); };
        const key = (e) => { if (e.key === 'Escape') done(false); };
        document.addEventListener('keydown', key);
        m.onclick = (e) => { const a = e.target.closest('[data-a]'); if (a) done(a.dataset.a === 'yes'); else if (e.target === m) done(false); };
    });
}

async function feedCall(cloud, body) {
    const r = await cloud.request('calendar-feed', body);
    feed = { enabled: r.enabled, url: r.url, items: r.items };
}

async function initFeed() {
    const sw = document.getElementById('sy-feed-sw');
    if (localStorage.getItem('bizzybee_session') !== 'identity' || (typeof Vault !== 'undefined' && Vault.devTest)) {
        renderFeed('Sign in to Cloud Sync (Settings) to make a link. The feed reads your cloud save.');
        return;
    }
    renderFeed('Checking…');
    const cloud = await waitForCloud();
    if (!cloud) { renderFeed('Cloud is still connecting. Reload in a moment.'); return; }
    try { await feedCall(cloud); renderFeed(); sw.disabled = false; }
    catch (error) { renderFeed(error.message); return; }

    sw.addEventListener('click', async () => {
        const turningOn = !feed.enabled;
        if (!turningOn && !(await confirmBox('Turn off the feed?', 'The link stops working. Bizzybee disappears from calendars that use it.', 'Turn off'))) return;
        sw.disabled = true;
        try { await feedCall(cloud, { action: turningOn ? 'enable' : 'disable', items: feed.items }); renderFeed(); Toast.show(turningOn ? '🔗 Feed link ready.' : 'Feed link turned off.', 'positive'); }
        catch (error) { Toast.show(error.message, 'negative'); }
        sw.disabled = false;
    });
    document.querySelectorAll('[data-item]').forEach(cb => cb.addEventListener('change', async () => {
        const items = { ...feed.items, [cb.dataset.item]: cb.checked };
        try { await feedCall(cloud, { action: 'items', items }); renderFeed('Saved. Calendars pick it up on their next check.'); }
        catch (error) { cb.checked = !cb.checked; Toast.show(error.message, 'negative'); }
    }));
    document.getElementById('sy-rotate').addEventListener('click', async () => {
        if (!(await confirmBox('Make a new link?', 'The old link stops working. You will need to add the new one to your calendar again.', 'New link'))) return;
        try { await feedCall(cloud, { action: 'rotate', items: feed.items }); renderFeed('New link made. Add it to your calendar again.'); }
        catch (error) { Toast.show(error.message, 'negative'); }
    });
    document.getElementById('sy-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(feed.url); Toast.show('Link copied.', 'positive'); }
        catch { const i = document.getElementById('sy-feed-url'); i.select(); Toast.show('Press Ctrl+C to copy.', 'positive'); }
    });
}

function initStatus() {
    setTimeout(() => {
        const push = typeof BizzyPush !== 'undefined' && BizzyPush.isOn();
        document.getElementById('sy-push-status').textContent = push ? 'On.' : 'Off.';
        document.getElementById('sy-push').classList.toggle('on', push);
        const hab = typeof HabiticaSync !== 'undefined' && HabiticaSync.isConnected();
        document.getElementById('sy-habitica-status').textContent = hab ? 'Connected on this device.' : 'Not connected on this device.';
        document.getElementById('sy-habitica').classList.toggle('on', hab);
    }, 1500);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    Waggle.setActions(baseWaggleActions());
    initStatus();
    initFeed();
});
