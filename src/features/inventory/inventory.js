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
// COVER FLOW SOUND
// Synthesized in-browser via Web Audio - deliberately NOT a downloaded/
// bundled audio clip (avoids any licensing question entirely). A short
// filtered noise burst + a quick descending tone for the per-card "flip"
// tick, and a two-tone chime for entering/leaving Jump-to-Letter mode.
// Module-scope (not per modal-open) so the AudioContext and the on/off
// preference both persist across repeated roster-modal opens.
// ==========================================================================
const COVERFLOW_SOUND_KEY = 'bizzybee_coverflow_sound';
let coverflowSoundOn = localStorage.getItem(COVERFLOW_SOUND_KEY) !== 'off';
let coverflowAudioCtx = null;

function getCoverflowAudioCtx() {
    if (!coverflowAudioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        coverflowAudioCtx = new Ctx();
    }
    if (coverflowAudioCtx.state === 'suspended') coverflowAudioCtx.resume();
    return coverflowAudioCtx;
}

function playCoverflowFlipSound() {
    if (!coverflowSoundOn) return;
    const ctx = getCoverflowAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 2200;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.22, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.05);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.055);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.12, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
}

function playCoverflowModeSound(rising) {
    if (!coverflowSoundOn) return;
    const ctx = getCoverflowAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    if (rising) {
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.18);
    } else {
        osc.frequency.setValueAtTime(1300, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.15);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);
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
            <!-- Cover Flow temporarily disabled (suspected contributor to a
                 stutter/glitch reported on Samsung Internet mobile when
                 opening a card from Grid view - see HANDOFF.md/inventory.js
                 comments near renderCoverflow). Button just hidden, not
                 removed - all of the Cover Flow code below is untouched and
                 this is a one-line revert once the underlying glitch is
                 sorted out. -->
            <button type="button" class="inventory-roster-view-btn" id="inventory-roster-view-coverflow-btn" hidden>🎞️ Cover Flow</button>
            <button type="button" class="inventory-roster-sound-btn" id="inventory-roster-sound-btn" title="Toggle Cover Flow sound" hidden>🔊</button>
        </div>

        <p class="inventory-roster-no-results" id="inventory-roster-no-results" hidden>No bees match your search/filters.</p>

        <div class="inventory-roster-tile-grid" id="inventory-roster-tile-grid"></div>

        <div class="inventory-roster-coverflow-wrap" id="inventory-roster-coverflow-wrap" hidden>
            <div class="inventory-roster-coverflow-track" id="inventory-roster-coverflow-track"></div>

            <div class="inventory-letter-jump" id="inventory-letter-jump">
                <div class="inventory-letter-jump-current" id="inventory-letter-jump-current">A</div>
                <div class="inventory-letter-jump-strip" id="inventory-letter-jump-strip"></div>
                <p class="inventory-letter-jump-hint">keep scrolling to change letters — pause to land</p>
            </div>

            <div class="inventory-coverflow-info" id="inventory-coverflow-info">
                <div class="inventory-coverflow-info-name" id="inventory-coverflow-info-name"></div>
                <div class="inventory-coverflow-info-sub" id="inventory-coverflow-info-sub"></div>
                <div class="inventory-coverflow-info-weakness" id="inventory-coverflow-info-weakness"></div>
            </div>

            <p class="inventory-roster-coverflow-hint">Scroll (or drag/swipe) to browse - keep scrolling fast to jump by letter - tap the centered bee to open it</p>
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
        soundBtn: overlay.querySelector('#inventory-roster-sound-btn'),
        letterJump: overlay.querySelector('#inventory-letter-jump'),
        letterCurrent: overlay.querySelector('#inventory-letter-jump-current'),
        letterStrip: overlay.querySelector('#inventory-letter-jump-strip'),
        coverflowInfo: overlay.querySelector('#inventory-coverflow-info'),
        coverflowInfoName: overlay.querySelector('#inventory-coverflow-info-name'),
        coverflowInfoSub: overlay.querySelector('#inventory-coverflow-info-sub'),
        coverflowInfoWeakness: overlay.querySelector('#inventory-coverflow-info-weakness'),
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

    // Cover Flow's tile - deliberately art-only, no name/text printed on
    // it (that only shows once below, in .inventory-coverflow-info, for
    // whichever bee is centered - matches the iPod-style reference this
    // was redesigned from). Still not a hand-built lookalike: it reuses
    // the REAL card's own art classes straight from bee-card.css
    // (bee-card-art-frame--<rarity>, bee-card-element-hex, bee-card-class-
    // badge) and the actual NanoBee sprite for its art, same "one source
    // of truth per bee" rule createTile() above already follows - just a
    // different (smaller, art-only) shape of tile.
    //
    // Position/rotation/scale are NOT set here - renderCoverflowFrame()
    // drives every tile's transform every frame from coverflowIndex, this
    // just builds the static element once per rebuild.
    function createCoverTile(bee) {
        const color = beeCardColor(bee.rarity);
        const themeKey = (bee.rarity || 'common').toLowerCase();
        const elementInfo = bee.element && BEE_ELEMENTS[bee.element] ? BEE_ELEMENTS[bee.element] : null;
        const classInfo = bee.class && BEE_CLASSES[bee.class] ? BEE_CLASSES[bee.class] : null;

        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = `inventory-cover-tile bee-card-art-frame bee-card-art-frame--${themeKey}`;
        tile.dataset.beeId = bee.id;
        tile.title = `${bee.name} (${bee.rarity})`;
        tile.style.setProperty('--tile-color', color);
        // Inline style always wins over bee-card.css's .bee-card-art-frame
        // border shorthand, regardless of cascade order - same trick
        // bee-card.js itself uses for the real card's border color.
        tile.style.borderColor = color;

        if (elementInfo) {
            const hex = document.createElement('span');
            hex.className = 'bee-card-element-hex';
            hex.title = elementInfo.label;
            hex.textContent = elementInfo.emoji;
            tile.appendChild(hex);
        }

        const iconHost = document.createElement('div');
        iconHost.className = 'inventory-cover-tile-icon-host';
        tile.appendChild(iconHost);
        NanoBee.render(iconHost, 'card', { color, hideCore: true, noFlight: true });

        if (classInfo) {
            const badge = document.createElement('span');
            badge.className = 'bee-card-class-badge';
            badge.title = classInfo.label;
            badge.textContent = classInfo.icon;
            tile.appendChild(badge);
        }

        tile.addEventListener('click', () => {
            // A drag/swipe that ends back over the tile still fires a
            // native click - swallow it so scrubbing through the deck
            // doesn't accidentally pop the expanded card open.
            if (coverflowDidDrag) return;
            openExpanded(bee);
        });
        return tile;
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
    }

    function renderGrid() {
        els.grid.innerHTML = '';
        filteredBees.forEach(bee => els.grid.appendChild(createTile(bee)));
        els.noResults.hidden = filteredBees.length !== 0;
        requestAnimationFrame(updateTileScale);
    }

    // ----------------------------------------------------------------
    // COVER FLOW: index-driven, not scroll-driven. coverflowIndex is the
    // ONLY source of truth for where the deck is - wheel/drag/touch/letter
    // -jump all just change that one number and call renderCoverflowFrame().
    // No native scrollLeft/scrollTo anywhere, which is what makes wheel
    // stepping reliable (the earlier native-scroll + scroll-snap + rAF-
    // sampled-geometry version could desync under fast input).
    // ----------------------------------------------------------------
    let coverflowTiles = [];
    let coverflowLetters = [];
    let coverflowIndex = 0;
    let coverflowSpacing = 82;
    let lastCenteredBeeId = null;
    let coverflowDidDrag = false;

    function measureCoverflowSpacing() {
        const first = coverflowTiles[0];
        if (first) coverflowSpacing = first.offsetWidth * 0.62;
    }

    // Applies every tile's transform for a given (possibly fractional,
    // mid-drag) index position, and refreshes the below-strip info block
    // for whichever card is currently closest to center.
    function renderCoverflowFrame(idxFloat) {
        if (coverflowTiles.length === 0) return;
        const clampedFloat = Math.max(0, Math.min(coverflowTiles.length - 1, idxFloat));
        const closestIndex = Math.max(0, Math.min(coverflowTiles.length - 1, Math.round(clampedFloat)));

        coverflowTiles.forEach((tile, i) => {
            const d = i - clampedFloat;
            const absD = Math.abs(d);
            const norm = Math.max(-1, Math.min(1, d / 2.2));
            const absNorm = Math.abs(norm);
            const scale = 1 - absNorm * 0.16;
            const rotateY = norm * -65;
            const translateZ = -absNorm * 70;
            const translateX = d * coverflowSpacing;
            const fade = Math.max(0, 1 - absD / 5.5);

            tile.style.transform = `translate(-50%, -50%) translateX(${translateX}px) perspective(700px) rotateY(${rotateY}deg) scale(${scale}) translateZ(${translateZ}px)`;
            tile.style.opacity = String(fade * (1 - absNorm * 0.15));
            tile.style.zIndex = String(100 - Math.round(absD * 10));
        });

        const bee = filteredBees[closestIndex];
        if (!bee) return;

        if (bee.id !== lastCenteredBeeId) {
            if (lastCenteredBeeId !== null) playCoverflowFlipSound();
            lastCenteredBeeId = bee.id;
        }

        const elementInfo = bee.element && BEE_ELEMENTS[bee.element] ? BEE_ELEMENTS[bee.element] : null;
        const weakKey = bee.element ? BEE_ELEMENT_WEAKNESS[bee.element] : null;
        const weakInfo = weakKey && BEE_ELEMENTS[weakKey] ? BEE_ELEMENTS[weakKey] : null;

        els.coverflowInfoName.textContent = bee.name;
        els.coverflowInfoName.style.color = beeCardColor(bee.rarity);
        els.coverflowInfoSub.textContent = elementInfo ? `${bee.rarity} · ${elementInfo.label}` : bee.rarity;
        if (weakInfo) {
            els.coverflowInfoWeakness.innerHTML = `Weakness <span>${weakInfo.emoji}</span> ×2`;
            els.coverflowInfoWeakness.style.display = 'inline-flex';
        } else {
            els.coverflowInfoWeakness.style.display = 'none';
        }
    }

    function setCoverflowIndex(newIndex) {
        if (coverflowTiles.length === 0) return;
        coverflowIndex = Math.max(0, Math.min(coverflowTiles.length - 1, newIndex));
        renderCoverflowFrame(coverflowIndex);
    }

    // --- JUMP-TO-LETTER MODE ---
    let coverflowLetterMode = false;
    let coverflowLetterCursor = 0;
    let coverflowLetterAccum = 0;
    let coverflowLetterExitTimer = null;
    const LETTER_STEP = 130;

    function updateLetterOverlay() {
        const letter = coverflowLetters[coverflowLetterCursor];
        els.letterCurrent.textContent = letter || '';
        Array.from(els.letterStrip.children).forEach((c, i) => c.classList.toggle('is-current', i === coverflowLetterCursor));
    }
    function jumpToLetter(letter) {
        const idx = filteredBees.findIndex(b => (b.name[0] || '?').toUpperCase() === letter);
        if (idx !== -1) setCoverflowIndex(idx);
    }
    function handleLetterScroll(delta) {
        coverflowLetterAccum += delta;
        let moved = false;
        while (Math.abs(coverflowLetterAccum) >= LETTER_STEP) {
            const step = coverflowLetterAccum > 0 ? 1 : -1;
            coverflowLetterAccum -= step * LETTER_STEP;
            const next = coverflowLetterCursor + step;
            if (next >= 0 && next < coverflowLetters.length) {
                coverflowLetterCursor = next;
                moved = true;
            }
        }
        if (moved) {
            updateLetterOverlay();
            jumpToLetter(coverflowLetters[coverflowLetterCursor]);
        }
    }
    function enterLetterMode() {
        if (coverflowLetterMode || coverflowLetters.length <= 1) return;
        coverflowLetterMode = true;
        coverflowWheelAccum = 0;
        coverflowLetterAccum = 0;
        const currentBee = filteredBees[coverflowIndex];
        coverflowLetterCursor = Math.max(0, coverflowLetters.indexOf((currentBee.name[0] || '?').toUpperCase()));
        els.letterJump.classList.add('is-active');
        updateLetterOverlay();
        playCoverflowModeSound(true);
    }
    function exitLetterMode(silent) {
        const wasActive = coverflowLetterMode;
        coverflowLetterMode = false;
        coverflowFastStreakStart = null;
        coverflowWheelAccum = 0;
        els.letterJump.classList.remove('is-active');
        if (wasActive && !silent) playCoverflowModeSound(false);
    }
    function scheduleLetterExit() {
        clearTimeout(coverflowLetterExitTimer);
        coverflowLetterExitTimer = setTimeout(() => exitLetterMode(false), 700);
    }

    function renderCoverflow() {
        els.coverflowTrack.innerHTML = '';
        els.noResults.hidden = filteredBees.length !== 0;
        exitLetterMode(true);
        coverflowTiles = [];
        lastCenteredBeeId = null;

        if (filteredBees.length === 0) {
            els.coverflowInfoName.textContent = '';
            els.coverflowInfoSub.textContent = '';
            els.coverflowInfoWeakness.textContent = '';
            els.letterStrip.innerHTML = '';
            coverflowLetters = [];
            return;
        }

        filteredBees.forEach(bee => els.coverflowTrack.appendChild(createCoverTile(bee)));
        coverflowTiles = Array.from(els.coverflowTrack.children);
        measureCoverflowSpacing();

        coverflowLetters = Array.from(new Set(filteredBees.map(b => (b.name[0] || '?').toUpperCase()))).sort();
        els.letterStrip.innerHTML = '';
        coverflowLetters.forEach(letter => {
            const chip = document.createElement('span');
            chip.className = 'inventory-letter-jump-chip';
            chip.textContent = letter;
            els.letterStrip.appendChild(chip);
        });

        coverflowIndex = 0;
        renderCoverflowFrame(coverflowIndex);
    }

    function renderCurrentView() {
        if (viewMode === 'grid') renderGrid();
        else renderCoverflow();
    }

    // --- DESKTOP MOUSE WHEEL --- one notch = one card. Faster consecutive
    // ticks multiply the effective delta so a quick flick eats through more
    // cards than a slow deliberate turn. ~1s of sustained fast ticking
    // flips into Jump-to-Letter mode.
    let coverflowWheelAccum = 0;
    let coverflowLastWheelTime = 0;
    let coverflowFastStreakStart = null;
    const WHEEL_STEP = 100;
    const FAST_TICK_MS = 90;
    const FAST_STREAK_MS = 1000;

    function onCoverflowWheel(e) {
        if (viewMode !== 'coverflow' || coverflowTiles.length === 0) return;
        e.preventDefault();
        getCoverflowAudioCtx();

        const now = performance.now();
        const dt = coverflowLastWheelTime ? now - coverflowLastWheelTime : Infinity;
        coverflowLastWheelTime = now;
        const rawDelta = e.deltaY + e.deltaX;
        if (rawDelta === 0) return;

        if (coverflowLetterMode) {
            handleLetterScroll(rawDelta);
            scheduleLetterExit();
            return;
        }

        const speedMultiplier = dt < 45 ? 3 : dt < 90 ? 1.8 : 1;
        coverflowWheelAccum += rawDelta * speedMultiplier;

        while (Math.abs(coverflowWheelAccum) >= WHEEL_STEP) {
            const step = coverflowWheelAccum > 0 ? 1 : -1;
            coverflowWheelAccum -= step * WHEEL_STEP;
            setCoverflowIndex(coverflowIndex + step);
        }

        if (dt < FAST_TICK_MS) {
            if (coverflowFastStreakStart === null) coverflowFastStreakStart = now;
            if (now - coverflowFastStreakStart >= FAST_STREAK_MS) enterLetterMode();
        } else {
            coverflowFastStreakStart = null;
        }
    }

    // --- MOUSE DRAG / TOUCH SWIPE: direct 1:1 follow while active (CSS
    // transition disabled via .is-dragging, see inventory.css), snaps to
    // the nearest card on release. Shared by mouse and touch so the two
    // interactions can't drift apart. ---
    let coverflowDragging = false;
    let coverflowDragStartX = 0;
    let coverflowDragStartIndex = 0;
    let coverflowLiveDragIndex = 0;

    function coverflowDragStart(clientX) {
        if (coverflowTiles.length === 0) return;
        coverflowDragging = true;
        coverflowDidDrag = false;
        els.coverflowWrap.classList.add('is-dragging');
        coverflowDragStartX = clientX;
        coverflowDragStartIndex = coverflowIndex;
        coverflowLiveDragIndex = coverflowIndex;
        getCoverflowAudioCtx();
    }
    function coverflowDragMove(clientX) {
        if (!coverflowDragging) return;
        const deltaPx = clientX - coverflowDragStartX;
        if (Math.abs(deltaPx) > 6) coverflowDidDrag = true;
        coverflowLiveDragIndex = Math.max(0, Math.min(coverflowTiles.length - 1, coverflowDragStartIndex - deltaPx / coverflowSpacing));
        renderCoverflowFrame(coverflowLiveDragIndex);
    }
    function coverflowDragEnd() {
        if (!coverflowDragging) return;
        coverflowDragging = false;
        els.coverflowWrap.classList.remove('is-dragging');
        setCoverflowIndex(Math.round(coverflowLiveDragIndex));
    }

    function onCoverflowMouseDown(e) {
        if (viewMode !== 'coverflow') return;
        coverflowDragStart(e.clientX);
    }
    function onWindowMouseMove(e) { coverflowDragMove(e.clientX); }
    function onWindowMouseUp() { coverflowDragEnd(); }

    function onCoverflowTouchStart(e) {
        if (viewMode !== 'coverflow' || !e.touches[0]) return;
        coverflowDragStart(e.touches[0].clientX);
    }
    function onWindowTouchMove(e) {
        if (!coverflowDragging || !e.touches[0]) return;
        coverflowDragMove(e.touches[0].clientX);
    }
    function onWindowTouchEnd() { coverflowDragEnd(); }

    function refreshSoundBtn() {
        els.soundBtn.textContent = coverflowSoundOn ? '🔊' : '🔇';
        els.soundBtn.classList.toggle('is-off', !coverflowSoundOn);
    }

    function setViewMode(mode) {
        viewMode = mode;
        els.viewGridBtn.classList.toggle('is-active', mode === 'grid');
        els.viewCoverflowBtn.classList.toggle('is-active', mode === 'coverflow');
        els.grid.hidden = mode !== 'grid';
        els.coverflowWrap.hidden = mode !== 'coverflow';
        els.soundBtn.hidden = mode !== 'coverflow';
        if (mode !== 'coverflow') exitLetterMode(true);
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

    els.soundBtn.addEventListener('click', () => {
        coverflowSoundOn = !coverflowSoundOn;
        localStorage.setItem(COVERFLOW_SOUND_KEY, coverflowSoundOn ? 'on' : 'off');
        refreshSoundBtn();
        if (coverflowSoundOn) getCoverflowAudioCtx();
    });
    refreshSoundBtn();

    els.coverflowInfo.addEventListener('click', () => {
        const bee = filteredBees[coverflowIndex];
        if (bee) openExpanded(bee);
    });

    // Wheel/drag/touch all live on the wrap (not just the track) so the
    // hit area includes the Jump-to-Letter overlay and any breathing room
    // around the deck. Drag/touch release listeners are bound to `window`
    // (same reasoning as the resize listener below - a mouseup/touchend
    // that lands outside the wrap must still end the drag), so they MUST
    // be torn down in destroy() too or repeated modal opens stack up
    // duplicate listeners.
    els.coverflowWrap.addEventListener('wheel', onCoverflowWheel, { passive: false });
    els.coverflowWrap.addEventListener('mousedown', onCoverflowMouseDown);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    els.coverflowWrap.addEventListener('touchstart', onCoverflowTouchStart, { passive: true });
    window.addEventListener('touchmove', onWindowTouchMove, { passive: true });
    window.addEventListener('touchend', onWindowTouchEnd);

    // Tile width (and so the --tile-scale every mini card is sized off of,
    // plus Cover Flow's card-to-card spacing) changes with the viewport -
    // rAF-throttled so a resize-drag doesn't recompute more than once a
    // frame. Bound to `window`, which outlives this modal, so it MUST be
    // torn down on close (see destroy() below) or repeated opens would
    // stack up duplicate listeners.
    let resizeRaf = null;
    function onWindowResize() {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = null;
            updateTileScale();
            if (viewMode === 'coverflow') {
                measureCoverflowSpacing();
                renderCoverflowFrame(coverflowIndex);
            }
        });
    }
    window.addEventListener('resize', onWindowResize);

    setViewMode('grid');

    return {
        destroy() {
            window.removeEventListener('resize', onWindowResize);
            window.removeEventListener('mousemove', onWindowMouseMove);
            window.removeEventListener('mouseup', onWindowMouseUp);
            window.removeEventListener('touchmove', onWindowTouchMove);
            window.removeEventListener('touchend', onWindowTouchEnd);
            clearTimeout(coverflowLetterExitTimer);
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
