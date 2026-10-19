console.log("/// BEE CARD MODULE ONLINE ///");

// Single source of truth for rendering a bee as a trading card. v2 design
// (Oct 2026): dark mech/brass card - rarity tag + name + element hex on one
// line, a forest art window with the bee picture (gold parts tinted by
// element), a BeeDex plate, abilities from the bee's job and traits, a
// weakness/job/obtained bar, flavor text and a collector line. Tap or click
// flips the card to the BizzyBee badge on the back. Art files live in
// src/assets/bees/. Used by both the Pollination Chamber's bee collection (editable
// - rename/assign work) and the Inventory roster modal (read-only view) -
// one component so a bee looks identical everywhere, same reasoning as
// BEE_RARITIES/BEE_CLASSES living in db.js as shared globals instead of
// being duplicated per page.
//
// Depends on BEE_RARITIES / BEE_CLASSES (db.js) already being loaded on the
// page - no module system here, just globals. (NanoBee is no longer used by
// this card, but KeeperDexCard and the Inventory tiles still use it.)

// Rarity accent colour for card-related glows (Inventory tiles etc.).
// Matches the v2 card themes in bee-card.css - Named is a deep metallic
// red here, not db.js's pink. Falls back to BEE_RARITIES for anything new.
const BEE_CARD_ACCENTS = { Common: '#aaaaaa', Rare: '#4aa3ff', Epic: '#b06bff', Legendary: '#ffd700', Named: '#d42a1e', Royal: '#ffd700' };

function beeCardColor(rarity) {
    if (BEE_CARD_ACCENTS[rarity]) return BEE_CARD_ACCENTS[rarity];
    const info = BEE_RARITIES.find(r => r.rarity === rarity);
    return info ? info.color : BEE_RARITIES[0].color;
}

