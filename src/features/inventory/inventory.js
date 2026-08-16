console.log("/// INVENTORY PROTOCOLS INITIALIZED ///");

// BEE_RARITIES, BEE_CLASSES, MATERIAL_CATALOG all live in db.js - same
// globals the Pollination Chamber renders from, so a bee/material looks
// identical here. Bee cards themselves are rendered via the shared
// BeeCard component (bee-card.js). Materials/Evolution Items/Store Items
// below render via the shared ItemCard component (item-card.js) instead -
// same flip-for-more-info idea, just a rectangular card instead of a
// bee-shaped one, since these are inert collectibles, not creatures.

// Shared by the Materials and Evolution Items grids below - both are the
// same "list the full catalog, grey out anything at 0" pattern, just
// reading from a different catalog/owned-counts pair. Evolution Items'
// fragment entries (isFragment: true) read from `fragments` instead of
// `owned` and render as an X/5 progress badge rather than a plain count -
// see FRAGMENTS_REQUIRED/_addFragment in db.js.
function renderCatalogGrid(gridId, catalog, owned, fragments) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.innerHTML = '';
    catalog.forEach(entry => {
        const card = document.createElement('div');
        grid.appendChild(card);

        const isFragment = !!(fragments && entry.isFragment);
        ItemCard.render(card, {
            id: entry.id,
            icon: entry.icon,
            label: entry.label,
            description: entry.description,
            rarity: entry.rarity || null,
            count: owned[entry.id] || 0,
            fragmentProgress: isFragment
                ? { current: fragments[entry.id] || 0, required: typeof FRAGMENTS_REQUIRED !== 'undefined' ? FRAGMENTS_REQUIRED : 5 }
                : null
        });
    });
}

function renderMaterialsGrid() {
    renderCatalogGrid('inventory-materials-grid', MATERIAL_CATALOG, Vault.getMaterials());
}

// Evolution Items - see EVOLUTION_ITEM_CATALOG/evolveBee/applyTraitItem in
// db.js. Actually spending one happens from the bee roster below (each
// BeeCard offers Evolve/Rebirth/Apply Item buttons in editable mode when
// eligible) - this grid is purely "what do I currently have," including
// in-progress fragment counts.
function renderItemsGrid() {
    renderCatalogGrid('inventory-items-grid', EVOLUTION_ITEM_CATALOG, Vault.getItems(), Vault.getFragments());
}

// Honey Store purchases - see STORE_ITEM_CATALOG/purchaseStoreItem in
// db.js. Shares the same state.inventory.items pool as Evolution Items
// (a purchased item and a dropped item are identical once owned), so this
// is purely "what did I buy" - the actual purchase happens on the Honey
// Store page, applying a bee-side effect happens from the roster below.
function renderStoreItemsGrid() {
    renderCatalogGrid('inventory-store-items-grid', STORE_ITEM_CATALOG, Vault.getItems());
}

// ==========================================================================
// BEE ROSTER PICKER
// Replaces the old plain flex-wrapped BeeCard grid with a real browsing
// picker: search + rarity/element/work filters, a compact-tile Grid view
// and an iPod-style Cover Flow view (toggle between them), real trading-
// card-ratio tiles (sizing itself lives in bee-card.css/the tile CSS in
// inventory.css - not duplicated here). Tapping any tile opens the real,
// EDITABLE BeeCard (rename/assign-work/evolve/rebirth all still work
// exactly like the old grid) at a readable size; tap it again or swipe it
// to flip to stats.
//
// State (allBees/filteredBees/viewMode) is scoped inside
// setupRosterPicker() per modal-open, not module-level - the modal is
// torn down and rebuilt from scratch every time it's opened (same pattern
// the old code already used), so there's no stale state to reset between
// opens.
// ==========================================================================

