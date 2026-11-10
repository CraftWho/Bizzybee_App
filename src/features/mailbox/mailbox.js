// Mailbox (Oct 29 2026). Letters from the creator; players react 👍 / 👎.
// Rules: core/services/social/social.js and netlify/functions/mail.mjs.
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const ago = (at) => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
let seenBefore = {};

// Nov 1 2026 (Craft): Craft's Halloween letter, the default for gifts. Nov 10: reworded for the late release.
const GIFT_LETTER = `Happy Halloween! 🎃

Sorry this is late. Your Halloween bee never made it out on the day, and that was my miss.

Thank you for being one of the very first in BizzyBee. This is Grimzy, a numbered bee made only for you. There are just 50 in the whole world.

Take care of it. 🐝

Craft`;

// Your gifts waiting to be added (Grimzy...). Tap to open.
function renderGifts() {
    renderClaim();
    const box = $('mb-gifts');
    const list = typeof Gifts !== 'undefined' ? Gifts.cached() : [];
    // Nov 1 2026 (Craft): items friends sent from the Honey Mart, as letters with the item attached.
    const items = typeof Social !== 'undefined' && Social.cachedItemGifts ? Social.cachedItemGifts() : [];
    box.innerHTML = list.map((g, i) => `<button type="button" class="bb-box mb-letter unread mb-giftrow" data-gift="${i}">
        <div class="top"><h3 class="bb-title">🎁 A gift from ${esc(g.from || 'Craft')}</h3><span class="new">NEW</span></div>
        <small>Grimzy #${String(g.serial).padStart(3, '0')} · ${when(g.at)} · tap to open</small></button>`).join('')
        + items.map(g => { const it = (typeof STORE_ITEM_CATALOG !== 'undefined' && STORE_ITEM_CATALOG.find(x => x.id === g.item)) || { icon: '🎁', label: g.item };
            return `<article class="bb-box mb-letter unread mb-itemgift">
                <div class="top"><h3 class="bb-title">🎁 From ${esc(g.from || 'a friend')}</h3><span class="new">NEW</span></div>
                <small>${when(g.at)}</small>${g.note ? `<p class="body">${esc(g.note)}</p>` : ''}
                <div class="mb-attach"><span>${it.icon} ${esc(it.label)} × ${g.n || 1}</span><button type="button" class="bb-btn bb-btn--main" data-take="${esc(g.id)}">Take</button></div></article>`; }).join('');
    box.onclick = async (e) => {
        const b = e.target.closest('[data-gift]'); if (b) { Gifts.open(list[+b.dataset.gift]); return; }
        const t = e.target.closest('[data-take]');
        if (!t) return;
        t.disabled = true; t.textContent = '…';
        try { const r = await Social.acceptGift(t.dataset.take); const it = STORE_ITEM_CATALOG.find(x => x.id === r.item); Toast.show(`🎁 ${it ? it.label : 'Gift'} is in your Bag.`, 'positive'); renderGifts(); }
        catch (err) { Toast.show(err.message || 'Could not take it.', 'negative'); t.disabled = false; t.textContent = 'Take'; }
    };
}

