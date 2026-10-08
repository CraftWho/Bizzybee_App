console.log("/// HIVE MIND (COLONY) PROTOCOLS INITIALIZED ///");

// BEE_RARITIES/BEE_CLASSES live in db.js (Vault awards bees from
// level-ups and task completion too, which happens from Home/Quests/
// Dailies, not just here) - this file just re-uses those same globals so
// a bee's color/animation is identical wherever it's rendered. Pulling new
// bees, renaming, assigning work, and unwrapping gacha tickets all live on
// their own page now - see src/features/gacha/ - this page is purely the
// nest/hive visualization (exterior mech hive - colony-hive.js - plus
// the interior honeycomb, Queen and crawling bees - colony-interior.js).

// Looks up a bee's rarity color, with a safe fallback for anything
// unexpected (e.g. hand-edited localStorage) rather than rendering blank.
function beeColor(rarity) {
    const info = BEE_RARITIES.find(r => r.rarity === rarity);
    return info ? info.color : BEE_RARITIES[0].color;
}

// Nest size grows in tiers with level rather than continuously - simpler to
// theme with a handful of CSS classes than a smooth scale formula.
function nestTier(level) {
    if (level >= 35) return 5;
    if (level >= 20) return 4;
    if (level >= 10) return 3;
    if (level >= 5) return 2;
    return 1;
}

// The swarm IS the colony's actual bee collection - each floating bee is a
// real, individually earned bee (starter/gacha/levelup/ticket), colored by
// its own rarity, not an abstract population count. Capped to the most
// recently earned bees so a long-lived colony doesn't overcrowd the scene;
// the full collection (uncapped) still lists out on the Pollination
// Chamber page regardless of this cap.
const SWARM_DISPLAY_CAP = 24;

// The player's King/Queen (from the egg) is the hive's royal, not a worker:
// it never flies in the swarm or gets a brood cell.
function colonyWorkerBees() {
    return Vault.getColonyBees().filter(b => b.rarity !== 'Royal');
}

