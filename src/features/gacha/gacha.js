console.log("/// POLLINATION CHAMBER PROTOCOLS INITIALIZED ///");

// BEE_RARITIES/BEE_CLASSES/MATERIAL_CATALOG live in db.js (Vault owns bee
// data) - this file re-uses those same globals so a bee's color/loot is
// identical wherever it's rendered. Bee MANAGEMENT (rename, assign work)
// now lives on the Inventory page - this room is just acquire (pollinate/
// tickets) and refine (destroy/combine), see Leo's "more about the gacha
// game" framing.

function beeColor(rarity) {
    const info = BEE_RARITIES.find(r => r.rarity === rarity);
    return info ? info.color : BEE_RARITIES[0].color;
}

function renderCollectionCounters() {
    const el = document.getElementById('gacha-collection-counter');
    if (!el) return;
    const bees = Vault.getColonyBees();
    const special = bees.filter(b => b.rarity === 'Named').length;
    const normal = bees.length - special;
    el.innerHTML = `<span>🐝 Normal <strong>${normal}</strong></span><span>✨ Special <strong>${special}</strong></span>`;
}

// --- SUMMON POPUP --------------------------------------------------------
// Shared by a Pollinate pull and a successful Combine. The full-screen
// effect (gacha-fx.js) plays first - a pull by default, or whatever `play`
// returns (combine) - then the result panel shows the real BeeCard.
async function showSummonReveal(bee, { title, play } = {}) {
    if (typeof GachaFX !== 'undefined') {
        try { await (play ? play() : GachaFX.pull(bee)); } catch (e) { console.error(e); }
    }
    return showSummonResult(bee, { title });
}

function showSummonResult(bee, { title } = {}) {
    const overlay = document.getElementById('gacha-summon-overlay');
    const resultPanel = document.getElementById('gacha-summon-result');
    const titleEl = document.getElementById('gacha-summon-title');
    const cardHost = document.getElementById('gacha-summon-card');
    const closeBtn = document.getElementById('gacha-summon-close');
    if (!overlay || !resultPanel || !cardHost) return;

    overlay.hidden = false;
    titleEl.textContent = title || `${bee.name} joined the colony!`;
    BeeCard.render(cardHost, bee, { editable: false });
    // Name it now (Oct 2026): a random name is already set; 🎲 for another.
    const nameHost = document.getElementById('gacha-summon-name');
    if (nameHost && typeof BeeName !== 'undefined' && bee.rarity !== 'Royal') {
        BeeName.mount(nameHost, bee, {
            label: 'Name your new bee',
            onSaved: (r) => { titleEl.textContent = `${r.name} joined the colony!`; BeeCard.render(cardHost, r, { editable: false }); }
        });
    } else if (nameHost) nameHost.innerHTML = '';
    resultPanel.hidden = false;

    closeBtn.addEventListener('click', () => { overlay.hidden = true; }, { once: true });
}

// Oct 2026: no more free pulls - each costs a ticket, with a guaranteed
// Rare or better on the 6th pull in a row without one (Vault.pullWithTicket).
function pollinateForNewBee() {
    const result = Vault.pullWithTicket();
    if (!result) { Toast.show('🎟️ You need a ticket to pollinate. Level up you or your skills to earn more.', 'negative'); renderTicketPanel(); return; }
    const { bee, guaranteed } = result;
    Toast.show(`🐝 ${bee.name} joined the colony!${guaranteed ? ' (guaranteed Rare+)' : ''}`, 'positive');
    showSummonReveal(bee, { title: `🌼 ${bee.name} joined the colony!` });
    renderCollectionCounters();
    renderRefineSelects();
    renderTicketPanel();
}

// --- GACHA TICKET / FOIL-CARD UNWRAP -------------------------------------
// Tickets come from leveling up and completing high-effort quests (see
// db.js's _syncLevelUpBees/_awardQuestTicketIfSignificant). Unwrapping one
// is a tap-or-swipe "tear the foil" reveal, guaranteed to produce a Named
// Beast (the only way to get that rarity - see BEE_RARITIES in db.js).
// This keeps its own foil-tear animation rather than the summon popup above
// - a different, deliberately more "precious single pull" moment.