// Nov 9 2026 (Craft): Grimzy is open to claim again for everyone signed in, one each.
// It closes on Nov 16 or when all 50 are taken. Shown at the top of the Mailbox.
async function renderClaim() {
    const box = $('mb-claim');
    if (!box || typeof Gifts === 'undefined' || localStorage.getItem('bizzybee_session') !== 'identity') return;
    let r;
    try { r = await Gifts.claimInfo(); } catch { box.innerHTML = ''; return; }
    if (r.mine) { box.innerHTML = `<article class="bb-box mb-letter"><div class="top"><h3 class="bb-title">🎃 Grimzy #${String(r.mine).padStart(3, '0')} is yours</h3></div><small>It is in your hive. Find it in your bees.</small></article>`; return; }
    if (!r.open) { box.innerHTML = ''; return; }
    const until = new Date(Date.parse(r.until) - 6 * 3600000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    box.innerHTML = `<button type="button" class="bb-box mb-letter unread mb-giftrow" id="mb-claim-btn"><div class="top"><h3 class="bb-title">🎃 Claim your Grimzy</h3><span class="new">OPEN</span></div><small>A numbered Halloween bee. ${r.left} of 50 left · one each · open until ${until}. Tap to claim.</small></button>`;
    $('mb-claim-btn').onclick = () => Gifts.open({ edition: 'grimzy-2026', claim: true, from: 'Craft', of: 50, letter: GIFT_LETTER });
}

let giftFormReady = false;
async function setupGiftForm() {
    if (giftFormReady || typeof Gifts === 'undefined') return;
    giftFormReady = true;
    $('mb-gift').hidden = false;
    if (!$('mb-gift-letter').value) $('mb-gift-letter').value = GIFT_LETTER;
    let taken = new Set();
    try { const r = await Gifts.sent(); (r.sent || []).forEach(g => taken.add(g.serial)); } catch { /* list stays full */ }
    const opts = [];
    for (let n = 1; n <= 50; n++) if (!taken.has(n)) opts.push(`<option value="${n}">🎃 Grimzy · #${String(n).padStart(3, '0')} of 050${n === 1 ? ' (yours)' : ''}</option>`);
    $('mb-gift-no').innerHTML = opts.join('');
    const sent = [...taken].sort((a, b) => a - b);
    $('mb-gift-sent').textContent = sent.length ? `Sent so far: ${sent.map(n => '#' + String(n).padStart(3, '0')).join(', ')}` : '';
    $('mb-gift-send').onclick = async () => {
        const email = $('mb-gift-to').value.trim(), serial = Number($('mb-gift-no').value), letter = $('mb-gift-letter').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { Toast.show('Add their sign-in email.', 'negative'); return; }
        const btn = $('mb-gift-send'); btn.disabled = true;
        try {
            await Gifts.send({ edition: 'grimzy-2026', email, serial, letter });
            Toast.show(`🎁 Grimzy #${String(serial).padStart(3, '0')} sent.`, 'positive');
            $('mb-gift-to').value = '';
            giftFormReady = false; setupGiftForm();
            try { await Gifts.inbox(true); renderGifts(); } catch { /* fine */ }
        } catch (e) { Toast.show(e.message, 'negative'); }
        finally { btn.disabled = false; }
    };
}

function render(data) {
    if (!data) return;
    $('mb-write').hidden = !data.creator;
    if (data.creator) setupGiftForm();
    const mine = Social.myCode();
    $('mb-list').innerHTML = data.letters.length ? data.letters.map(l => {
        const unread = !seenBefore[l.id];
        const connect = l.hive && l.hive !== mine ? `<button type="button" class="bb-btn bb-btn--main" data-connect="${esc(l.hive)}" data-letter="${esc(l.id)}">🤝 Connect · ${esc(l.hive)}</button>` : '';
        const totals = l.totals ? `<span class="mb-totals">👍 ${l.totals.up} · 👎 ${l.totals.down}</span><button type="button" class="mb-del" data-del="${esc(l.id)}">Delete</button>` : '';
        return `<article class="bb-box mb-letter${unread ? ' unread' : ''}">
            <div class="top"><h3 class="bb-title">${esc(l.title)}</h3>${unread ? '<span class="new">NEW</span>' : ''}</div>
            <small>From ${esc(l.from)} · ${when(l.at)}</small>
            <p class="body">${esc(l.body)}</p>
            <div class="mb-row">${connect}
                <button type="button" class="mb-react" data-react="up" data-id="${esc(l.id)}" aria-pressed="${l.mine === 'up'}" aria-label="Like">👍</button>
                <button type="button" class="mb-react" data-react="down" data-id="${esc(l.id)}" aria-pressed="${l.mine === 'down'}" aria-label="Dislike">👎</button>${totals}</div>
        </article>`;
    }).join('') : '<p class="mb-empty">No letters yet.</p>';
    $('mb-updated').textContent = data.at ? `Checked ${ago(data.at)}. New mail arrives about once an hour.` : '';
    data.letters.forEach(l => Social.markRead(l.id));
}

async function load(force) {
    renderGifts();
    if (typeof Gifts !== 'undefined' && localStorage.getItem('bizzybee_session') === 'identity') Gifts.inbox(force).then(renderGifts).catch(() => {});
    if (localStorage.getItem('bizzybee_session') === 'identity' && Social.itemGifts) Social.itemGifts().then(renderGifts).catch(() => {});   // Nov 1 2026 (Craft)
    render(Social.cachedMail());
    try { render(await Social.mail(force)); $('mb-signin').hidden = true; }
    catch (e) {
        $('mb-signin').hidden = false;
        $('mb-signin').innerHTML = `${esc(e.message)} <a href="../settings/settings.html#cloud">Open Settings</a>`;
        if (!Social.cachedMail()) $('mb-list').innerHTML = '<p class="mb-empty">Sign in to get mail.</p>';
    }
}

// Updates tab (Oct 29 2026, Craft): every What's New entry as a changelog,
// named by version ("Update 1.0.6"), newest first. The first one is open.
function renderUpdates(tries = 0) {
    const box = $('mb-updates');
    if (typeof BizzyUpdates === 'undefined') { if (tries < 50) setTimeout(() => renderUpdates(tries + 1), 100); else box.innerHTML = '<p class="mb-empty">Updates could not load. Try again later.</p>'; return; }
    const part = (label, list) => list && list.length ? `<h4>${label}</h4><ul>${list.map(i => `<li><span aria-hidden="true">${i.icon}</span><span><b>${esc(i.title)}</b> ${esc(i.text)}</span></li>`).join('')}</ul>` : '';
    box.innerHTML = BizzyUpdates.entries.map((e, n) => `<details class="bb-box mb-up"${n === 0 ? ' open' : ''}>
        <summary><b>Update ${esc(e.version)}</b><small>${esc(e.date || '')}${n === 0 ? ' · latest' : ''}</small></summary>
        ${part('New', e.new)}${part('Better', e.improved)}${part('Fixed', e.fixed)}</details>`).join('');
}
function showTab(tab) {
    const up = tab === 'updates';
    $('mb-updates').hidden = !up; $('mb-letters').hidden = up;
    $('mb-tab-letters').setAttribute('aria-selected', String(!up)); $('mb-tab-updates').setAttribute('aria-selected', String(up));
    if (up && !$('mb-updates').innerHTML) renderUpdates();
}

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelector('.mb-tabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { showTab(t.dataset.tab); try { history.replaceState(null, '', t.dataset.tab === 'updates' ? '#updates' : location.pathname); } catch { /* ignore */ } } });
    if (location.hash === '#updates') showTab('updates');
    await Vault.init();
    if (typeof Waggle !== 'undefined' && typeof baseWaggleActions === 'function') Waggle.setActions(baseWaggleActions());
    try { seenBefore = JSON.parse(localStorage.getItem('bizzybee_mail_seen') || '{}'); } catch { seenBefore = {}; }
    load(false);
    window.addEventListener('bb-gifts', renderGifts);
    $('mb-refresh').onclick = () => load(true);
    $('mb-send').onclick = async () => {
        const title = $('mb-title').value.trim(), body = $('mb-body').value.trim();
        if (!title || !body) { Toast.show('Add a title and a message.', 'negative'); return; }
        const btn = $('mb-send'); btn.disabled = true;
        try {
            let hive = null;
            if ($('mb-hive').checked) hive = Social.myCode() || (await Social.publish(true)).code;
            const from = (Vault.state.displayName || 'The creator');
            await Social.send({ title, body, hive, from });
            $('mb-title').value = ''; $('mb-body').value = '';
            Toast.show('📬 Sent to everyone.', 'positive');
            render(Social.cachedMail());
        } catch (e) { Toast.show(e.message, 'negative'); }
        finally { btn.disabled = false; }
    };
    $('mb-list').addEventListener('click', async (e) => {
        const r = e.target.closest('[data-react]'), c = e.target.closest('[data-connect]'), d = e.target.closest('[data-del]');
        if (r) {
            const value = r.getAttribute('aria-pressed') === 'true' ? null : r.dataset.react;
            try { await Social.react(r.dataset.id, value); render(Social.cachedMail()); } catch (err) { Toast.show(err.message, 'negative'); }
        } else if (c) {
            try { await Social.add(c.dataset.connect, c.dataset.letter); Toast.show('🤝 Connected! Find them in Friends\' hives.', 'positive'); }
            catch (err) { Toast.show(err.message, 'negative'); }
        } else if (d) {
            if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = 'Tap again'; setTimeout(() => { d.dataset.armed = ''; d.textContent = 'Delete'; }, 2500); return; }
            try { render(await Social.del(d.dataset.del)); Toast.show('Deleted.', 'neutral'); } catch (err) { Toast.show(err.message, 'negative'); }
        }
    });
});