function escapeColonyText(t) {
    return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function colonyRoyal() {
    const bee = typeof Vault.getRoyalBee === 'function' ? Vault.getRoyalBee() : null;
    return bee ? { kind: bee.royal === 'king' ? 'king' : 'queen', name: bee.name || '' } : null;
}

function swarmBees() {
    return colonyWorkerBees().slice(-SWARM_DISPLAY_CAP);
}

// Exterior and interior are two disjoint HALVES of the same list, not the
// same bees shown twice - a colony of 15 shows some subset outside and the
// rest inside, 15 total between the two views, never 15 in each. The split
// is by index parity (not random) so it's stable across re-renders: a
// given bee doesn't jump between outside/inside every time you look.
function exteriorSwarmBees() {
    return swarmBees().filter((_, i) => i % 2 === 0);
}

function interiorSwarmBees() {
    return swarmBees().filter((_, i) => i % 2 !== 0);
}

// Label colours for bee names around the hive - same accents as the v2
// cards (Named is the deep crimson there, not db.js's pink; Common is a
// lighter grey so it stays readable on the dusk sky).
const COLONY_LABEL_COLORS = { Common: '#d4d4d4', Rare: '#7fc0ff', Epic: '#c99bff', Legendary: '#ffd700', Named: '#ff6a5a' };

let colonyHiveScene = null;
let colonyHiveEntrance = null;

// Outside view: the mech hive (colony-hive.js) sized by level tier, with
// the exterior half of your real bees orbiting it (names shown, stripes in
// their element colour), worker bees pacing the landing deck, and random
// foragers leaving / coming back through the entrance. All bee movement is
// MechBeeScene (src/core/mech-bee/mech-bee.js).
function renderExterior() {
    const user = Vault.getUser();
    const tier = nestTier(user.level);
    const stage = document.getElementById('colony-hive-stage');
    if (!stage) return;

    if (colonyHiveScene) colonyHiveScene.destroy();

    const hive = ColonyHive.build(tier);
    stage.innerHTML = hive.svg;
    colonyHiveEntrance = hive.entrance;
    stage.dataset.tier = String(tier);

    const svg = stage.querySelector('svg');
    // Frame the hive itself, not the full tier-5 canvas: a small hive gets
    // a tight crop, so it shows up big and detailed. Top = the branch,
    // bottom = the finial, sides = room for the orbiting bees. The sky and
    // branch still run past the crop to fill the page (overflow visible).
    const cropTop = 30;
    const cropBottom = hive.bottom + 42;
    const cropHalf = Math.max(hive.maxA * 2.2, (cropBottom - cropTop) * 0.4);
    svg.setAttribute('viewBox', `${hive.cx - cropHalf} ${cropTop} ${cropHalf * 2} ${cropBottom - cropTop}`);
    colonyFitHive();
    colonyHiveScene = new MechBeeScene(svg, {
        front: svg.querySelector('.ch-fly-front'),
        back: svg.querySelector('.ch-fly-back')
    });

    const bandTop = hive.top + 40;
    const bandHeight = Math.max(40, hive.bottom - hive.top - 40);
    exteriorSwarmBees().forEach(bee => {
        colonyHiveScene.orbit({
            cx: hive.cx,
            y: bandTop + Math.random() * bandHeight,
            rx: hive.maxA * (1.45 + Math.random() * 0.7),
            ry: 16 + Math.random() * 26,
            speed: (0.5 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1),
            bee: { scale: 0.6 + Math.random() * 0.25, stripe: MechBee.stripeFor(bee.element) },
            label: bee.name,
            labelColor: COLONY_LABEL_COLORS[bee.rarity] || '#d4d4d4',
            onClick: () => openColonyBeeCard(bee)
        });
    });

    hive.deckSpots.forEach((spot, i) => {
        colonyHiveScene.walk({ x: spot.x, y: spot.y, range: 16, speed: 0.6 + i * 0.25, bee: { scale: 0.6, pollen: i === 1 } });
    });

    colonyHiveScene.autoForage({ entrance: hive.entrance, bee: { scale: 0.7 } });
    colonyHiveScene.start();
}

// The hive art fills the whole page behind the title panel (colony.css).
// The SVG box starts just under the panel and ends above the floating
// buttons, so the hive itself is never hidden; the sky/branch extend past
// the box (overflow visible) to fill the rest of the screen.
function colonyFitHive() {
    const stage = document.getElementById('colony-hive-stage');
    const panel = document.querySelector('#colony-exterior .page-header-panel');
    if (!stage || !panel) return;
    const top = Math.max(0, panel.getBoundingClientRect().bottom + 8);
    stage.style.setProperty('--hive-top', `${Math.round(top)}px`);
}

// Read-only BeeCard (bee-card.js) in an overlay - opened by tapping a bee.
function openColonyBeeCard(bee) {
    const overlay = document.getElementById('colony-card-overlay');
    const host = document.getElementById('colony-card-host');
    if (!overlay || !host || typeof BeeCard === 'undefined') return;
    // BeeCard.render() keeps one flip listener per host (dataset guard), so
    // the same host is simply re-rendered for each bee.
    host.innerHTML = '';
    host.classList.remove('is-flipped');
    overlay.classList.remove('is-queen');
    BeeCard.render(host, bee, { editable: false });
    overlay.hidden = false;
}

// ---------------------------------------------------------------------
// INSIDE THE HIVE (colony-interior.js draws it; this decides what it shows)
//
// Honey = lit comb cells. Earned from:
//   - cards: every bee you own adds COLONY_HONEY_PER_BEE cells
//   - level: every level adds COLONY_HONEY_PER_LEVEL cells (plus the XP
//     part-way into the current level)
// Decay = lapses in the last COLONY_DECAY_DAYS days hollow out lit cells:
//   - a Daily that was due on a past day and not checked off
//   - a To-Do that went past its due date and is still open
//   - a bad-habit (−) click
// Lapses older than the window drop off, so decayed cells heal on their own.
// ---------------------------------------------------------------------
const COLONY_HIVE_CAPACITY = 320;
const COLONY_HONEY_BASE = 6;
const COLONY_HONEY_PER_BEE = 4;
const COLONY_HONEY_PER_LEVEL = 3;
const COLONY_DECAY_DAYS = 14;
const COLONY_HATCHED_KEY = 'bizzybee_colony_hatched';
const COLONY_HATCH_MAX = 3;
// Queen art folder, resolved from this script's own URL so any page that
// loads colony.js (the app page, or a test harness elsewhere) finds it.
const COLONY_QUEEN_ASSETS = document.currentScript
    ? new URL('../../assets/bees/queen/', document.currentScript.src).href
    : '../../assets/bees/queen/';

let colonyInterior = null;

function colonyDayISO(daysAgo) {
    return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

// Honey and decay now live in db.js (Vault.getHiveHoney) so Home's hive
// strip shows the same numbers as this page.
function colonyRecentLapses() {
    return Vault.getHiveHoney().lapseIds;
}

function colonyHoneyState() {
    return Vault.getHiveHoney();
}

// Which bees haven't hatched yet. First visit ever: only the newest bee
// hatches (so you see it once); everyone else counts as already hatched.
function colonyBeesToHatch(allBees) {
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem(COLONY_HATCHED_KEY) || 'null'); } catch (e) { seen = null; }
    const ids = allBees.map(b => b.id);
    let fresh;
    if (!Array.isArray(seen)) fresh = allBees.slice(-1);
    else fresh = allBees.filter(b => !seen.includes(b.id)).slice(-COLONY_HATCH_MAX);
    try { localStorage.setItem(COLONY_HATCHED_KEY, JSON.stringify(ids)); } catch (e) { /* storage off: just no memory */ }
    return fresh;
}

