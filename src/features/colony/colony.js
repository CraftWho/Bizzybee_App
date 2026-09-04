console.log("/// HIVE MIND (COLONY) PROTOCOLS INITIALIZED ///");

// BEE_RARITIES/BEE_CLASSES live in db.js (Vault awards bees from
// level-ups and task completion too, which happens from Home/Quests/
// Dailies, not just here) - this file just re-uses those same globals so
// a bee's color/animation is identical wherever it's rendered. Pulling new
// bees, renaming, assigning work, and unwrapping gacha tickets all live on
// their own page now - see src/features/gacha/ - this page is purely the
// nest/hive visualization (exterior nest, interior honeycomb + Queen +
// swarm).

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

function swarmBees() {
    return Vault.getColonyBees().slice(-SWARM_DISPLAY_CAP);
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

// Assigns bee #index (of `total`) a resting cell in a roughly-square grid
// over the scene, with a little random jitter so it doesn't look
// mechanically gridded. Pure uniform-random placement let names collide
// constantly once there were 10+ bees in a small area - this guarantees
// every bee gets its own patch of space first.
function swarmGridPosition(index, total) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(total)));
    const rows = Math.max(1, Math.ceil(total / columns));
    const col = index % columns;
    const row = Math.floor(index / columns);

    const cellWidth = 90 / columns;
    const cellHeight = 78 / rows;

    const jitterX = (Math.random() - 0.5) * cellWidth * 0.5;
    const jitterY = (Math.random() - 0.5) * cellHeight * 0.5;

    return {
        left: Math.max(0, Math.min(92, col * cellWidth + cellWidth / 2 + jitterX)),
        top: Math.max(0, Math.min(85, row * cellHeight + cellHeight / 2 + jitterY))
    };
}

function renderSwarm(containerId, bees) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Icon containers rendered empty first, then NanoBee.render() fills
    // each one right after. Name sits above the icon (DOM order
    // top-to-bottom in a flex column) and travels with it since both live
    // inside the same wandering .colony-swarm-bee wrapper. A bee's class
    // (if assigned on the Pollination Chamber page) adds a modifier class
    // that swaps its wander animation - see colony.css's colony-patrol
    // (Guardian)/colony-forage (Collector) keyframes.
    container.innerHTML = bees.map((bee, i) => {
        const { top, left } = swarmGridPosition(i, bees.length);
        const duration = (4 + Math.random() * 4).toFixed(1);
        const delay = (Math.random() * 4).toFixed(1);
        const classModifier = bee.class ? ` colony-swarm-bee--${bee.class}` : '';
        return `
            <span class="colony-swarm-bee${classModifier}" data-swarm-slot="${i}" style="top:${top}%; left:${left}%; animation-duration:${duration}s; animation-delay:${delay}s;">
                <span class="colony-swarm-bee-name" style="color:${beeColor(bee.rarity)};">${bee.name}</span>
                <span class="colony-swarm-bee-icon"></span>
            </span>
        `;
    }).join('');

    bees.forEach((bee, i) => {
        const wrapper = container.querySelector(`[data-swarm-slot="${i}"]`);
        const iconEl = wrapper ? wrapper.querySelector('.colony-swarm-bee-icon') : null;
        if (iconEl) NanoBee.render(iconEl, 'swarm', { color: beeColor(bee.rarity), hideCore: true, noFlight: true });
    });
}

function renderHoneycombGrid() {
    const grid = document.getElementById('colony-honeycomb-grid');
    if (!grid) return;

    grid.innerHTML = Array.from({ length: 18 }).map(() => `<div class="colony-comb-cell"></div>`).join('');
}

function renderExterior() {
    const user = Vault.getUser();
    const nest = document.getElementById('colony-nest');
    nest.className = `colony-nest colony-nest--tier-${nestTier(user.level)}`;

    renderSwarm('colony-exterior-swarm', exteriorSwarmBees());
}

function renderInterior() {
    renderHoneycombGrid();
    renderSwarm('colony-interior-swarm', interiorSwarmBees());

    const queenEl = document.getElementById('colony-queen');
    if (!queenEl.dataset.rendered) {
        // 'queen' (not 'mini') + hideCore: true - just the Queen and her
        // flight path, sized to actually stand out next to the swarm now
        // that there's no glowing hex backdrop filling out the visual.
        NanoBee.render(queenEl, 'queen', { hideCore: true });
        queenEl.dataset.rendered = 'true';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    renderExterior();

    document.getElementById('enter-hive-btn').addEventListener('click', () => {
        const scene = document.getElementById('colony-nest-scene');
        scene.classList.add('is-entering');

        setTimeout(() => {
            document.getElementById('colony-exterior').style.display = 'none';
            document.getElementById('colony-interior').style.display = '';
            renderInterior();
        }, 900);
    });

    document.getElementById('leave-hive-btn').addEventListener('click', () => {
        document.getElementById('colony-interior').style.display = 'none';
        document.getElementById('colony-exterior').style.display = '';
        document.getElementById('colony-nest-scene').classList.remove('is-entering');
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
