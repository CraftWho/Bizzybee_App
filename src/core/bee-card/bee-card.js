console.log("/// BEE CARD MODULE ONLINE ///");

// Single source of truth for rendering a bee as a trading card - styled
// after a real Pokemon/Yu-Gi-Oh card: name + type badge up top, a
// rectangular "photo" frame with a themed background per rarity, a
// BeeDex info strip (No./species/weight - the bee-flavored answer to a
// Pokedex strip) underneath, then work/obtained info and a short flavor
// line. Tap or click flips the whole card (Pokemon-card-style 3D rotate)
// to a back face showing its rolled combat stats (see rollBeeStats in
// db.js). Used by both the Pollination Chamber's bee collection (editable
// - rename/assign work) and the Inventory roster modal (read-only view) -
// one component so a bee looks identical everywhere, same reasoning as
// BEE_RARITIES/BEE_CLASSES living in db.js as shared globals instead of
// being duplicated per page.
//
// Depends on BEE_RARITIES / BEE_CLASSES (db.js) and NanoBee (nano-bee.js)
// already being loaded on the page - no module system here, just globals.

function beeCardColor(rarity) {
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

        const color = beeCardColor(bee.rarity);
        const stats = bee.stats || { level: 1, hp: 0, offense: 0, defense: 0, speed: 0, power: 0 };
        const weight = typeof bee.weight === 'number' ? bee.weight.toFixed(1) : '?';
        const dexNo = String(bee.dexNumber || 1).padStart(3, '0');
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
        const showStoreTraitAction = editable && bee.rarity !== 'Named' && storeTraitItemIds.length > 0;
        const showTraitAction = showLegacyTraitAction || showStoreTraitAction;
        const ownedIdentityCards = items['identity-card'] || 0;
        const showIdentityAction = editable && bee.rarity !== 'Named' && !bee.customNamed && ownedIdentityCards > 0;

        container.classList.add('bee-card');
        container.innerHTML = `
            <div class="bee-card-inner">
                <div class="bee-card-face bee-card-front" style="border-color:${color}; box-shadow: 0 0 18px ${color}88;">
                    <div class="bee-card-top-row">
                        <span class="bee-card-name" title="${bee.name}">${bee.name}</span>
                        ${editable ? `<button class="bee-card-rename-btn" title="Rename this bee">✏️</button>` : ''}
                        <span class="bee-card-type-badge" style="background:${color};" title="${bee.rarity}">${bee.rarity.charAt(0)}</span>
                    </div>

                    <div class="bee-card-art-frame bee-card-art-frame--${themeKey}">
                        ${elementInfo ? `<span class="bee-card-element-hex" title="${elementInfo.label}">${elementInfo.emoji}</span>` : ''}
                        <span class="bee-card-icon"></span>
                        ${classInfo ? `<span class="bee-card-class-badge" title="${classInfo.label}">${classInfo.icon}</span>` : ''}
                    </div>

                    <div class="bee-card-dex-strip">
                        <span class="bee-card-dex-no">No. ${dexNo}</span>
                        <span class="bee-card-dex-species">${archetype.title}</span>
                        <span class="bee-card-dex-wt">WT ${weight}g</span>
                    </div>

                    ${weakElementInfo ? `
                    <div class="bee-card-weakness-row">
                        <span class="bee-card-weakness-label">Weakness</span>
                        <span class="bee-card-weakness-hex" title="${weakElementInfo.label}">${weakElementInfo.emoji}</span>
                        <span class="bee-card-weakness-mult">×2</span>
                    </div>` : ''}

                    ${traits.length > 0 ? `
                    <div class="bee-card-traits-row">
                        ${traits.map(trait => `<span class="bee-card-trait-badge" title="${trait.description}">${trait.icon} ${trait.label}</span>`).join('')}
                    </div>` : ''}

                    <div class="bee-card-footer">
                        ${editable
                            ? BeeCard._classSelectHTML(bee)
                            : (classInfo
                                ? `<span class="bee-card-role">${classInfo.icon} ${classInfo.label}</span>`
                                : `<span class="bee-card-role bee-card-role--none">Unassigned</span>`)}
                        <span class="bee-card-obtained">Obtained ${formatBeeObtainedDate(bee.obtainedAt)}</span>
                    </div>

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

                    <p class="bee-card-flavor">${archetype.description}</p>
                    <span class="bee-card-flip-hint">↻ tap for stats</span>
                </div>
                <div class="bee-card-face bee-card-back" style="border-color:${color};">
                    <h4 class="bee-card-back-title" style="color:${color};">⚔️ STATS</h4>
                    <ul class="bee-card-stat-list">
                        <li><span>Level</span><strong>${stats.level}</strong></li>
                        <li><span>❤️ HP</span><strong>${stats.hp}</strong></li>
                        <li><span>⚔️ Offense</span><strong>${stats.offense}</strong></li>
                        <li><span>🛡️ Defense</span><strong>${stats.defense}</strong></li>
                        <li><span>💨 Speed</span><strong>${stats.speed}</strong></li>
                        <li><span>💥 Power</span><strong>${stats.power}</strong></li>
                    </ul>
                    <span class="bee-card-flip-hint">↻ tap to flip back</span>
                </div>
            </div>
        `;

        const iconEl = container.querySelector('.bee-card-icon');
        if (iconEl) NanoBee.render(iconEl, 'card', { color, hideCore: true, noFlight: true });

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
            const category = info.category || 'Other';
            if (!groups[category]) groups[category] = [];
            groups[category].push(`<option value="${key}"${bee.class === key ? ' selected' : ''}>${info.icon} ${info.label}</option>`);
        });

        const groupsHTML = Object.entries(groups)
            .map(([category, options]) => `<optgroup label="${category}">${options.join('')}</optgroup>`)
            .join('');

        return `<select class="bee-card-class-select" title="Assign work"><option value="">Unassigned</option>${groupsHTML}</select>`;
    }
};
