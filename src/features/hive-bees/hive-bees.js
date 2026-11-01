console.log("/// HIVE BEES ONLINE ///");

// Hive Bees. Oct 31 2026 (Craft, approved demo "BizzyBee Card Binder"):
// your card binder. Cover Flow (like the old iPod) of every hatched bee:
// drag with your finger, flick fast to jump by codex number (or letter, rarity
// or date, by the sort), a click wheel (SORT, prev/next, LIST, center =
// select/flip), a slider, a hexagon search box, a full-screen list that pauses
// the hive behind it, and a big card where Rare-and-up cards catch the light
// (BeeCardGlare in bee-card.js). "Care & details" opens the old bee sheet
// (vitals, Nursery, held items). Jobs are set in the Hive Mind.
// Mood faces come from beeFeeling() in db.js (same as the Hive Life combs).
const CB_TABS = [
    ['all', 'All'], ['working', 'Working'], ['idle', 'No job'], ['help', 'Need help']
];
const CB_RARITY_RANK = ['Royal', 'Named', 'Legendary', 'Epic', 'Rare', 'Common'];

const cbIsEgg = (b) => typeof beeIsBrood === 'function' && beeIsBrood(b);
const cbIsRoyal = (b) => b.rarity === 'Royal';
function cbFeeling(b) {
    if (cbIsRoyal(b)) return { key: 'royal', face: '👑', why: `Your ${b.royal === 'king' ? 'King' : 'Queen'}` };
    return typeof beeFeeling === 'function' ? beeFeeling(b) : { key: 'calm', face: '🙂', why: '' };
}
function cbNurses() { return Vault._workers ? Vault._workers('nurse').length : 0; }
function cbJobText(b) {
    const job = b.class && BEE_CLASSES[b.class];
    if (cbIsRoyal(b)) return `👑 ${b.royal === 'king' ? 'King' : 'Queen'}`;
    if (cbIsEgg(b)) {
        const left = broodDaysLeft(b, todayISO(), cbNurses());
        return `🥚 Egg · hatches ${left <= 1 ? 'tomorrow' : `in ${left} days`}${job ? ` · will be a ${job.label}` : ''}`;
    }
    if (b.life && b.life.nursery) return '🛏️ In the Nursery';
    if (b.life && b.life.recuperate) return '💤 Recuperating';
    return job ? `${b.talent === b.class && b.rarity !== 'Named' ? '⭐ ' : ''}${job.icon} ${job.label}` : '— No job';
}

// What each vital is doing this hour (Oct 28 2026): [stamina, fullness, happiness, fatigue, health].
function cbRates(b) {
    const L = b.life;
    if (!L || L.faintedAt || L.hatchOn) return null;
    const night = typeof isNightHour === 'function' && isNightHour(new Date().getHours());
    const working = !night && !!b.class && !L.recuperate && beeCanWork(b);
    if (working) {
        const r = JOB_RATES[b.class] || [-4, -3, -1, 2.5];
        return { mode: `${BEE_CLASSES[b.class].icon} Working`, v: [r[0], r[1], r[2], +(r[3] * beeFatigueFactor(b)).toFixed(1), L.fullness >= 50 ? 0.2 : 0] };
    }
    const r = L.nursery ? REST_RATES.nursery : night ? REST_RATES.night : REST_RATES.day;
    const mode = L.nursery ? '🛏️ In a Nursery bed' : night ? '🌙 Asleep' : b.class ? '💤 Resting (can\'t work right now)' : '💤 Recuperating';
    return { mode, v: [r[0], r[1], r[2], r[3], (L.nursery || L.fullness >= 50) ? r[4] : 0] };
}
const cbRate = (n) => !n ? '' : `<small class="cb-rate ${n > 0 ? 'up' : 'down'}">${n > 0 ? '▲' : '▼'}${Math.abs(n)}/h</small>`;
// The bee's own art (same picture as its card), as a small square.
function cbArt(b, cls = '') {
    if (cbIsEgg(b)) return `<span class="cb-egg ${cls}" aria-hidden="true">${typeof EggDesign !== 'undefined' ? EggDesign.forBee(b) : '🥚'}</span>`;
    const key = String(b.rarity || 'common').toLowerCase();
    const rarityKey = (typeof BEE_CARD_RARITY_KEYS !== 'undefined' && BEE_CARD_RARITY_KEYS.includes(key)) ? key : 'common';
    const el = b.element && typeof BEE_ELEMENTS !== 'undefined' && BEE_ELEMENTS[b.element] ? b.element : 'none';
    return `<span class="cb-art bc-v2 bc-tile bc-r-${rarityKey} bc-e-${el} ${cls}" aria-hidden="true">${beeCardArtHTML({ rarityKey, rivets: 0, royal: b.royal || null })}</span>`;
}
function cbMatches(b, tab) {
    const f = cbFeeling(b).key;
    if (tab === 'working') return !!b.class && !cbIsEgg(b);
    if (tab === 'idle') return !b.class && !cbIsEgg(b) && !cbIsRoyal(b);
    if (tab === 'eggs') return cbIsEgg(b);
    if (tab === 'help') return f === 'sad' || f === 'upset' || f === 'fainted';
    return true;
}
function cbVital(icon, label, value, color, rate = 0) {
    value = Math.round(value);
    return `<div class="cb-vital"><span>${icon} ${label}</span><span class="cb-bar-v" role="progressbar" aria-label="${label}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><i style="width:${value}%;background:${color}"></i></span><span class="cb-num">${value}${cbRate(rate)}</span></div>`;
}

