console.log("/// HIVE MIND PROTOCOLS INITIALIZED ///");

// BEE_RARITIES/BEE_CLASSES live in db.js (Vault awards bees from
// level-ups and task completion too, which happens from Home/Quests/
// Dailies, not just here) - this file just re-uses those same globals so
// a bee's color/animation is identical wherever it's rendered. Pulling new
// bees, renaming, assigning work, and unwrapping gacha tickets all live on
// their own page now - see src/features/gacha/ - this page is purely the
// nest/hive visualization (exterior mech hive - hive-mind-hive.js - plus
// the interior honeycomb, Queen and crawling bees - hive-mind-interior.js).

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

// The swarm IS the hive's actual bee collection - each floating bee is a
// real, individually earned bee (starter/gacha/levelup/ticket), colored by
// its own rarity, not an abstract population count. Capped to the most
// recently earned bees so a long-lived hive doesn't overcrowd the scene;
// the full collection (uncapped) still lists out on the Pollination
// Chamber page regardless of this cap.
const SWARM_DISPLAY_CAP = 24;

// The player's King/Queen (from the egg) is the hive's royal, not a worker:
// it never flies in the swarm or gets a brood cell.
function hiveMindWorkerBees() {
    return Vault.getHiveBees().filter(b => b.rarity !== 'Royal');
}

