console.log("/// HONEY MART OPEN ///");

// Honey Mart (Nov 1 2026, Craft; approved demo, from 1.0.7's Store v3).
// A game-shop feel: the clerk talks, BUY / SELL / QUIT, pockets you flip
// with ◀ ▶, a list with prices on the right, a description box, and a
// quantity box (▲ ▼) that stops at what you can afford or own.
// Buying: Vault.buyStoreItems. Selling: Vault.sellOwned (half its worth).
// Items bees hold can be sent to a friend as a gift (Social.gift); it
// arrives in their Mailbox. Incubators: Vault.buyIncubator (one each).
const esc = (t) => PV2.esc(t);
const $ = (id) => document.getElementById(id);
const BUY_POCKETS = [['held', 'Bee items'], ['trait', 'Trait gear'], ['special', 'Special'], ['incubator', 'Incubators']];
const SELL_POCKETS = [['held', 'Bee items'], ['trait', 'Trait gear'], ['special', 'Special'], ['mats', 'Materials'], ['tickets', 'Tickets']];
const pocketOf = (item) => item.kind === 'held' ? 'held' : item.kind === 'trait' ? 'trait' : 'special';
let mode = 'buy', pk = 0, sel = null, qty = 1;

const priceInfo = (item) => item.price.currency === 'coins' ? { icon: '🪙', label: 'Honey coins' }
    : (() => { const m = MATERIAL_CATALOG.find(x => x.id === item.price.materialId) || {}; return { icon: m.icon || '', label: m.label || '' }; })();
const say = (t) => { $('hm-say').textContent = t; };

function renderMoney() {
    const m = Vault.getMaterials();
    $('hm-money').innerHTML = `<span>🪙 ${Vault.getCoins()}</span>` + MATERIAL_CATALOG.filter(x => x.id !== 'royal-jelly').map(x => `<span>${x.icon} ${m[x.id] || 0}</span>`).join('');
}

// The rows for the current mode and pocket.
function rows() {
    const list = mode === 'buy' ? BUY_POCKETS : SELL_POCKETS;
    const key = list[pk % list.length][0];
    const items = Vault.getItems();
    if (mode === 'buy') {
        if (key === 'incubator') {
            const I = Vault.getIncubator ? Vault.getIncubator() : { owned: [], coins: 0 };
            return { list, key, items: INCUBATOR_ORDER.map(id => { const t = INCUBATORS[id]; const own = I.owned.includes(id);
                return { id: 'inc:' + id, inc: id, icon: t.icon, label: t.label, priceIcon: '🪙', price: t.price, have: own ? 1 : 0, max: own ? 0 : (I.coins >= t.price ? 1 : 0), owned: own,
                    text: `${t.slots} egg slot${t.slots > 1 ? 's' : ''}. 1 day off per ${t.goal.toLocaleString()} steps, up to ${t.cap} a day.${t.full ? ' Hatchlings start full.' : ''}${t.trait ? ` +${Math.round(t.trait * 100)}% birth trait chance.` : ''}` }; }) };
        }
        return { list, key, items: STORE_ITEM_CATALOG.filter(i => pocketOf(i) === key).map(i => ({ id: i.id, icon: i.icon, label: i.label, priceIcon: priceInfo(i).icon, price: i.price.amount, have: items[i.id] || 0, max: Vault.maxAffordable(i.id), text: i.description, held: i.kind === 'held' })) };
    }
    if (key === 'mats') {
        const m = Vault.getMaterials();
        return { list, key, items: MATERIAL_CATALOG.filter(x => m[x.id] > 0).map(x => ({ id: x.id, icon: x.icon, label: x.label, price: Vault.sellValue(x.id), have: m[x.id], max: m[x.id], text: x.description })) };
    }
    if (key === 'tickets') {
        const n = Vault.getTicketCount ? Vault.getTicketCount() : 0;
        return { list, key, items: n ? [{ id: 'ticket', icon: '🎟️', label: 'Gacha Ticket', price: 0, have: n, max: 0, text: 'Use it in the Pollination Chamber. Tickets can\'t be sold.' }] : [] };
    }
    return { list, key, items: STORE_ITEM_CATALOG.filter(i => pocketOf(i) === key && items[i.id] > 0).map(i => ({ id: i.id, icon: i.icon, label: i.label, price: Vault.sellValue(i.id), have: items[i.id], max: items[i.id], text: i.description, held: i.kind === 'held' })) };
}