function rosterPickerMarkup() {
    return `
        <div class="inventory-roster-controls">
            <input type="search" id="inventory-roster-search" class="inventory-roster-search-input" placeholder="🔍 Search by name…">
            <select id="inventory-roster-filter-rarity" class="inventory-roster-filter-select">
                <option value="">All Rarities</option>
            </select>
            <select id="inventory-roster-filter-element" class="inventory-roster-filter-select">
                <option value="">All Elements</option>
            </select>
            <select id="inventory-roster-filter-class" class="inventory-roster-filter-select">
                <option value="">All Work</option>
            </select>
            <span class="inventory-roster-result-count" id="inventory-roster-result-count"></span>
        </div>

        <div class="inventory-roster-view-toggle">
            <button type="button" class="inventory-roster-view-btn is-active" id="inventory-roster-view-grid-btn">▦ Grid</button>
            <button type="button" class="inventory-roster-view-btn" id="inventory-roster-view-coverflow-btn">🎞️ Cover Flow</button>
        </div>

        <p class="inventory-roster-no-results" id="inventory-roster-no-results" hidden>No bees match your search/filters.</p>

        <div class="inventory-roster-tile-grid" id="inventory-roster-tile-grid"></div>

        <div class="inventory-roster-coverflow-wrap" id="inventory-roster-coverflow-wrap" hidden>
            <div class="inventory-roster-coverflow-track" id="inventory-roster-coverflow-track"></div>
            <p class="inventory-roster-coverflow-hint">↔ scroll or swipe - tap any bee to open it</p>
        </div>
    `;
}

function populateFilterSelect(selectEl, entries) {
    entries.forEach(([value, label]) => selectEl.appendChild(new Option(label, value)));
}

// BeeCard.render() already wires a plain tap/click to flip - this adds a
// horizontal swipe as an alternate gesture on the expanded card, toggling
// the same `is-flipped` class the click listener uses.
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

function closeExpanded(expandedOverlay) {
    expandedOverlay.classList.remove('is-open');
    setTimeout(() => {
        if (expandedOverlay.isConnected) expandedOverlay.hidden = true;
    }, 220);
}

