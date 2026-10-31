console.log("/// KEEPERDEX PROTOCOLS INITIALIZED ///");

// KeeperDex v2 (Oct 2026, same look as Settings/Inventory - page-v2.css).
// Every KEEPERDEX_ENTRIES row (db.js) as a KeeperDexCard (keeperdex-card.js),
// shown small in a grid (the real card, scaled down - same trick as Colony
// Bees). Tap one to see it full size. Filters: All, Found, Missing, and
// one chip per rarity. The memorial lists bees that died (Hive Life).
let kdTab = 'all';

function kdEntries() {
    const bees = Vault.getColonyBees();
    return KEEPERDEX_ENTRIES.map(entry => ({ entry, obtained: isKeeperDexEntryObtained(entry, bees) }));
}

function kdScale() {
    const grid = document.getElementById('keeperdex-grid');
    const t = grid && grid.querySelector('.kd-tile');
    if (t) grid.style.setProperty('--tile-scale', t.offsetWidth / 260);
}

function renderKeeperDex() {
    const grid = document.getElementById('keeperdex-grid');
    if (!grid) return;
    const all = kdEntries();
    const found = all.filter(x => x.obtained).length;
    const pct = Math.round((found / all.length) * 100);
    document.getElementById('keeperdex-progress-text').textContent = `${found} of ${all.length} found`;
    document.getElementById('keeperdex-progress-pct').textContent = `${pct}%`;
    document.getElementById('keeperdex-progress-fill').style.width = `${pct}%`;

    const rarities = [...new Set(KEEPERDEX_ENTRIES.map(e => e.rarity))];
    const tabs = [['all', 'All'], ['found', 'Found'], ['missing', 'Missing'], ...rarities.map(r => [r, r])];
    const match = (x, t) => t === 'all' || (t === 'found' ? x.obtained : t === 'missing' ? !x.obtained : x.entry.rarity === t);
    document.getElementById('kd-tabs').innerHTML = tabs.map(([k, label]) =>
        `<button type="button" class="chip" data-tab="${PV2.esc(k)}" aria-pressed="${kdTab === k}">${PV2.esc(label)}<small>${all.filter(x => match(x, k)).length}</small></button>`).join('');

    grid.innerHTML = '';
    all.filter(x => match(x, kdTab)).forEach(({ entry, obtained }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kd-tile' + (obtained ? '' : ' is-locked');
        btn.dataset.dex = entry.dexNumber;
        btn.setAttribute('aria-label', obtained ? `${entry.name}, found` : `Entry ${entry.dexNumber}, not found yet`);
        btn.innerHTML = '<div class="kd-scale"><div></div></div>';
        KeeperDexCard.render(btn.querySelector('.kd-scale > div'), entry, { obtained });
        grid.appendChild(btn);
    });
    requestAnimationFrame(kdScale);
}

function openDexEntry(dexNumber) {
    const x = kdEntries().find(e => String(e.entry.dexNumber) === String(dexNumber));
    if (!x) return;
    const box = PV2.sheet(`
        <div class="head"><div><h2>${x.obtained ? PV2.esc(x.entry.name) : `No. ${String(x.entry.dexNumber).padStart(3, '0')}`}</h2>
            <small>${x.obtained ? 'Found' : 'Not found yet. Get a matching bee to reveal it.'}</small></div>
            <button type="button" class="x" data-close aria-label="Close">×</button></div>
        <div class="kd-full"></div>`, x.entry.name);
    KeeperDexCard.render(box.querySelector('.kd-full'), x.entry, { obtained: x.obtained });
}

// Fallen bees (Hive Life, Oct 2026): name, job, how long they lived.
function renderMemorial() {
    const fallen = typeof Vault.getFallenBees === 'function' ? Vault.getFallenBees() : [];
    const box = document.getElementById('keeperdex-memorial');
    if (!box || !fallen.length) return;
    const esc = PV2.esc;
    document.getElementById('keeperdex-fallen').innerHTML = fallen.map(b => {
        const role = b.role && BEE_CLASSES[b.role] ? `${BEE_CLASSES[b.role].icon} ${BEE_CLASSES[b.role].label}` : 'No job';
        const days = b.bornAt ? (daysBetween(b.bornAt, b.diedAt) || 0) : null;
        return `<li><b>🕯️ ${esc(b.name)}</b><span>${esc(b.rarity)} · ${role}${days !== null ? ` · lived ${days} day${days === 1 ? '' : 's'}` : ''}</span><small>${b.cause === 'old age' ? 'Old age' : 'Fainted too long'} · ${esc(b.diedAt)}</small></li>`;
    }).join('');
    box.hidden = false;
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    renderKeeperDex();
    renderMemorial();
    document.getElementById('kd-tabs').addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]');
        if (t) { kdTab = t.dataset.tab; renderKeeperDex(); }
    });
    document.getElementById('keeperdex-grid').addEventListener('click', (e) => {
        const t = e.target.closest('[data-dex]');
        if (t) openDexEntry(t.dataset.dex);
    });
    let raf = null;
    window.addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; kdScale(); }); });
    Waggle.setActions(baseWaggleActions());
});
