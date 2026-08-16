console.log("/// KEEPERDEX CARD MODULE ONLINE ///");

// Single-face reference card for the KeeperDex (src/features/keeperdex/) -
// deliberately reuses bee-card.css's shared chrome classes directly
// (.bee-card-face, .bee-card-top-row, .bee-card-type-badge, .bee-card-
// art-frame + its rarity theme variants, .bee-card-element-hex, .bee-
// card-dex-strip parts, .bee-card-weakness-row, .bee-card-flavor) instead
// of re-declaring a lookalike set - same "one visual language, no drift"
// reasoning BeeCard itself is built on (see bee-card.js's header comment).
// Only genuinely new here: the outer sizing (single face, no flip needed
// - a KeeperDex entry isn't an individual bee, so there's no stats back
// to reveal), the skills list, and the locked/silhouette treatment - see
// keeperdex-card.css for both.
//
// Depends on bee-card.css (for the reused classes above), bee-card.js's
// beeCardColor(), the KEEPERDEX_*/BEE_ELEMENTS/BEE_ELEMENT_WEAKNESS
// globals (db.js), and NanoBee (nano-bee.js) already being loaded on the
// page - no module system here, just globals, same as everywhere else.
const KeeperDexCard = {
    // container: an empty element to render into. entry: one row from
    // KEEPERDEX_ENTRIES (db.js). options.obtained: whether to render the
    // real entry or the locked/"???" placeholder version.
    render(container, entry, options = {}) {
        if (!container || !entry) return;
        const { obtained = false } = options;

        const color = beeCardColor(entry.rarity);
        const themeKey = entry.rarity.toLowerCase();
        const elementInfo = BEE_ELEMENTS[entry.element];
        const weakInfo = BEE_ELEMENTS[BEE_ELEMENT_WEAKNESS[entry.element]];
        const dexNo = String(entry.dexNumber).padStart(3, '0');

        container.classList.add('keeperdex-card');
        container.classList.toggle('is-locked', !obtained);

        container.innerHTML = `
            <div class="bee-card-face keeperdex-card-face" style="border-color:${obtained ? color : '#3a3a3a'}; ${obtained ? `box-shadow: 0 0 18px ${color}88;` : ''}">
                <div class="bee-card-top-row">
                    <span class="bee-card-name">${obtained ? entry.name : '???'}</span>
                    <span class="bee-card-type-badge" style="background:${obtained ? color : '#333'};" title="${obtained ? entry.rarity : 'Undiscovered'}">${obtained ? entry.rarity.charAt(0) : '?'}</span>
                </div>

                <div class="bee-card-art-frame ${obtained ? `bee-card-art-frame--${themeKey}` : 'keeperdex-art-frame--locked'}">
                    ${obtained ? `<span class="bee-card-element-hex" title="${elementInfo.label}">${elementInfo.emoji}</span>` : ''}
                    <span class="keeperdex-card-icon"></span>
                </div>

                <div class="bee-card-dex-strip">
                    <span class="bee-card-dex-no">No. ${dexNo}</span>
                    <span class="bee-card-dex-species">${obtained ? `${entry.rarity} ${entry.species}` : '???'}</span>
                </div>

                <div class="bee-card-weakness-row">
                    <span class="bee-card-weakness-label">Weakness</span>
                    <span class="bee-card-weakness-hex" title="${obtained ? weakInfo.label : ''}">${obtained ? weakInfo.emoji : '?'}</span>
                    <span class="bee-card-weakness-mult">${obtained ? '×2' : ''}</span>
                </div>

                ${obtained ? `
                <div class="keeperdex-skills-row">
                    ${entry.skills.map(skill => `
                        <div class="keeperdex-skill">
                            <span class="keeperdex-skill-name">${skill.name}</span>
                            <span class="keeperdex-skill-power">${skill.power}</span>
                        </div>
                    `).join('')}
                </div>` : ''}

                <p class="bee-card-flavor">${obtained ? entry.description : 'Not yet discovered - obtain a matching bee to reveal this entry.'}</p>
            </div>
        `;

        // Same NanoBee 'card' render BeeCard itself uses for its art-frame
        // icon (bee-card.js) - locked entries get it muted + turned into a
        // flat silhouette via CSS filter (keeperdex-card.css) rather than
        // skipping it, so a "???" entry still reads as "a bee-shaped
        // something," not an empty box.
        const iconEl = container.querySelector('.keeperdex-card-icon');
        if (iconEl) {
            NanoBee.render(iconEl, 'card', { color: obtained ? color : '#444', hideCore: true, noFlight: true });
            iconEl.classList.toggle('keeperdex-card-icon--silhouette', !obtained);
        }
    }
};
