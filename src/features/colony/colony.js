console.log("/// HIVE MIND (COLONY) PROTOCOLS INITIALIZED ///");

// Weighted gacha table for the Pollination Chamber placeholder. All bees are
// the same emoji for now (no art yet to differentiate them) - rarity comes
// through in the name/color instead. Test mechanic only: no cost, no gating.
const BEE_RARITIES = [
    { rarity: 'Common', weight: 60, color: '#aaaaaa' },
    { rarity: 'Rare', weight: 25, color: '#4aa3ff' },
    { rarity: 'Epic', weight: 12, color: '#b06bff' },
    { rarity: 'Legendary', weight: 3, color: 'var(--gold-start)' }
];

function rollBeeRarity() {
    const totalWeight = BEE_RARITIES.reduce((sum, r) => sum + r.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of BEE_RARITIES) {
        if (roll < entry.weight) return entry;
        roll -= entry.weight;
    }
    return BEE_RARITIES[0];
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

// Ambient worker-bee count for the swarm visuals - not stored anywhere
// (same "live, not a ledger" philosophy as DP/level), just a display figure
// derived from real progress. Capped so the scene doesn't get overcrowded.
function computePopulation() {
    const user = Vault.getUser();
    const completedQuests = Vault.getQuests().filter(q => q.status === 'completed').length;
    return Math.min(24, user.level + completedQuests);
}

function renderSwarm(containerId, count) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = Array.from({ length: count }).map(() => {
        const top = Math.round(Math.random() * 80);
        const left = Math.round(Math.random() * 90);
        const duration = (4 + Math.random() * 4).toFixed(1);
        const delay = (Math.random() * 4).toFixed(1);
        return `<span class="colony-swarm-bee" style="top:${top}%; left:${left}%; animation-duration:${duration}s; animation-delay:${delay}s;">🐝</span>`;
    }).join('');
}

function renderHoneycombGrid() {
    const grid = document.getElementById('colony-honeycomb-grid');
    if (!grid) return;

    grid.innerHTML = Array.from({ length: 18 }).map(() => `<div class="colony-comb-cell"></div>`).join('');
}

function renderBeeCollection() {
    const list = document.getElementById('colony-bee-collection');
    const bees = Vault.getColonyBees();

    if (bees.length === 0) {
        list.innerHTML = `<p class="colony-empty-state">No bees pulled yet - try the Pollination Chamber above.</p>`;
        return;
    }

    list.innerHTML = bees.slice().reverse().map(bee => {
        const rarityInfo = BEE_RARITIES.find(r => r.rarity === bee.rarity) || BEE_RARITIES[0];
        return `<div class="colony-bee-chip" style="border-color: ${rarityInfo.color};">
            🐝 <span style="color: ${rarityInfo.color};">${bee.name}</span>
        </div>`;
    }).join('');
}

function pollinateForNewBee() {
    const resultEl = document.getElementById('colony-gacha-result');
    const btn = document.getElementById('colony-pollinate-btn');
    btn.disabled = true;

    let ticks = 0;
    const spin = setInterval(() => {
        resultEl.textContent = '🐝'.repeat(1 + (ticks % 3));
        ticks += 1;

        if (ticks > 10) {
            clearInterval(spin);
            btn.disabled = false;

            const rarityInfo = rollBeeRarity();
            const bee = {
                id: `bee-${Date.now()}`,
                name: `${rarityInfo.rarity} Bee #${Vault.getColonyBees().length + 1}`,
                rarity: rarityInfo.rarity,
                obtainedAt: new Date().toISOString()
            };
            Vault.addColonyBee(bee);

            resultEl.innerHTML = `🐝 <span style="color:${rarityInfo.color};">${bee.name}</span> joined the colony!`;
            Toast.show(`🐝 ${bee.name} joined the colony!`, 'positive');
            renderBeeCollection();
        }
    }, 120);
}

function renderExterior() {
    const user = Vault.getUser();
    const nest = document.getElementById('colony-nest');
    nest.className = `colony-nest colony-nest--tier-${nestTier(user.level)}`;

    renderSwarm('colony-exterior-swarm', computePopulation());
}

function renderInterior() {
    renderHoneycombGrid();
    renderSwarm('colony-interior-swarm', computePopulation());
    renderBeeCollection();

    const queenEl = document.getElementById('colony-queen');
    if (!queenEl.dataset.rendered) {
        NanoBee.render(queenEl, 'mini');
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

    document.getElementById('colony-pollinate-btn').addEventListener('click', pollinateForNewBee);

    HiveMind.setActions(baseHiveMindActions());
});
