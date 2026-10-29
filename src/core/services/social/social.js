// Friends' hives + Mailbox (Oct 29 2026). Talks to netlify/functions/hive.mjs
// and mail.mjs through Cloud sync's sign-in. To keep Netlify free, nothing
// here calls the server more than once an hour on its own:
//   - your hive card uploads at most once an hour
//   - friends' hives and mail download at most once an hour (a saved copy
//     is shown in between, so opening pages costs nothing)
// Buttons (Add, Remove, React, Send, Refresh) call right away.
const Social = (() => {
    const HOUR = 60 * 60 * 1000;
    const K = { pub: 'bizzybee_hive_pub', friends: 'bizzybee_hive_friends', mail: 'bizzybee_mail', seen: 'bizzybee_mail_seen' };
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };
    const stale = (at) => !at || Date.now() - at > HOUR;

    // Cloud sync loads itself on every page; wait for it (up to ~8 s).
    async function cloud() {
        for (let i = 0; i < 40; i++) {
            if (typeof CloudSyncAuto !== 'undefined' && CloudSyncAuto.isReady && CloudSyncAuto.isReady()) return CloudSyncAuto;
            await new Promise(r => setTimeout(r, 200));
        }
        throw new Error('Sign in to Cloud sync to use this.');
    }
    const call = async (fn, body) => (await cloud()).request(fn, body);

    // Your hive card: only what a visitor sees. No quests, tasks, jobs,
    // vitals or when you last played.
    function card() {
        const v = Vault, all = v.getColonyBees ? v.getColonyBees() : [];
        const royal = all.find(b => b.rarity === 'Royal');
        const owner = (v.state.displayName || (royal && royal.name) || (v.getUser() || {}).name || 'A beekeeper').replace(/^worker bee$/i, 'A beekeeper');
        return {
            owner,
            level: (v.getUser() || {}).level || 1,
            bees: all.filter(b => b.rarity !== 'Royal').map(b => ({ n: b.name, r: b.rarity, e: b.element, ...(typeof beeIsBrood === 'function' && beeIsBrood(b) ? { egg: true } : {}) })),
            queen: royal ? { name: royal.name, king: royal.royal === 'king' } : null,
        };
    }

    async function publish(force) {
        const last = read(K.pub);
        if (!force && last && !stale(last.at)) return last;
        const r = await call('hive', { action: 'publish', card: card() });
        const out = { at: Date.now(), code: r.code };
        write(K.pub, out);
        return out;
    }
    const myCode = () => (read(K.pub) || {}).code || (read(K.friends) || {}).code || null;

    async function friends(force) {
        const c = read(K.friends);
        if (!force && c && !stale(c.at)) return c;
        const r = await call('hive', { action: 'friends' });
        const out = { at: Date.now(), code: r.code, sharing: r.sharing, list: r.friends || [] };
        write(K.friends, out);
        return out;
    }
    const cachedFriends = () => read(K.friends);
    async function add(code, letter) { const r = await call('hive', { action: 'add', code, ...(letter ? { letter } : {}) }); await friends(true); return r; }
    async function remove(code) { await call('hive', { action: 'remove', code }); return friends(true); }
    async function sharing(on) { const r = await call('hive', { action: 'sharing', on }); const c = read(K.friends) || {}; c.sharing = r.sharing; write(K.friends, c); return r.sharing; }

    // ---- Mailbox ----
    async function mail(force) {
        const c = read(K.mail);
        if (!force && c && !stale(c.at)) return c;
        const r = await call('mail', { action: 'list' });
        const out = { at: Date.now(), creator: !!r.creator, letters: r.letters || [] };
        write(K.mail, out);
        window.dispatchEvent(new CustomEvent('mail-changed'));
        return out;
    }
    const cachedMail = () => read(K.mail);
    function unread() {
        const c = read(K.mail), seen = read(K.seen) || {};
        return c ? c.letters.filter(l => !seen[l.id]).length : 0;
    }
    function markRead(id) { const s = read(K.seen) || {}; s[id] = 1; write(K.seen, s); window.dispatchEvent(new CustomEvent('mail-changed')); }
    async function react(id, value) {
        await call('mail', { action: 'react', id, value });
        const c = read(K.mail); if (c) { const l = c.letters.find(x => x.id === id); if (l) l.mine = value; write(K.mail, c); }
    }
    async function send(letter) { const r = await call('mail', { action: 'send', ...letter }); await mail(true); return r.letter; }
    async function del(id) { await call('mail', { action: 'delete', id }); return mail(true); }

    // Once a page is ready: upload your card and check mail, each at most hourly.
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(async () => {
            if (typeof Vault === 'undefined' || !Vault.state || Vault.devTest) return;
            try { await publish(false); } catch { /* not signed in: fine */ }
            try { await mail(false); } catch { /* not signed in: fine */ }
        }, 4000);
    });

    // Limited editions (Oct 29 2026): how many are left (cached 10 min, so
    // Home doesn't call the server on every visit) and claiming one.
    async function limitedLeft(edition, force) {
        const k = 'bizzybee_limited_' + edition, c = read(k);
        if (!force && c && Date.now() - c.at < 10 * 60 * 1000) return c;
        const r = await call('limited', { action: 'status', edition });
        const out = { at: Date.now(), left: r.left, mine: r.mine || null };
        write(k, out);
        return out;
    }
    async function claimLimited(edition, day) {
        const r = await call('limited', { action: 'claim', edition, day });
        write('bizzybee_limited_' + edition, { at: Date.now(), left: r.left, mine: r.serial });
        return r;
    }

    return { card, publish, myCode, friends, cachedFriends, add, remove, sharing, mail, cachedMail, unread, markRead, react, send, del, limitedLeft, claimLimited, HOUR };
})();