function formatBeeObtainedDate(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Which of the four "skill" stats (hp/level deliberately excluded - those
// track power level, not personality) a bee leans into hardest. Ties
// resolve toward whichever key comes first below (offense wins).
function dominantStatKey(stats) {
    const keys = ['offense', 'defense', 'speed', 'power'];
    const safeStats = stats || {};
    return keys.reduce((best, key) => ((safeStats[key] || 0) > (safeStats[best] || 0) ? key : best), keys[0]);
}

// The card's BeeDex "species" line and flavor text both come from this -
// a bee-themed archetype picked from its traits (assigned work first,
// then element, then whichever stat it leans into hardest), same spirit
// as a Named Beast's generated "<Noun> The <Title>" name but applied to
// every bee, not just those. Checked top to bottom, first match wins, so
// order IS priority - an assigned job says more about a bee's card
// presence than its element does, which says more than a raw stat lean.
const BEE_ARCHETYPES = [
    // The founder (Royal rarity) - the Queen or King hatched from the egg gift.
    {
        title: 'King',
        match: (bee) => bee.rarity === 'Royal' && bee.royal === 'king',
        description: 'The heart of a new hive, hatched from a gift. Every bee to come answers to him.'
    },
    {
        title: 'Queen',
        match: (bee) => bee.rarity === 'Royal',
        description: 'The heart of a new hive, hatched from a gift. Every bee to come answers to her.'
    },
    {
        title: 'Guardian',
        match: (bee) => bee.class === 'guardian',
        description: 'A steadfast defender - built to hold the line and never budge.'
    },
    {
        title: 'Collector',
        match: (bee) => bee.class === 'collector',
        description: 'Sharp-eyed and quick to spot what everyone else walks right past.'
    },
    {
        title: 'Barrier',
        match: (bee) => bee.class === 'barrier',
        description: 'Holds a fixed post at the entrance - a wall of stingers, built to block, not to chase.'
    },
    {
        title: 'Architect',
        match: (bee) => bee.class === 'architect',
        description: 'Raises new honeycomb cells, expanding the hive one hex at a time.'
    },
    {
        title: 'Nurse',
        match: (bee) => bee.class === 'nurse',
        description: "Tends the brood chamber, keeping every egg warm and fed."
    },
    {
        title: 'Pyron',
        match: (bee) => bee.element === 'fire',
        description: "A bee pyromaniac, helplessly drawn to heat and sparks it really shouldn't touch."
    },
    {
        title: 'Dewzzer',
        match: (bee) => bee.element === 'water',
        description: 'Never far from morning dew - calm, cool, and quick to slip away.'
    },
    {
        title: 'Loambuzz',
        match: (bee) => bee.element === 'earth',
        description: 'Thick-shelled and grounded, most at home nose-deep in soil.'
    },
    {
        title: 'Gustwing',
        match: (bee) => bee.element === 'wind',
        description: 'Rides every gust like it was born mid-flight, never quite landing.'
    },
    {
        title: 'Champ',
        match: (bee) => dominantStatKey(bee.stats) === 'offense',
        description: 'All muscle and menace - built to fight, not to hide.'
    },
    {
        title: 'Hermit',
        match: (bee) => dominantStatKey(bee.stats) === 'speed',
        description: 'A cunning loner, gone before a fight even starts.'
    },
    {
        title: 'Thornguard',
        match: (bee) => dominantStatKey(bee.stats) === 'defense',
        description: "Armored and unshaken - the kind of bee that just doesn't flinch."
    },
    {
        // Falls through to here on a 'power' lean (or no stats at all) -
        // always matches, so it's the guaranteed last resort.
        title: 'Waxling',
        match: () => true,
        description: 'A steady worker of the colony, still finding its place in the hive.'
    }
];

function beeArchetype(bee) {
    return BEE_ARCHETYPES.find(a => a.match(bee)) || BEE_ARCHETYPES[BEE_ARCHETYPES.length - 1];
}

// --- v2 card helpers -------------------------------------------------------

// Card art lives in src/assets/bees/. Resolved against THIS script's own URL
// (captured while it loads) so it works from any page depth, Netlify or a
// local file:// copy alike.
const BEE_CARD_ASSETS = (() => {
    try {
        const src = document.currentScript && document.currentScript.src;
        return new URL('../../assets/bees/', src || window.location.href).href;
    } catch (e) {
        return '../../assets/bees/';
    }
})();

const BEE_CARD_RARITY_KEYS = ['common', 'rare', 'epic', 'legendary', 'named', 'royal'];
const BEE_CARD_RARITY_SYMBOLS = { common: '●', rare: '◆', epic: '◆◆', legendary: '★', named: '✦', royal: '♛' };

// Ability shown on the card for each job (the "attack" slot on a real
// trading card). Text comes from BEE_CLASSES' own description, minus the
// "No material yield yet." developer note.
const BEE_CARD_ABILITY_NAMES = {
    collector: 'Forage',
    scout: 'Waggle Dance',
    guardian: 'Guard',
    barrier: 'Seal with Propolis',
    undertaker: 'Carry Out',
    architect: 'Build Comb',
    cleaner: 'Scrub',
    honeymaker: 'Ripen Nectar',
    watercarrier: 'Fan & Cool',
    nurse: 'Tend',
    attendant: 'Groom the Queen',
    drone: 'Mate'
};

function beeCardAbility(classKey, classInfo) {
    const text = (classInfo.description || '').replace(/\s*No material yield yet\.?/i, '').trim();
    return { name: BEE_CARD_ABILITY_NAMES[classKey] || classInfo.label, text };
}

// Twinkling gold sparkles for Legendary cards (random positions each render).
function beeCardSparkles(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        const size = (2.5 + Math.random() * 4).toFixed(1);
        const dur = (1.6 + Math.random() * 2.2).toFixed(2);
        const delay = (-Math.random() * 4).toFixed(2);
        html += `<i class="bc-spk" style="left:${(4 + Math.random() * 92).toFixed(1)}%;top:${(4 + Math.random() * 92).toFixed(1)}%;--s:${size}cqw;--d:${dur}s;--dl:${delay}s"></i>`;
    }
    return `<div class="bc-sparkles">${html}</div>`;
}

// Forest art-window background: layered tree silhouettes, fog and light
// rays, coloured entirely by the rarity's CSS variables (--sky1/--f1/...).
// Drawn once with a fixed seed (same trees on every card), then cloned per
// card with unique gradient ids so each card's colours resolve correctly.
const BEE_CARD_FOREST_TEMPLATE = (() => {
    let seed = 4;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const W = 300, H = 200, n = v => v.toFixed(1);
    const canopy = (cx, cy, r) => {
        const pts = [];
        for (let i = 0; i < 7; i++) {
            const t = 2 * Math.PI * i / 7, rr = r * (0.75 + rand() * 0.35);
            pts.push([cx + rr * Math.cos(t), cy + rr * 0.8 * Math.sin(t)]);
        }
        let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
        for (let i = 0; i < 7; i++) { const p = pts[(i + 1) % 7]; d += `A${n(r * 0.5)} ${n(r * 0.45)} 0 0 1 ${n(p[0])} ${n(p[1])}`; }
        return d + 'Z';
    };
    const layer = (count, trunkW, topY, r) => {
        let trunks = '', leaves = '';
        const xs = Array.from({ length: count }, () => -20 + rand() * (W + 40)).sort((a, b) => a - b);
        xs.forEach(x => {
            const w = trunkW * (0.7 + rand() * 0.6), top = topY * (0.6 + rand() * 0.6);
            trunks += `M${n(x - w / 2)} ${H}L${n(x - w * 0.32)} ${n(top)}L${n(x + w * 0.32)} ${n(top)}L${n(x + w / 2)} ${H}Z`;
            for (let k = 0; k < 3; k++) leaves += canopy(x + (rand() * 2 - 1) * r * 0.7, top + (rand() * 0.9 - 0.6) * r, r * (0.7 + rand() * 0.4));
        });
        return `<path d="${trunks}"/><path d="${leaves}"/>`;
    };
    let ferns = '';
    for (let i = 0; i < 26; i++) {
        const x = -10 + rand() * (W + 20), y = H + 4, h = 26 * (0.6 + rand() * 0.6);
        for (let k = 0; k < 5; k++) {
            const a = (-150 + k * 30 + (rand() * 16 - 8)) * Math.PI / 180, L = h * (0.7 + rand() * 0.3);
            ferns += `M${n(x)} ${n(y)}Q${n(x + Math.cos(a) * L * 0.7)} ${n(y + Math.sin(a) * L * 1.1)} ${n(x + Math.cos(a) * L * 1.4)} ${n(y + Math.sin(a) * L)}`;
        }
    }
    const rays = [[60, 14], [110, 8], [150, 20], [205, 10]]
        .map(([x, w]) => `<path d="M${x} -10L${x + w} -10L${x + w + 70} ${H}L${x + 40} ${H}Z"/>`).join('');
    return `<svg class="bc-forest" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="bcfsky@" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset=".6" style="stop-color:var(--sky2)"/><stop offset="1" style="stop-color:var(--f3)"/></linearGradient>
<radialGradient id="bcfsun@" cx="60%" cy="18%" r="55%"><stop offset="0" style="stop-color:var(--light)" stop-opacity=".9"/><stop offset="1" style="stop-color:var(--light)" stop-opacity="0"/></radialGradient>
<linearGradient id="bcffog@" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--fog)" stop-opacity="0"/><stop offset="1" style="stop-color:var(--fog)" stop-opacity=".75"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bcfsky@)"/><rect class="bc-sun" width="${W}" height="${H}" fill="url(#bcfsun@)"/>
<g style="fill:var(--f1)">${layer(16, 5, 40, 14)}</g>
<rect y="${H * 0.35}" width="${W}" height="${H * 0.65}" fill="url(#bcffog@)"/>
<g class="bc-rays" style="fill:var(--light)">${rays}</g>
<g style="fill:var(--f2)">${layer(10, 9, 20, 20)}</g>
<rect y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="url(#bcffog@)" opacity=".6"/>
<g style="fill:var(--f3)">${layer(5, 18, -10, 30)}</g>
<path d="${ferns}" style="fill:none;stroke:var(--f3);stroke-width:4;stroke-linecap:round"/>
</svg>`;
})();

let beeCardForestId = 0;
function beeCardForest() {
    return BEE_CARD_FOREST_TEMPLATE.replace(/@/g, `-${beeCardForestId++}`);
}

// The gold-tint mask image, shared by every card on the page.
document.documentElement.style.setProperty('--bc-gold-mask', `url("${BEE_CARD_ASSETS}card-bee-gold-mask.webp")`);

// Puts the v2 theme classes on a card root (BeeCard, KeeperDexCard or an
// Inventory cover tile): .bc-v2 + .bc-r-<rarity> + .bc-e-<element>. Old
// theme classes are removed first, since containers get re-rendered.
// Returns the rarity key actually used.
function beeCardApplyTheme(el, rarity, elementKey) {
    const key = (rarity || 'common').toLowerCase();
    const rarityKey = BEE_CARD_RARITY_KEYS.includes(key) ? key : 'common';
    [...el.classList].filter(c => /^bc-[re]-/.test(c)).forEach(c => el.classList.remove(c));
    el.classList.add('bc-v2', `bc-r-${rarityKey}`, `bc-e-${elementKey || 'none'}`);
    return rarityKey;
}

// Inside of the art window: forest, frame rivets, aura, bee picture with
// its gold-tint layer, foil sweep, Legendary sparkles and the job badge.
// options.silhouette: show the bee as a dark shape (KeeperDex "???").
// options.rivets: how many frame rivets (default 3).
// The founder's own art (Queen or King, crown on) instead of the worker bee.
function beeCardRoyalHTML(kind) {
    const L = kind === 'king'
        ? [['bc-rl', 'king/king-body.webp'], ['bc-rl', 'king/king-wings.webp']]
        : [['bc-rl', 'queen/queen-wing-back.webp'], ['bc-rl', 'queen/queen-body.webp'], ['bc-rl', 'queen/queen-wing-front.webp']];
    return `<div class="bc-royal">${L.map(([c, f]) => `<img class="${c}" src="${BEE_CARD_ASSETS}${f}" alt="" draggable="false">`).join('')}</div>`;
}

function beeCardArtHTML({ rarityKey = 'common', classInfo = null, silhouette = false, rivets = 3, royal = null } = {}) {
    const rivetHTML = ['bc-tl', 'bc-tr', 'bc-bl'].slice(0, rivets).map(c => `<i class="bc-rv ${c}"></i>`).join('');
    const bee = royal
        ? `<div class="bc-beewrap bc-beewrap--royal${silhouette ? ' bc-silhouette' : ''}">${beeCardRoyalHTML(royal)}</div>`
        : `<div class="bc-beewrap${silhouette ? ' bc-silhouette' : ''}"><img src="${BEE_CARD_ASSETS}card-bee.webp" alt="" draggable="false">${silhouette ? '' : '<div class="bc-tint"></div>'}</div>`;
    return `${beeCardForest()}${rivetHTML}
        <div class="bc-aura"></div>
        ${bee}
        <div class="bc-foil"></div>
        ${(rarityKey === 'legendary' || rarityKey === 'royal') && !silhouette ? beeCardSparkles(14) : ''}
        ${classInfo ? `<span class="bc-cls" title="${classInfo.label}">${classInfo.icon}</span>` : ''}`;
}

const BeeCard = {
    // container: an empty element to render into (its innerHTML is fully
    // owned/replaced by this call - safe to re-call on the same container
    // to refresh it, e.g. after a rename).
    // options.editable: shows the rename button + class-assign dropdown
    // and wires them up (Gacha page). Omit/false for a read-only view
    // (Inventory roster).
    // options.onChange: called after a rename or class change, in case the
    // caller has other UI that depends on it (e.g. a roster count).
    render(container, bee, options = {}) {
        if (!container || !bee) return;
        const { editable = false, onChange } = options;

        const weight = typeof bee.weight === 'number' ? bee.weight.toFixed(1) : '?';
        const dexNo = String(typeof bee.dexNumber === 'number' ? bee.dexNumber : 1).padStart(3, '0');
        const themeKey = (bee.rarity || 'common').toLowerCase();
        const classInfo = bee.class && typeof BEE_CLASSES !== 'undefined' && BEE_CLASSES[bee.class]
            ? BEE_CLASSES[bee.class]
            : null;
        const elementInfo = bee.element && typeof BEE_ELEMENTS !== 'undefined' && BEE_ELEMENTS[bee.element]
            ? BEE_ELEMENTS[bee.element]
            : null;
        const weakElementKey = bee.element && typeof BEE_ELEMENT_WEAKNESS !== 'undefined' ? BEE_ELEMENT_WEAKNESS[bee.element] : null;
        const weakElementInfo = weakElementKey && typeof BEE_ELEMENTS !== 'undefined' ? BEE_ELEMENTS[weakElementKey] : null;
        const archetype = beeArchetype(bee);
        const traits = (bee.traits || []).map(key => (typeof BEE_TRAITS !== 'undefined' ? BEE_TRAITS[key] : null)).filter(Boolean);

        // Evolve/apply-item actions are only offered in editable mode, and
        // only when the bee is actually eligible AND you own the item - see
        // evolveBee/applyTraitItem/applyStoreItem/evolveToNamed in db.js
        // for the rules these mirror. Two separate trait-item pools feed
        // the same select+apply control: legacy drop-only items (Epic+
        // only, applied via Vault.applyTraitItem) and Honey Store items
        // (any non-Named rarity, applied via Vault.applyStoreItem) - each
        // option remembers its own pool via a data-kind attribute so the
        // click handler knows which Vault method to call.
        const items = editable && typeof Vault !== 'undefined' ? Vault.getItems() : {};
        const ownedEvoStones = items['evo-stone'] || 0;
        const ownedRebirthStones = items['rebirth-stone'] || 0;
        const legacyTraitItemIds = ['drill-hands', 'nanite-bolt'].filter(id => (items[id] || 0) > 0);
        const storeTraitItemIds = typeof STORE_ITEM_CATALOG !== 'undefined'
            ? STORE_ITEM_CATALOG.filter(i => i.kind === 'trait' && (items[i.id] || 0) > 0).map(i => i.id)
            : [];
        // Both stones (see evolveBee in db.js) work on any bee that isn't
        // already Legendary (nothing to gain) or Named (RARITY_ORDER
        // index -1, tops out beyond either stone's reach).
        const canEvolveRarity = typeof RARITY_ORDER !== 'undefined'
            && RARITY_ORDER.indexOf(bee.rarity) !== -1 && bee.rarity !== 'Legendary';
        const showEvolveAction = editable && canEvolveRarity && ownedEvoStones > 0;
        const showRebirthAction = editable && canEvolveRarity && ownedRebirthStones > 0;
        const showLegacyTraitAction = editable && ['Epic', 'Legendary', 'Named'].includes(bee.rarity) && legacyTraitItemIds.length > 0;
        const showStoreTraitAction = editable && bee.rarity !== 'Named' && bee.rarity !== 'Royal' && storeTraitItemIds.length > 0;
        const showTraitAction = showLegacyTraitAction || showStoreTraitAction;
        const ownedIdentityCards = items['identity-card'] || 0;
        const showIdentityAction = editable && bee.rarity !== 'Named' && bee.rarity !== 'Royal' && !bee.customNamed && ownedIdentityCards > 0;

        // v2 design (see the BEE CARD v2 block at the bottom of bee-card.css).
        // Theme classes are stripped and re-added on every render, since the
        // same container is re-rendered after a rename/class change/evolve.
        const rarityKey = beeCardApplyTheme(container, bee.rarity, elementInfo ? bee.element : null);
        container.classList.add('bee-card');

        const isLegendary = rarityKey === 'legendary' || rarityKey === 'royal';
        const rivets = '<i class="bc-rv bc-tl"></i><i class="bc-rv bc-tr"></i><i class="bc-rv bc-bl"></i><i class="bc-rv bc-br"></i>';
        const ability = classInfo ? beeCardAbility(bee.class, classInfo) : null;
        const abilitiesHTML = (ability
            ? `<div class="bc-ab"><span class="bc-ic">${classInfo.icon}</span><h4>${ability.name} <small>Ability</small></h4><p>${ability.text}</p></div>`
            : `<div class="bc-ab bc-locked"><span class="bc-ic">🔒</span><h4>No ability <small>Ability</small></h4><p>Assign this bee a job to unlock its ability.</p></div>`)
            + traits.map(trait => `<div class="bc-ab" title="${trait.description}"><span class="bc-ic">${trait.icon}</span><h4>${trait.label} <small>Trait</small></h4><p>${trait.description}</p></div>`).join('');

        container.innerHTML = `
            <div class="bee-card-inner">
                <div class="bee-card-face bee-card-front${(showEvolveAction || showRebirthAction || showTraitAction || showIdentityAction) ? ' bc-has-actions' : ''}">
                    <i class="bc-hexbg"></i><i class="bc-trim"></i>${rivets}
                    ${isLegendary ? beeCardSparkles(8) : ''}

                    <div class="bc-top">
                        <span class="bc-rpill">${bee.rarity.toUpperCase()}</span>
                        <span class="bee-card-name${bee.name.length > 12 ? ' bc-long' : ''}" title="${bee.name}">${bee.name}</span>
                        ${editable ? `<button class="bee-card-rename-btn" title="Rename this bee">✏️</button>` : ''}
                        ${elementInfo ? `<span class="bc-elhex" title="${elementInfo.label}"><span>${elementInfo.emoji}</span></span>` : ''}
                    </div>

                    <div class="bc-art">${beeCardArtHTML({ rarityKey, classInfo, royal: bee.royal || null })}</div>

                    <div class="bc-dex">
                        <span><b>No.${dexNo}</b></span>
                        <span class="bc-dex-species">${archetype.title}</span>
                        <span>WT ${weight}g</span>
                    </div>

                    <div class="bc-abil${traits.length >= 2 ? ' bc-many' : ''}">${abilitiesHTML}</div>

                    ${showEvolveAction ? `
                    <div class="bee-card-item-action">
                        <button class="bee-card-evolve-btn">💠 Evolve +1 Tier (${ownedEvoStones})</button>
                    </div>` : ''}

                    ${showRebirthAction ? `
                    <div class="bee-card-item-action">
                        <button class="bee-card-rebirth-btn">🌟 Rebirth to Legendary (${ownedRebirthStones})</button>
                    </div>` : ''}

                    ${showTraitAction ? `
                    <div class="bee-card-item-action">
                        <select class="bee-card-trait-item-select">
                            ${showLegacyTraitAction ? legacyTraitItemIds.map(id => {
                                const item = typeof EVOLUTION_ITEM_CATALOG !== 'undefined' ? EVOLUTION_ITEM_CATALOG.find(i => i.id === id) : null;
                                const label = item ? `${item.icon} ${item.label}` : id;
                                return `<option value="${id}" data-kind="legacy">${label} (${items[id]})</option>`;
                            }).join('') : ''}
                            ${showStoreTraitAction ? storeTraitItemIds.map(id => {
                                const item = typeof STORE_ITEM_CATALOG !== 'undefined' ? STORE_ITEM_CATALOG.find(i => i.id === id) : null;
                                const label = item ? `${item.icon} ${item.label}` : id;
                                return `<option value="${id}" data-kind="store">${label} (${items[id]})</option>`;
                            }).join('') : ''}
                        </select>
                        <button class="bee-card-apply-trait-btn">🔧 Apply</button>
                    </div>` : ''}

                    ${showIdentityAction ? `
                    <div class="bee-card-item-action">
                        <button class="bee-card-identity-btn">🪪 Make Named Beast (${ownedIdentityCards})</button>
                    </div>` : ''}

                    <div class="bc-bar">
                        <div><small>Weakness</small><span>${weakElementInfo ? `<em title="${weakElementInfo.label}">${weakElementInfo.emoji}</em> ×2` : '—'}</span></div>
                        <div><small>Job</small>${editable
                            ? BeeCard._classSelectHTML(bee)
                            : `<span>${classInfo ? classInfo.label : 'Unassigned'}</span>`}</div>
                        <div><small>Obtained</small><span>${formatBeeObtainedDate(bee.obtainedAt)}</span></div>
                    </div>

                    <p class="bee-card-flavor">${archetype.description}</p>
                    <div class="bc-coll"><span>No.${dexNo} · BizzyBee Base Set</span><b title="${bee.rarity}">${BEE_CARD_RARITY_SYMBOLS[rarityKey]}</b></div>
                </div>

                <div class="bee-card-face bee-card-back">
                    <i class="bc-hexbg"></i><i class="bc-trim"></i>${rivets}
                    <div class="bc-back-inner">
                        <img class="bc-logo" src="${BEE_CARD_ASSETS}bizzybee-badge.webp" alt="BizzyBee" draggable="false">
                        <span class="bee-card-flip-hint">↻ tap to flip back</span>
                    </div>
                </div>
            </div>
        `;

        // The flip-toggle listener is attached to the CONTAINER itself,
        // which persists across re-renders (only its innerHTML gets
        // replaced above) - guard so repeated render() calls (rename,
        // class change) don't stack up duplicate listeners that would
        // toggle the flip state back and forth on a single tap.
        if (!container.dataset.beeCardBound) {
            container.dataset.beeCardBound = 'true';
            container.addEventListener('click', (event) => {
                if (event.target.closest(
                    '.bee-card-rename-btn, .bee-card-class-select, .bee-card-evolve-btn, .bee-card-rebirth-btn, .bee-card-apply-trait-btn, .bee-card-trait-item-select, .bee-card-identity-btn'
                )) return;
                container.classList.toggle('is-flipped');
            });
        }

        if (!editable) return;

        const renameBtn = container.querySelector('.bee-card-rename-btn');
        if (renameBtn) {
            renameBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const next = prompt('Rename this bee:', bee.name);
                if (next === null) return; // cancelled
                const renamed = Vault.renameBee(bee.id, next);
                if (renamed) {
                    BeeCard.render(container, renamed, options);
                    if (onChange) onChange();
                }
            });
        }

        const classSelect = container.querySelector('.bee-card-class-select');
        if (classSelect) {
            classSelect.addEventListener('change', () => {
                const updated = Vault.assignBeeClass(bee.id, classSelect.value || null);
                if (updated) {
                    BeeCard.render(container, updated, options);
                    if (onChange) onChange();
                }
            });
        }

        const evolveBtn = container.querySelector('.bee-card-evolve-btn');
        if (evolveBtn) {
            evolveBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const result = Vault.evolveBee(bee.id, 'evo-stone');
                if (!result) return;

                // Guaranteed - the rarity is in finding the stone, not in
                // this working (see evolveBee in db.js).
                if (typeof Toast !== 'undefined') {
                    Toast.show(`💠 ${result.bee.name} evolved up to ${result.newRarity}!`, 'positive');
                }

                BeeCard.render(container, result.bee, options);
                if (onChange) onChange();
            });
        }

        const rebirthBtn = container.querySelector('.bee-card-rebirth-btn');
        if (rebirthBtn) {
            rebirthBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const result = Vault.evolveBee(bee.id, 'rebirth-stone');
                if (!result) return;

                // Guaranteed - same pattern as the evo-stone above, just a
                // much rarer item that jumps straight to Legendary instead
                // of one tier at a time.
                if (typeof Toast !== 'undefined') {
                    Toast.show(`🌟 ${result.bee.name} was reborn as a Legendary!`, 'positive');
                }

                BeeCard.render(container, result.bee, options);
                if (onChange) onChange();
            });
        }

        const applyTraitBtn = container.querySelector('.bee-card-apply-trait-btn');
        if (applyTraitBtn) {
            applyTraitBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const select = container.querySelector('.bee-card-trait-item-select');
                const itemId = select ? select.value : null;
                if (!itemId) return;
                const selectedOption = select.options[select.selectedIndex];
                const kind = selectedOption ? selectedOption.dataset.kind : 'legacy';

                // Legacy drop items (Epic+ only) go through applyTraitItem;
                // Honey Store items (any non-Named rarity, also roll a
                // chance to jump straight to Epic) go through
                // applyStoreItem - see db.js for how the two differ.
                const result = kind === 'store'
                    ? Vault.applyStoreItem(bee.id, itemId)
                    : Vault.applyTraitItem(bee.id, itemId);
                if (!result) return;

                if (typeof Toast !== 'undefined') {
                    const traitInfo = result.traitKey && typeof BEE_TRAITS !== 'undefined' ? BEE_TRAITS[result.traitKey] : null;
                    const messages = [];
                    if (result.evolved) messages.push(`💠 evolved to Epic`);
                    messages.push(result.succeeded
                        ? `gained the ${traitInfo ? traitInfo.label : 'trait'}`
                        : `no trait this time`);
                    Toast.show(`🔧 ${result.bee.name}: ${messages.join(' + ')}!`, (result.succeeded || result.evolved) ? 'positive' : 'negative');
                }

                BeeCard.render(container, result.bee, options);
                if (onChange) onChange();
            });
        }

        const identityBtn = container.querySelector('.bee-card-identity-btn');
        if (identityBtn) {
            identityBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const result = Vault.evolveToNamed(bee.id, 'identity-card');
                if (!result) return;

                // Guaranteed - the risk lives in acquiring the card, not in
                // this working (same pattern as the evo-stone above).
                if (typeof Toast !== 'undefined') {
                    Toast.show(`🪪 ${bee.name} became a Named Beast: ${result.bee.name}!`, 'positive');
                }

                BeeCard.render(container, result.bee, options);
                if (onChange) onChange();
            });
        }
    },

    // Grouped by category (Gathering/Defense/Hive Management - see
    // BEE_CLASSES in db.js) now that there are enough classes for flat
    // options to get hard to scan.
    _classSelectHTML(bee) {
        const groups = {};
        Object.entries(BEE_CLASSES).forEach(([key, info]) => {
            // Hive Life: Drones are male, every other job is female.
            if (bee.sex && !!info.maleOnly !== (bee.sex === 'm') && bee.class !== key) return;
            const category = info.category || 'Other';
            if (!groups[category]) groups[category] = [];
            groups[category].push(`<option value="${key}"${bee.class === key ? ' selected' : ''}>${info.icon} ${info.label}</option>`);
        });

        const groupsHTML = Object.entries(groups)
            .map(([category, options]) => `<optgroup label="${category}">${options.join('')}</optgroup>`)
            .join('');

        const sexLabel = bee.sex === 'm' ? '♂ Male' : bee.sex === 'f' ? '♀ Female' : '';
        return `<select class="bee-card-class-select" title="Assign work${sexLabel ? ' · ' + sexLabel : ''}"><option value="">Unassigned${sexLabel ? ' · ' + sexLabel : ''}</option>${groupsHTML}</select>`;
    }
};