function render() {
    renderMoney();
    $('hm-menu').querySelectorAll('[data-m]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
    if (mode === 'quit') { $('hm-body').innerHTML = ''; return; }
    const { list, items } = rows();
    const it = items.find(i => i.id === sel) || null;
    if (!it) sel = null;
    const pocket = list[pk % list.length][1];
    $('hm-body').innerHTML = `<div class="hm-pockets"><button type="button" class="hm-arrow" data-pk="-1" aria-label="Previous pocket">◀</button><div class="hm-pk">${esc(pocket)}</div><button type="button" class="hm-arrow" data-pk="1" aria-label="Next pocket">▶</button></div>
        <div class="hm-dots" aria-hidden="true">${list.map((_, i) => `<i class="${i === pk % list.length ? 'on' : ''}"></i>`).join('')}</div>
        <div class="hm-list" role="listbox" aria-label="${esc(pocket)}">${items.length ? items.map(i => `<button type="button" class="hm-li${mode === 'buy' && !i.max ? ' cant' : ''}" role="option" data-i="${esc(i.id)}" aria-selected="${i.id === sel}">
            <span class="ic">${i.icon}</span><span class="nm">${esc(i.label)}</span><span class="pr">${mode === 'buy' ? (i.owned ? 'Owned' : `${i.priceIcon} ${i.price.toLocaleString()}`) : `×${i.have}`}</span></button>`).join('')
            : `<div class="hm-li empty">${mode === 'buy' ? 'Nothing here yet.' : 'Nothing in this pocket.'}</div>`}</div>
        <div class="hm-desc">${it ? `<b>${it.icon} ${esc(it.label)}</b><span>${esc(it.text || '')}</span><small>${mode === 'buy' ? (it.inc ? (it.owned ? 'You own this one.' : '') : `In your Bag: ${it.have}`) : it.price ? `Sells for 🪙 ${it.price} each` : ''}</small>` : '<small>Pick an item.</small>'}</div>
        ${it && it.max ? `<div class="hm-q"><div class="arr"><button type="button" data-q="1" aria-label="More"${qty >= it.max ? ' disabled' : ''}>▲</button><button type="button" data-q="-1" aria-label="Fewer"${qty <= 1 ? ' disabled' : ''}>▼</button></div>
            <div class="x">× ${String(qty).padStart(2, '0')}</div><div class="tot">${mode === 'buy' ? it.priceIcon : '🪙'} ${(qty * it.price).toLocaleString()}</div></div>
            <div class="hm-acts">${mode === 'sell' && it.held ? '<button type="button" class="hm-no" id="hm-gift">🎁 Send as gift</button>' : '<button type="button" class="hm-no" id="hm-cancel">Cancel</button>'}<button type="button" class="hm-ok" id="hm-go">${mode === 'buy' ? 'BUY' : 'SELL'}</button></div>` : ''}
        ${it && !it.max && mode === 'sell' && it.held ? '<div class="hm-acts"><span></span><button type="button" class="hm-no" id="hm-gift">🎁 Send as gift</button></div>' : ''}`;
}

function pick(id) {
    sel = id; qty = 1;
    const it = rows().items.find(i => i.id === id);
    if (!it) return;
    if (mode === 'buy') say(it.owned ? `You already have a ${it.label}.` : it.max ? `${it.label}? Certainly. How many would you like?` : `Sorry, you can't afford ${it.label} yet.`);
    else say(it.price ? `${it.label}? How many would you like to sell?` : 'Sorry, I can\'t buy that.');
    if (it.inc) say(it.owned ? `You already have a ${it.label}.` : it.max ? `A ${it.label}? That'll be 🪙 ${it.price.toLocaleString()}.` : `Sorry, you need 🪙 ${it.price.toLocaleString()} for that.`);
    render();
}

function go() {
    const it = rows().items.find(i => i.id === sel);
    if (!it) return;
    if (mode === 'buy' && it.inc) {
        const r = Vault.buyIncubator(it.inc);
        if (r.ok && typeof Vault.setPluginEnabled === 'function' && !Vault.isPluginEnabled('incubator')) Vault.setPluginEnabled('incubator', true);
        say(r.ok ? `Here you go! Your ${it.label}. Put eggs inside from the Egg Incubator page. 🐝` : r.error);
    } else if (mode === 'buy') {
        const r = Vault.buyStoreItems(it.id, qty);
        say(r ? `Here you go! ${r.count} × ${it.label}. Thank you! 🐝` : 'Sorry, you can\'t afford that.');
    } else {
        const r = Vault.sellOwned(it.id, qty);
        say(r ? `Thanks! Here's 🪙 ${r.coins}.` : 'Sorry, I can\'t buy that.');
    }
    sel = null; qty = 1;
    render();
}

// 🎁 Send as gift: pick a friend (you must have added each other) and write
// a line. It arrives in their Mailbox as a letter with the item attached.
async function openGift(itemId) {
    const item = STORE_ITEM_CATALOG.find(i => i.id === itemId);
    if (!item) return;
    PV2.sheet(`<div class="head"><span class="hx big">${item.icon}</span><div><h2>Send ${esc(item.label)}</h2><small>Finding your friends…</small></div><button type="button" class="x" data-close aria-label="Close">×</button></div>`, 'Send as gift');
    let list = [];
    try { list = ((await Social.friends()).list || []).filter(f => f.status === 'ok' || f.status === 'hidden'); }
    catch (e) { PV2.close(); Toast.show(e.message || 'Sign in to Cloud sync to send gifts.', 'negative'); return; }
    if (!PV2.isOpen()) return;   // closed while loading
    let to = '';
    const box = PV2.sheet(`<div class="head"><span class="hx big">${item.icon}</span><div><h2>Send ${esc(item.label)}</h2><small>It arrives in their Mailbox.</small></div><button type="button" class="x" data-close aria-label="Close">×</button></div>
        ${list.length ? list.map(f => `<button type="button" class="hm-friend" data-to="${esc(f.code)}" aria-pressed="false">🐝 ${esc((f.card && f.card.owner) || f.name || f.code)}</button>`).join('')
            : '<p>Gifts go to friends who added you back. Add friends on Friends\' hives.</p>'}
        ${list.length ? `<label for="hm-note">NOTE <small>optional</small></label><textarea id="hm-note" maxlength="200" placeholder="A line for them"></textarea>
        <div class="btns"><button type="button" class="btn solid" id="hm-send" disabled>Send 1</button></div>` : '<div class="btns"><a class="btn" href="../friends/friends.html">Friends\' hives</a></div>'}`, 'Send as gift');
    box.addEventListener('click', async (e) => {
        const f = e.target.closest('[data-to]');
        if (f) { to = f.dataset.to; box.querySelectorAll('[data-to]').forEach(x => x.setAttribute('aria-pressed', String(x === f))); box.querySelector('#hm-send').disabled = false; return; }
        const s = e.target.closest('#hm-send');
        if (!s || !to) return;
        s.disabled = true; s.textContent = 'Sending…';
        try {
            await Social.gift(to, item.id, box.querySelector('#hm-note').value.trim());
            PV2.close();
            say(`Your ${item.label} is on its way! 🐝`);
            Toast.show(`🎁 Sent! It's in their Mailbox.`, 'positive');
            sel = null; render();
        } catch (err) { Toast.show(err.message || 'Could not send it.', 'negative'); s.disabled = false; s.textContent = 'Send 1'; }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    say('Hi there! What would you like? 🐝');
    render();
    $('hm-menu').addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]'); if (!b) return;
        mode = b.dataset.m; pk = 0; sel = null; qty = 1;
        say(mode === 'buy' ? 'Hi there! What would you like? 🐝' : mode === 'sell' ? 'What would you like to sell?' : 'Please come again! 🐝');
        render();
    });
    $('hm-body').addEventListener('click', (e) => {
        const a = e.target.closest('[data-pk]');
        if (a) { const n = rows().list.length; pk = (pk + Number(a.dataset.pk) + n) % n; sel = null; qty = 1; render(); return; }
        const r = e.target.closest('[data-i]');
        if (r) { pick(r.dataset.i); return; }
        const q = e.target.closest('[data-q]');
        if (q) { const it = rows().items.find(i => i.id === sel); if (it) { qty = Math.max(1, Math.min(it.max, qty + Number(q.dataset.q))); render(); } return; }
        if (e.target.closest('#hm-cancel')) { sel = null; say('Anything else?'); render(); return; }
        if (e.target.closest('#hm-gift')) { openGift(sel); return; }
        if (e.target.closest('#hm-go')) go();
    });
    Waggle.setActions(baseWaggleActions());
});
