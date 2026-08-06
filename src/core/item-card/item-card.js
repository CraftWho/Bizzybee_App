console.log("/// ITEM CARD MODULE ONLINE ///");

// Shared rectangular, flippable card for materials/evolution items/
// fragments/store items - the item-flavored counterpart to BeeCard
// (bee-card.js). Deliberately NOT bee-card-shaped (wider, shorter, no
// class/rename controls) since these are inert collectibles, not
// creatures - tap/click still flips it (same 3D rotate) to read the full
// description + a couple extra stats on the back, same "learn more" idea
// as a bee's stat flip.
//
// Depends on BEE_RARITIES (db.js, for the front border color) already
// being loaded - no module system here, just globals, same as BeeCard.
// This component is presentation-only: it doesn't call Vault itself -
// callers (inventory.js, honey-store.js) hand it a pre-shaped `entry`
// (count/fragment progress/affordability already resolved) and get an
// onBuy callback if the card should offer a purchase.

function itemCardColor(rarity) {
    if (!rarity || typeof BEE_RARITIES === 'undefined') return '#555';
    const info = BEE_RARITIES.find(r => r.rarity === rarity);
    return info ? info.color : '#555';
}

const ItemCard = {
    // container: an empty element to render into (innerHTML fully owned -
    // safe to re-call on the same container to refresh it).
    // entry: {
    //   id, icon, label, description,
    //   rarity: 'Common'|'Rare'|'Epic'|'Legendary'|null,
    //   count: number (owned, or completed-item count),
    //   fragmentProgress: { current, required } | null,
    //   price: { materialId, amount, icon, label } | null,   // only for purchasable store items
    //   affordable: boolean                                   // only meaningful when price is set
    // }
    // options.onBuy(entry.id): wired to the Buy button when entry.price is set.
    render(container, entry, options = {}) {
        if (!container || !entry) return;
        const { onBuy } = options;

        const color = itemCardColor(entry.rarity);
        const hasPrice = !!entry.price;
        const owned = typeof entry.count === 'number' ? entry.count : 0;
        const isUnowned = !hasPrice && owned === 0 && !entry.fragmentProgress;

        container.classList.add('item-card');
        container.classList.toggle('item-card--unowned', isUnowned);
        container.innerHTML = `
            <div class="item-card-inner">
                <div class="item-card-face item-card-front" style="border-color:${color}; box-shadow: 0 0 14px ${color}66;">
                    <div class="item-card-top-row">
                        <span class="item-card-icon">${entry.icon}</span>
                        <span class="item-card-label" title="${entry.label}">${entry.label}</span>
                        ${entry.fragmentProgress
                            ? `<span class="item-card-count item-card-count--fragment" title="Fragments collected">${entry.fragmentProgress.current}/${entry.fragmentProgress.required}</span>`
                            : `<span class="item-card-count">×${owned}</span>`}
                    </div>
                    <p class="item-card-desc">${entry.description}</p>
                    ${hasPrice ? `
                    <div class="item-card-footer">
                        <span class="item-card-price">${entry.price.icon || ''} ${entry.price.amount} ${entry.price.label || ''}</span>
                        <button class="item-card-buy-btn" ${entry.affordable ? '' : 'disabled'}>Buy</button>
                    </div>` : ''}
                    <span class="item-card-flip-hint">↻ tap for more</span>
                </div>
                <div class="item-card-face item-card-back" style="border-color:${color};">
                    <h4 class="item-card-back-title" style="color:${color};">${entry.icon} ${entry.label}</h4>
                    ${entry.rarity ? `<span class="item-card-back-rarity" style="color:${color};">${entry.rarity}</span>` : ''}
                    <p class="item-card-back-desc">${entry.description}</p>
                    ${entry.fragmentProgress ? `<p class="item-card-back-fragment">🔹 Fragments: ${entry.fragmentProgress.current} / ${entry.fragmentProgress.required}</p>` : ''}
                    ${hasPrice
                        ? `<p class="item-card-back-price">Costs ${entry.price.icon || ''} ${entry.price.amount} ${entry.price.label || ''}</p>`
                        : `<p class="item-card-back-owned">Owned: ${owned}</p>`}
                    <span class="item-card-flip-hint">↻ tap to flip back</span>
                </div>
            </div>
        `;

        // Same bound-once-per-container flip guard BeeCard uses - repeated
        // render() calls (refreshing counts after a purchase/apply) replace
        // innerHTML but shouldn't stack duplicate listeners.
        if (!container.dataset.itemCardBound) {
            container.dataset.itemCardBound = 'true';
            container.addEventListener('click', (event) => {
                if (event.target.closest('.item-card-buy-btn')) return;
                container.classList.toggle('is-flipped');
            });
        }

        const buyBtn = container.querySelector('.item-card-buy-btn');
        if (buyBtn && onBuy) {
            buyBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                onBuy(entry.id);
            });
        }
    }
};
