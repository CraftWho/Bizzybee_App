console.log("/// HIVE BEES ONLINE ///");

// Hive Bees (Oct 2026, approved demo). Its own page now - it used to be
// a pop-up on the Inventory page. A list (or the real bee cards, scaled
// down) with search, sort and filters: All, Working, No job, Eggs and
// Need help. Tap a bee for a sheet with its mood, vitals and job picker;
// "Open card" shows the real, editable bee card (rename, items, evolve).
// Mood faces come from beeFeeling() in db.js (same as the Hive Life combs).
const CB_KEY = 'bizzybee_hive_bees_view';
const CB_TABS = [
    ['all', 'All'], ['working', 'Working'], ['idle', 'No job'], ['eggs', 'Eggs'], ['help', 'Need help']
];
const CB_RARITY_RANK = ['Royal', 'Named', 'Legendary', 'Epic', 'Rare', 'Common'];
const CB_MOOD_RANK = ['fainted', 'upset', 'sad', 'calm', 'happy', 'royal', 'egg'];
const cbState = { tab: 'all', sort: 'new', view: 'list', q: '' };
try { Object.assign(cbState, JSON.parse(localStorage.getItem(CB_KEY) || '{}'), { tab: 'all', q: '' }); } catch { /* storage off */ }
const cbSave = () => { try { localStorage.setItem(CB_KEY, JSON.stringify({ sort: cbState.sort, view: cbState.view })); } catch { /* storage off */ } };

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
function cbSorted(list) {
    const l = list.slice();
    const time = (b) => new Date(b.obtainedAt || 0).getTime();
    if (cbState.sort === 'old') l.sort((a, b) => time(a) - time(b));
    // Eggs keep their rarity secret, so they always sort last here.
    else if (cbState.sort === 'rarity') { const rank = (b) => cbIsEgg(b) ? 999 : CB_RARITY_RANK.indexOf(b.rarity); l.sort((a, b) => rank(a) - rank(b) || time(b) - time(a)); }
    else if (cbState.sort === 'mood') l.sort((a, b) => CB_MOOD_RANK.indexOf(cbFeeling(a).key) - CB_MOOD_RANK.indexOf(cbFeeling(b).key));
    else if (cbState.sort === 'name') l.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    else l.sort((a, b) => time(b) - time(a));
    return l;
}