function escapeHiveMindText(t) {
    return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function hiveMindRoyal() {
    const bee = typeof Vault.getRoyalBee === 'function' ? Vault.getRoyalBee() : null;
    return bee ? { kind: bee.royal === 'king' ? 'king' : 'queen', name: bee.name || '' } : null;
}

function swarmBees() {
    // Oct 31 2026 (Craft, from 1.0.6): eggs never fly or crawl (tapping a "bee" opened an egg).
    return hiveMindWorkerBees().filter(b => !(typeof beeIsBrood === 'function' && beeIsBrood(b))).slice(-SWARM_DISPLAY_CAP);
}

// Exterior and interior are two disjoint HALVES of the same list, not the
// same bees shown twice - a hive of 15 shows some subset outside and the
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
const HIVE_MIND_LABEL_COLORS = { Common: '#d4d4d4', Rare: '#7fc0ff', Epic: '#c99bff', Legendary: '#ffd700', Named: '#ff6a5a' };

let hiveMindHiveScene = null;
let hiveMindHiveEntrance = null;

// Outside view: the mech hive (hive-mind-hive.js) sized by level tier, with
// the exterior half of your real bees orbiting it (names shown, stripes in
// their element colour), worker bees pacing the landing deck, and random
// foragers leaving / coming back through the entrance. All bee movement is
// MechBeeScene (src/core/ui/mech-bee/mech-bee.js).
function renderExterior() {
    const user = Vault.getUser();
    const tier = nestTier(user.level);
    const stage = document.getElementById('hive-mind-hive-stage');
    if (!stage) return;

    if (hiveMindHiveScene) hiveMindHiveScene.destroy();

    const hive = HiveMindHive.build(tier);
    stage.innerHTML = hive.svg;
    hiveMindHiveEntrance = hive.entrance;
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
    hiveMindFitHive();
    hiveMindHiveScene = new MechBeeScene(svg, {
        front: svg.querySelector('.ch-fly-front'),
        back: svg.querySelector('.ch-fly-back')
    });

    const bandTop = hive.top + 40;
    const bandHeight = Math.max(40, hive.bottom - hive.top - 40);
    // Hive Life: only Foragers and Scouts are outside; everyone else is
    // inside at their job. Classic: half of your bees fly outside.
    const outsideBees = hiveMindHiveView() === 'life' && typeof HiveLife !== 'undefined'
        ? hiveMindWorkerBees().filter(b => HiveLife.zoneOf(b) === 'outside').slice(0, 8)
        : exteriorSwarmBees();
    const faceActors = [];
    outsideBees.forEach(bee => {
        const actor = hiveMindHiveScene.orbit({
            cx: hive.cx,
            y: bandTop + Math.random() * bandHeight,
            rx: hive.maxA * (1.45 + Math.random() * 0.7),
            ry: 16 + Math.random() * 26,
            speed: (0.5 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1),
            bee: { scale: 0.6 + Math.random() * 0.25, stripe: MechBee.stripeFor(bee.element) },
            label: bee.name,
            labelColor: HIVE_MIND_LABEL_COLORS[bee.rarity] || '#d4d4d4',
            onClick: () => openHiveBeeCard(bee)
        });
        faceActors.push({ bee, actor });
    });
    hiveMindExteriorFaces(faceActors);
    renderHiveMindStats();

    hive.deckSpots.forEach((spot, i) => {
        hiveMindHiveScene.walk({ x: spot.x, y: spot.y, range: 16, speed: 0.6 + i * 0.25, bee: { scale: 0.6, pollen: i === 1 } });
    });

    hiveMindHiveScene.autoForage({ entrance: hive.entrance, bee: { scale: 0.7 } });
    hiveMindHiveScene.start();
    // Friends' hives in the distance (Oct 29 2026).
    if (typeof HiveMindFriends !== 'undefined') HiveMindFriends.refresh();
}

// v2 header stats: level, bees, and how many need help (Hive Life moods).
function renderHiveMindStats() {
    const host = document.getElementById('cm-stats');
    if (!host) return;
    const bees = hiveMindWorkerBees();
    const eggs = bees.filter(b => typeof beeIsBrood === 'function' && beeIsBrood(b)).length;
    const help = typeof beeFeeling === 'function' ? bees.filter(b => ['sad', 'upset', 'fainted'].includes(beeFeeling(b).key)).length : 0;
    const user = Vault.getUser() || {};
    host.innerHTML = `<span><b>⭐ ${user.level || 1}</b><small>Level</small></span>
        <span><b>🐝 ${bees.length - eggs}</b><small>${eggs ? `+${eggs} egg${eggs === 1 ? '' : 's'}` : 'Bees'}</small></span>
        <a href="../hive-bees/hive-bees.html?show=help" class="${help ? 'is-warn' : ''}"><b>${help ? '😢' : '😊'} ${help}</b><small>Need help</small></a>`;
}

// Hive Life faces over the bees flying outside (😊 / 😢 / 😠).
let hiveMindFaceTimer = null;
function hiveMindExteriorFaces(list) {
    clearInterval(hiveMindFaceTimer);
    if (!list.length || typeof HiveLife === 'undefined' || hiveMindHiveView() !== 'life') return;
    const pop = () => {
        if (document.hidden || !document.body.classList.contains('hive-mind-outside')) return;
        list.forEach(({ bee, actor }, i) => {
            const f = beeFeeling(bee);
            if (!HiveLife.wantsFace(f) || !actor.el || !actor.el.wrap.isConnected) return;
            setTimeout(() => {
                const r = actor.el.wrap.getBoundingClientRect();
                if (r.width) HiveLife.popFace(document.body, f.face, r.left + r.width / 2, r.top - 6, true);
            }, i * 300);
        });
    };
    setTimeout(pop, 900);
    hiveMindFaceTimer = setInterval(pop, 7000);
}

// The hive art fills the whole page behind the title panel (hive-mind.css).
// The SVG box starts just under the panel and ends above the floating
// buttons, so the hive itself is never hidden; the sky/branch extend past
// the box (overflow visible) to fill the rest of the screen.
function hiveMindFitHive() {
    const stage = document.getElementById('hive-mind-hive-stage');
    const panel = document.querySelector('#hive-mind-exterior .page-header-panel');
    if (!stage || !panel) return;
    const top = Math.max(0, panel.getBoundingClientRect().bottom + 8);
    stage.style.setProperty('--hive-top', `${Math.round(top)}px`);
}

// Read-only BeeCard (bee-card.js) in an overlay - opened by tapping a bee.
function openHiveBeeCard(bee) {
    const overlay = document.getElementById('hive-mind-card-overlay');
    const host = document.getElementById('hive-mind-card-host');
    if (!overlay || !host || typeof BeeCard === 'undefined') return;
    // Eggs keep their card secret until they hatch (Oct 27 2026).
    if (typeof beeIsBrood === 'function' && beeIsBrood(bee)) { window.location.href = `../hive-bees/hive-bees.html?bee=${encodeURIComponent(bee.id)}`; return; }
    // BeeCard.render() keeps one flip listener per host (dataset guard), so
    // the same host is simply re-rendered for each bee.
    host.innerHTML = '';
    host.classList.remove('is-flipped');
    overlay.classList.remove('is-queen');
    BeeCard.render(host, bee, { editable: false });
    const lifeHost = document.getElementById('hive-mind-life-panel');
    if (lifeHost && typeof HiveLife !== 'undefined') HiveLife.renderPanel(lifeHost, bee, () => hiveMindRefreshLife());
    overlay.hidden = false;
}

// ---- Hive Life vs Classic (Oct 2026) ----------------------------------
const HIVE_MIND_VIEW_KEY = 'bizzybee_hive_view';
let hiveMindLifeView = null;
function hiveMindHiveView() {
    try { return localStorage.getItem(HIVE_MIND_VIEW_KEY) === 'classic' ? 'classic' : 'life'; } catch { return 'life'; }
}
function hiveMindRefreshLife() {
    if (hiveMindHiveView() !== 'life' || typeof HiveLife === 'undefined') return;
    HiveLife.renderNews(document.getElementById('hl-news-host'), () => renderHiveLife());
}
function renderHiveLife() {
    if (hiveMindLifeView) hiveMindLifeView.destroy();
    hiveMindLifeView = HiveLife.mountComb(document.getElementById('hl-comb-host'), {
        bees: hiveMindWorkerBees(),
        onBeeClick: bee => openHiveBeeCard(bee),
        onChange: () => renderHiveLife()
    });
    hiveMindRefreshLife();
}
function hiveMindShowInside() {
    const life = hiveMindHiveView() === 'life' && typeof HiveLife !== 'undefined';
    document.body.classList.toggle('hive-life', life);
    document.getElementById('hive-mind-life').hidden = !life;
    document.querySelectorAll('[data-hive-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hiveView === (life ? 'life' : 'classic'))));
    if (life) {
        if (hiveMindInterior) { hiveMindInterior.destroy(); hiveMindInterior = null; }
        renderHiveLife();
    } else {
        if (hiveMindLifeView) { hiveMindLifeView.destroy(); hiveMindLifeView = null; }
        renderInterior();
    }
}

// ---------------------------------------------------------------------
// INSIDE THE HIVE (hive-mind-interior.js draws it; this decides what it shows)
//
// Honey = lit comb cells. Level only (Oct 2026): HIVE_MIND_HONEY_BASE cells,
//   plus HIVE_MIND_HONEY_PER_LEVEL per level (and the XP part-way into the
//   current level). Never fewer than one home cell per bee.
// Bees with a job (bee.class) crawl around. Bees without one sit still in
//   their open cell, waiting for a command - no animation.
// Decay = lapses in the last HIVE_MIND_DECAY_DAYS days hollow out lit cells:
//   - a Daily that was due on a past day and not checked off
//   - a To-Do that went past its due date and is still open
//   - a bad-habit (−) click
// Lapses older than the window drop off, so decayed cells heal on their own.
// ---------------------------------------------------------------------
const HIVE_MIND_HIVE_CAPACITY = 320;
const HIVE_MIND_HONEY_BASE = 8;
const HIVE_MIND_HONEY_PER_LEVEL = 3;
const HIVE_MIND_DECAY_DAYS = 14;
const HIVE_MIND_HATCHED_KEY = 'bizzybee_hive_hatched';
const HIVE_MIND_HATCH_MAX = 3;
const HIVE_MIND_MAX_CRAWLERS = 6;      // busy bees moving at once (keeps it smooth)
// Queen art folder, resolved from this script's own URL so any page that
// loads hive-mind.js (the app page, or a test harness elsewhere) finds it.
const HIVE_MIND_QUEEN_ASSETS = document.currentScript
    ? new URL('../../assets/bees/queen/', document.currentScript.src).href
    : '../../assets/bees/queen/';

let hiveMindInterior = null;

function hiveMindDayISO(daysAgo) {
    return shiftISODate(todayISO(), -daysAgo);
}

// Honey and decay now live in db.js (Vault.getHiveHoney) so Home's hive
// strip shows the same numbers as this page.
function hiveMindRecentLapses() {
    return Vault.getHiveHoney().lapseIds;
}

function hiveMindHoneyState() {
    return Vault.getHiveHoney();
}

// Which bees haven't hatched yet. First visit ever: only the newest bee
// hatches (so you see it once); everyone else counts as already hatched.
function hiveMindBeesToHatch(allBees) {
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem(HIVE_MIND_HATCHED_KEY) || 'null'); } catch (e) { seen = null; }
    const ids = allBees.map(b => b.id);
    let fresh;
    if (!Array.isArray(seen)) fresh = allBees.slice(-1);
    else fresh = allBees.filter(b => !seen.includes(b.id)).slice(-HIVE_MIND_HATCH_MAX);
    try { localStorage.setItem(HIVE_MIND_HATCHED_KEY, JSON.stringify(ids)); } catch (e) { /* storage off: just no memory */ }
    return fresh;
}

