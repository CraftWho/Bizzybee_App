console.log("/// BEE MODELS PROTOCOLS ONLINE ///");

// Renders every KEEPERDEX_ENTRIES row (db.js) as a big "model stage" -
// see nano-bee.css's --model scene variant, built specifically for this
// page. Deliberately NOT gated by ownership the way KeeperDex is (no
// locked/"???" state) - the point here is to see every species regardless
// of what you've unlocked, same "list the full catalog either way" spirit
// MATERIAL_CATALOG already uses on Inventory.
//
// Each entry's `model` field (db.js) is the one thing this page and any
// future card component share - see the comment on it there. Today
// `ready` is always false, so every stage below falls back to the flat
// NanoBee art plus a "not built yet" pill. Nothing here needs to change
// when that flips true except this file eventually branching on it too.
function renderModelsGrid() {
    const grid = document.getElementById('models-grid');
    if (!grid) return;

    grid.innerHTML = '';
    KEEPERDEX_ENTRIES.forEach(entry => {
        const card = document.createElement('div');
        grid.appendChild(card);
        renderModelCard(card, entry);
    });
}

function renderModelCard(container, entry) {
    const color = beeCardColor(entry.rarity);
    const dexNo = String(entry.dexNumber).padStart(3, '0');

    container.className = 'model-card';
    container.innerHTML = `
        <div class="model-card-stage" style="box-shadow: inset 0 0 40px ${color}33;">
            <span class="model-card-icon"></span>
        </div>
        <div class="model-card-info">
            <div class="model-card-top-row">
                <span class="model-card-name">${entry.name}</span>
                <span class="model-card-badge" style="background:${color};" title="${entry.rarity}">${entry.rarity.charAt(0)}</span>
            </div>
            <span class="model-card-species">No. ${dexNo} - ${entry.species}</span>
            <span class="model-card-3d-pill ${entry.model.ready ? 'is-ready' : ''}">${entry.model.ready ? '🧊 3D model ready' : '🧊 3D model: not built yet'}</span>
        </div>
    `;

    const iconEl = container.querySelector('.model-card-icon');
    NanoBee.render(iconEl, 'model', { color, hideCore: true, noFlight: true });

    container.addEventListener('click', () => openModelInspector(entry, color));
}

// Bigger stage + a working zoom slider + a drag-to-tilt preview. The
// drag/zoom are real and do something today; the "rotation" is a flat
// CSS rotateY on the same 2D art, an honest stand-in for what a real
// rotatable model will do here later - the pill under the controls says
// so explicitly rather than letting this pretend to be more than it is.
function openModelInspector(entry, color) {
    const dexNo = String(entry.dexNumber).padStart(3, '0');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-box model-inspector-modal">
            <div class="modal-header">
                <span class="modal-title">${entry.name} - No. ${dexNo}</span>
                <button class="modal-close" aria-label="Close">✕</button>
            </div>
            <div class="modal-body model-inspector-body">
                <div class="model-inspector-stage-wrap">
                    <div class="model-inspector-stage" id="model-inspector-stage"></div>
                </div>
                <div class="model-inspector-controls">
                    <label class="model-inspector-zoom-label">
                        Zoom
                        <input type="range" id="model-inspector-zoom" min="0.6" max="2.2" step="0.05" value="1">
                    </label>
                    <p class="model-inspector-drag-hint">drag left / right on the bee to preview rotation</p>
                    <span class="model-inspector-3d-pill ${entry.model.ready ? 'is-ready' : ''}">
                        ${entry.model.ready
                            ? '🧊 Full 3D model ready - drag to rotate for real'
                            : '🧊 Full 3D model coming soon - this is a flat preview standing in for it'}
                    </span>
                </div>
                <p class="model-inspector-flavor">${entry.description}</p>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // NanoBee.render() turns whatever container it's given INTO the
    // .nano-bee-scene element (adds the classes, replaces the innerHTML
    // with .scene-inner + the rig) - so render straight onto the stage
    // div itself rather than pre-building scene-inner by hand and handing
    // render() a nested child, which would just get a second scene-inner
    // rigged inside the first one.
    const stageScene = overlay.querySelector('#model-inspector-stage');
    NanoBee.render(stageScene, 'model', { color, hideCore: true, noFlight: true });
    stageScene.classList.add('is-focused');
    const sceneInner = stageScene.querySelector('.scene-inner');

    const zoomInput = overlay.querySelector('#model-inspector-zoom');
    // Matches nano-bee-scene--model.is-focused's own CSS scale(3.1) - once
    // JS starts driving .scene-inner's transform directly (for the tilt),
    // that inline style wins over the CSS rule, so the same base factor
    // has to be repeated here or zoom's 1.0 default would suddenly look
    // smaller than the static grid card did a moment ago.
    const FOCUS_BASE_SCALE = 3.1;
    let rotY = 0;
    let dragging = false;
    let lastX = 0;

    const applyTilt = () => {
        sceneInner.style.transform = `perspective(700px) rotateY(${rotY}deg) scale(${zoomInput.value * FOCUS_BASE_SCALE})`;
    };
    applyTilt();

    zoomInput.addEventListener('input', applyTilt);

    const onDragStart = (clientX) => { dragging = true; lastX = clientX; stageScene.classList.add('is-dragging'); };
    const onDragMove = (clientX) => {
        if (!dragging) return;
        rotY += (clientX - lastX) * 0.6;
        rotY = Math.max(-55, Math.min(55, rotY));
        lastX = clientX;
        applyTilt();
    };
    const onDragEnd = () => {
        if (!dragging) return;
        dragging = false;
        stageScene.classList.remove('is-dragging');
        rotY = 0;
        applyTilt();
    };

    stageScene.addEventListener('mousedown', (e) => onDragStart(e.clientX));
    window.addEventListener('mousemove', (e) => onDragMove(e.clientX));
    window.addEventListener('mouseup', onDragEnd);
    stageScene.addEventListener('touchstart', (e) => onDragStart(e.touches[0].clientX), { passive: true });
    window.addEventListener('touchmove', (e) => onDragMove(e.touches[0].clientX), { passive: true });
    window.addEventListener('touchend', onDragEnd);

    const closeModal = () => {
        overlay.remove();
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
        window.removeEventListener('touchmove', onDragMove);
        window.removeEventListener('touchend', onDragEnd);
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderModelsGrid();

    Waggle.setActions(baseWaggleActions());
});
