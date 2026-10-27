// What's New + app updates (Oct 27 2026, approved demo).
//  - What's New: shows once after each website update, grouped New /
//    Improved / Fixed, with TRY buttons. Settings › About lists them all.
//  - App updates (Android app only): checks GitHub for a newer APK, then
//    downloads and installs it in the app (native BeeUpdater, app 1.0.6+).
//    The repo is private for now, so the app needs a read-only GitHub token
//    (Settings › About). When releases go public, no token is needed.
const APP_WEB_VERSION = '1.0.4';
const WHATS_NEW = [
    { version: '1.0.4', date: 'Oct 2026',
      new: [
        { icon: '🔔', title: 'Phone reminders', text: 'In the Android app. Work offline, with Done and Snooze on the alert.', href: 'features/settings/settings.html#phone-features' },
        { icon: '🌙', title: 'Evening check-in', text: '"3 dailies left today" at a time you pick. Works on the website too.', href: 'features/settings/settings.html#phone-features' },
        { icon: '🧠', title: 'Smart Notifications (beta)', text: 'Hard tasks and close deadlines keep after you.', href: 'features/settings/settings.html#phone-features' },
        { icon: '🔊', title: 'Alert sounds and rhythms', text: 'Pick your reminder sound, alarm sound and vibration rhythm.', href: 'features/settings/settings.html#phone-features' },
        { icon: '👟', title: 'Steps', text: 'From Health Connect. "Walk 8000 steps" dailies finish themselves.', href: 'features/settings/settings.html#permissions' },
        { icon: '🌦️', title: 'Weather on Home', text: 'Your area or a city you pick.', href: 'features/settings/settings.html#weather' },
        { icon: '📷', title: 'Profile photo', text: 'Tap your picture to take or choose a new one.', href: 'features/profile/profile.html' },
        { icon: '💾', title: 'Phone backups', text: 'A copy of your save goes to a folder you pick, once a day.', href: 'features/settings/settings.html#permissions' },
        { icon: '🛡️', title: 'Permissions', text: 'Asked only when a feature needs it. See them all in Settings.', href: 'features/settings/settings.html#permissions' },
        { icon: '⬆️', title: 'App updates', text: 'The Android app tells you when an update is out, and updates itself.', href: 'features/settings/settings.html#about' },
        { icon: '🛠️', title: 'Projects plugin', text: 'All your builds in one gallery.', href: 'features/plugin-hub/plugin-hub.html' },
        { icon: '✦', title: 'Prestige Tiers', text: 'Level 50 is the top. Then come Tiers.' },
        { icon: '💡', title: 'Hints and the Hive Coach', text: 'Tips on every page, and help when a task keeps getting missed.' },
        { icon: '⏰', title: 'To-Do deadline time', text: 'Give a To-Do a time. Smart Notifications count down to it.', href: 'features/todos/create-todo.html' },
      ],
      improved: [
        { icon: '↓', title: 'Pull down to refresh', text: 'And the app syncs when you come back to it.' },
        { icon: '🔥', title: 'Streak bonus XP', text: '+20 for all dailies, more at 3, 7, 30 and 100 days.' },
        { icon: '🐝', title: 'The whole hive feels missed work', text: 'Bees can get sick, hurt or worn out. Fatigue makes them rest.' },
        { icon: '🥚', title: 'Eggs keep their secrets', text: 'No rarity, stats or job until an egg hatches.' },
        { icon: '💬', title: 'New pop-up messages', text: 'Black and gold, from the top, with OK and Go to buttons.' },
        { icon: '🛠', title: 'Movable dev button', text: 'Drag it anywhere.' },
      ],
      fixed: [
        { icon: '🩹', title: 'Header flicker on short pages', text: 'Plus quest stats, form panels and Start My Day loading twice.' },
      ] },
];