function colonyFitInterior() {
    const panel = document.querySelector('#colony-interior .page-header-panel');
    const scene = document.getElementById('colony-interior-scene');
    if (!panel || !scene) return 0.55;
    const h = scene.clientHeight || window.innerHeight;
    const top = panel.getBoundingClientRect().bottom;
    const bottom = h - 190;                 // above the HUD + buttons
    return Math.min(0.7, Math.max(0.35, ((top + bottom) / 2) / h));
}

function renderColonyHud(state) {
    const hud = document.getElementById('colony-hud');
    if (!hud) return;
    const pct = Math.round(state.lit / state.capacity * 100);
    hud.innerHTML = `
        <span class="colony-hud-chip colony-hud-chip--honey" title="Lit honey cells">🍯 <b>${state.lit - state.decay}</b> cells<span class="colony-hud-extra"> · ${pct}%</span></span>
        <span class="colony-hud-chip colony-hud-chip--bees" title="Bees (cards) - each adds ${COLONY_HONEY_PER_BEE} cells">🐝 <b>${state.bees}</b><span class="colony-hud-extra"> bees</span></span>
        <span class="colony-hud-chip colony-hud-chip--level" title="Level - each adds ${COLONY_HONEY_PER_LEVEL} cells">⭐ Lv <b>${state.level}</b></span>
        <span class="colony-hud-chip colony-hud-chip--decay${state.decay ? '' : ' is-zero'}" title="Missed dailies, overdue to-dos and bad habits in the last ${COLONY_DECAY_DAYS} days">🥀 <b>${state.decay}</b><span class="colony-hud-extra"> decayed</span></span>`;
}

function openColonyQueenPanel(state, royal) {
    const overlay = document.getElementById('colony-card-overlay');
    const host = document.getElementById('colony-card-host');
    if (!overlay || !host) return;
    // Plain panel, not a card: drop the card + theme classes BeeCard added.
    host.className = 'colony-card-host';
    overlay.classList.add('is-queen');
    host.innerHTML = `<div class="colony-queen-panel">
        <div class="colony-queen-panel-crown">👑</div>
        <h2>${royal && royal.name ? escapeColonyText(royal.name) : 'Queen Bee'}</h2>
        <p class="colony-queen-panel-sub">${royal ? (royal.kind === 'king' ? 'Your King' : 'Your Queen') + ' · heart of the colony' : 'Heart of the colony'}</p>
        <div class="colony-queen-panel-stats">
            <div><b>${state.bees}</b><small>Bees</small></div>
            <div><b>${state.lit - state.decay}</b><small>Honey cells</small></div>
            <div class="is-crimson"><b>${state.decay}</b><small>Decayed</small></div>
        </div>
        <ul class="colony-queen-panel-rules">
            <li><span class="is-gold">+${state.fromCards}</span> from your ${state.bees} bee cards</li>
            <li><span class="is-gold">+${state.fromLevel}</span> from level ${state.level}</li>
            <li><span class="is-crimson">−${state.decay}</span> from ${state.lapses} lapse${state.lapses === 1 ? '' : 's'} (missed dailies, overdue to-dos, bad habits) in the last ${COLONY_DECAY_DAYS} days</li>
        </ul>
        <p class="colony-queen-panel-note">Decayed cells heal after ${COLONY_DECAY_DAYS} days. New bees hatch from their cell.</p>
    </div>`;
    overlay.hidden = false;
}

