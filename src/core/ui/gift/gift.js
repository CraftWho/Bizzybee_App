// Gifts (Nov 1 2026, Craft, approved demo "Grimzy Gift"). The creator sends a
// numbered limited card (Grimzy) with a letter to someone's sign-in email
// (Mailbox › Send a gift). It pops up the next time they open BizzyBee:
// envelope -> the official bee card, face down, tap to flip -> letter. Not opened
// within 7 days? It waits in their Mailbox (Letters) until they add it.
// Server: netlify/functions/limited.mjs (inbox / accept / gift).
const Gifts = (() => {
    const KEY = 'bizzybee_gifts', SHOWN = 'bizzybee_gift_popup';
    const CHECK_MS = 30 * 60 * 1000, POPUP_DAYS = 7;
    const ART = { 'grimzy-2026': { name: 'GRIMZY', art: 'grimzy', label: 'LIMITED · HALLOWEEN 2026', title: '💀 The Reaper · Soul Harvest' } };
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = (n) => String(n).padStart(3, '0');
    const root = () => (document.querySelector('script[src*="core/ui/gift/gift.js"]') || {}).src.replace(/core\/ui\/gift\/gift\.js.*$/, '');
    let scrim = null;

    async function cloud() {
        for (let i = 0; i < 40; i++) {
            if (typeof CloudSyncAuto !== 'undefined' && CloudSyncAuto.isReady && CloudSyncAuto.isReady()) return CloudSyncAuto;
            await new Promise(r => setTimeout(r, 200));
        }
        throw new Error('Sign in to Cloud sync to get gifts.');
    }
    const call = async (body) => (await cloud()).request('limited', body);

    // Your gifts not added yet (saved copy in between checks).
    const cached = () => (read(KEY) || { gifts: [] }).gifts || [];
    async function inbox(force) {
        const c = read(KEY);
        if (!force && c && Date.now() - c.at < CHECK_MS) return c.gifts || [];
        const r = await call({ action: 'inbox' });
        write(KEY, { at: Date.now(), gifts: r.gifts || [] });
        return r.gifts || [];
    }

    // The official bee card (src/core/ui/bee-card/), loaded on pages that don't have it.
    function beeCardReady() {
        if (typeof BeeCard !== 'undefined') return Promise.resolve();
        return new Promise((resolve) => {
            if (!document.querySelector('link[href*="bee-card/bee-card.css"]')) {
                const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = root() + 'core/ui/bee-card/bee-card.css'; document.head.appendChild(css);
            }
            const js = document.createElement('script'); js.src = root() + 'core/ui/bee-card/bee-card.js';
            js.onload = () => setTimeout(resolve, 60); js.onerror = () => resolve();
            document.body.appendChild(js);
        });
    }

    function close() { if (scrim) { scrim.remove(); scrim = null; } document.body.classList.remove('gf-open'); document.documentElement.classList.remove('bb-zoom'); }

    // Plays the gift: envelope, card, letter, add to hive.
    function open(g) {
        if (!g || scrim) return;
        const a = ART[g.edition] || { name: 'LIMITED BEE', art: 'grimzy', label: 'LIMITED', title: '' };
        const n = pad(g.serial), of = pad(g.of || 50);
        scrim = document.createElement('div');
        scrim.className = 'gf-scrim';
        scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-label', 'A gift for you');
        document.body.appendChild(scrim); document.body.classList.add('gf-open'); document.documentElement.classList.add('bb-zoom');   // everything behind pauses
        const step = (html) => { scrim.innerHTML = `<div class="gf-step">${html}</div>`; return scrim.querySelector('.gf-step'); };
        const envelope = () => {
            const s = step(`<button type="button" class="gf-env"><span class="gf-seal" aria-hidden="true"></span><b>A gift from ${esc(g.from || 'Craft')}</b><span class="gf-note">Tap to open</span></button><button type="button" class="gf-later">Later</button>`);
            s.querySelector('.gf-env').onclick = card;
            s.querySelector('.gf-later').onclick = close;
            s.querySelector('.gf-env').focus({ preventScroll: true });
        };
        // Opening the envelope adds the bee (so the card you see is YOUR card,
        // with its real stats), then shows the official bee card face down.
        const card = async () => {
            const s = step(`<p class="gf-note" aria-live="polite">Opening…</p>`);
            let bee = null, serial = g.serial;
            try {
                const r = await call(g.claim ? { action: 'claim', edition: g.edition } : { action: 'accept', edition: g.edition });   // Nov 9 2026 (Craft): a claim or a gift
                serial = Number(r.serial);
                bee = Vault.addLimitedBee(g.edition, serial);
                write(KEY, { at: Date.now(), gifts: cached().filter(x => x.edition !== g.edition) });
                window.dispatchEvent(new Event('bb-gifts'));
                await beeCardReady();
            } catch (e) {
                s.innerHTML = `<p class="gf-note">${esc(e.message || 'Could not open it.')} </p><button type="button" class="gf-btn">Try again</button><button type="button" class="gf-later">Later</button>`;
                s.querySelector('.gf-btn').onclick = card;
                s.querySelector('.gf-later').onclick = close;
                return;
            }
            const c = step(`<div class="gf-card-host is-flipped" role="button" tabindex="0" aria-label="Tap to flip the card"></div><p class="gf-note" aria-live="polite">Tap the card</p>`);
            const host = c.querySelector('.gf-card-host');
            if (bee && typeof BeeCard !== 'undefined') BeeCard.render(host, bee, { editable: false });
            else host.innerHTML = `<div class="gf-letter">${esc(a.name)} #${pad(serial)}</div>`;
            const revealed = () => {
                if (host.classList.contains('is-flipped') || c.querySelector('.gf-btn')) return;
                c.querySelector('.gf-note').textContent = `${a.name.charAt(0) + a.name.slice(1).toLowerCase()} #${pad(serial)} / ${of} joined your hive!`;
                c.insertAdjacentHTML('beforeend', '<button type="button" class="gf-btn">Read your letter</button>');
                c.querySelector('.gf-btn').onclick = () => letter(serial);
            };
            host.addEventListener('click', () => setTimeout(revealed, 50));
            host.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); host.classList.toggle('is-flipped'); setTimeout(revealed, 50); } });
            host.focus({ preventScroll: true });
        };
        const letter = (serial) => {
            const s = step(`<div class="gf-letter">${esc(g.letter || 'Happy Halloween! 🎃')}</div><button type="button" class="gf-btn">Close</button><p class="gf-note">Find ${esc(a.name.charAt(0) + a.name.slice(1).toLowerCase())} #${pad(serial)} in Hive Bees.</p>`);
            const b = s.querySelector('.gf-btn');
            b.focus({ preventScroll: true });
            b.onclick = close;
        };
        envelope();
    }

    // At start: a gift sent in the last 7 days pops up (once per app open).
    async function check() {
        if (typeof Vault === 'undefined' || Vault.pcLocal || Vault.devTest) return;
        if (localStorage.getItem('bizzybee_session') !== 'identity') return;
        let gifts = [];
        try { gifts = await inbox(false); } catch { return; }
        window.dispatchEvent(new Event('bb-gifts'));
        const fresh = gifts.find(g => Date.now() - Date.parse(g.at) < POPUP_DAYS * 864e5);
        if (!fresh) return;
        try { if (sessionStorage.getItem(SHOWN) === fresh.edition) return; sessionStorage.setItem(SHOWN, fresh.edition); } catch { /* fine */ }
        // Wait for Start My Day, the Daily bonus and level-ups to finish first.
        const busy = () => document.querySelector('.ds-scrim, .dbn-scrim, .ss-scrim, .lvr, .gfx.on, dialog[open], .wn-scrim');
        let tries = 0;
        const t = setInterval(() => { if (!busy() || ++tries > 90) { clearInterval(t); if (!busy()) open(fresh); } }, 1000);
    }

    // Creator: send one (Mailbox › Send a gift).
    const send = (body) => call({ action: 'gift', ...body });
    const sent = () => call({ action: 'gifts' });
    // Nov 9 2026 (Craft): the Grimzy claim is open to everyone signed in, until Nov 16 or until all 50 are taken.
    const claimInfo = () => call({ action: 'status', edition: 'grimzy-2026' });
    return { open, check, inbox, cached, send, sent, close, claimInfo };
})();
