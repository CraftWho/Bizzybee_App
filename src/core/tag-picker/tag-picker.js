console.log("/// TAG PICKER MODULE ONLINE ///");

// Reusable automatic tag picker: no text input, tags are detected from
// whatever text the page hands over (typically a title + notes field)
// against a page-supplied list of known terms, and the only manual action
// is dismissing a chip via ×. Additive only - a fresh match gets added,
// but editing the text back below a match never yanks an already-attached
// tag back out; dismissing is the only thing that's "picking" left in an
// otherwise fully-automatic system.
//
// Extracted out of create-daily.js, create-todo.js and create-habit.js,
// which each carried a byte-for-byte identical copy of this logic (only
// the DOM ids/class prefix and the known-term SOURCES differed) - see the
// project-tuning pass before Hive Defense. collectKnownTerms() itself
// stays page-owned (each page draws on genuinely different Vault data -
// Dailies/To-Dos/Habits/Quests in different combinations) and is passed
// into rescan() as a plain array rather than folded into this component.
//
// Renders into a given container (same "component owns its DOM"
// convention as BeeCard/ItemCard) - the container IS the tag list element
// itself (e.g. the page's own .tags-list div), matching how the original
// per-page versions worked directly against their `*-tags-list` div.
// State is keyed off the container (a WeakMap) so more than one picker
// per page would just work even though that's never been a real case.
const TagPicker = {
    _instances: new WeakMap(),

    // Word-boundary-ish match (not a substring match) so a short term
    // like "CSS" doesn't fire on "process" or "accessible" - matched
    // against a lowercased copy of the text. Terms under 3 characters are
    // skipped outright to avoid noisy single/double-letter false
    // positives. Pure/stateless - exposed directly in case a page ever
    // wants to preview a match without going through rescan().
    findMatchingTerms(text, knownTerms) {
        if (!text) return [];
        const lowerText = text.toLowerCase();

        return knownTerms.filter(term => {
            if (term.length < 3) return false;
            const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, 'i');
            return re.test(lowerText);
        });
    },

    // Builds the picker inside `container`, seeded with `initialTags`
    // (plain strings, already in their canonical casing).
    render(container, initialTags) {
        if (!container) return;
        this._instances.set(container, {
            tags: [...(initialTags || [])],
            dismissed: new Set() // lowercased tags explicitly × 'd off - stays off for the rest of this edit even if the text below still matches it
        });
        this._renderChips(container);
    },

    // Current tags, in display order - this is what a page's submit
    // handler should read for its save payload.
    getTags(container) {
        const state = this._instances.get(container);
        return state ? state.tags : [];
    },

    // Scans `texts` (an array of raw field strings, e.g. [title, notes])
    // against `knownTerms` and adds any newly-matched, non-dismissed,
    // not-already-attached tags. Call this from each source field's own
    // input listener.
    rescan(container, texts, knownTerms) {
        const state = this._instances.get(container);
        if (!state) return;

        const matched = new Set();
        (texts || []).forEach(text => {
            this.findMatchingTerms(text, knownTerms).forEach(tag => matched.add(tag));
        });

        let changed = false;
        matched.forEach(tag => {
            const lower = tag.toLowerCase();
            if (state.dismissed.has(lower)) return;
            if (state.tags.some(t => t.toLowerCase() === lower)) return;
            state.tags.push(tag);
            changed = true;
        });

        if (changed) this._renderChips(container);
    },

    _escapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    _renderChips(container) {
        const state = this._instances.get(container);
        container.innerHTML = state.tags.length
            ? state.tags.map(tag => `
                <span class="tag-chip" data-tag="${this._escapeAttr(tag)}">${this._escapeAttr(tag)} <button type="button" class="tag-remove" aria-label="Remove tag">×</button></span>
            `).join('')
            : '<p class="tags-empty">No matches yet - type a known term in your title or notes above.</p>';

        container.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const chip = btn.closest('.tag-chip');
                const tag = chip.dataset.tag;
                state.dismissed.add(tag.toLowerCase());
                state.tags = state.tags.filter(t => t !== tag);
                this._renderChips(container);
            });
        });
    }
};
