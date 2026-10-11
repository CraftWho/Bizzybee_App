console.log("/// POLLINATION CHAMBER PROTOCOLS INITIALIZED ///");

// BEE_RARITIES/BEE_CLASSES/MATERIAL_CATALOG live in db.js (Vault owns bee
// data) - this file re-uses those same globals so a bee's color/loot is
// identical wherever it's rendered. Bee MANAGEMENT (rename, assign work)
// now lives on the Inventory page - this room is just acquire (pollinate/
// tickets) and refine (destroy/combine), see redacted's "more about the gacha
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
// Shared by a Pollinate pull and a successful Combine - spins a warp/
// galaxy animation (colored to match the result's rarity, so a Legendary
// pull already "feels" special before the reveal), then swaps to the
// actual bee rendered as a full (read-only) BeeCard.

function showSummonReveal(bee, { title } = {}) {
    const overlay = document.getElementById('gacha-summon-overlay');
    const stage = document.getElementById('gacha-summon-stage');
    const resultPanel = document.getElementById('gacha-summon-result');
    const titleEl = document.getElementById('gacha-summon-title');
    const cardHost = document.getElementById('gacha-summon-card');
    const closeBtn = document.getElementById('gacha-summon-close');
    if (!overlay || !stage || !resultPanel || !cardHost) return;

    stage.style.setProperty('--warp-color', beeColor(bee.rarity));

    overlay.hidden = false;
    stage.hidden = false;
    stage.classList.add('is-spinning');
    resultPanel.hidden = true;
    cardHost.innerHTML = '';

    const SPIN_DURATION_MS = 1600;
    setTimeout(() => {
        stage.classList.remove('is-spinning');
        stage.hidden = true;

        titleEl.textContent = title || `${bee.name} joined the colony!`;
        BeeCard.render(cardHost, bee, { editable: false });
        resultPanel.hidden = false;
    }, SPIN_DURATION_MS);

    closeBtn.addEventListener('click', () => {
        overlay.hidden = true;
        stage.classList.remove('is-spinning');
    }, { once: true });
}

function pollinateForNewBee() {
    const bee = Vault.awardBee('gacha');
    Toast.show(`🐝 ${bee.name} joined the colony!`, 'positive');
    showSummonReveal(bee, { title: `🌼 ${bee.name} joined the colony!` });
    renderCollectionCounters();
    renderRefineSelects();
}

// --- GACHA TICKET / FOIL-CARD UNWRAP -------------------------------------
// Tickets come from leveling up and completing high-effort quests (see
// db.js's _syncLevelUpBees/_awardQuestTicketIfSignificant). Unwrapping one
// is a tap-or-swipe "tear the foil" reveal, guaranteed to produce a Named
// Beast (the only way to get that rarity - see BEE_RARITIES in db.js).
// This keeps its own foil-tear animation rather than the warp popup above
// - a different, deliberately more "precious single pull" moment.

function renderTicketPanel() {
    const countEl = document.getElementById('gacha-ticket-count');
    if (countEl) countEl.textContent = Vault.getTicketCount();
    resetFoilCard();
}

function resetFoilCard() {
    const wrap = document.getElementById('gacha-foil-wrap');
    const back = document.getElementById('gacha-foil-back');
    if (!wrap || !back) return;

    wrap.classList.remove('is-torn');
    wrap.classList.toggle('is-empty', Vault.getTicketCount() <= 0);
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
        Toast.show('🎟️ No tickets to unwrap yet.', 'negative');
        return;
    }

    back.innerHTML = `
        <span class="gacha-foil-reveal-icon" id="gacha-foil-reveal-icon"></span>
        <span class="gacha-foil-reveal-name" style="color:${beeColor(bee.rarity)};">${bee.name}</span>
        <span class="gacha-foil-reveal-rarity">✨ Named Beast</span>
    `;
    wrap.classList.add('is-torn');

    const iconEl = document.getElementById('gacha-foil-reveal-icon');
    if (iconEl) NanoBee.render(iconEl, 'swarm', { color: beeColor(bee.rarity), hideCore: true, noFlight: true });

    Toast.show(`🎟️ Unwrapped ${bee.name}!`, 'positive');
    document.getElementById('gacha-ticket-count').textContent = Vault.getTicketCount();
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

function handleDestroy() {
    const select = document.getElementById('gacha-destroy-select');
    const beeId = select.value;
    if (!beeId) {
        Toast.show('Pick a bee to destroy first.', 'negative');
        return;
    }

    const bee = Vault.getColonyBees().find(b => b.id === beeId);
    if (!bee) return;
    if (!confirm(`Destroy ${bee.name}? This can't be undone.`)) return;

    const result = Vault.destroyBee(beeId);
    if (!result) return;

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
        title: result.upgraded ? `✨ Upgraded into ${result.newBee.name}!` : `🧬 ${result.newBee.name} emerged!`
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderCollectionCounters();
    renderTicketPanel();
    renderRefineSelects();
    setupFoilCard();

    document.getElementById('gacha-pollinate-btn').addEventListener('click', pollinateForNewBee);
    document.getElementById('gacha-destroy-btn').addEventListener('click', handleDestroy);
    document.getElementById('gacha-combine-btn').addEventListener('click', handleCombine);

    Waggle.setActions(baseWaggleActions());
});