function cbOpenBee(id) {
    const esc = PV2.esc;
    const b = Vault.getHiveBees().find(x => x.id === id);
    if (!b) { PV2.close(); return; }
    const f = cbFeeling(b);
    const L = b.life;
    const jobs = Object.keys(BEE_CLASSES).filter(j => !!BEE_CLASSES[j].maleOnly === (b.sex === 'm'));
    const locked = typeof beeLockedJob === 'function' ? beeLockedJob(b) : null;
    const talent = b.talent && BEE_CLASSES[b.talent] && b.rarity !== 'Named' ? BEE_CLASSES[b.talent] : null;
    // Oct 31 2026 (Craft): jobs are set in the Hive Mind now (Hive Life combs), not here.
    const jobPicker = cbIsRoyal(b) ? '' : `<p class="cb-jobline">Job: <b style="color:var(--ink)">${esc(cbJobText(b))}</b>${locked ? ' 🔒 set by its title' : ''}. <a href="../hive-mind/hive-mind.html">Change jobs in the Hive Mind ›</a></p>
        ${talent ? `<p>⭐ Natural talent: <b style="color:var(--ink)">${talent.icon} ${esc(talent.label)}</b>. It's 20% better at that job${b.class === b.talent ? ', and doing it now' : ''}.</p>` : ''}`;
    // Eggs (Oct 27 2026): everything stays a secret until it hatches. No
    // rarity, sex, talent, stats, card or job until then.
    if (cbIsEgg(b)) {
        const egg = PV2.sheet(`
            <div class="head"><span class="cb-av">${cbArt(b, 'big')}</span>
                <div><h2>${esc(b.name)}</h2><small>🥚 Mystery egg</small><br><small>${esc(cbJobText(b))}</small></div>
                <button type="button" class="x" data-close aria-label="Close">×</button></div>
            ${Vault.isEggReady && Vault.isEggReady(b) ? '<div class="btns"><button type="button" class="btn solid" data-act="hatch">🐣 Ready! Tap to hatch</button></div>' : ''}
            <p>What's inside is a secret until it hatches. You can name it and pick its job after that.</p>
            <p>Nurses help eggs hatch a day sooner.</p>`, b.name);
        const hb = egg.querySelector('[data-act=hatch]');
        if (hb) hb.addEventListener('click', () => { PV2.close(); AppShell.hatch(b.id, () => { cfRefresh(); }); });
        return;
    }
    // Oct 28 2026 (approved demo): tap the picture for the card; exact problems,
    // what they cost, the Nursery, Recuperate, and an item slot for Rare and up.
    const rates = cbRates(b);
    const needs = typeof beeNeeds === 'function' ? beeNeeds(b) : [];
    const probs = typeof beeProblems === 'function' ? beeProblems(b) : 0;
    const beds = Vault.nurseryBeds ? Vault.nurseryBeds() : null;
    const canBed = L && !L.faintedAt && (L.sickUntil || (typeof beeHurtLevel === 'function' && beeHurtLevel(b) > 0));
    const slots = typeof beeItemSlots === 'function' ? beeItemSlots(b) : 0;
    const itemOf = (id) => id && STORE_ITEM_CATALOG.find(i => i.id === id);
    const R = rates ? rates.v : [0, 0, 0, 0, 0];
    // Oct 31 2026 (Craft): fix: your King/Queen has no hive-life stats (L), which crashed this sheet.
    const box = PV2.sheet(`
        <div class="head"><button type="button" class="cb-av cb-av-btn" data-act="card" aria-label="Open ${esc(b.name)}'s card">${cbArt(b, 'big')}<span class="cb-tapcard">TAP FOR CARD</span></button>
            <div><h2>${esc(b.name)}${b.title && typeof NAMED_TITLES !== 'undefined' && NAMED_TITLES[b.title] ? ` <span class="cb-title">\u201c${esc(NAMED_TITLES[b.title].label)}\u201d</span>` : ''}</h2><small style="color:var(--${esc(b.rarity)})">${esc(b.rarity)}</small>${b.sex ? ` <small>· ${b.sex === 'm' ? '♂ Male' : '♀ Female'}</small>` : ''}<br><small>${esc(cbJobText(b))}</small></div>
            <button type="button" class="x" data-close aria-label="Close">×</button></div>
        <div class="cb-chips">${needs.map(n => `<span class="cb-chip bad">${esc(n.need)} · ${esc(n.value)}</span>`).join('')}${!needs.length && !(L && L.faintedAt) ? `<span class="cb-chip ok">${f.face} ${esc(f.why)}</span>` : ''}${rates ? `<span class="cb-chip ok">${esc(rates.mode)}</span>` : ''}</div>
        <div class="cb-name"></div>
        ${L ? cbVital('❤️', 'Health', L.health, '#5fd38a', R[4]) + cbVital('⚡', 'Stamina', L.stamina, '#5aa9ff', R[0]) + cbVital('🥱', 'Fatigue', L.fatigue || 0, '#ff8a3d', R[3]) + cbVital('🍯', 'Fullness', L.fullness, '#ffcc00', R[1]) + cbVital('😊', 'Happiness', L.happiness, '#e58fff', R[2]) : ''}
        ${probs ? `<div class="cb-debuff"><b>Not well (${needs.filter(n => n.need !== 'No job' && n.need !== 'Worn out').map(n => esc(n.need)).join(', ') || probs + ' problems'}).</b><br>Stats, talent and work ${probs >= 2 ? '−30%' : '−15%'} · fatigue builds ${probs >= 2 ? '3×' : '2×'} faster on a job.${needs[0] ? `<br>Fix: ${esc(needs[0].fix)}` : ''}</div>` : ''}
        ${canBed ? (L.nursery ? `<div class="btns"><button type="button" class="btn" data-act="unbed">🛏️ In the Nursery · take it out</button></div>`
            : `<div class="btns"><button type="button" class="btn cb-bed" data-act="bed"${beds && !beds.free ? ' disabled' : ''}>🛏️ Send to the Nursery${beds ? ` · ${beds.free} of ${beds.total} beds free` : ''}</button></div>`) : ''}
        ${jobPicker}
        ${typeof beeHurtLevel === 'function' && beeHurtLevel(b) === 3 ? '<p>🚑 Severely hurt: it can\'t work until it heals. Recuperate or the Nursery.</p>' : ''}
        ${slots ? `<div class="cb-slots">${Array.from({ length: slots }, (_, i) => { const it = itemOf((b.held || [])[i]); return `<button type="button" class="cb-slot" data-slot="${i}"><span class="hx">${it ? it.icon : '＋'}</span><span><b>${it ? esc(it.label) : `Item slot${slots > 1 ? ' ' + (i + 1) : ''} · empty`}</b><small>${it ? esc(it.description.replace(/^Held( gear)?\. /, '')) : 'Tap to give it an item to hold.'}</small></span></button>`; }).join('')}<div class="cb-items" hidden></div></div>` : ''}
        ${L && L.faintedAt ? '<p>Revive fainted bees inside the hive (Rest Comb).</p>' : ''}`, b.name);
    BeeName.mount(box.querySelector('.cb-name'), b, { onSaved: (r, changed) => { if (changed) { cfRefresh(); cbOpenBee(b.id); } } });
    const cardBtn = box.querySelector('[data-act=card]');
    if (cardBtn) cardBtn.addEventListener('click', () => { PV2.close(); cfZoom(b.id); });
    const toast = (m, t = 'positive') => { if (typeof Toast !== 'undefined') Toast.show(m, t); };
    box.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]');
        if (act && act.dataset.act === 'bed') { const r = Vault.sendToNursery(b.id); toast(r.ok ? `🛏️ ${b.name} is in a Nursery bed. +4 health an hour.` : r.error, r.ok ? 'positive' : 'negative'); cfRefresh(); cbOpenBee(b.id); return; }
        if (act && act.dataset.act === 'unbed') { Vault.leaveNursery(b.id); toast(`${b.name} left the Nursery.`, 'neutral'); cfRefresh(); cbOpenBee(b.id); return; }
        const slot = e.target.closest('[data-slot]');
        const list = box.querySelector('.cb-items');
        if (slot && list) {
            const i = Number(slot.dataset.slot);
            const have = Vault.getItems();
            const held = STORE_ITEM_CATALOG.filter(it => it.kind === 'held');
            list.dataset.slot = i;
            list.innerHTML = held.map(it => `<button type="button" class="cb-item" data-give="${it.id}"${have[it.id] > 0 ? '' : ' disabled'}><span>${it.icon}</span><span><b>${esc(it.label)} <small>×${have[it.id] || 0}</small></b><small>${esc(it.description.replace(/^Held( gear)?\. /, ''))}</small></span></button>`).join('')
                + ((b.held || [])[i] ? '<button type="button" class="cb-item" data-take><span>✕</span><span><b>Take it off</b><small>Back to your bag.</small></span></button>' : '')
                + '<a class="cb-item" href="../honey-store/honey-store.html"><span>🍯</span><span><b>Make items</b><small>In the Honey Store, from materials.</small></span></a>';
            list.hidden = !list.hidden;
            return;
        }
        const give = e.target.closest('[data-give]');
        if (give) { const r = Vault.giveBeeItem(b.id, give.dataset.give, Number(list.dataset.slot)); toast(r.ok ? `${b.name} is holding it.` : r.error, r.ok ? 'positive' : 'negative'); cfRefresh(); cbOpenBee(b.id); return; }
        if (e.target.closest('[data-take]')) { Vault.takeBeeItem(b.id, Number(list.dataset.slot)); toast('Back in your bag.', 'neutral'); cfRefresh(); cbOpenBee(b.id); }
    });
}