function hiveMindFitInterior() {
    const panel = document.querySelector('#hive-mind-interior .page-header-panel');
    const scene = document.getElementById('hive-mind-interior-scene');
    if (!panel || !scene) return 0.55;
    const h = scene.clientHeight || window.innerHeight;
    const top = panel.getBoundingClientRect().bottom;
    const bottom = h - 190;                 // above the HUD + buttons
    return Math.min(0.7, Math.max(0.35, ((top + bottom) / 2) / h));
}

function renderHiveMindHud(state) {
    const hud = document.getElementById('hive-mind-hud');
    if (!hud) return;
    const pct = Math.round(state.lit / state.capacity * 100);
    hud.innerHTML = `
        <span class="hive-mind-hud-chip hive-mind-hud-chip--honey" title="Lit honey cells">🍯 <b>${state.lit - state.decay}</b> cells<span class="hive-mind-hud-extra"> · ${pct}%</span></span>
        <span class="hive-mind-hud-chip hive-mind-hud-chip--bees" title="Bees - busy ones crawl, idle ones wait in their cell">🐝 <b>${state.bees}</b><span class="hive-mind-hud-extra"> bees</span></span>
        <span class="hive-mind-hud-chip hive-mind-hud-chip--level" title="Level - each adds ${HIVE_MIND_HONEY_PER_LEVEL} cells">⭐ Lv <b>${state.level}</b></span>
        <span class="hive-mind-hud-chip hive-mind-hud-chip--decay${state.decay ? '' : ' is-zero'}" title="Missed dailies, overdue to-dos and bad habits in the last ${HIVE_MIND_DECAY_DAYS} days">🥀 <b>${state.decay}</b><span class="hive-mind-hud-extra"> decayed</span></span>`;
}