function cbRender() {
    const esc = PV2.esc;
    const all = Vault.getHiveBees();
    const eggs = all.filter(cbIsEgg).length;
    document.getElementById('cb-lead').textContent = all.length
        ? `${all.length - eggs} bee${all.length - eggs === 1 ? '' : 's'}${eggs ? ` and ${eggs} egg${eggs === 1 ? '' : 's'}` : ''}. Tap a bee for its card.`
        : 'No bees yet.';
    document.getElementById('cb-tabs').innerHTML = CB_TABS.map(([key, label]) => {
        const n = all.filter(b => cbMatches(b, key)).length;
        return `<button type="button" class="chip" data-tab="${key}" aria-pressed="${cbState.tab === key}">${label}<small>${n}</small></button>`;
    }).join('');
    document.querySelectorAll('.cb-view [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === cbState.view)));
    document.getElementById('cb-sort').value = cbState.sort;

    const q = cbState.q.trim().toLowerCase();
    const list = cbSorted(all.filter(b => cbMatches(b, cbState.tab) && (!q || String(b.name).toLowerCase().includes(q))));
    const host = document.getElementById('cb-list');
    if (!all.length) { host.innerHTML = '<p class="cb-empty">No bees yet. Visit the <a href="../gacha/gacha.html">Pollination Chamber</a> to pull your first one.</p>'; return; }
    if (!list.length) { host.innerHTML = '<p class="cb-empty">No bees match.</p>'; return; }

    if (cbState.view === 'cards') {
        host.innerHTML = '<div class="cb-cards"></div>';
        const grid = host.firstElementChild;
        list.forEach(b => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cb-tile' + (cbIsEgg(b) ? ' is-egg' : '');
            btn.dataset.bee = b.id;
            btn.style.setProperty('--tile-color', cbIsEgg(b) ? '#8a7e62' : (typeof beeCardColor === 'function' ? beeCardColor(b.rarity) : '#888'));
            btn.setAttribute('aria-label', cbIsEgg(b) ? `${b.name}, egg, ${cbJobText(b)}` : `${b.name}, ${b.rarity}, ${cbJobText(b)}`);
            // Eggs: a plain black card with the egg on it - no stats yet.
            if (cbIsEgg(b)) btn.innerHTML = `<div class="cb-egg-card">${cbArt(b)}</div>`;
            else {
                btn.innerHTML = `<div class="cb-tile-scale"><div></div></div><span class="cb-face">${cbFeeling(b).face}</span>`;
                BeeCard.render(btn.querySelector('.cb-tile-scale > div'), b, { editable: false });
            }
            grid.appendChild(btn);
        });
        requestAnimationFrame(() => {
            const t = grid.querySelector('.cb-tile');
            if (t) grid.style.setProperty('--tile-scale', t.offsetWidth / 260);
        });
        return;
    }
    host.innerHTML = `<div class="card">${list.map(b => {
        const f = cbFeeling(b);
        return `<button type="button" class="row" data-bee="${esc(b.id)}">
            <span class="cb-av">${cbArt(b)}${cbIsEgg(b) ? '' : `<span class="cb-face">${f.face}</span>`}</span>
            <span class="mid"><b>${esc(b.name)}${b.sex === 'm' && !cbIsEgg(b) ? ' ♂' : ''}</b><small>${cbIsEgg(b) ? '<span class="cb-rar">🥚 Mystery egg</span>' : `<span class="cb-rar" style="color:var(--${esc(b.rarity)})">${esc(b.rarity)}</span>`}${b.title && typeof NAMED_TITLES !== 'undefined' && NAMED_TITLES[b.title] ? ` · <span class="cb-title">\u201c${esc(NAMED_TITLES[b.title].label)}\u201d</span>` : ''} · ${esc(cbJobText(b))}</small></span>
            <span class="chev">›</span></button>`;
    }).join('')}</div>`;
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
    const jobPicker = cbIsRoyal(b) ? '' : locked
        ? `<div class="cb-job"><label>Job</label><select disabled><option>🔒 ${BEE_CLASSES[locked].icon} ${esc(BEE_CLASSES[locked].label)}</option></select></div><p>🔒 Its title sets its job.</p>`
        : `<div class="cb-job"><label for="cb-job-sel">${cbIsEgg(b) ? 'Job when hatched' : 'Job'}</label>
        <select id="cb-job-sel"><option value="">${cbIsEgg(b) ? 'Pick a job…' : '— No job —'}</option>${cbIsEgg(b) ? '' : `<option value="recuperate"${b.life && b.life.recuperate ? ' selected' : ''}>💤 Recuperate (eat, sleep, heal)</option>`}${jobs.map(j => `<option value="${j}"${b.class === j ? ' selected' : ''}>${BEE_CLASSES[j].icon} ${esc(BEE_CLASSES[j].label)}${b.talent === j ? ' ⭐' : ''}</option>`).join('')}</select></div>
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
        if (hb) hb.addEventListener('click', () => { PV2.close(); AppShell.hatch(b.id, () => { cbRender(); }); });
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
    const box = PV2.sheet(`
        <div class="head"><button type="button" class="cb-av cb-av-btn" data-act="card" aria-label="Open ${esc(b.name)}'s card">${cbArt(b, 'big')}<span class="cb-tapcard">TAP FOR CARD</span></button>
            <div><h2>${esc(b.name)}${b.title && typeof NAMED_TITLES !== 'undefined' && NAMED_TITLES[b.title] ? ` <span class="cb-title">\u201c${esc(NAMED_TITLES[b.title].label)}\u201d</span>` : ''}</h2><small style="color:var(--${esc(b.rarity)})">${esc(b.rarity)}</small>${b.sex ? ` <small>· ${b.sex === 'm' ? '♂ Male' : '♀ Female'}</small>` : ''}<br><small>${esc(cbJobText(b))}</small></div>
            <button type="button" class="x" data-close aria-label="Close">×</button></div>
        <div class="cb-chips">${needs.map(n => `<span class="cb-chip bad">${esc(n.need)} · ${esc(n.value)}</span>`).join('')}${!needs.length && !L.faintedAt ? `<span class="cb-chip ok">${f.face} ${esc(f.why)}</span>` : ''}${rates ? `<span class="cb-chip ok">${esc(rates.mode)}</span>` : ''}</div>
        <div class="cb-name"></div>
        ${L ? cbVital('❤️', 'Health', L.health, '#5fd38a', R[4]) + cbVital('⚡', 'Stamina', L.stamina, '#5aa9ff', R[0]) + cbVital('🥱', 'Fatigue', L.fatigue || 0, '#ff8a3d', R[3]) + cbVital('🍯', 'Fullness', L.fullness, '#ffcc00', R[1]) + cbVital('😊', 'Happiness', L.happiness, '#e58fff', R[2]) : ''}
        ${probs ? `<div class="cb-debuff"><b>Not well (${needs.filter(n => n.need !== 'No job' && n.need !== 'Worn out').map(n => esc(n.need)).join(', ') || probs + ' problems'}).</b><br>Stats, talent and work ${probs >= 2 ? '−30%' : '−15%'} · fatigue builds ${probs >= 2 ? '3×' : '2×'} faster on a job.${needs[0] ? `<br>Fix: ${esc(needs[0].fix)}` : ''}</div>` : ''}
        ${canBed ? (L.nursery ? `<div class="btns"><button type="button" class="btn" data-act="unbed">🛏️ In the Nursery · take it out</button></div>`
            : `<div class="btns"><button type="button" class="btn cb-bed" data-act="bed"${beds && !beds.free ? ' disabled' : ''}>🛏️ Send to the Nursery${beds ? ` · ${beds.free} of ${beds.total} beds free` : ''}</button></div>`) : ''}
        ${jobPicker}
        ${typeof beeHurtLevel === 'function' && beeHurtLevel(b) === 3 ? '<p>🚑 Severely hurt: it can\'t work until it heals. Recuperate or the Nursery.</p>' : ''}
        ${slots ? `<div class="cb-slots">${Array.from({ length: slots }, (_, i) => { const it = itemOf((b.held || [])[i]); return `<button type="button" class="cb-slot" data-slot="${i}"><span class="hx">${it ? it.icon : '＋'}</span><span><b>${it ? esc(it.label) : `Item slot${slots > 1 ? ' ' + (i + 1) : ''} · empty`}</b><small>${it ? esc(it.description.replace(/^Held( gear)?\. /, '')) : 'Tap to give it an item to hold.'}</small></span></button>`; }).join('')}<div class="cb-items" hidden></div></div>` : ''}
        ${L && L.faintedAt ? '<p>Revive fainted bees inside the hive (Rest Comb).</p>' : ''}`, b.name);
    BeeName.mount(box.querySelector('.cb-name'), b, { onSaved: (r, changed) => { if (changed) { cbRender(); cbOpenBee(b.id); } } });
    const sel = box.querySelector('#cb-job-sel');
    if (sel) sel.addEventListener('change', () => {
        const job = sel.value || null;
        const r = Vault.assignBeeClass(b.id, job);
        if (typeof Toast !== 'undefined') {
            if (!r) Toast.show("That bee can't do that job.", 'negative');
            else Toast.show(job === 'recuperate' ? `💤 ${r.name} is recuperating.` : job ? `${BEE_CLASSES[job].icon} ${r.name} ${cbIsEgg(r) ? 'will be a' : 'is now a'} ${BEE_CLASSES[job].label}.` : `${r.name} has no job.`, 'positive');
        }
        cbRender();
        cbOpenBee(b.id);
    });
    const cardBtn = box.querySelector('[data-act=card]');
    if (cardBtn) cardBtn.addEventListener('click', () => { PV2.close(); cbOpenCard(b.id); });
    const toast = (m, t = 'positive') => { if (typeof Toast !== 'undefined') Toast.show(m, t); };
    box.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]');
        if (act && act.dataset.act === 'bed') { const r = Vault.sendToNursery(b.id); toast(r.ok ? `🛏️ ${b.name} is in a Nursery bed. +4 health an hour.` : r.error, r.ok ? 'positive' : 'negative'); cbRender(); cbOpenBee(b.id); return; }
        if (act && act.dataset.act === 'unbed') { Vault.leaveNursery(b.id); toast(`${b.name} left the Nursery.`, 'neutral'); cbRender(); cbOpenBee(b.id); return; }
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
        if (give) { const r = Vault.giveBeeItem(b.id, give.dataset.give, Number(list.dataset.slot)); toast(r.ok ? `${b.name} is holding it.` : r.error, r.ok ? 'positive' : 'negative'); cbRender(); cbOpenBee(b.id); return; }
        if (e.target.closest('[data-take]')) { Vault.takeBeeItem(b.id, Number(list.dataset.slot)); toast('Back in your bag.', 'neutral'); cbRender(); cbOpenBee(b.id); }
    });
}

// The real, editable bee card (bee-card.js).
function cbOpenCard(id) {
    const overlay = document.getElementById('cb-expanded');
    const host = overlay.querySelector('.cb-expanded-host');
    const b = Vault.getHiveBees().find(x => x.id === id);
    if (!b) { cbCloseCard(); return; }
    host.innerHTML = '';
    BeeCard.render(host, b, { editable: true, onChange: () => { cbRender(); cbOpenCard(id); } });
    const card = host.querySelector('.bee-card');
    if (card) {
        let x0 = null;
        card.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
        card.addEventListener('touchend', (e) => {
            if (x0 === null) return;
            const dx = e.changedTouches[0].clientX - x0; x0 = null;
            if (Math.abs(dx) > 40) card.classList.toggle('is-flipped');
        }, { passive: true });
    }
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-open'));
}
function cbCloseCard() {
    const overlay = document.getElementById('cb-expanded');
    overlay.classList.remove('is-open');
    setTimeout(() => { overlay.hidden = true; }, 200);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    // ?show=help (Home's "bees need help" note, Hive Mind stats) opens a filter.
    const show = new URLSearchParams(window.location.search).get('show');
    if (show && CB_TABS.some(([k]) => k === show)) cbState.tab = show;
    cbRender();
    // ?bee=<id> (the level-up reward's "See my bee") opens that bee.
    const beeId = new URLSearchParams(window.location.search).get('bee');
    if (beeId && Vault.getHiveBees().some(b => b.id === beeId)) cbOpenBee(beeId);

    document.getElementById('cb-q').addEventListener('input', (e) => { cbState.q = e.target.value; cbRender(); });
    document.getElementById('cb-sort').addEventListener('change', (e) => { cbState.sort = e.target.value; cbSave(); cbRender(); });
    document.getElementById('cb-tabs').addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]');
        if (t) { cbState.tab = t.dataset.tab; cbRender(); }
    });
    document.querySelector('.cb-view').addEventListener('click', (e) => {
        const v = e.target.closest('[data-view]');
        if (v) { cbState.view = v.dataset.view; cbSave(); cbRender(); }
    });
    document.getElementById('cb-list').addEventListener('click', (e) => {
        const r = e.target.closest('[data-bee]');
        if (r) cbOpenBee(r.dataset.bee);
    });
    const overlay = document.getElementById('cb-expanded');
    overlay.querySelector('.cb-expanded-close').addEventListener('click', cbCloseCard);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cbCloseCard(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) cbCloseCard(); });
    let resizeRaf = null;
    window.addEventListener('resize', () => {
        if (resizeRaf || cbState.view !== 'cards') return;
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = null;
            const grid = document.querySelector('.cb-cards'), t = grid && grid.querySelector('.cb-tile');
            if (t) grid.style.setProperty('--tile-scale', t.offsetWidth / 260);
        });
    });

    Waggle.setActions(baseWaggleActions());
});