// All picker state/behavior for one open-modal lifetime. `overlay` is the
// roster modal itself, `expandedOverlay` the separate tap-to-enlarge
// layer created alongside it in openBeeRosterModal().
function setupRosterPicker(overlay, expandedOverlay, initialBees) {
    let allBees = initialBees;
    let filteredBees = allBees.slice();
    let viewMode = 'grid';
    let coverflowRaf = null;

    const els = {
        search: overlay.querySelector('#inventory-roster-search'),
        rarity: overlay.querySelector('#inventory-roster-filter-rarity'),
        element: overlay.querySelector('#inventory-roster-filter-element'),
        cls: overlay.querySelector('#inventory-roster-filter-class'),
        resultCount: overlay.querySelector('#inventory-roster-result-count'),
        noResults: overlay.querySelector('#inventory-roster-no-results'),
        grid: overlay.querySelector('#inventory-roster-tile-grid'),
        coverflowWrap: overlay.querySelector('#inventory-roster-coverflow-wrap'),
        coverflowTrack: overlay.querySelector('#inventory-roster-coverflow-track'),
        viewGridBtn: overlay.querySelector('#inventory-roster-view-grid-btn'),
        viewCoverflowBtn: overlay.querySelector('#inventory-roster-view-coverflow-btn'),
        countBadge: overlay.querySelector('#inventory-roster-count-badge')
    };

    populateFilterSelect(els.rarity, BEE_RARITIES.map(r => [r.rarity, r.rarity]));
    populateFilterSelect(els.element, Object.entries(BEE_ELEMENTS).map(([key, info]) => [key, `${info.emoji} ${info.label}`]));
    populateFilterSelect(els.cls, Object.entries(BEE_CLASSES).map(([key, info]) => [key, `${info.icon} ${info.label}`]));
    els.cls.appendChild(new Option('— Unassigned —', '__unassigned__'));

    // Builds a tile as a scaled-down copy of the REAL bee card - not a
    // hand-built lookalike. BeeCard.render() (bee-card.js) is called
    // read-only (editable: false) into a fixed-260px-wide inner element,
    // which is then shrunk to fit the tile via a CSS transform: scale() -
    // see .inventory-roster-tile-scale in inventory.css. This is what
    // guarantees the tile matches the expanded card 1:1 (name+badge, art
    // frame with element hex/class badge, dex strip, weakness row,
    // role/footer, flavor text, flip hint) instead of two versions that
    // could quietly drift apart later.
    //
    // The tile itself owns the click (opens the expanded, editable card -
    // see openExpanded below); the mini card inside is pointer-events:none
    // (inventory.css) so it can't independently catch a click and trigger
    // its own flip - there's no room to show a flipped-stats face at this
    // size anyway.
    function createTile(bee) {
        // beeCardColor() is a plain global function from bee-card.js
        // (already loaded on this page) - reused as-is rather than
        // duplicated here, same rarity-to-color mapping every bee-shaped
        // element in the app already shares. Only used here for the
        // tile's own hover/centered glow - the card's own border/glow
        // comes from BeeCard.render() itself.
        const color = beeCardColor(bee.rarity);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inventory-roster-tile';
        btn.dataset.beeId = bee.id;
        btn.style.setProperty('--tile-color', color);
        btn.title = `${bee.name} (${bee.rarity})`;

        const scaleWrap = document.createElement('div');
        scaleWrap.className = 'inventory-roster-tile-scale';

        const cardHost = document.createElement('div');
        scaleWrap.appendChild(cardHost);
        btn.appendChild(scaleWrap);

        BeeCard.render(cardHost, bee, { editable: false });

        btn.addEventListener('click', () => openExpanded(bee));
        return btn;
    }

    // Grid and Cover Flow render their tiles at different real widths (see
    // the responsive breakpoints / clamp() in inventory.css) - rather than
    // duplicating that sizing math here, this just measures whatever tile
    // width actually landed and exposes it as a --tile-scale custom
    // property on the shared wrapper, which every tile's 260px-wide mini
    // card reads via transform: scale(). Recomputed after every re-render
    // and on window resize (see the resize listener below) so it never
    // drifts out of sync with the CSS as the viewport changes.
    function updateTileScale() {
        const gridTile = els.grid.querySelector('.inventory-roster-tile');
        if (gridTile) els.grid.style.setProperty('--tile-scale', gridTile.offsetWidth / 260);

        const cfTile = els.coverflowTrack.querySelector('.inventory-roster-tile');
        if (cfTile) els.coverflowTrack.style.setProperty('--tile-scale', cfTile.offsetWidth / 260);
    }

    function renderGrid() {
        els.grid.innerHTML = '';
        filteredBees.forEach(bee => els.grid.appendChild(createTile(bee)));
        els.noResults.hidden = filteredBees.length !== 0;
        requestAnimationFrame(updateTileScale);
    }

    function renderCoverflow() {
        els.coverflowTrack.innerHTML = '';
        els.coverflowTrack.style.paddingLeft = '0px';
        els.coverflowTrack.style.paddingRight = '0px';
        els.noResults.hidden = filteredBees.length !== 0;
        if (filteredBees.length === 0) return;

        filteredBees.forEach(bee => els.coverflowTrack.appendChild(createTile(bee)));

        // Pad both ends so the first/last real tile can still reach dead
        // center - otherwise only tiles in the "middle" of the list could
        // ever be the focused one.
        requestAnimationFrame(() => {
            updateTileScale();
            const firstTile = els.coverflowTrack.querySelector('.inventory-roster-tile');
            if (els.coverflowWrap && firstTile) {
                const pad = Math.max(0, (els.coverflowWrap.clientWidth - firstTile.offsetWidth) / 2);
                els.coverflowTrack.style.paddingLeft = `${pad}px`;
                els.coverflowTrack.style.paddingRight = `${pad}px`;
                els.coverflowTrack.scrollLeft = 0;
            }
            updateCoverflowTransforms();
        });
    }

    function renderCurrentView() {
        if (viewMode === 'grid') renderGrid();
        else renderCoverflow();
    }

    // rAF-throttled so this doesn't run more than once per frame while
    // the user is actively scrolling/swiping.
    function onCoverflowScroll() {
        if (coverflowRaf) return;
        coverflowRaf = requestAnimationFrame(() => {
            coverflowRaf = null;
            updateCoverflowTransforms();
        });
    }

    // The actual "iPod" feel: each tile's scale/rotation/opacity is a
    // function of how far its center sits from the track's visible
    // center, normalized to -1..1 (edge of the wrap) - centered = full
    // size, facing forward, opaque; toward either edge = smaller, tilted
    // away (a cheap perspective/rotateY fake-3D "cover flow" lean), and
    // fading out.
    function updateCoverflowTransforms() {
        if (!els.coverflowWrap || !els.coverflowTrack) return;
        const wrapRect = els.coverflowWrap.getBoundingClientRect();
        const centerX = wrapRect.left + wrapRect.width / 2;

        Array.from(els.coverflowTrack.children).forEach(tile => {
            if (!tile.classList || !tile.classList.contains('inventory-roster-tile')) return;
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

    function setViewMode(mode) {
        viewMode = mode;
        els.viewGridBtn.classList.toggle('is-active', mode === 'grid');
        els.viewCoverflowBtn.classList.toggle('is-active', mode === 'coverflow');
        els.grid.hidden = mode !== 'grid';
        els.coverflowWrap.hidden = mode !== 'coverflow';
        renderCurrentView();
    }

    function applyFilters() {
        const search = els.search.value.trim().toLowerCase();
        const rarity = els.rarity.value;
        const element = els.element.value;
        const cls = els.cls.value;

        filteredBees = allBees.filter(bee => {
            if (search && !bee.name.toLowerCase().includes(search)) return false;
            if (rarity && bee.rarity !== rarity) return false;
            if (element && bee.element !== element) return false;
            if (cls === '__unassigned__' && bee.class) return false;
            if (cls && cls !== '__unassigned__' && bee.class !== cls) return false;
            return true;
        });

        els.resultCount.textContent = `${filteredBees.length} of ${allBees.length}`;
        renderCurrentView();
    }

    // Editable BeeCard, same as the old roster grid - rename, assign
    // work, evolve, rebirth, apply trait items, Named Beast conversion
    // all still work here, just reached by tapping a tile instead of
    // being permanently visible on every card at once.
    function openExpanded(bee) {
        const host = expandedOverlay.querySelector('.inventory-roster-expanded-card-host');
        host.innerHTML = '';
        BeeCard.render(host, bee, {
            editable: true,
            onChange: () => {
                // A rename/class-change/evolve/etc. can change the exact
                // bee this card is showing (new name, rarity, or class) -
                // refresh the roster from the Vault, re-apply the active
                // filters (a class change can drop a bee out of an active
                // class filter, same as the old grid's onChange refreshed
                // every card), and keep the SAME bee open with fresh data
                // rather than closing the overlay out from under the user.
                allBees = Vault.getColonyBees().slice().reverse();
                const fresh = allBees.find(b => b.id === bee.id);
                if (els.countBadge) els.countBadge.textContent = allBees.length;
                const rosterCountEl = document.getElementById('inventory-bee-roster-count');
                if (rosterCountEl) rosterCountEl.textContent = `${allBees.length} bees`;
                renderItemsGrid();
                renderStoreItemsGrid();
                applyFilters();
                if (fresh) openExpanded(fresh);
                else closeExpanded(expandedOverlay);
            }
        });
        setupSwipeToFlip(host);

        expandedOverlay.hidden = false;
        // Next frame so the hidden->visible change doesn't eat the
        // opacity/scale transition (browsers won't animate a property
        // change applied in the same frame an element goes display:none
        // -> visible).
        requestAnimationFrame(() => expandedOverlay.classList.add('is-open'));
    }

    els.search.addEventListener('input', applyFilters);
    els.rarity.addEventListener('change', applyFilters);
    els.element.addEventListener('change', applyFilters);
    els.cls.addEventListener('change', applyFilters);

    els.viewGridBtn.addEventListener('click', () => setViewMode('grid'));
    els.viewCoverflowBtn.addEventListener('click', () => setViewMode('coverflow'));
    els.coverflowTrack.addEventListener('scroll', onCoverflowScroll, { passive: true });

    // Tile width (and so the --tile-scale every mini card is sized off of)
    // changes with the viewport - rAF-throttled the same way the scroll
    // listener above is, so a resize-drag doesn't recompute more than once
    // a frame. Bound to `window`, which outlives this modal, so it MUST be
    // torn down on close (see destroy() below) or repeated opens would
    // stack up duplicate listeners.
    let resizeRaf = null;
    function onWindowResize() {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = null;
            updateTileScale();
            if (viewMode === 'coverflow') updateCoverflowTransforms();
        });
    }
    window.addEventListener('resize', onWindowResize);

    setViewMode('grid');

    return {
        destroy() {
            window.removeEventListener('resize', onWindowResize);
        }
    };
}

function openBeeRosterModal() {
    const bees = Vault.getColonyBees().slice().reverse();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-box inventory-roster-modal">
            <div class="modal-header">
                <span class="modal-title">🐝 Colony Bees (<span id="inventory-roster-count-badge">${bees.length}</span>)</span>
                <button class="modal-close" aria-label="Close">✕</button>
            </div>
            <div class="modal-body inventory-roster-body">
                ${bees.length === 0
                    ? `<p class="empty-state">No bees yet - visit the Pollination Chamber to pull your first one.</p>`
                    : rosterPickerMarkup()}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Tap-to-enlarge layer - a separate fixed-position element (not
    // nested in the modal) so it can sit above the roster modal itself;
    // created/removed together with it rather than living in the static
    // HTML, same "built entirely in JS" pattern the modal already used.
    const expandedOverlay = document.createElement('div');
    expandedOverlay.className = 'inventory-roster-expanded-overlay';
    expandedOverlay.hidden = true;
    expandedOverlay.innerHTML = `
        <button class="inventory-roster-expanded-close" aria-label="Close">✕</button>
        <div class="inventory-roster-expanded-card-host"></div>
        <p class="inventory-roster-expanded-hint">tap the card, or swipe it, to flip</p>
    `;
    document.body.appendChild(expandedOverlay);

    // Set by setupRosterPicker() below when there are bees to browse - its
    // destroy() tears down the window resize listener it registers, so
    // closing/reopening the modal repeatedly doesn't leak listeners.
    let picker = null;

    const closeAll = () => {
        if (picker) picker.destroy();
        overlay.remove();
        expandedOverlay.remove();
    };

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeAll();
    });
    overlay.querySelector('.modal-close').addEventListener('click', closeAll);

    expandedOverlay.querySelector('.inventory-roster-expanded-close').addEventListener('click', () => closeExpanded(expandedOverlay));
    expandedOverlay.addEventListener('click', (event) => {
        if (event.target === expandedOverlay) closeExpanded(expandedOverlay);
    });

    if (bees.length === 0) return;

    picker = setupRosterPicker(overlay, expandedOverlay, bees);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderMaterialsGrid();
    renderItemsGrid();
    renderStoreItemsGrid();
    document.getElementById('inventory-bee-roster-count').textContent = `${Vault.getColonyBees().length} bees`;
    document.getElementById('inventory-bee-roster-btn').addEventListener('click', openBeeRosterModal);

    HiveMind.setActions(baseHiveMindActions());
});