// ---------------------------------------------------------------------------
// The binder (Oct 31 2026, Craft)
// ---------------------------------------------------------------------------
const CF_KEY = 'bizzybee_hive_bees_view';
const CF_SORTS = [['dex', 'Codex No.'], ['name', 'Name'], ['rarity', 'Rarity'], ['newest', 'Newest']];
const cf = { sort: 'dex', wheel: true, q: '', idx: 0, drag: 0, dragging: false, bees: [], nodes: new Map(), filter: 'all', zoomId: null, w: 190 };
try { const v = JSON.parse(localStorage.getItem(CF_KEY) || '{}'); if (CF_SORTS.some(([k]) => k === v.sort)) cf.sort = v.sort; if (v.wheel === false) cf.wheel = false; } catch { /* storage off */ }
const cfSave = () => { try { localStorage.setItem(CF_KEY, JSON.stringify({ sort: cf.sort, wheel: cf.wheel })); } catch { /* storage off */ } };
const pad3 = (n) => String(n).padStart(3, '0');
function cfKd(b) {
    const e = typeof KEEPERDEX_ENTRIES !== 'undefined' ? KEEPERDEX_ENTRIES.find(x => x.rarity === b.rarity && x.element === b.element) : null;
    return e ? e.dexNumber : b.rarity === 'Royal' ? 0 : 999;
}
function cfGroup(b) {
    if (cf.sort === 'name') return String(b.name || '?')[0].toUpperCase();
    if (cf.sort === 'rarity') return String(b.rarity).toUpperCase();
    if (cf.sort === 'newest') { const d = new Date(b.obtainedAt); return isNaN(d) ? '?' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase(); }
    return b.rarity === 'Royal' ? 'ROYAL' : 'No.' + pad3(cfKd(b));
}
function cfList() {
    const q = cf.q.trim().toLowerCase().replace(/^no\.?\s*/, '');
    const time = (b) => new Date(b.obtainedAt || 0).getTime();
    const l = Vault.getHiveBees().filter(b => !cbIsEgg(b)).filter(b => !q || String(b.name).toLowerCase().includes(q)
        || String(b.serial || '').toLowerCase().includes(q) || pad3(cfKd(b)).includes(q.padStart(3, '0')));
    if (cf.sort === 'name') l.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    else if (cf.sort === 'rarity') l.sort((a, b) => CB_RARITY_RANK.indexOf(a.rarity) - CB_RARITY_RANK.indexOf(b.rarity) || cfKd(a) - cfKd(b));
    else if (cf.sort === 'newest') l.sort((a, b) => time(b) - time(a));
    else l.sort((a, b) => cfKd(a) - cfKd(b) || time(a) - time(b));
    return l;
}
let cfBubbleT = null;
function cfBubble(text) {
    const el = document.getElementById('cf-bubble');
    el.textContent = text; el.classList.add('on');
    clearTimeout(cfBubbleT); cfBubbleT = setTimeout(() => el.classList.remove('on'), 700);
}
function cfNode(b) {
    let n = cf.nodes.get(b.id);
    if (n) return n;
    n = document.createElement('button');
    n.type = 'button'; n.className = 'cf-card'; n.dataset.bee = b.id;
    n.setAttribute('aria-label', `${b.name}, ${b.rarity}`);
    n.innerHTML = '<div class="cf-scale"><div></div></div>';
    BeeCard.render(n.querySelector('.cf-scale > div'), b, { editable: false });
    document.getElementById('cf-stage').appendChild(n);
    cf.nodes.set(b.id, n);
    return n;
}
// Only the cards near the middle exist, so a big binder stays smooth.
function cfLayout() {
    const W = cf.w, keep = new Set();
    cf.bees.forEach((b, i) => {
        const off = i - cf.idx + cf.drag, a = Math.abs(off);
        if (a > 5.5) return;
        keep.add(b.id);
        const n = cfNode(b), sign = Math.sign(off);
        const x = sign * (Math.min(a, 1) * W * .48 + Math.max(a - 1, 0) * W * .21);
        const rot = -Math.max(-1, Math.min(1, off)) * 62, near = Math.max(0, 1 - a);
        n.style.transform = `translateX(${x.toFixed(1)}px) translateZ(${(-40 + near * 90).toFixed(1)}px) rotateY(${rot.toFixed(1)}deg)`;
        n.style.zIndex = String(Math.round(100 - a * 10));
        n.classList.toggle('is-center', i === cf.idx && !cf.dragging);
        n.classList.toggle('dragging', cf.dragging);
        n.tabIndex = i === cf.idx ? 0 : -1;
    });
    cf.nodes.forEach((n, id) => { if (!keep.has(id)) { n.remove(); cf.nodes.delete(id); } });
    const b = cf.bees[cf.idx];
    document.getElementById('cf-now').innerHTML = b
        ? `<b>${PV2.esc(b.name)}</b><small>No.${b.rarity === 'Royal' ? 'R' : pad3(cfKd(b))} · ${PV2.esc(b.rarity)}${b.element && BEE_ELEMENTS[b.element] ? ' ' + PV2.esc(BEE_ELEMENTS[b.element].label) : ''} · tap the middle card to look closer</small>` : '';
    const r = document.getElementById('cf-range');
    r.max = String(Math.max(0, cf.bees.length - 1)); r.value = String(cf.idx);
    document.getElementById('cf-pos').textContent = cf.bees.length ? `${cf.idx + 1}/${cf.bees.length}` : '0/0';
}
function cfGo(i, bubble) {
    if (!cf.bees.length) return;
    cf.idx = Math.max(0, Math.min(cf.bees.length - 1, i));
    if (bubble) cfBubble(cfGroup(cf.bees[cf.idx]));
    cfLayout();
}
function cfJump(dir) {
    const L = cf.bees; if (!L.length) return;
    const cur = cfGroup(L[cf.idx]);
    let i = cf.idx;
    if (dir > 0) { while (i < L.length - 1 && cfGroup(L[i]) === cur) i++; }
    else { while (i > 0 && cfGroup(L[i]) === cur) i--; const g = cfGroup(L[i]); while (i > 0 && cfGroup(L[i - 1]) === g) i--; }
    cfGo(i, true);
}
// Fast = 3+ steps inside 260 ms: jump a whole group instead of one card.
let cfSteps = [];
function cfStep(dir) {
    const now = Date.now();
    cfSteps = cfSteps.filter(t => now - t < 260); cfSteps.push(now);
    if (cfSteps.length >= 3) cfJump(dir); else cfGo(cf.idx + dir, false);
}
function cfRefresh(keepId) {
    const id = keepId || (cf.bees[cf.idx] && cf.bees[cf.idx].id);
    cf.nodes.forEach(n => n.remove()); cf.nodes.clear();
    cf.bees = cfList();
    const at = cf.bees.findIndex(b => b.id === id);
    cf.idx = at >= 0 ? at : Math.min(cf.idx, Math.max(0, cf.bees.length - 1));
    const all = Vault.getHiveBees(), eggs = all.filter(cbIsEgg).length, hatched = all.length - eggs;
    document.getElementById('cb-lead').textContent = hatched ? `Your cards · ${hatched}` : 'No bees yet.';
    const empty = document.getElementById('cf-empty');
    empty.hidden = !!cf.bees.length;
    empty.innerHTML = hatched ? 'No cards match.' : 'No bees yet. Visit the <a href="../gacha/gacha.html">Pollination Chamber</a> to pull your first one.';
    const e = document.getElementById('cf-eggs');
    e.hidden = !eggs;
    e.innerHTML = `🥚 ${eggs} egg${eggs === 1 ? '' : 's'} in the Nursery. <a href="../hive-mind/hive-mind.html">Hive Mind ›</a>`;
    document.getElementById('cf-sorts').innerHTML = CF_SORTS.map(([k, label]) => `<button type="button" class="cf-pill" data-sort="${k}" aria-pressed="${cf.sort === k}">${label}</button>`).join('');
    cfLayout();
}
function cfSize() {
    const stage = document.getElementById('cf-stage');
    cf.w = Math.round(Math.max(140, Math.min(210, stage.clientWidth * .42)));   // fits above the dock on a phone
    stage.style.setProperty('--cf-w', cf.w + 'px');
    stage.style.setProperty('--cf-s', String(cf.w / 260));
}

