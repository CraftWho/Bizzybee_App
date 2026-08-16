console.log("/// BEE PICKER DEMO (test page, not part of the live app) ///");

// What this demonstrates, for review before any of it touches Inventory
// or Gacha:
//   1. The compact browsing tile - real 5:7 trading-card ratio, small
//      enough that a phone-width screen shows 4+ and a desktop-width
//      window shows 8+ (see .picker-tile-grid in bee-picker-demo.css).
//   2. Search (by name) + filter (rarity/element/assigned class), live,
//      combined with AND logic.
//   3. A "Cover Flow" scroll mode - the iPod-style browsing animation:
//      horizontal scroll-snap, the centered bee scales up and faces
//      forward, neighbors shrink/tilt/fade based on distance from
//      center. Toggle between this and the plain Grid to compare.
//   4. Tap any tile (either mode) to open it - reuses the REAL BeeCard
//      component (bee-card.js) at a readable size, so what you see here
//      is the actual card, not a mockup. Tap it again, or swipe it, to
//      flip to stats (tap-to-flip is BeeCard's own built-in behavior;
//      swipe is added here, see setupSwipeToFlip below).
//
// Uses your real Vault data (Vault.getColonyBees()) so this is a
// realistic preview, not placeholder bees - if your colony is empty
// you'll see the empty-state message instead of the grid.
//
// Nothing here writes to the Vault or touches any other page's files.

let allBees = [];
let filteredBees = [];
let viewMode = 'grid';
let coverflowRaf = null;

function beeRarityColor(rarity) {
    const info = BEE_RARITIES.find(r => r.rarity === rarity);
    return info ? info.color : BEE_RARITIES[0].color;
}

// --- TILE (shared by Grid and Cover Flow - same element, different
// container CSS handles the layout/animation difference) ---
function createTile(bee) {
    const color = beeRarityColor(bee.rarity);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'picker-tile';
    btn.dataset.beeId = bee.id;
    btn.style.setProperty('--tile-color', color);
    btn.title = `${bee.name} (${bee.rarity})`;

    const art = document.createElement('span');
    art.className = 'picker-tile-art';
    const icon = document.createElement('span');
    icon.className = 'picker-tile-icon';
    art.appendChild(icon);

    const nameEl = document.createElement('span');
    nameEl.className = 'picker-tile-name';
    nameEl.textContent = bee.name; // textContent, not innerHTML - no escaping needed

    btn.appendChild(art);
    btn.appendChild(nameEl);

    NanoBee.render(icon, 'chip', { color, hideCore: true, noFlight: true });

    btn.addEventListener('click', () => openExpanded(bee));
    return btn;
}

// --- GRID MODE ---
function renderGrid() {
    const host = document.getElementById('picker-grid');
    host.innerHTML = '';
    if (filteredBees.length === 0) {
        host.innerHTML = `<p class="picker-empty">No bees match your search/filters.</p>`;
        return;
    }
    filteredBees.forEach(bee => host.appendChild(createTile(bee)));
}

// --- COVER FLOW MODE ---
function renderCoverflow() {
    const track = document.getElementById('picker-coverflow-track');
    track.innerHTML = '';
    track.style.paddingLeft = '0px';
    track.style.paddingRight = '0px';

    if (filteredBees.length === 0) {
        track.innerHTML = `<p class="picker-empty">No bees match your search/filters.</p>`;
        return;
    }

    filteredBees.forEach(bee => track.appendChild(createTile(bee)));

    // Pad both ends so the first/last real tile can still reach dead
    // center - without this only tiles in the "middle" of the list could
    // ever be the focused one.
    requestAnimationFrame(() => {
        const wrap = document.getElementById('picker-coverflow-wrap');
        const firstTile = track.querySelector('.picker-tile');
        if (wrap && firstTile) {
            const pad = Math.max(0, (wrap.clientWidth - firstTile.offsetWidth) / 2);
            track.style.paddingLeft = `${pad}px`;
            track.style.paddingRight = `${pad}px`;
            track.scrollLeft = 0;
        }
        updateCoverflowTransforms();
    });
}

// rAF-throttled so this doesn't run more than once per frame while the
// user is actively scrolling/swiping.
function onCoverflowScroll() {
    if (coverflowRaf) return;
    coverflowRaf = requestAnimationFrame(() => {
        coverflowRaf = null;
        updateCoverflowTransforms();
    });
}

// The actual "iPod" feel: each tile's scale/rotation/opacity is a
// function of how far its center sits from the track's visible center,
// normalized to -1..1 (edge of the wrap) - centered = full size, facing
// forward, opaque; toward either edge = smaller, tilted away (a cheap
// perspective/rotateY fake-3D "cover flow" lean), and fading out.
function updateCoverflowTransforms() {
    const wrap = document.getElementById('picker-coverflow-wrap');
    const track = document.getElementById('picker-coverflow-track');
    if (!wrap || !track) return;
    const wrapRect = wrap.getBoundingClientRect();
    const centerX = wrapRect.left + wrapRect.width / 2;

    Array.from(track.children).forEach(tile => {
        if (!tile.classList || !tile.classList.contains('picker-tile')) return;
        const r = tile.getBoundingClientRect();
        const tileCenter = r.left + r.width / 2;
        const dist = tileCenter - centerX;
        const norm = Math.max(-1, Math.min(1, dist / (wrapRect.width / 2)));
        const absNorm = Math.min(Math.abs(norm), 1);

        const scale = 1 - absNorm * 0.35;
        const rotateY = norm * -35;
        const translateZ = -absNorm * 60;

        tile.style.transform = `perspective(700px) rotateY(${rotateY}deg) scale(${scale}) translateZ(${translateZ}px)`;
        tile.style.opacity = String(1 - absNorm * 0.55);
        tile.style.zIndex = String(100 - Math.round(absNorm * 100));
        tile.classList.toggle('is-centered', absNorm < 0.12);
    });
}