function renderInterior() {
    const stage = document.getElementById('colony-interior-stage');
    if (!stage || typeof ColonyInterior === 'undefined') return;
    if (colonyInterior) colonyInterior.destroy();

    const state = colonyHoneyState();
    const allBees = colonyWorkerBees();
    const inside = interiorSwarmBees();
    const royal = colonyRoyal();
    const toHatch = colonyBeesToHatch(allBees);
    const hatchIds = new Set(toHatch.map(b => b.id));
    renderColonyHud(state);

    colonyInterior = ColonyInterior.mount(stage, {
        honey: state,
        broodBees: allBees,
        // Bees about to hatch aren't crawling yet - they come out of their cell.
        crawlers: inside.filter(b => !hatchIds.has(b.id)),
        lightY: colonyFitInterior(),
        assetBase: COLONY_QUEEN_ASSETS,
        royal,
        onBeeClick: bee => openColonyBeeCard(bee),
        onQueenClick: () => openColonyQueenPanel(state, royal)
    });

    const insideIds = new Set(inside.map(b => b.id));
    (async () => {
        await new Promise(r => setTimeout(r, 1500));     // let the light spread first
        for (const bee of toHatch) {
            if (!colonyInterior || !colonyInterior.hasBrood(bee)) continue;
            if (typeof Toast !== 'undefined') Toast.show(`🐣 ${bee.name} hatched!`, 'positive');
            await colonyInterior.hatch(bee, { joinCrawl: insideIds.has(bee.id) });
            await new Promise(r => setTimeout(r, 500));
        }
    })();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    document.body.classList.add('colony-outside');
    renderExterior();
    window.addEventListener('resize', colonyFitHive);

    const cardOverlay = document.getElementById('colony-card-overlay');
    if (cardOverlay) {
        cardOverlay.addEventListener('click', (e) => {
            if (!e.target.closest('.bee-card, .colony-queen-panel')) cardOverlay.hidden = true;
        });
    }

    document.getElementById('enter-hive-btn').addEventListener('click', () => {
        const scene = document.getElementById('colony-nest-scene');
        // Full-screen zoom: the scene jumps above the header and the
        // floating buttons for the length of the animation.
        const svgEl = document.querySelector('#colony-hive-stage .colony-hive-svg');
        if (svgEl && colonyHiveEntrance) {
            const pt = svgEl.createSVGPoint();
            pt.x = colonyHiveEntrance.x; pt.y = colonyHiveEntrance.y;
            const screen = pt.matrixTransform(svgEl.getScreenCTM());
            const box = svgEl.getBoundingClientRect();
            svgEl.style.transformOrigin = `${screen.x - box.left}px ${screen.y - box.top}px`;
        }
        document.body.classList.add('colony-is-entering');
        scene.classList.add('is-entering');

        // Zoom into the entrance (colony.css), then swap to the inside view
        // and pause the outside bees while they're off-screen.
        setTimeout(() => {
            if (colonyHiveScene) colonyHiveScene.stop();
            document.body.classList.remove('colony-is-entering');
            document.body.classList.remove('colony-outside');
            document.getElementById('colony-exterior').style.display = 'none';
            document.getElementById('colony-interior').style.display = '';
            document.body.classList.add('colony-inside');
            renderInterior();
        }, 1150);
    });

    document.getElementById('leave-hive-btn').addEventListener('click', () => {
        if (colonyInterior) { colonyInterior.destroy(); colonyInterior = null; }
        document.body.classList.remove('colony-inside');
        document.getElementById('colony-interior').style.display = 'none';
        document.getElementById('colony-exterior').style.display = '';
        document.getElementById('colony-nest-scene').classList.remove('is-entering');
        document.body.classList.add('colony-outside');
        renderExterior();
    });

    // Same quick-access shortcut as the "Colony Bees" Waggle FAB item
    // (llm-engine.js's baseWaggleActions()) - jumps straight to the bee
    // roster (openBeeRosterModal() on the Inventory page) via the
    // #colony-bees hash inventory.js's DOMContentLoaded handler watches
    // for, rather than making the user go Inventory -> scroll -> tap
    // "View & Manage Colony Bees" themselves.
    document.getElementById('colony-bees-quick-btn').addEventListener('click', () => {
        window.location.href = '../inventory/inventory.html#colony-bees';
    });

    Waggle.setActions(baseWaggleActions());
});
