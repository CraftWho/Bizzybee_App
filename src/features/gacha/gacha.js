console.log("/// POLLINATION CHAMBER PROTOCOLS INITIALIZED ///");

// BEE_RARITIES/BEE_CLASSES/MATERIAL_CATALOG live in db.js (Vault owns bee
// data) - this file re-uses those same globals so a bee's color/loot is
// identical wherever it's rendered. Bee MANAGEMENT (rename, assign work)
// now lives on the Inventory page - this room is just acquire (pollinate/
// tickets) and refine (destroy/combine), see Craft's "more about the gacha
// game" framing.

function beeColor(rarity) {
    const info = BEE_RARITIES.find(r => r.rarity === rarity);
    return info ? info.color : BEE_RARITIES[0].color;
}

function renderCollectionCounters() {
    const el = document.getElementById('gacha-collection-counter');
    if (!el) return;
    const bees = Vault.getHiveBees();
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
    titleEl.textContent = title || `${bee.name} joined the hive!`;
    BeeCard.render(cardHost, bee, { editable: false });
    // Name it now (Oct 2026): a random name is already set; 🎲 for another.
    const nameHost = document.getElementById('gacha-summon-name');
    if (nameHost && typeof BeeName !== 'undefined' && bee.rarity !== 'Royal') {
        BeeName.mount(nameHost, bee, {
            label: 'Name your new bee',
            onSaved: (r) => { titleEl.textContent = `${r.name} joined the hive!`; BeeCard.render(cardHost, r, { editable: false }); }
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
    Toast.show(`🐝 ${bee.name} joined the hive!${guaranteed ? ' (guaranteed Rare+)' : ''}`, 'positive');
    showSummonReveal(bee, { title: `🌼 ${bee.name} joined the hive!` });
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
    Toast.show(`🐝 ${results.length} bees joined the hive!`, 'positive');
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

// Nov 3 2026 (Craft; approved demo): merge picker.
// Nov 6 2026 (Craft; approved demo v2): one list, best to merge first.
// 1) bees that can't get a job (its job is locked or full), 2) bees with a
// free slot, 3) working bees. Weakest first inside each part, so your
// strongest bees sit at the very bottom. Tapping sets the two hidden
// selects that handleCombine reads. ?pick=<id> (from the Rest Comb's 🧬)
// starts with that bee picked.
let mpFilter = 'spare';
let mpPicked = [];
function mpEsc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const MP_RANK = { spare: 0, idle: 1, work: 2 };
const MP_HEAD = ['Merge these first', 'Could work: a slot is free', 'Working'];
function mpJob(b) { return (typeof beeLockedJob === 'function' && beeLockedJob(b)) || b.talent || null; }
function mpPower(b) { const j = mpJob(b); return (typeof beeJobScore === 'function' && BEE_CLASSES[j]) ? beeJobScore(b, j) : 0; }
function mpWhy(b, s) {
    if (s === 'work') return ['Working', 'is-work'];
    const j = mpJob(b);
    if (s === 'idle') return ['Slot free', 'is-idle'];
    if (!j || !BEE_CLASSES[j]) return ['No job', 'is-spare'];
    if (!Vault.hiveOpenJobs().includes(j)) { const l = Vault.hiveJobLadder().find(x => x.job === j); return [`🔒 Opens Lv ${l ? l.lv : '?'}`, 'is-spare']; }
    return [`Job full ${Vault.jobHolders(j).length}/${Vault.jobSlots(j)}`, 'is-spare'];
}
// Nov 9 2026 (Craft; approved demo): every row says the sex, the job the bee can
// work, and WHY it is spare. The old power number is gone.
function mpReason(b, s) {
    const j = mpJob(b), info = BEE_CLASSES[j], lab = info ? info.label : '';
    if (s === 'work') return `Working as ${BEE_CLASSES[b.class] ? BEE_CLASSES[b.class].label : 'a worker'}`;
    if (!info) return 'No job matches its talent';
    if (s === 'idle') return `${lab} slot is free (${Vault.jobHolders(j).length}/${Vault.jobSlots(j)})`;
    if (!Vault.hiveOpenJobs().includes(j)) { const l = Vault.hiveJobLadder().find(x => x.job === j); return `${lab} opens Lv ${l ? l.lv : '?'}`; }
    return `${lab} is full (${Vault.jobHolders(j).length}/${Vault.jobSlots(j)})`;
}
const mpSex = (b) => b.sex === 'f' ? '<i class="mp-sx f" title="Female">♀</i>' : b.sex === 'm' ? '<i class="mp-sx m" title="Male">♂</i>' : '';
const mpSexTxt = (b) => b.sex === 'f' ? '♀' : b.sex === 'm' ? '♂' : '';
function renderMergePicker() {
    const list = document.getElementById('mp-list');
    if (!list || typeof Vault.beeMergeStatus !== 'function') return;
    const bees = Vault.getHiveBees().map(b => ({ b, s: Vault.beeMergeStatus(b) })).filter(x => x.s);
    document.getElementById('mp-c-spare').textContent = bees.filter(x => x.s === 'spare').length;
    document.getElementById('mp-c-all').textContent = bees.length;
    mpPicked = mpPicked.filter(id => bees.some(x => x.b.id === id));
    const shown = bees.filter(x => mpFilter === 'all' || x.s === 'spare' || mpPicked.includes(x.b.id))
        .map(x => ({ ...x, p: mpPower(x.b) }))
        .sort((a, z) => MP_RANK[a.s] - MP_RANK[z.s] || a.p - z.p);
    let last = -1;
    list.innerHTML = shown.length ? '<div class="mp-grp">' + shown.map(x => {
        const r = MP_RANK[x.s], [why, cls] = mpWhy(x.b, x.s), info = BEE_CLASSES[mpJob(x.b)];
        const head = r !== last ? `<h3><span>${MP_HEAD[r]}</span></h3>` : '';
        last = r;
        return head + `<div class="mp-row"><button type="button" class="mp-bee" data-mp="${mpEsc(x.b.id)}" aria-pressed="${mpPicked.includes(x.b.id)}"><span class="mid"><span class="mp-top"><span class="mp-nm" data-mpcard="${mpEsc(x.b.id)}">${mpEsc(x.b.name)}</span>${mpSex(x.b)}<small class="mp-rar">${mpEsc(x.b.rarity)}</small></span><small class="mp-meta">${info ? info.icon + ' ' + mpEsc(info.label) : 'No talent'} · <span class="mp-why ${cls}">${mpEsc(mpReason(x.b, x.s))}</span></small></span><span class="mp-st ${cls}">${mpEsc(why)}</span></button><button type="button" class="mp-card" data-mpcard="${mpEsc(x.b.id)}" aria-label="Open ${mpEsc(x.b.name)}'s card">Card ›</button></div>`;
    }).join('') + '</div>' : '<p class="mp-key">Nothing here.</p>';
    const [a, b] = mpPicked.map(id => Vault.getHiveBees().find(x => x.id === id));
    const pick = document.getElementById('mp-pick');
    const jl = (x) => { const i = BEE_CLASSES[mpJob(x)]; return i ? ` ${i.icon} ${mpEsc(i.label)}` : ''; };
    pick.innerHTML = !a ? 'Pick two bees.' : !b ? `<b>${mpEsc(a.name)}</b> ${mpSexTxt(a)}${jl(a)} + …` : `<b>${mpEsc(a.name)}</b> ${mpSexTxt(a)}${jl(a)} + <b>${mpEsc(b.name)}</b> ${mpSexTxt(b)}${jl(b)}${a.talent && a.talent === b.talent ? ' · same talent' : ''}<br><small>The new bee is always female. 1 in 10 is a Rare male Drone.</small>`;
    document.getElementById('gacha-combine-select-a').value = a ? a.id : '';
    document.getElementById('gacha-combine-select-b').value = b ? b.id : '';
    document.getElementById('gacha-combine-btn').disabled = !(a && b);
}
// A quick sheet for one bee: the things that matter when you choose what to merge.
// Opens on the real collectible card; "Details" shows the merge info.
function mpOpenSheet(id) {
    const b = Vault.getHiveBees().find(x => x.id === id);
    if (!b) return;
    const st = Vault.beeMergeStatus(b), j = mpJob(b), info = BEE_CLASSES[j];
    const L = b.life || {};
    const now = L.faintedAt ? 'Fainted' : L.nursery ? 'In a Nursery bed' : L.recuperate ? 'Recuperating' : st === 'work' ? mpReason(b, 'work') : st === 'idle' ? 'No job. ' + mpReason(b, 'idle') : 'Spare. ' + mpReason(b, st);
    document.querySelectorAll('.mp-sheet-bg').forEach(n => n.remove());
    const bg = document.createElement('div');
    bg.className = 'mp-sheet-bg';
    const close = () => bg.remove();
    const basic = () => {
        bg.innerHTML = `<div class="mp-sheet" role="dialog" aria-label="${mpEsc(b.name)}">
            <h2>${mpEsc(b.name)} ${mpSex(b)} <small class="mp-rar">${mpEsc(b.rarity)}</small></h2>
            <dl class="mp-kv">
                <div><dt>Can work as</dt><dd><b>${info ? info.icon + ' ' + mpEsc(info.label) : 'No talent'}</b>${info ? `<small>${mpEsc(info.description)}</small>` : ''}</dd></div>
                <div><dt>Sex</dt><dd>${b.sex === 'm' ? '♂ Male. Can only be a Drone.' : b.sex === 'f' ? '♀ Female' : '—'}</dd></div>
                <div><dt>Right now</dt><dd>${mpEsc(now)}</dd></div>
                <div><dt>Level</dt><dd class="mp-soon">Bee levels come later. This line fills in then.</dd></div>
            </dl>
            <div class="mp-sheet-btns"><button type="button" class="mp-full">Card</button><button type="button" class="mp-close">Close</button></div>
        </div>`;
        bg.querySelector('.mp-close').onclick = close;
        bg.querySelector('.mp-full').onclick = full;
    };
    const full = () => {
        bg.innerHTML = `<div class="mp-sheet mp-sheet--card" role="dialog" aria-label="${mpEsc(b.name)} card"><div class="mp-cardhost"></div><div class="mp-sheet-btns"><button type="button" class="mp-back">Details</button><button type="button" class="mp-close">Close</button></div></div>`;
        if (typeof BeeCard !== 'undefined') BeeCard.render(bg.querySelector('.mp-cardhost'), b, { editable: false });
        bg.querySelector('.mp-back').onclick = basic;   // "Details"
        bg.querySelector('.mp-close').onclick = close;
    };
    bg.onclick = (e) => { if (e.target === bg) close(); };
    // Nov 21 2026 (Craft: "buttons not pulling up the card"): Card › opens the real card; Details has the merge info.
    full();
    document.body.appendChild(bg);
}
function setupMergePicker() {
    const block = document.getElementById('merge');
    if (!block) return;
    block.addEventListener('click', (e) => {
        const f = e.target.closest('[data-mpf]');
        if (f) { mpFilter = f.dataset.mpf; block.querySelectorAll('[data-mpf]').forEach(x => x.setAttribute('aria-pressed', String(x === f))); renderMergePicker(); return; }
        const cd = e.target.closest('[data-mpcard]');
        if (cd) { e.stopPropagation(); mpOpenSheet(cd.dataset.mpcard); return; }
        const c = e.target.closest('[data-mp]');
        if (c) { const id = c.dataset.mp; mpPicked = mpPicked.includes(id) ? mpPicked.filter(x => x !== id) : [...mpPicked, id].slice(-2); renderMergePicker(); }
    });
    // Bees can change after the page opens (eggs hatch, jobs change): keep it current.
    window.addEventListener('vault-saved', () => renderMergePicker());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderMergePicker(); });
    setTimeout(renderMergePicker, 1500);
    const pre = new URLSearchParams(location.search).get('pick');   // Nov 6 2026 (Craft): from the Rest Comb's 🧬
    if (pre) { mpPicked = [pre]; renderMergePicker(); }
    if (location.hash === '#merge') setTimeout(() => block.scrollIntoView({ block: 'start' }), 300);
}

function renderRefineSelects() {
    const bees = Vault.getHiveBees().slice().reverse();
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
    if (mpPicked.length === 2) mpPicked = [];   // Nov 3 2026 (Craft): fresh picks after a merge
    renderMergePicker();
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

    const bee = Vault.getHiveBees().find(b => b.id === beeId);
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
    // Nov 3 2026 (Craft): the merge picker's two picks, else the old selects.
    const idA = mpPicked.length === 2 ? mpPicked[0] : document.getElementById('gacha-combine-select-a').value;
    const idB = mpPicked.length === 2 ? mpPicked[1] : document.getElementById('gacha-combine-select-b').value;

    if (!idA || !idB) {
        Toast.show('Pick two bees to combine.', 'negative');
        return;
    }
    if (idA === idB) {
        Toast.show('Pick two different bees.', 'negative');
        return;
    }

    const beeA = Vault.getHiveBees().find(b => b.id === idA);
    const beeB = Vault.getHiveBees().find(b => b.id === idB);
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
    setupMergePicker();
    setupFoilCard();

    document.getElementById('gacha-pollinate-btn').addEventListener('click', pollinateForNewBee);
    document.getElementById('gacha-pollinate10-btn').addEventListener('click', () => pollinateMany(10));
    document.getElementById('gacha-destroy-btn').addEventListener('click', handleDestroy);
    document.getElementById('gacha-combine-btn').addEventListener('click', handleCombine);

    Waggle.setActions(baseWaggleActions());
});
