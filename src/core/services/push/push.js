// Phone reminders (Oct 2026) - real notifications even when the app is
// closed, via web push. Pieces:
//   /sw.js                              shows the notification
//   this file                           turns it on/off, uploads the upcoming
//                                       reminder times (next 10 days)
//   netlify/functions/push-subscribe    stores this device + those times
//   netlify/functions/push-send         runs every 5 minutes, sends what's due
// Needs a cloud account (signed in). Your save stays encrypted - only the
// reminder times and (if you allow it) the task names go to the server.
const BizzyPush = (() => {
    const ON_KEY = 'bizzybee_push_on';
    const NAMES_KEY = 'bizzybee_push_names';      // '0' = hide task names
    const HASH_KEY = 'bizzybee_push_hash';
    const AT_KEY = 'bizzybee_push_uploaded_at';
    const DAYS = 10;
    const API = '/.netlify/functions/push-subscribe';
    let timer = null;

    const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const isOn = () => localStorage.getItem(ON_KEY) === '1';
    const showNames = () => localStorage.getItem(NAMES_KEY) !== '0';

    function user() {
        return typeof netlifyIdentity !== 'undefined' ? netlifyIdentity.currentUser() : null;
    }
    async function call(body) {
        const u = user();
        if (!u) throw new Error('Sign in to your cloud account (Settings) to use phone reminders.');
        const token = await u.jwt();
        const res = await fetch(API, {
            method: 'POST', cache: 'no-store',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) throw new Error(out.error || 'Phone reminders: the server said no.');
        return out;
    }


    // Upcoming reminders for the next DAYS days (shared planner: services/notify/notify.js).
    function buildSchedule() {
        if (typeof Vault === 'undefined' || !Vault.state || typeof BizzyNotify === 'undefined') return [];
        return BizzyNotify.plan({ days: DAYS, limit: 400 }).map(a => ({ id: a.key, at: a.at.toISOString(), title: a.title, body: a.body, url: a.url }));
    }

    async function subscription(create) {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub && create) {
            const res = await fetch(API, { cache: 'no-store' });
            const out = await res.json().catch(() => ({}));
            if (!out.publicKey) throw new Error(out.error || 'Phone reminders are not set up on the server yet.');
            const raw = atob(out.publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - out.publicKey.length % 4) % 4));
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
        }
        return sub;
    }

    async function enable() {
        if (!supported()) throw new Error('This browser can\'t do phone notifications. Try Chrome.');
        if (!user()) throw new Error('Sign in to your cloud account (Settings) first.');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in the browser\'s site settings.');
        const sub = await subscription(true);
        const schedule = buildSchedule();
        const out = await call({ subscription: sub.toJSON(), schedule });
        localStorage.setItem(ON_KEY, '1');
        remember(schedule);
        return out;
    }

    async function disable() {
        localStorage.removeItem(ON_KEY);
        localStorage.removeItem(HASH_KEY);
        if (!supported()) return;
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) {
            try { await call({ disable: true, endpoint: sub.endpoint }); } catch {}
            await sub.unsubscribe().catch(() => {});
        }
    }

    const test = () => call({ test: true });

    function remember(schedule) {
        localStorage.setItem(HASH_KEY, JSON.stringify(schedule));
        localStorage.setItem(AT_KEY, String(Date.now()));
    }

    // Re-upload when the upcoming reminders changed, or twice a day anyway.
    async function refresh() {
        if (!isOn() || !user() || (typeof Vault !== 'undefined' && Vault.devTest)) return;
        const schedule = buildSchedule();
        const same = localStorage.getItem(HASH_KEY) === JSON.stringify(schedule);
        const age = Date.now() - Number(localStorage.getItem(AT_KEY) || 0);
        if (same && age < 12 * 3600000) return;
        try {
            const sub = await subscription(false);
            await call(sub ? { subscription: sub.toJSON(), schedule } : { schedule });
            remember(schedule);
        } catch (e) { console.warn('Phone reminders:', e.message); }
    }

    function start() {
        // Oct 31 2026 (Craft): web push is off. A browser that had it on
        // unsubscribes once (removes its server copy), then nothing runs.
        if (isOn()) disable().catch(() => {});
        return;
        // eslint-disable-next-line no-unreachable
        if (!isOn()) return;
        window.addEventListener('vault-saved', () => { clearTimeout(timer); timer = setTimeout(refresh, 8000); });
        setTimeout(refresh, 4000);
    }

    return { supported, isOn, showNames, enable, disable, test, refresh, buildSchedule, start,
        setShowNames(on) { localStorage.setItem(NAMES_KEY, on ? '1' : '0'); localStorage.removeItem(HASH_KEY); refresh(); } };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => BizzyPush.start());
else BizzyPush.start();