function openHiveMindQueenPanel(state, royal) {
    const overlay = document.getElementById('hive-mind-card-overlay');
    const host = document.getElementById('hive-mind-card-host');
    if (!overlay || !host) return;
    // Plain panel, not a card: drop the card + theme classes BeeCard added.
    host.className = 'hive-mind-card-host';
    const lifeHost = document.getElementById('hive-mind-life-panel');
    if (lifeHost) lifeHost.innerHTML = '';
    overlay.classList.add('is-queen');
    host.innerHTML = `<div class="hive-mind-queen-panel">
        <div class="hive-mind-queen-panel-crown">👑</div>
        <h2>${royal && royal.name ? escapeHiveMindText(royal.name) : 'Queen Bee'}</h2>
        <p class="hive-mind-queen-panel-sub">${royal ? (royal.kind === 'king' ? 'Your King' : 'Your Queen') + ' · heart of the hive' : 'Heart of the hive'}</p>
        <div class="hive-mind-queen-panel-stats">
            <div><b>${state.bees}</b><small>Bees</small></div>
            <div><b>${state.lit - state.decay}</b><small>Honey cells</small></div>
            <div class="is-crimson"><b>${state.decay}</b><small>Decayed</small></div>
        </div>
        <ul class="hive-mind-queen-panel-rules">
            <li><span class="is-gold">+${state.fromLevel}</span> from level ${state.level}</li>
            <li><span class="is-crimson">−${state.decay}</span> from ${state.lapses} lapse${state.lapses === 1 ? '' : 's'} (missed dailies, overdue to-dos, bad habits) in the last ${HIVE_MIND_DECAY_DAYS} days</li>
        </ul>
        <p class="hive-mind-queen-panel-note">Decayed cells heal after ${HIVE_MIND_DECAY_DAYS} days. Bees with no job wait in their cell.</p>
    </div>`;
    overlay.hidden = false;
}