// --- EXPANDED (readable-size) OVERLAY, shared by both modes ---
function openExpanded(bee) {
    const overlay = document.getElementById('picker-expanded-overlay');
    const host = document.getElementById('picker-expanded-card-host');
    host.innerHTML = '';
    BeeCard.render(host, bee, { editable: false });
    setupSwipeToFlip(host);

    overlay.hidden = false;
    // next frame so the hidden->visible change doesn't eat the opacity/
    // scale transition (browsers won't animate a property change applied
    // in the same frame an element goes from display:none to visible).
    requestAnimationFrame(() => overlay.classList.add('is-open'));
}

function closeExpanded() {
    const overlay = document.getElementById('picker-expanded-overlay');
    overlay.classList.remove('is-open');
    setTimeout(() => { overlay.hidden = true; }, 220);
}

// BeeCard.render() already wires a plain tap/click to flip - this adds a
// horizontal swipe as an alternate gesture, toggling the same
// `is-flipped` class the click listener uses, so both stay in sync.
function setupSwipeToFlip(host) {
    const cardEl = host.querySelector('.bee-card');
    if (!cardEl) return;
    let startX = null;

    cardEl.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
    }, { passive: true });

    cardEl.addEventListener('touchend', (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) > 40) cardEl.classList.toggle('is-flipped');
    }, { passive: true });
}

// --- VIEW TOGGLE ---
function setViewMode(mode) {
    viewMode = mode;
    document.getElementById('picker-view-grid-btn').classList.toggle('is-active', mode === 'grid');
    document.getElementById('picker-view-coverflow-btn').classList.toggle('is-active', mode === 'coverflow');
    document.getElementById('picker-grid').hidden = mode !== 'grid';
    document.getElementById('picker-coverflow-wrap').hidden = mode !== 'coverflow';

    if (mode === 'grid') renderGrid();
    else renderCoverflow();
}

// --- SEARCH + FILTERS ---
function populateFilterSelect(selectEl, entries) {
    entries.forEach(([value, label]) => {
        selectEl.appendChild(new Option(label, value));
    });
}

function setupFilters() {
    const raritySelect = document.getElementById('picker-filter-rarity');
    const elementSelect = document.getElementById('picker-filter-element');
    const classSelect = document.getElementById('picker-filter-class');

    populateFilterSelect(raritySelect, BEE_RARITIES.map(r => [r.rarity, r.rarity]));
    populateFilterSelect(elementSelect, Object.entries(BEE_ELEMENTS).map(([key, info]) => [key, `${info.emoji} ${info.label}`]));
    populateFilterSelect(classSelect, Object.entries(BEE_CLASSES).map(([key, info]) => [key, `${info.icon} ${info.label}`]));
    classSelect.appendChild(new Option('— Unassigned —', '__unassigned__'));

    document.getElementById('picker-search').addEventListener('input', applyFilters);
    raritySelect.addEventListener('change', applyFilters);
    elementSelect.addEventListener('change', applyFilters);
    classSelect.addEventListener('change', applyFilters);
}

function applyFilters() {
    const search = document.getElementById('picker-search').value.trim().toLowerCase();
    const rarity = document.getElementById('picker-filter-rarity').value;
    const element = document.getElementById('picker-filter-element').value;
    const cls = document.getElementById('picker-filter-class').value;

    filteredBees = allBees.filter(bee => {
        if (search && !bee.name.toLowerCase().includes(search)) return false;
        if (rarity && bee.rarity !== rarity) return false;
        if (element && bee.element !== element) return false;
        if (cls === '__unassigned__' && bee.class) return false;
        if (cls && cls !== '__unassigned__' && bee.class !== cls) return false;
        return true;
    });

    document.getElementById('picker-result-count').textContent = `${filteredBees.length} of ${allBees.length}`;

    if (viewMode === 'grid') renderGrid();
    else renderCoverflow();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    allBees = Vault.getColonyBees().slice().reverse();
    filteredBees = allBees.slice();

    if (allBees.length === 0) {
        document.getElementById('picker-empty-state').hidden = false;
        document.getElementById('picker-controls').hidden = true;
        document.getElementById('picker-view-toggle').hidden = true;
        return;
    }

    setupFilters();
    document.getElementById('picker-result-count').textContent = `${filteredBees.length} of ${allBees.length}`;

    document.getElementById('picker-view-grid-btn').addEventListener('click', () => setViewMode('grid'));
    document.getElementById('picker-view-coverflow-btn').addEventListener('click', () => setViewMode('coverflow'));
    document.getElementById('picker-coverflow-track').addEventListener('scroll', onCoverflowScroll, { passive: true });
    window.addEventListener('resize', () => { if (viewMode === 'coverflow') updateCoverflowTransforms(); });

    document.getElementById('picker-expanded-close').addEventListener('click', closeExpanded);
    document.getElementById('picker-expanded-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'picker-expanded-overlay') closeExpanded();
    });

    setViewMode('grid');
});