const BizzyUpdates = (() => {
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const Cap = window.Capacitor;
    const isApp = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
    const P = (n) => (isApp && Cap.Plugins && Cap.Plugins[n]) || null;
    const REPO = 'CraftWho/Bizzybee_App';
    const TOKEN_KEY = 'bizzybee_gh_token', CHECK_KEY = 'bizzybee_update_checked', LATER_KEY = 'bizzybee_update_later';
    const root = () => { const i = location.pathname.indexOf('/src/'); return i >= 0 ? location.pathname.slice(0, i) : ''; };
    const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
    const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

    // ---------------- What's New ----------------
    const seenKey = () => (typeof Vault !== 'undefined' && Vault.state && Vault.state.whatsNewSeen) || null;
    function unseen() {
        const seen = seenKey();
        return WHATS_NEW.filter(e => !seen || cmp(e.version, seen) > 0);
    }
    function markSeen() {
        if (typeof Vault === 'undefined' || !Vault.state) return;
        Vault.state.whatsNewSeen = APP_WEB_VERSION;
        Vault.save();
    }
    function itemHTML(it) {
        return `<div class="wn-it"><span class="wn-ic">${esc(it.icon)}</span><span class="wn-t">${esc(it.title)}<small>${esc(it.text)}</small></span>${it.href ? `<a class="wn-try" href="${root()}/src/${esc(it.href)}">TRY</a>` : ''}</div>`;
    }
    function entryHTML(e) {
        const grp = (cls, label, list) => list && list.length ? `<div class="wn-grp ${cls}"><h3>${label}</h3>${list.map(itemHTML).join('')}</div>` : '';
        return `<div class="wn-page"><div class="wn-top"><div class="wn-seal">🐝</div><h2>WHAT'S NEW</h2><div class="wn-sub">Version ${esc(e.version)} · ${esc(e.date)}</div></div>
            ${grp('new', '✦ NEW', e.new)}${grp('imp', '▲ IMPROVED', e.improved)}${grp('fix', '✚ FIXED', e.fixed)}</div>`;
    }
    function openWhatsNew(entries = unseen(), { onClose } = {}) {
        if (!entries.length || document.querySelector('.wn-scrim')) return;
        let i = 0;
        const s = document.createElement('div');
        s.className = 'wn-scrim';
        s.innerHTML = `<div class="wn" role="dialog" aria-modal="true" aria-label="What's new"><div class="wn-body"></div>
            <div class="wn-foot">${entries.length > 1 ? '<button type="button" class="wn-btn" data-k="prev">‹</button>' : ''}<button type="button" class="wn-btn go" data-k="ok">Got it</button>${entries.length > 1 ? '<button type="button" class="wn-btn" data-k="next">›</button>' : ''}</div>
            ${entries.length > 1 ? `<div class="wn-dots">${entries.map(() => '<i></i>').join('')}</div><p class="wn-more">Missed a few updates? Use ‹ › or swipe to see each one.</p>` : ''}</div>`;
        const body = s.querySelector('.wn-body');
        const draw = () => {
            body.innerHTML = entryHTML(entries[i]);
            s.querySelectorAll('.wn-dots i').forEach((d, n) => d.classList.toggle('on', n === i));
            const pv = s.querySelector('[data-k="prev"]'), nx = s.querySelector('[data-k="next"]');
            if (pv) pv.disabled = i === 0; if (nx) nx.disabled = i === entries.length - 1;
        };
        const close = () => { markSeen(); s.remove(); if (onClose) onClose(); };
        s.addEventListener('click', e => {
            const b = e.target.closest('[data-k]');
            if (e.target === s || (b && b.dataset.k === 'ok')) { close(); return; }
            if (b && b.dataset.k === 'prev' && i > 0) { i--; draw(); }
            if (b && b.dataset.k === 'next' && i < entries.length - 1) { i++; draw(); }
            if (e.target.closest('.wn-try')) markSeen();
        });
        let x0 = null;
        s.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
        s.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) { i = Math.max(0, Math.min(entries.length - 1, i + (dx < 0 ? 1 : -1))); draw(); } x0 = null; });
        draw();
        document.body.appendChild(s);
    }
    async function autoWhatsNew() {
        if (typeof Vault === 'undefined') return;
        await Vault.init();
        if (!Vault.state || (Vault.isOnboarding && Vault.isOnboarding())) return;
        // A brand-new player has nothing "new" to catch up on.
        if (!Vault.state.whatsNewSeen) {
            let xp = 0; try { xp = Vault.getUser().totalXP || 0; } catch {}
            if (xp === 0) { markSeen(); return; }
        }
        if (!unseen().length) return;
        // Wait for Start My Day / level-up screens to finish first.
        const busy = () => document.querySelector('.ds-scrim, .lvr, .gfx.on, dialog[open]');
        let tries = 0;
        const t = setInterval(() => { if (!busy() || ++tries > 120) { clearInterval(t); if (!busy()) openWhatsNew(); } }, 1000);
    }

    // ---------------- App updates (Android app) ----------------
    let latest = null;   // { version, size, notes, assetUrl, page }
    const token = () => get(TOKEN_KEY);
    async function installedVersion() {
        try { return (await P('App').getInfo()).version; } catch { return null; }
    }
    async function check({ quiet } = {}) {
        if (!isApp) return { state: 'web' };
        const tk = token();
        const headers = { Accept: 'application/vnd.github+json' };
        if (tk) headers.Authorization = `Bearer ${tk}`;
        let r;
        try { r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers, cache: 'no-store' }); }
        catch { return { state: 'offline' }; }
        if (r.status === 404 || r.status === 401) return { state: tk ? 'bad-token' : 'no-token' };
        if (!r.ok) return { state: 'error', code: r.status };
        const rel = await r.json();
        const m = String(rel.tag_name || '').match(/(\d+\.\d+\.\d+)/);
        const apk = (rel.assets || []).find(a => /\.apk$/i.test(a.name));
        if (!m || !apk) return { state: 'none' };
        set(CHECK_KEY, String(Date.now()));
        const mine = await installedVersion();
        latest = { version: m[1], size: apk.size, notes: rel.body || '', assetUrl: apk.url, page: rel.html_url, date: rel.published_at };
        const available = mine && cmp(latest.version, mine) > 0;
        if (available && !quiet) offer();
        return { state: available ? 'available' : 'current', mine, latest };
    }
    function offer() {
        if (!latest || typeof Toast === 'undefined') return;
        if (get(LATER_KEY) === latest.version) return;
        Toast.show(`⬆️ BizzyBee ${latest.version} is ready. Takes about a minute.`, 'neutral', { ms: 15000, action: { label: 'Update now', onClick: openUpdater } });
    }
    function mb(n) { return n ? `${(n / 1048576).toFixed(1)} MB` : ''; }
    async function openUpdater() {
        if (!latest) { const r = await check({ quiet: true }); if (r.state !== 'available' && r.state !== 'current') { if (typeof Toast !== 'undefined') Toast.show(problemText(r.state), 'negative'); return; } }
        if (document.querySelector('.up-scrim')) return;
        const mine = await installedVersion();
        const up = P('BeeUpdater');
        const s = document.createElement('div');
        s.className = 'up-scrim';
        s.innerHTML = `<div class="up-sheet" role="dialog" aria-modal="true" aria-label="App update">
            <h2>⬆️ APP UPDATE</h2>
            <div class="up-ver"><span class="old">${esc(mine || '?')}</span> → <span class="new">${esc(latest.version)}</span><span class="up-meta"> · ${mb(latest.size)}</span></div>
            <p class="up-meta">Your saves stay safe. They live in the cloud, not in the app.</p>
            <div class="up-bar"><i></i></div><p class="up-meta up-pct">${up ? 'Ready to download' : 'This app is too old to update itself. Use the GitHub page this one time.'}</p>
            <ol class="up-steps"><li><b>Download</b> happens right here.</li><li>Android asks <b>"Do you want to install this update?"</b> Tap <b>Update</b>.</li><li>BizzyBee reopens on the new version.</li></ol>
            <div class="up-btns"><button type="button" class="up-btn" data-k="close">Later</button><button type="button" class="up-btn go" data-k="go">${up ? 'Download &amp; install' : 'Open GitHub'}</button></div></div>`;
        document.body.appendChild(s);
        const bar = s.querySelector('.up-bar i'), pct = s.querySelector('.up-pct'), go = s.querySelector('[data-k="go"]');
        let file = null;
        s.addEventListener('click', async e => {
            const b = e.target.closest('[data-k]');
            if (e.target === s || (b && b.dataset.k === 'close')) { set(LATER_KEY, latest.version); s.remove(); return; }
            if (!b || b.dataset.k !== 'go' || go.disabled) return;
            if (!up) { window.open(latest.page, '_blank'); return; }
            if (file) { await install(up); return; }
            go.disabled = true; go.textContent = 'Downloading…';
            const sub = await up.addListener('progress', p => {
                if (p.pct >= 0) { bar.style.width = p.pct + '%'; pct.textContent = `${p.pct}% · ${mb(p.done)} of ${mb(p.total)}`; }
                else pct.textContent = `${mb(p.done)} downloaded`;
            });
            try {
                const headers = { Accept: 'application/octet-stream' };
                if (token()) headers.Authorization = `Bearer ${token()}`;
                file = await up.download({ url: latest.assetUrl, headers });
                bar.style.width = '100%'; pct.textContent = 'Downloaded. Opening the Android installer…';
                go.textContent = 'Install'; go.disabled = false;
                await install(up);
            } catch (err) {
                pct.textContent = `Download failed: ${err && err.message ? err.message : 'try again'}.`;
                go.textContent = 'Try again'; go.disabled = false;
            } finally { try { sub.remove(); } catch {} }
        });
    }
    async function install(up) {
        const ok = await up.canInstall();
        if (!ok.allowed) {
            Toast.show('Android needs your OK once: allow BizzyBee to install updates, then come back and tap Install.', 'neutral', { ms: 20000, action: { label: 'Allow', onClick: () => up.openInstallSettings() } });
            return;
        }
        await up.install();
    }
    function problemText(state) {
        return state === 'no-token' ? 'Add your GitHub token in Settings › About to get app updates.'
            : state === 'bad-token' ? "GitHub didn't accept the token. Check it in Settings › About."
            : state === 'offline' ? "Couldn't reach GitHub. Check your connection."
            : "Couldn't check for updates right now.";
    }
    async function autoCheck() {
        if (!isApp || !token()) return;
        const last = Number(get(CHECK_KEY) || 0);
        if (Date.now() - last < 6 * 3600000) return;
        setTimeout(() => check().catch(() => {}), 6000);
    }

    // ---------------- Settings › About ----------------
    async function renderAbout(host) {
        if (!host) return;
        const mine = isApp ? await installedVersion() : null;
        host.innerHTML = `
            <div class="row"><span class="hx">🐝</span><span class="mid"><b id="ab-title">BizzyBee ${esc(APP_WEB_VERSION)}</b><small id="ab-sub">Website ${esc(APP_WEB_VERSION)}${mine ? ` · App ${esc(mine)}` : ''}</small></span><button type="button" class="btn" id="ab-update" hidden>Update</button></div>
            ${isApp ? `<div class="row"><span class="hx">🔁</span><span class="mid"><b>Check for updates</b><small id="ab-check-note">${get(CHECK_KEY) ? `Checked ${new Date(Number(get(CHECK_KEY))).toLocaleString()}` : 'Not checked yet'}</small></span><button type="button" class="btn" id="ab-check">Check</button></div>
            <div class="row ab-token"><span class="hx">🔑</span><span class="mid"><b>GitHub token</b><small>The app's releases are private for now. A read-only token lets this phone see them. It stays on this phone.</small>
                <span class="ab-tok-line"><input type="password" id="ab-token" autocomplete="off" placeholder="${token() ? 'Saved ✓ (paste to replace)' : 'github_pat_…'}"><button type="button" class="btn" id="ab-token-save">Save</button></span>
                <small><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Make one on GitHub</a>: Fine-grained → Only select repositories: Bizzybee_App → Repository permissions: Contents → Read-only.</small></span></div>` : ''}
            <button type="button" class="row" id="ab-news"><span class="hx">📰</span><span class="mid"><b>What's new</b><small>Every update and what changed</small></span><span class="chev">›</span></button>`;
        const $ = (id) => host.querySelector('#' + id);
        $('ab-news').addEventListener('click', () => openWhatsNew(WHATS_NEW));
        if (!isApp) return;
        const show = (r) => {
            $('ab-check-note').textContent = r.state === 'available' ? `Version ${r.latest.version} is ready.` : r.state === 'current' ? `You're on the newest version. Checked just now.` : problemText(r.state);
            $('ab-update').hidden = r.state !== 'available';
            $('ab-title').innerHTML = `BizzyBee ${esc(APP_WEB_VERSION)}${r.state === 'available' ? '<span class="ab-dot"></span>' : ''}`;
        };
        $('ab-check').addEventListener('click', async () => { $('ab-check-note').textContent = 'Checking…'; set(LATER_KEY, null); show(await check({ quiet: true })); });
        $('ab-update').addEventListener('click', openUpdater);
        $('ab-token-save').addEventListener('click', async () => {
            const v = $('ab-token').value.trim();
            if (!v) return;
            set(TOKEN_KEY, v); $('ab-token').value = ''; $('ab-token').placeholder = 'Saved ✓ (paste to replace)';
            Toast.show('🔑 Token saved on this phone.', 'positive');
            show(await check({ quiet: true }));
        });
        if (token()) show(await check({ quiet: true }));
    }

    function start() {
        const path = location.pathname;
        if (!/\/(features|plugins)\//.test(path) || /\/onboarding\//.test(path)) return;
        autoWhatsNew();
        autoCheck();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    return { version: APP_WEB_VERSION, entries: WHATS_NEW, openWhatsNew, check, openUpdater, renderAbout, isApp };
})();