function renderInterior() {
    const stage = document.getElementById('hive-mind-interior-stage');
    if (!stage || typeof HiveMindInterior === 'undefined') return;
    if (hiveMindInterior) hiveMindInterior.destroy();

    const state = hiveMindHoneyState();
    const allBees = hiveMindWorkerBees();
    // Busy bees (a job is set) crawl, up to HIVE_MIND_MAX_CRAWLERS.
    const inside = allBees.filter(b => b.class && !(typeof beeIsBrood === 'function' && beeIsBrood(b))).slice(-HIVE_MIND_MAX_CRAWLERS);
    const insideIds = new Set(inside.map(b => b.id));
    const royal = hiveMindRoyal();
    // Eggs (Hive Life) stay sealed and play the hatch animation once they hatch.
    const isEgg = b => typeof beeIsBrood === 'function' && beeIsBrood(b);
    const toHatch = hiveMindBeesToHatch(allBees.filter(b => !isEgg(b)));
    const hatchIds = new Set(toHatch.map(b => b.id));
    renderHiveMindHud(state);

    hiveMindInterior = HiveMindInterior.mount(stage, {
        honey: state,
        broodBees: allBees,
        // Bees about to hatch aren't crawling yet - they come out of their cell.
        crawlers: inside.filter(b => !hatchIds.has(b.id)),
        // Only bees with no job wait head-out in an open cell. Bees with a
        // job past the crawl cap (and eggs) show as sealed, glowing cells.
        idleBees: allBees.filter(b => !b.class && !isEgg(b) && !hatchIds.has(b.id)),
        lightY: hiveMindFitInterior(),
        assetBase: HIVE_MIND_QUEEN_ASSETS,
        royal,
        onBeeClick: bee => openHiveBeeCard(bee),
        onQueenClick: () => openHiveMindQueenPanel(state, royal)
    });

    (async () => {
        await new Promise(r => setTimeout(r, 1500));     // let the light spread first
        for (const bee of toHatch) {
            if (!hiveMindInterior || !hiveMindInterior.hasBrood(bee)) continue;
            if (typeof Toast !== 'undefined') Toast.show(`🐣 ${bee.name} hatched!`, 'positive');
            await hiveMindInterior.hatch(bee, { joinCrawl: insideIds.has(bee.id) });   // idle bees settle back in
            await new Promise(r => setTimeout(r, 500));
        }
    })();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    document.body.classList.add('hive-mind-outside');
    renderExterior();
    window.addEventListener('resize', hiveMindFitHive);

    const cardOverlay = document.getElementById('hive-mind-card-overlay');
    if (cardOverlay) {
        cardOverlay.addEventListener('click', (e) => {
            if (!e.target.closest('.bee-card, .hive-mind-queen-panel, .hl-panel')) {
                cardOverlay.hidden = true;
                if (hiveMindHiveView() === 'life' && document.body.classList.contains('hive-mind-inside')) renderHiveLife();
            }
        });
    }

    document.getElementById('enter-hive-btn').addEventListener('click', () => {
        const scene = document.getElementById('hive-mind-nest-scene');
        // Full-screen zoom: the scene jumps above the header and the
        // floating buttons for the length of the animation.
        const svgEl = document.querySelector('#hive-mind-hive-stage .hive-mind-hive-svg');
        if (svgEl && hiveMindHiveEntrance) {
            const pt = svgEl.createSVGPoint();
            pt.x = hiveMindHiveEntrance.x; pt.y = hiveMindHiveEntrance.y;
            const screen = pt.matrixTransform(svgEl.getScreenCTM());
            const box = svgEl.getBoundingClientRect();
            svgEl.style.transformOrigin = `${screen.x - box.left}px ${screen.y - box.top}px`;
        }
        document.body.classList.add('hive-mind-is-entering');
        scene.classList.add('is-entering');

        // Zoom into the entrance (hive-mind.css), then swap to the inside view
        // and pause the outside bees while they're off-screen.
        setTimeout(() => {
            if (hiveMindHiveScene) hiveMindHiveScene.stop();
            document.body.classList.remove('hive-mind-is-entering');
            document.body.classList.remove('hive-mind-outside');
            document.getElementById('hive-mind-exterior').style.display = 'none';
            document.getElementById('hive-mind-interior').style.display = '';
            document.body.classList.add('hive-mind-inside');
            hiveMindShowInside();
        }, 1150);
    });

    document.getElementById('leave-hive-btn').addEventListener('click', () => {
        if (hiveMindInterior) { hiveMindInterior.destroy(); hiveMindInterior = null; }
        if (hiveMindLifeView) { hiveMindLifeView.destroy(); hiveMindLifeView = null; }
        if (typeof HiveLife !== 'undefined') HiveLife.closeRoom();
        document.body.classList.remove('hive-mind-inside', 'hive-life');
        document.getElementById('hive-mind-interior').style.display = 'none';
        document.getElementById('hive-mind-exterior').style.display = '';
        document.getElementById('hive-mind-nest-scene').classList.remove('is-entering');
        document.body.classList.add('hive-mind-outside');
        renderExterior();
    });

    document.querySelectorAll('[data-hive-view]').forEach(btn => btn.addEventListener('click', () => {
        try { localStorage.setItem(HIVE_MIND_VIEW_KEY, btn.dataset.hiveView); } catch { /* storage off */ }
        hiveMindShowInside();
    }));

    // Hive Bees has its own page (Oct 2026).
    document.getElementById('hive-bees-quick-btn').addEventListener('click', () => {
        window.location.href = '../hive-bees/hive-bees.html';
    });

    Waggle.setActions(baseWaggleActions());
});
