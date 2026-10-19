console.log("/// COLONY BEES ONLINE ///");

// Colony Bees (Oct 2026, approved demo). Its own page now - it used to be
// a pop-up on the Inventory page. A list (or the real bee cards, scaled
// down) with search, sort and filters: All, Working, No job, Eggs and
// Need help. Tap a bee for a sheet with its mood, vitals and job picker;
// "Open card" shows the real, editable bee card (rename, items, evolve).
// Mood faces come from beeFeeling() in db.js (same as the Hive Life combs).
const CB_KEY = 'bizzybee_colony_bees_view';
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
    return job ? `${job.icon} ${job.label}` : '💤 No job';
}
// The bee's own art (same picture as its card), as a small square.
function cbArt(b, cls = '') {
    if (cbIsEgg(b)) return `<span class="hx r-${PV2.esc(b.rarity)} ${cls}">🥚</span>`;
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
    else if (cbState.sort === 'rarity') l.sort((a, b) => CB_RARITY_RANK.indexOf(a.rarity) - CB_RARITY_RANK.indexOf(b.rarity) || time(b) - time(a));
    else if (cbState.sort === 'mood') l.sort((a, b) => CB_MOOD_RANK.indexOf(cbFeeling(a).key) - CB_MOOD_RANK.indexOf(cbFeeling(b).key));
    else if (cbState.sort === 'name') l.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    else l.sort((a, b) => time(b) - time(a));
    return l;
}

function cbRender() {
    const esc = PV2.esc;
    const all = Vault.getColonyBees();
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
            btn.style.setProperty('--tile-color', typeof beeCardColor === 'function' ? beeCardColor(b.rarity) : '#888');
            btn.setAttribute('aria-label', `${b.name}, ${b.rarity}, ${cbJobText(b)}`);
            btn.innerHTML = `<div class="cb-tile-scale"><div></div></div>${cbIsEgg(b) ? '' : `<span class="cb-face">${cbFeeling(b).face}</span>`}`;
            BeeCard.render(btn.querySelector('.cb-tile-scale > div'), b, { editable: false });
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
            <span class="mid"><b>${esc(b.name)}${b.sex === 'm' ? ' ♂' : ''}</b><small><span class="cb-rar" style="color:var(--${esc(b.rarity)})">${esc(b.rarity)}</span> · ${esc(cbJobText(b))}</small></span>
            <span class="chev">›</span></button>`;
    }).join('')}</div>`;
}

function cbVital(icon, label, value, color) {
    return `<div class="cb-vital"><span>${icon} ${label}</span><span class="cb-bar-v" role="progressbar" aria-label="${label}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><i style="width:${value}%;background:${color}"></i></span><span class="cb-num">${value}</span></div>`;
}

function cbOpenBee(id) {
    const esc = PV2.esc;
    const b = Vault.getColonyBees().find(x => x.id === id);
    if (!b) { PV2.close(); return; }
    const f = cbFeeling(b);
    const L = b.life;
    const jobs = Object.keys(BEE_CLASSES).filter(j => !!BEE_CLASSES[j].maleOnly === (b.sex === 'm'));
    const jobPicker = cbIsRoyal(b) ? '' : `<div class="cb-job"><label for="cb-job-sel">${cbIsEgg(b) ? 'Job when hatched' : 'Job'}</label>
        <select id="cb-job-sel"><option value="">${cbIsEgg(b) ? 'Pick a job…' : '— No job (rest) —'}</option>${jobs.map(j => `<option value="${j}"${b.class === j ? ' selected' : ''}>${BEE_CLASSES[j].icon} ${esc(BEE_CLASSES[j].label)}</option>`).join('')}</select></div>`;
    const box = PV2.sheet(`
        <div class="head"><span class="cb-av">${cbArt(b, 'big')}</span>
            <div><h2>${esc(b.name)}</h2><small style="color:var(--${esc(b.rarity)})">${esc(b.rarity)}</small>${b.sex ? ` <small>· ${b.sex === 'm' ? '♂ Male' : '♀ Female'}</small>` : ''}<br><small>${esc(cbJobText(b))}</small></div>
            <button type="button" class="x" data-close aria-label="Close">×</button></div>
        <p>${f.face} ${esc(f.why)}${cbIsEgg(b) ? '. The job starts the moment it hatches.' : ''}</p>
        <div class="cb-name"></div>
        ${L && !cbIsEgg(b) ? cbVital('❤️', 'Health', L.health, '#5fd38a') + cbVital('⚡', 'Stamina', L.stamina, '#5aa9ff') + cbVital('🍯', 'Fullness', L.fullness, '#ffcc00') + cbVital('😊', 'Happiness', L.happiness, '#e58fff') : ''}
        ${jobPicker}
        <div class="btns">
            <button type="button" class="btn solid" data-act="card">🃏 Open card</button>
            <a class="btn" href="../colony/colony.html">🏰 Hive Mind</a>
        </div>
        <p>The card has items and evolve.${L && L.faintedAt ? ' Revive fainted bees inside the hive (Rest Comb).' : ''}</p>`, b.name);
    BeeName.mount(box.querySelector('.cb-name'), b, { onSaved: (r, changed) => { if (changed) { cbRender(); cbOpenBee(b.id); } } });
    const sel = box.querySelector('#cb-job-sel');
    if (sel) sel.addEventListener('change', () => {
        const job = sel.value || null;
        const r = Vault.assignBeeClass(b.id, job);
        if (typeof Toast !== 'undefined') {
            if (!r) Toast.show("That bee can't do that job.", 'negative');
            else Toast.show(job ? `${BEE_CLASSES[job].icon} ${r.name} ${cbIsEgg(r) ? 'will be a' : 'is now a'} ${BEE_CLASSES[job].label}.` : `💤 ${r.name} is resting.`, 'positive');
        }
        cbRender();
        cbOpenBee(b.id);
    });
    box.querySelector('[data-act=card]').addEventListener('click', () => { PV2.close(); cbOpenCard(b.id); });
}

// The real, editable bee card (bee-card.js).
function cbOpenCard(id) {
    const overlay = document.getElementById('cb-expanded');
    const host = overlay.querySelector('.cb-expanded-host');
    const b = Vault.getColonyBees().find(x => x.id === id);
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