// ---- Full-screen list (pauses the hive behind it) ----
function cfOpenList(filter) {
    if (filter) cf.filter = filter;
    const esc = PV2.esc;
    const all = cfList();
    const box = document.getElementById('cf-list');
    document.getElementById('cf-list-filters').innerHTML = CB_TABS.map(([k, label]) => `<button type="button" class="cf-pill" data-filter="${k}" aria-pressed="${cf.filter === k}">${label} <small>${all.filter(b => cbMatches(b, k)).length}</small></button>`).join('');
    const rows = all.filter(b => cbMatches(b, cf.filter));
    document.getElementById('cf-list-body').innerHTML = rows.length ? rows.map(b => {
        const color = typeof beeCardColor === 'function' ? beeCardColor(b.rarity) : '#888';
        return `<button type="button" class="cf-row" data-pick="${esc(b.id)}">
            <span class="cb-av">${cbArt(b)}<span class="cb-face">${cbFeeling(b).face}</span></span>
            <span class="mid"><b>${esc(b.name)}</b><small><span style="color:${color}">${esc(b.rarity)}</span> · No.${b.rarity === 'Royal' ? 'R' : pad3(cfKd(b))} · ${esc(cbJobText(b))}</small><small class="cf-row-serial">${esc(b.serial || '')}</small></span>
            <span class="chev">›</span></button>`;
    }).join('') : '<p class="cb-empty">No cards match.</p>';
    box.hidden = false;
    document.documentElement.classList.add('bb-paused');
}
function cfCloseList() {
    document.getElementById('cf-list').hidden = true;
    document.documentElement.classList.remove('bb-paused');
}

