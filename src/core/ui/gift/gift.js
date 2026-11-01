// Gifts (Nov 1 2026, Craft, approved demo "Grimzy Gift"). The creator sends a
// numbered limited card (Grimzy) with a letter to someone's sign-in email
// (Mailbox › Send a gift). It pops up the next time they open BizzyBee:
// envelope -> card flip -> letter -> "Add Grimzy to my hive". Not opened
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

    function close() { if (scrim) { scrim.remove(); scrim = null; } document.body.classList.remove('gf-open'); }

    // Plays the gift: envelope, card, letter, add to hive.
    function open(g) {
        if (!g || scrim) return;
        const a = ART[g.edition] || { name: 'LIMITED BEE', art: 'grimzy', label: 'LIMITED', title: '' };
        const n = pad(g.serial), of = pad(g.of || 50);
        scrim = document.createElement('div');
        scrim.className = 'gf-scrim';
        scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-label', 'A gift for you');
        document.body.appendChild(scrim); document.body.classList.add('gf-open');
        const step = (html) => { scrim.innerHTML = `<div class="gf-step">${html}</div>`; return scrim.querySelector('.gf-step'); };
        const envelope = () => {
            const s = step(`<button type="button" class="gf-env"><span class="gf-seal" aria-hidden="true"></span><b>A gift from ${esc(g.from || 'Craft')}</b><span class="gf-note">Tap to open</span></button><button type="button" class="gf-later">Later</button>`);
            s.querySelector('.gf-env').onclick = card;
            s.querySelector('.gf-later').onclick = close;
            s.querySelector('.gf-env').focus({ preventScroll: true });
        };
        const card = () => {
            const s = step(`<button type="button" class="gf-flip" aria-label="Flip the card"><span class="in">
                <span class="gf-face gf-back">TAP TO REVEAL</span>
                <span class="gf-face gf-front"><span class="top"><span>${esc(a.label)}</span><span>🔥</span></span><img src="${root()}assets/bees/${a.art}.webp" alt="${esc(a.name)}"><span class="bot"><b>${esc(a.name)}</b><small>${esc(a.title)}</small><span class="gf-serial">#${n} / ${of}</span></span><span class="gf-glare"></span></span>
            </span></button><p class="gf-note" aria-live="polite">Tap the card</p>`);
            const f = s.querySelector('.gf-flip');
            f.onclick = () => { if (f.classList.contains('open')) { letter(); return; } f.classList.add('open'); s.querySelector('.gf-note').textContent = 'Tap again for your letter'; };
            f.focus({ preventScroll: true });
        };
        const letter = () => {
            const s = step(`<div class="gf-letter">${esc(g.letter || 'Happy Halloween! 🎃')}</div><button type="button" class="gf-btn">Add ${esc(a.name.charAt(0) + a.name.slice(1).toLowerCase())} to my hive</button>`);
            const b = s.querySelector('.gf-btn');
            b.focus({ preventScroll: true });
            b.onclick = async () => {
                b.disabled = true; b.textContent = 'Adding…';
                try {
                    const r = await call({ action: 'accept', edition: g.edition });
                    const bee = Vault.addLimitedBee(g.edition, Number(r.serial));
                    write(KEY, { at: Date.now(), gifts: cached().filter(x => x.edition !== g.edition) });
                    const d = step(`<div class="gf-done"><b>🎃 ${esc(bee ? bee.name : a.name)} #${pad(r.serial)} joined your hive!</b></div><p class="gf-note">Find it in Hive Bees.</p><button type="button" class="gf-btn">Close</button>`);
                    d.querySelector('.gf-btn').onclick = () => { close(); window.dispatchEvent(new Event('bb-gifts')); };
                    d.querySelector('.gf-btn').focus({ preventScroll: true });
                } catch (e) {
                    b.disabled = false; b.textContent = 'Try again';
                    if (typeof Toast !== 'undefined') Toast.show(e.message || 'Could not add it. Try again.', 'negative');
                }
            };
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
    return { open, check, inbox, cached, send, sent, close };
})();
