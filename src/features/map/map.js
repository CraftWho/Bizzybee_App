console.log("/// MAP PROTOCOLS INITIALIZED ///");

// Not the same escapeHTML/escapeAttr as quests.js - kept private to this
// file, same reasoning as llm-engine.js's escapeChatHTML.
function escapeMapAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// The road's waypoints are now game-determined rather than one-per-quest:
// a fixed ladder of level milestones, each a named town or city along the
// route. Every 3rd stop is a city (bigger, more significant); the rest are
// towns. Purely presentational data - no Vault storage needed, since it's
// the same fixed itinerary for everyone and just reflects Vault.getUser()
// .level against it live.
const MAP_CHECKPOINTS = [
    { level: 3, name: 'Pollen Hollow', isCity: false },
    { level: 6, name: 'Waxcomb Village', isCity: false },
    { level: 9, name: 'Nectar City', isCity: true },
    { level: 12, name: 'Dew Meadow', isCity: false },
    { level: 15, name: 'Clover Bend', isCity: false },
    { level: 18, name: 'Golden Hive Capital', isCity: true },
    { level: 21, name: 'Sunpetal Grove', isCity: false },
    { level: 24, name: 'Driftwing Hamlet', isCity: false },
    { level: 27, name: 'Royal Comb Citadel', isCity: true },
    { level: 30, name: 'Amber Thicket', isCity: false },
    { level: 33, name: 'Honeyfen', isCity: false },
    { level: 36, name: 'Sovereign Apiary', isCity: true }
];

const MAP_FINISH_LABEL = 'The Eternal Hive';

// Overworld-style layout: milestones are plotted as checkpoints along a
// winding road that's baked into the illustrated picture itself (see
// ./assets/map-background.svg). That picture is linked into the page via
// an <object> tag rather than <img> specifically so this file can reach
// inside its embedded document and read the road path's real geometry via
// getPointAtLength - the same element you SEE is the one deciding where
// every checkpoint lands.
//
// Icon meaning: 📍 start (bottom-left)   🏁 checkpoint (town/city)   🏆 finish (top-right)
// Since 🏁 is shared by every checkpoint, status is communicated through
// color/glow, and city-vs-town through size - three status states:
//   reached           -> gold, solid
//   next milestone     -> crimson, pulsing (only ever one at a time)
//   locked (not yet reached) -> dim/neutral
function renderMap(pictureDoc) {
    const userLevel = Vault.getUser().level;
    const pathEl = pictureDoc.getElementById('map-road-path');
    const markersEl = document.getElementById('map-markers');

    const totalLength = pathEl.getTotalLength();

    // The picture's SVG viewBox is a fixed 1000x1000 square and .map-frame
    // is forced to aspect-ratio: 1/1 in CSS, so a viewBox coordinate maps
    // straight to a percentage - no separate screen-space math needed.
    const toPercent = (pt) => ({
        left: (pt.x / 1000) * 100,
        top: (pt.y / 1000) * 100
    });

    const startPt = toPercent(pathEl.getPointAtLength(0));
    const finishPt = toPercent(pathEl.getPointAtLength(totalLength));

    const nodesHTML = [];

    nodesHTML.push(`
        <div class="map-node map-node--start" style="left:${startPt.left}%; top:${startPt.top}%;" title="Start">
            <span class="map-node-icon">📍</span>
        </div>
    `);

    // Exactly one checkpoint is ever "next" - the first one the user's
    // current level hasn't reached yet. Everything before it is reached;
    // everything after it is locked. Once every milestone is passed, none
    // are "next" anymore - they're just all reached.
    const nextIndex = MAP_CHECKPOINTS.findIndex(cp => userLevel < cp.level);

    MAP_CHECKPOINTS.forEach((cp, i) => {
        const t = (i + 1) / (MAP_CHECKPOINTS.length + 1);
        const pt = toPercent(pathEl.getPointAtLength(t * totalLength));
        const reached = userLevel >= cp.level;
        const isNext = i === nextIndex;

        let statusClass = 'map-node--pending';
        let statusLabel = 'Locked';
        if (reached) {
            statusClass = 'map-node--completed';
            statusLabel = 'Reached';
        } else if (isNext) {
            statusClass = 'map-node--active';
            statusLabel = 'Next Milestone';
        }

        const cityClass = cp.isCity ? ' map-node--city' : '';
        const typeLabel = cp.isCity ? 'City' : 'Town';
        const title = `${cp.name} (${typeLabel}, Level ${cp.level}) - ${statusLabel}`;

        nodesHTML.push(`
            <div class="map-node map-node--checkpoint ${statusClass}${cityClass}" style="left:${pt.left}%; top:${pt.top}%;" title="${escapeMapAttr(title)}">
                <span class="map-node-icon">🏁</span>
            </div>
        `);
    });

    nodesHTML.push(`
        <div class="map-node map-node--finish" style="left:${finishPt.left}%; top:${finishPt.top}%;" title="${escapeMapAttr(MAP_FINISH_LABEL)} - Finish">
            <span class="map-node-icon">🏆</span>
        </div>
    `);

    markersEl.innerHTML = nodesHTML.join('');
}