// ---- The big card ----
function cfZoom(id) {
    const b = Vault.getHiveBees().find(x => x.id === id);
    if (!b || cbIsEgg(b)) { cbOpenBee(id); return; }
    cf.zoomId = id;
    const overlay = document.getElementById('cb-expanded');
    const host = overlay.querySelector('.cb-expanded-host');
    host.innerHTML = '';
    BeeCard.render(host, b, { editable: true, onChange: () => { cfRefresh(id); cfZoom(id); } });
    document.getElementById('cb-expanded-hint').textContent = b.rarity === 'Common'
        ? 'Tap the card to flip it.' : 'Tilt your phone (or move the mouse) to catch the light. Tap to flip.';
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-open'));
}
function cfCloseZoom() {
    const overlay = document.getElementById('cb-expanded');
    overlay.classList.remove('is-open'); cf.zoomId = null;
    setTimeout(() => { overlay.hidden = true; }, 200);
}
function cfFlipZoom() {
    const card = document.querySelector('#cb-expanded .bee-card');
    if (card) card.classList.toggle('is-flipped');
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    cfSize(); cfRefresh();
    const params = new URLSearchParams(window.location.search);
    // ?bee=<id> (the level-up reward's "See my bee") opens that card big.
    const beeId = params.get('bee');
    if (beeId && Vault.getHiveBees().some(b => b.id === beeId)) { cfRefresh(beeId); cfZoom(beeId); }
    // ?show=help (Home's "bees need help") opens the list on that filter.
    const show = params.get('show');
    if (show && CB_TABS.some(([k]) => k === show)) cfOpenList(show);

    const stage = document.getElementById('cf-stage');
    const wheelBox = document.getElementById('cf-wheel');
    const setWheel = () => {
        wheelBox.hidden = !cf.wheel;
        document.getElementById('cf-tip').hidden = cf.wheel;
        document.getElementById('cf-wheel-toggle').setAttribute('aria-pressed', String(cf.wheel));
    };
    setWheel();

    // Drag: the row moves with your finger, then snaps. A fast flick jumps a group.
    let sx = null, lx = 0, lt = 0, vx = 0, justDragged = false;
    stage.addEventListener('pointerdown', (e) => { sx = e.clientX; lx = e.clientX; lt = Date.now(); vx = 0; });
    stage.addEventListener('pointermove', (e) => {
        if (sx === null) return;
        const dx = e.clientX - sx;
        if (!cf.dragging && Math.abs(dx) < 8) return;
        if (!cf.dragging) { cf.dragging = true; try { stage.setPointerCapture(e.pointerId); } catch { /* fine */ } }
        const n = cf.bees.length;
        cf.drag = Math.max(cf.idx - (n - 1), Math.min(cf.idx, dx / (cf.w * .42)));
        const now = Date.now(); vx = (e.clientX - lx) / Math.max(1, now - lt); lx = e.clientX; lt = now;
        cfLayout();
    });
    const end = () => {
        if (sx === null) return;
        sx = null;
        if (!cf.dragging) return;
        justDragged = true; setTimeout(() => { justDragged = false; }, 80);
        const target = Math.round(cf.idx - cf.drag);
        cf.drag = 0; cf.dragging = false;
        if (Math.abs(vx) > 1.4) { cf.idx = Math.max(0, Math.min(cf.bees.length - 1, target)); cfJump(vx > 0 ? -1 : 1); }
        else cfGo(target, false);
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('click', (e) => {
        const card = e.target.closest('.cf-card');
        if (!card || justDragged) return;
        const i = cf.bees.findIndex(b => b.id === card.dataset.bee);
        if (i === cf.idx) cfZoom(card.dataset.bee); else cfGo(i, false);
    });
    let acc = 0;
    stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(acc) >= 50) { cfStep(Math.sign(acc)); acc = 0; }
    }, { passive: false });
    stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); cfStep(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); cfStep(-1); }
        else if (e.key === 'Enter' && cf.bees[cf.idx]) { e.preventDefault(); cfZoom(cf.bees[cf.idx].id); }
    });

    document.getElementById('cf-range').addEventListener('input', (e) => cfGo(Number(e.target.value), true));
    document.getElementById('cb-q').addEventListener('input', (e) => { cf.q = e.target.value; cf.idx = 0; cfRefresh(); });
    document.getElementById('cf-sorts').addEventListener('click', (e) => {
        const b = e.target.closest('[data-sort]');
        if (b) { cf.sort = b.dataset.sort; cf.idx = 0; cfSave(); cfRefresh('__none'); }
    });
    document.getElementById('cf-wheel-toggle').addEventListener('click', () => { cf.wheel = !cf.wheel; cfSave(); setWheel(); });

    // Click wheel: spin a finger round the ring to scroll; buttons as labelled.
    let wc = null, wa = null, turn = 0, spun = 0;
    wheelBox.addEventListener('pointerdown', (e) => {
        const r = wheelBox.getBoundingClientRect();
        wc = [r.left + r.width / 2, r.top + r.height / 2];
        wa = Math.atan2(e.clientY - wc[1], e.clientX - wc[0]); turn = 0; spun = 0;
    });
    wheelBox.addEventListener('pointermove', (e) => {
        if (wa === null) return;
        const a = Math.atan2(e.clientY - wc[1], e.clientX - wc[0]);
        let d = a - wa; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
        wa = a; turn += d; spun += Math.abs(d);
        if (spun > .3) { try { wheelBox.setPointerCapture(e.pointerId); } catch { /* fine */ } }
        if (Math.abs(turn) > .45) { cfStep(Math.sign(turn)); turn = 0; }
    });
    const wEnd = () => { wa = null; };
    wheelBox.addEventListener('pointerup', wEnd);
    wheelBox.addEventListener('pointercancel', wEnd);
    wheelBox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-w]');
        if (!b || spun > .3) return;
        const w = b.dataset.w;
        if (w === 'prev') cfJump(-1);
        else if (w === 'next') cfJump(1);
        else if (w === 'sort') { const k = CF_SORTS.map(x => x[0]); cf.sort = k[(k.indexOf(cf.sort) + 1) % k.length]; cf.idx = 0; cfSave(); cfRefresh('__none'); cfBubble(CF_SORTS.find(x => x[0] === cf.sort)[1].toUpperCase()); }
        else if (w === 'list') cfOpenList();
        else if (w === 'select') { if (cf.zoomId) cfFlipZoom(); else if (cf.bees[cf.idx]) cfZoom(cf.bees[cf.idx].id); }
    });

    const list = document.getElementById('cf-list');
    list.addEventListener('click', (e) => {
        if (e.target.closest('[data-close-list]')) { cfCloseList(); return; }
        const f = e.target.closest('[data-filter]');
        if (f) { cfOpenList(f.dataset.filter); return; }
        const p = e.target.closest('[data-pick]');
        if (p) { cfCloseList(); const i = cf.bees.findIndex(b => b.id === p.dataset.pick); if (i >= 0) cfGo(i, false); }
    });

    const overlay = document.getElementById('cb-expanded');
    overlay.querySelector('.cb-expanded-close').addEventListener('click', cfCloseZoom);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cfCloseZoom(); });
    document.getElementById('cb-details').addEventListener('click', () => { const id = cf.zoomId; cfCloseZoom(); if (id) cbOpenBee(id); });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!overlay.hidden) cfCloseZoom(); else if (!list.hidden) cfCloseList();
    });
    let rz = null;
    window.addEventListener('resize', () => { if (rz) return; rz = requestAnimationFrame(() => { rz = null; cfSize(); cfRefresh(); }); });

    Waggle.setActions(baseWaggleActions());
});
