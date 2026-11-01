console.log("/// KEEPERDEX CARD MODULE ONLINE ///");

// Single-face reference card for the KeeperDex (src/features/keeperdex/).
// Uses the same v2 card design as BeeCard (bee-card.css's .bc-v2 block and
// bee-card.js's beeCardApplyTheme / beeCardArtHTML helpers) so a dex entry
// and an owned bee always look like the same card family.
//
// Differences from BeeCard: one face (no flip - a dex entry isn't an
// individual bee), the move list shows the entry's flavor skills with
// their power, and an entry you haven't obtained yet renders as a locked
// "???" card with the bee as a dark silhouette.
//
// Depends on bee-card.css + bee-card.js (helpers above) and the
// KEEPERDEX_* / BEE_ELEMENTS / BEE_ELEMENT_WEAKNESS globals (db.js).
// Oct 31 2026 (Craft): the middle of a range, e.g. [1.4, 2.0] -> "1.7".
const kdMid = (r) => (r ? ((r[0] + r[1]) / 2).toFixed(1) : '—');
const KeeperDexCard = {
    // container: an empty element to render into. entry: one row from
    // KEEPERDEX_ENTRIES (db.js). options.obtained: real entry vs locked.
    render(container, entry, options = {}) {
        if (!container || !entry) return;
        // Oct 31 2026 (Craft, from 1.0.6): a card back too. flipped: start face-down.
        const { obtained = false, flipped = false, firstAt = null } = options;   // firstAt: when you first got this kind (Oct 31 2026)

        const elementInfo = BEE_ELEMENTS[entry.element];
        const weakInfo = BEE_ELEMENTS[BEE_ELEMENT_WEAKNESS[entry.element]];
        const dexNo = String(entry.dexNumber).padStart(3, '0');

        container.classList.add('keeperdex-card', 'bee-card');
        container.classList.toggle('is-flipped', !!flipped);
        container.classList.toggle('is-locked', !obtained);
        // Locked entries use the plain Common look (no glow, grey trim) so
        // they never give away the rarity before you've earned it.
        const rarityKey = beeCardApplyTheme(container, obtained ? entry.rarity : 'Common', obtained ? entry.element : null);
        const realRarityKey = (entry.rarity || 'common').toLowerCase();

        const movesHTML = obtained
            ? entry.skills.map(skill => `
                <div class="bc-ab bc-move">
                    <span class="bc-ic">${elementInfo.emoji}</span>
                    <span class="bc-mtx"><h4>${skill.name}</h4>${skill.text ? `<span class="bc-mdesc">${skill.text}</span>` : ''}</span>${/* Oct 31 2026 (Craft): short line under each skill */ ''}
                    <b class="bc-pow">${skill.power}</b>
                </div>`).join('')
            : `<div class="bc-ab bc-locked"><span class="bc-ic">🔒</span><h4>Unknown moves <small>Locked</small></h4><p>Obtain a matching bee to reveal this entry.</p></div>`;

        // Oct 31 2026 (Craft): a card you haven't found shows its back on
        // both sides, so flipping it reveals nothing.
        const backFace = (side) => `<div class="bee-card-face bee-card-${side}">
                <i class="bc-hexbg"></i><i class="bc-trim"></i>
                <i class="bc-rv bc-tl"></i><i class="bc-rv bc-tr"></i><i class="bc-rv bc-bl"></i><i class="bc-rv bc-br"></i>
                <div class="bc-back-inner"><img class="bc-logo" src="${BEE_CARD_ASSETS}bizzybee-badge.webp" alt="BizzyBee" draggable="false"></div>
            </div>`;
        if (!obtained) { container.innerHTML = `<div class="bee-card-inner">${backFace('front')}${backFace('back')}</div>`; return; }
        // Oct 31 2026 (Craft): found Rare-and-up cards catch the light (BeeCardGlare).
        const glare = realRarityKey !== 'common' ? '<i class="bc-glare" aria-hidden="true"></i>' : '';
        container.innerHTML = `<div class="bee-card-inner">
            <div class="bee-card-face bee-card-front">${glare}
                <i class="bc-hexbg"></i><i class="bc-trim"></i>
                <i class="bc-rv bc-tl"></i><i class="bc-rv bc-tr"></i><i class="bc-rv bc-bl"></i><i class="bc-rv bc-br"></i>
                ${obtained && rarityKey === 'legendary' ? beeCardSparkles(8) : ''}

                <div class="bc-top">
                    <span class="bc-rpill">${obtained ? entry.rarity.toUpperCase() : '???'}</span>
                    <span class="bee-card-name${obtained && entry.name.length > 14 ? ' bc-long' : ''}" title="${obtained ? entry.name : 'Undiscovered'}">${obtained ? entry.name : '???'}</span>
                    <span class="bc-elhex" title="${obtained ? elementInfo.label : 'Unknown element'}"><span>${obtained ? elementInfo.emoji : '?'}</span></span>
                </div>

                <div class="bc-art">${beeCardArtHTML({ rarityKey, silhouette: !obtained })}</div>

                <div class="bc-dex">${/* Oct 31 2026 (Craft): No. · first found · typical height · typical weight */ ''}
                    <span><b>No.${dexNo}</b></span>
                    <span>${firstAt && !isNaN(new Date(firstAt)) ? new Date(firstAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</span>
                    <span>H ~${kdMid(typeof BEE_HEIGHT_RANGES !== 'undefined' ? BEE_HEIGHT_RANGES[entry.rarity] : null)}cm</span>
                    <span>W ~${kdMid(typeof BEE_WEIGHT_RANGES !== 'undefined' ? BEE_WEIGHT_RANGES[entry.rarity] : null)}g</span>
                </div>

                <div class="bc-abil${obtained ? ' bc-moves' : ''}">${movesHTML}</div>

                <div class="bc-bar">${/* Oct 31 2026 (Craft): Weakness | Resistance | Recovery.
                    NOTE: Resistance is a placeholder (the element it resists). It needs
                    its own unique design later, not a mirror of Weakness. */ ''}
                    <div><small>Weakness</small><span>${obtained ? `<em title="${weakInfo.label}">${weakInfo.emoji}</em> ×2` : '?'}</span></div>
                    <div><small>Resistance</small><span>${(() => { const r = obtained && typeof beeResistElement === 'function' ? beeResistElement(entry.element) : null; return r ? `<em title="${r.label}">${r.emoji}</em> ½` : '?'; })()}</span></div>
                    <div><small>Recovery</small><span>${obtained && typeof BEE_RECOVERY_RANGES !== 'undefined' && BEE_RECOVERY_RANGES[entry.rarity] ? BEE_RECOVERY_RANGES[entry.rarity].join('–') : '?'}</span></div>
                </div>

                <p class="bee-card-flavor">${obtained ? entry.description : 'Not yet discovered - obtain a matching bee to reveal this entry.'}</p>
                ${/* TODO (Craft, Oct 31 2026): the bottom left of the KeeperDex card needs
                    finishing. Design not decided yet; "KeeperDex No." stays until then. */ ''}
                <div class="bc-coll"><span>KeeperDex No.${dexNo}</span><b>${obtained ? BEE_CARD_RARITY_SYMBOLS[realRarityKey] || '' : '?'}</b></div>
            </div>
            <div class="bee-card-face bee-card-back">
                <i class="bc-hexbg"></i><i class="bc-trim"></i>
                <i class="bc-rv bc-tl"></i><i class="bc-rv bc-tr"></i><i class="bc-rv bc-bl"></i><i class="bc-rv bc-br"></i>
                <div class="bc-back-inner"><img class="bc-logo" src="${BEE_CARD_ASSETS}bizzybee-badge.webp" alt="BizzyBee" draggable="false"></div>
            </div></div>
        `;
    },
    flip(container) {
        if (container) container.classList.toggle('is-flipped');
    }
};