// Ten pulls at once: a quick grid of what you got (best first), pity
// still applies to each pull.
function pollinateMany(n) {
    if (Vault.getTicketCount() < n) { Toast.show(`🎟️ You need ${n} tickets for ×${n}.`, 'negative'); return; }
    const results = [];
    for (let i = 0; i < n; i++) { const r = Vault.pullWithTicket(); if (r) results.push(r); }
    const order = ['Legendary', 'Epic', 'Rare', 'Common'];
    results.sort((a, b) => order.indexOf(a.bee.rarity) - order.indexOf(b.bee.rarity));
    const box = document.getElementById('gacha-multi');
    const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    box.innerHTML = `<p class="gacha-multi-head">×${results.length} pulled</p><ul>${results.map(r =>
        `<li style="--rc:${beeColor(r.bee.rarity)}"><b>${esc(r.bee.name)}</b><small>${r.bee.rarity}${r.guaranteed ? ' · guaranteed' : ''}</small></li>`).join('')}</ul>`;
    box.hidden = false;
    const best = results[0];
    if (best && best.bee.rarity !== 'Common') showSummonReveal(best.bee, { title: `🌼 Best pull: ${best.bee.name}!` });
    Toast.show(`🐝 ${results.length} bees joined the colony!`, 'positive');
    renderCollectionCounters();
    renderRefineSelects();
    renderTicketPanel();
}

function renderTicketPanel() {
    const countEl = document.getElementById('gacha-ticket-count');
    if (countEl) countEl.textContent = Vault.getTicketCount();
    const btn = document.getElementById('gacha-pollinate-btn');
    if (btn) btn.disabled = Vault.getTicketCount() < 1;
    const btn10 = document.getElementById('gacha-pollinate10-btn');
    if (btn10) btn10.disabled = Vault.getTicketCount() < 10;
    const pity = document.getElementById('gacha-pity');
    if (pity) pity.textContent = `Guaranteed Rare+ in ${Math.max(1, 6 - Vault.getPityCount())} pull${6 - Vault.getPityCount() === 1 ? '' : 's'}.`;
    resetFoilCard();
}

function resetFoilCard() {
    const wrap = document.getElementById('gacha-foil-wrap');
    const back = document.getElementById('gacha-foil-back');
    if (!wrap || !back) return;

    wrap.classList.remove('is-torn');
    wrap.classList.toggle('is-empty', Vault.getTicketCount() < NAMED_BEAST_TICKETS);
    back.innerHTML = '';
}

function unwrapFoilCard() {
    const wrap = document.getElementById('gacha-foil-wrap');
    const back = document.getElementById('gacha-foil-back');
    if (!wrap || !back) return;

    // A tap on an already-revealed card re-wraps it, ready for the next
    // ticket (if any) - lets you keep tapping through several in a row.
    if (wrap.classList.contains('is-torn')) {
        resetFoilCard();
        return;
    }

    if (wrap.classList.contains('is-empty')) return;

    const bee = Vault.unwrapTicket();
    if (!bee) {
        Toast.show(`🎟️ A Named Beast takes ${NAMED_BEAST_TICKETS} tickets.`, 'negative');
        return;
    }

    back.innerHTML = `
        <span class="gacha-foil-reveal-icon" id="gacha-foil-reveal-icon"></span>
        <span class="gacha-foil-reveal-name" style="color:${beeColor(bee.rarity)};">${typeof beeFullName === 'function' ? beeFullName(bee) : bee.name}</span>
        <span class="gacha-foil-reveal-rarity">✨ Named Beast</span>
    `;
    wrap.classList.add('is-torn');

    const iconEl = document.getElementById('gacha-foil-reveal-icon');
    if (iconEl) NanoBee.render(iconEl, 'swarm', { color: beeColor(bee.rarity), hideCore: true, noFlight: true });

    Toast.show(`🎟️ Unwrapped ${typeof beeFullName === 'function' ? beeFullName(bee) : bee.name}!`, 'positive');
    document.getElementById('gacha-ticket-count').textContent = Vault.getTicketCount();
    const pbtn = document.getElementById('gacha-pollinate-btn');
    if (pbtn) pbtn.disabled = Vault.getTicketCount() < 1;
    const pbtn10 = document.getElementById('gacha-pollinate10-btn');
    if (pbtn10) pbtn10.disabled = Vault.getTicketCount() < 10;
    renderCollectionCounters();
    renderRefineSelects();
}

function setupFoilCard() {
    const wrap = document.getElementById('gacha-foil-wrap');
    if (!wrap) return;

    wrap.addEventListener('click', unwrapFoilCard);

    // Swipe support, in addition to plain tap/click above - a real swipe
    // (vertical drag past the threshold) triggers immediately on
    // touchend; a plain tap still falls through to the click listener.
    // unwrapFoilCard() is idempotent once torn (see the is-torn guard
    // above), so if both fire for the same tap, the second call just
    // re-wraps instead of double-spending a ticket.
    let touchStartY = null;
    wrap.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    wrap.addEventListener('touchend', (e) => {
        if (touchStartY === null) return;
        const dy = e.changedTouches[0].clientY - touchStartY;
        touchStartY = null;
        if (Math.abs(dy) > 30) unwrapFoilCard();
    }, { passive: true });
}

// --- REFINE: destroy for loot / combine for a chance at better ----------

