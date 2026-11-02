// Themes (Oct 28 2026). Pick a theme in Settings › Themes. 'auto' is
// BizzyBee, and Halloween on Oct 31. boot.js sets the theme before the page
// paints; this file handles picking, the icons and the Halloween bats.
//   Themes.list() · Themes.pick() · Themes.current() · Themes.set(id)
const Themes = (() => {
    const KEY = 'bizzybee_theme', DAY_KEY = 'bizzybee_dev_day';
    const THEMES = [
        { id: 'auto', icon: '✨', label: 'Auto', note: 'BizzyBee, and Halloween on Oct 31', colors: ['#ffcc00', '#ff7a1a', '#8fe33a'], bg: ['#1a140b', '#160b1f'] },
        { id: 'bee', icon: '🐝', label: 'BizzyBee', note: 'Black, gold and red', colors: ['#ffcc00', '#dc143c', '#f1ede2'], bg: ['#1a140b', '#050402'] },
        // Nov 1 2026 (Craft): Halloween can't be picked; it turns on by itself on Oct 31 (Auto).
        { id: 'halloween', icon: '🎃', label: 'Halloween', note: 'Pumpkin, slime, cobwebs and bats', colors: ['#ff7a1a', '#8fe33a', '#f3ead8'], bg: ['#22102e', '#0a0510'], seasonal: true },
    ];
    const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage off */ } };
    const today = () => { const d = get(DAY_KEY); return d ? new Date(d + 'T12:00:00') : new Date(); };
    const seasonal = () => { const d = today(); return d.getMonth() === 9 && d.getDate() === 31 ? 'halloween' : 'bee'; };
    // A saved Halloween pick (from before Nov 1 2026) counts as Auto.
    const pickable = (id) => THEMES.some(t => t.id === id && !t.seasonal);
    const pick = () => { const p = get(KEY); return pickable(p) ? p : 'auto'; };
    const current = () => (pick() === 'auto' ? seasonal() : pick());

    // App icons: each theme can have its own set in src/assets/icons/<id>/.
    const ICON_SETS = { halloween: 'halloween/' };
    const ICON_BASE = document.currentScript ? new URL('../../../assets/icons/', document.currentScript.src).href : '/src/assets/icons/';
    function icons(skin) {
        const sub = ICON_SETS[skin] || '';
        document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(l => {
            if (!l.dataset.bbHref) l.dataset.bbHref = l.getAttribute('href') || '';
            const orig = l.dataset.bbHref;
            if (!sub) { l.setAttribute('href', orig); return; }
            const file = (orig.match(/([^/]+\.png)$/) || [])[1] || 'favicon-48x48.png';   // favicon.ico -> png
            l.setAttribute('href', ICON_BASE + sub + file);
        });
    }

    // Halloween bats: one or two fly across every so often.
    let batTimer = null;
    const BAT = '<svg viewBox="0 0 64 32"><path fill="#14061c" stroke="#ff7a1a" stroke-opacity=".35" d="M32 10c2-4 4-6 4-6l1 5c3 0 5 2 5 2 4-6 14-8 22-6-6 3-8 8-8 14-4-3-9-3-12 0-2-2-5-3-8-2-1 3-3 5-4 7-1-2-3-4-4-7-3-1-6 0-8 2-3-3-8-3-12 0 0-6-2-11-8-14 8-2 18 0 22 6 0 0 2-2 5-2l1-5s2 2 4 6z"/></svg>';
    function bats(on) {
        clearTimeout(batTimer);
        let box = document.querySelector('.bb-bats');
        if (!on) { if (box) box.remove(); return; }
        if (!box) { box = document.createElement('div'); box.className = 'bb-bats'; box.setAttribute('aria-hidden', 'true'); document.body.appendChild(box); }
        const fly = () => {
            if (document.visibilityState === 'visible' && box.childElementCount < 3) {
                const n = 1 + (Math.random() < .35 ? 1 : 0);
                for (let i = 0; i < n; i++) {
                    const b = document.createElement('div');
                    b.className = 'bb-bat';
                    b.style.setProperty('--y', `${12 + Math.random() * 55}%`);
                    b.style.setProperty('--t', `${7 + Math.random() * 5}s`);
                    b.style.animationDelay = `${i * .6}s`;
                    b.style.width = `${26 + Math.random() * 16}px`;
                    b.innerHTML = BAT;
                    b.addEventListener('animationend', (e) => { if (e.target === b) b.remove(); });
                    box.appendChild(b);
                }
            }
            batTimer = setTimeout(fly, 14000 + Math.random() * 16000);
        };
        batTimer = setTimeout(fly, 2500);
    }

    // Halloween ghosts: one drifts up now and then, see-through, never in the way.
    let ghostTimer = null;
    const GHOST = '<svg viewBox="0 0 60 72"><path fill="#f3ead8" fill-opacity=".85" d="M30 2C15 2 6 13 6 28v38l8-6 8 6 8-6 8 6 8-6 8 6V28C54 13 45 2 30 2z"/><ellipse cx="22" cy="28" rx="4" ry="6" fill="#14061c"/><ellipse cx="38" cy="28" rx="4" ry="6" fill="#14061c"/><ellipse cx="30" cy="42" rx="5" ry="4" fill="#14061c" fill-opacity=".8"/></svg>';
    function ghosts(on, box) {
        clearTimeout(ghostTimer);
        if (!on || !box) return;
        const float = () => {
            if (document.visibilityState === 'visible' && !box.querySelector('.bb-ghost')) {
                const g = document.createElement('div');
                g.className = 'bb-ghost';
                g.style.setProperty('--x', `${8 + Math.random() * 70}%`);
                g.style.setProperty('--t', `${9 + Math.random() * 5}s`);
                g.innerHTML = GHOST;
                g.addEventListener('animationend', (e) => { if (e.target === g) g.remove(); });
                box.appendChild(g);
            }
            ghostTimer = setTimeout(float, 20000 + Math.random() * 25000);
        };
        ghostTimer = setTimeout(float, 6000);
    }
    // Big cobwebs in the screen corners, and a little spider on a thread.
    function webs(on) {
        let w = document.querySelector('.bb-webs');
        if (!on) { if (w) w.remove(); return; }
        if (w) return;
        w = document.createElement('div');
        w.className = 'bb-webs'; w.setAttribute('aria-hidden', 'true');
        w.innerHTML = '<i class="bb-web tl"></i><i class="bb-web tr"></i><i class="bb-web bl"></i><i class="bb-web br"></i><i class="bb-spider"><b><svg viewBox="0 0 64 56"><g fill="none" stroke="#ff7a1a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M24 24L12 14L4 20M24 28L8 26L2 34M25 32L10 38L6 50M27 35L18 46L16 55"/><path d="M40 24L52 14L60 20M40 28L56 26L62 34M39 32L54 38L58 50M37 35L46 46L48 55"/></g><ellipse cx="32" cy="34" rx="11" ry="12" fill="#14061c" stroke="#ff7a1a" stroke-width="2"/><circle cx="32" cy="20" r="7" fill="#14061c" stroke="#ff7a1a" stroke-width="2"/><circle cx="29.5" cy="19.5" r="1.8" fill="#8fe33a"/><circle cx="34.5" cy="19.5" r="1.8" fill="#8fe33a"/></svg></b></i>';
        document.body.appendChild(w);
    }

    // Auto switches at 12:00 AM on Oct 31 and back at 12:00 AM on Nov 1,
    // even if the app stays open over midnight.
    let midnightTimer = null;
    function atMidnight() {
        clearTimeout(midnightTimer);
        const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
        midnightTimer = setTimeout(() => { apply(); atMidnight(); }, Math.min(next - now, 2 ** 31 - 1));
    }

    function apply() {
        const skin = current();
        if (skin === 'bee') delete document.documentElement.dataset.skin;
        else document.documentElement.dataset.skin = skin;
        icons(skin);
        if (document.body) {
            const hw = skin === 'halloween';
            bats(hw); webs(hw); ghosts(hw, document.querySelector('.bb-bats'));
        }
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { skin, pick: pick() } }));
        return skin;
    }

    // Saves the pick on this device and in your save (so it follows you).
    function set(id) {
        if (!pickable(id)) return null;
        put(KEY, id === 'auto' ? null : id);
        if (typeof Vault !== 'undefined' && Vault.state) { Vault.state.theme = id; Vault.save(); }
        return apply();
    }

    // Your save wins over this device, so a pick on your phone reaches the PC.
    function fromSave() {
        if (typeof Vault === 'undefined' || !Vault.state) return false;
        const saved = Vault.state.theme;
        // Nov 1 2026 (Craft): an old Halloween pick goes back to Auto, everywhere.
        if (saved && !pickable(saved)) { Vault.state.theme = 'auto'; put(KEY, null); Vault.save(); apply(); return true; }
        if (saved && saved !== pick() && pickable(saved)) { put(KEY, saved === 'auto' ? null : saved); apply(); }
        return true;
    }

    // Dev mode: pretend it's a certain day (YYYY-MM-DD), or null for today.
    function devDay(iso) { put(DAY_KEY, iso || null); return apply(); }

    document.addEventListener('DOMContentLoaded', () => {
        apply();
        atMidnight();
        // A phone that slept over midnight catches up when it wakes.
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.documentElement.dataset.skin !== (current() === 'bee' ? undefined : current())) apply(); });
        let tries = 0;
        const wait = () => { if (!fromSave() && ++tries < 40) setTimeout(wait, 250); };
        wait();
    });
    window.addEventListener('vault-saved', () => fromSave());

    return { list: () => THEMES.filter(t => !t.seasonal), pick, current, set, apply, devDay, seasonal };
})();