// --- MAP KEY MODAL - triggered by the 🗝️ button in the map's bottom-right
// corner controls. Reuses the shared modal-overlay/modal-box shell (see
// core/modal/modal.css) with its own themed list inside. Closes on: the
// key button again (toggle), the ✕ button, clicking the dark overlay
// outside the box, or Escape. ---
let mapKeyKeydownHandler = null;

function closeKeyModal() {
    const overlay = document.querySelector('.map-key-overlay');
    if (overlay) overlay.remove();
    if (mapKeyKeydownHandler) {
        document.removeEventListener('keydown', mapKeyKeydownHandler);
        mapKeyKeydownHandler = null;
    }
}

function openKeyModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay map-key-overlay';
    overlay.innerHTML = `
        <div class="modal-box map-key-modal">
            <div class="modal-header">
                <span class="modal-title">🗝️ Map Key</span>
                <button class="modal-close map-key-close-btn" aria-label="Close">✕</button>
            </div>
            <div class="modal-body">
                <ul class="map-key-list">
                    <li><span class="map-key-swatch map-key-swatch--start">📍</span> Start</li>
                    <li><span class="map-key-swatch map-key-swatch--completed">🏁</span> Reached Milestone</li>
                    <li><span class="map-key-swatch map-key-swatch--active">🏁</span> Next Milestone</li>
                    <li><span class="map-key-swatch map-key-swatch--pending">🏁</span> Locked</li>
                    <li><span class="map-key-swatch map-key-swatch--city">🏁</span> City <span class="map-key-note">(major milestone)</span></li>
                    <li><span class="map-key-swatch map-key-swatch--finish">🏆</span> Finish</li>
                </ul>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeKeyModal();
    });
    overlay.querySelector('.map-key-close-btn').addEventListener('click', closeKeyModal);

    mapKeyKeydownHandler = (e) => {
        if (e.key === 'Escape') closeKeyModal();
    };
    document.addEventListener('keydown', mapKeyKeydownHandler);
}

function toggleKeyModal() {
    if (document.querySelector('.map-key-overlay')) {
        closeKeyModal();
    } else {
        openKeyModal();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    HiveMind.setActions(baseHiveMindActions());

    document.getElementById('map-key-btn').addEventListener('click', toggleKeyModal);

    // The <object> loads its linked SVG picture asynchronously and
    // separately from the rest of the page - renderMap() can't run until
    // that inner document actually exists (it reads the road path out of
    // it). If it's already loaded by the time we get here (cached/fast),
    // contentDocument is available immediately; otherwise wait for the
    // object's own load event.
    const pictureObj = document.getElementById('map-picture');
    const tryRender = () => {
        const doc = pictureObj.contentDocument;
        if (doc && doc.getElementById('map-road-path')) {
            renderMap(doc);
        }
    };

    if (pictureObj.contentDocument && pictureObj.contentDocument.getElementById('map-road-path')) {
        tryRender();
    } else {
        pictureObj.addEventListener('load', tryRender);
    }
});