function beeOptionsHTML(bees) {
    return bees.map(b => `<option value="${b.id}">${b.name} (${b.rarity})</option>`).join('');
}

function renderRefineSelects() {
    const bees = Vault.getColonyBees().slice().reverse();
    const destroySelect = document.getElementById('gacha-destroy-select');
    const comboA = document.getElementById('gacha-combine-select-a');
    const comboB = document.getElementById('gacha-combine-select-b');
    const destroyBtn = document.getElementById('gacha-destroy-btn');
    const combineBtn = document.getElementById('gacha-combine-btn');
    if (!destroySelect || !comboA || !comboB) return;

    const placeholder = bees.length === 0
        ? '<option value="">No bees yet</option>'
        : '<option value="">Select a bee…</option>';

    destroySelect.innerHTML = placeholder + beeOptionsHTML(bees);
    comboA.innerHTML = placeholder + beeOptionsHTML(bees);
    comboB.innerHTML = placeholder + beeOptionsHTML(bees);

    destroySelect.disabled = bees.length === 0;
    destroyBtn.disabled = bees.length === 0;
    comboA.disabled = bees.length < 2;
    comboB.disabled = bees.length < 2;
    combineBtn.disabled = bees.length < 2;
}

function lootSummaryHTML(loot) {
    const counts = {};
    loot.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    return Object.entries(counts).map(([id, count]) => {
        const material = MATERIAL_CATALOG.find(m => m.id === id);
        const label = material ? `${material.icon} ${material.label}` : id;
        return `${label} x${count}`;
    }).join(', ');
}

async function handleDestroy() {
    const select = document.getElementById('gacha-destroy-select');
    const beeId = select.value;
    if (!beeId) {
        Toast.show('Pick a bee to destroy first.', 'negative');
        return;
    }

    const bee = Vault.getColonyBees().find(b => b.id === beeId);
    if (!bee) return;
    if (!confirm(`Destroy ${bee.name}? This can't be undone.`)) return;

    const snapshot = JSON.parse(JSON.stringify(bee));
    const result = Vault.destroyBee(beeId);
    if (!result) return;
    renderRefineSelects();
    renderCollectionCounters();
    if (typeof GachaFX !== 'undefined') { try { await GachaFX.destroy(snapshot, result.loot); } catch (e) { console.error(e); } }

    const lootText = lootSummaryHTML(result.loot);
    document.getElementById('gacha-destroy-result').textContent = `Got: ${lootText}`;
    Toast.show(`💥 ${result.removed.name} broken down into ${lootText}`, 'positive');

    renderRefineSelects();
    renderCollectionCounters();
}

function handleCombine() {
    const idA = document.getElementById('gacha-combine-select-a').value;
    const idB = document.getElementById('gacha-combine-select-b').value;

    if (!idA || !idB) {
        Toast.show('Pick two bees to combine.', 'negative');
        return;
    }
    if (idA === idB) {
        Toast.show('Pick two different bees.', 'negative');
        return;
    }

    const beeA = Vault.getColonyBees().find(b => b.id === idA);
    const beeB = Vault.getColonyBees().find(b => b.id === idB);
    if (!beeA || !beeB) return;
    if (!confirm(`Combine ${beeA.name} and ${beeB.name}? Both will be consumed.`)) return;

    const snapA = JSON.parse(JSON.stringify(beeA)), snapB = JSON.parse(JSON.stringify(beeB));
    const result = Vault.combineBees(idA, idB);
    if (!result) {
        Toast.show('Combine failed - pick two different bees.', 'negative');
        return;
    }

    const gain = result.statGain > 0 ? ` Stats +${result.statGain}.` : '';
    document.getElementById('gacha-combine-result').textContent = result.upgraded
        ? `✨ Upgraded into ${result.newBee.name} (${result.newBee.rarity})!${gain}`
        : `${result.newBee.name} (${result.newBee.rarity}) emerged.${gain}`;

    renderRefineSelects();
    renderCollectionCounters();
    showSummonReveal(result.newBee, {
        title: result.upgraded ? `✨ Upgraded into ${result.newBee.name}!` : `🧬 ${result.newBee.name} emerged!`,
        play: typeof GachaFX !== 'undefined' ? () => GachaFX.combine(snapA, snapB, result.newBee, result.upgraded) : null
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderCollectionCounters();
    renderTicketPanel();
    renderRefineSelects();
    setupFoilCard();

    document.getElementById('gacha-pollinate-btn').addEventListener('click', pollinateForNewBee);
    document.getElementById('gacha-pollinate10-btn').addEventListener('click', () => pollinateMany(10));
    document.getElementById('gacha-destroy-btn').addEventListener('click', handleDestroy);
    document.getElementById('gacha-combine-btn').addEventListener('click', handleCombine);

    Waggle.setActions(baseWaggleActions());
});
