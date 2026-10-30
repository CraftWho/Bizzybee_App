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
        // #TimeManagement also counts as "Time Management" (db.js).
        const lowerText = (typeof withHashtagWords === 'function' ? withHashtagWords(text) : text).toLowerCase();

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
        this._mountInput(container);
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

        // A library word ("wake") tags its skill ("Time Management") (Oct 29 2026).
        if (typeof Vault !== 'undefined' && Vault.getDictionaryTerms) {
            const lib = new Map(Vault.getDictionaryTerms().filter(t => t.source === 'library').map(t => [t.name.toLowerCase(), t.category]));
            [...matched].forEach(tag => { const cat = lib.get(tag.toLowerCase()); if (cat) { matched.delete(tag); matched.add(cat); } });
        }
        let changed = false;
        matched.forEach(tag => {
            const lower = tag.toLowerCase();
            if (state.dismissed.has(lower)) return;
            if (state.tags.some(t => t.toLowerCase() === lower)) return;
            state.tags.push(tag);
            changed = true;
        });

        if (changed) this._renderChips(container);
        this._suggest(container, texts, knownTerms);
    },

    // Oct 2026: type your own tag too. A box under the chips - Enter (or a
    // comma) adds it; #TimeManagement becomes "Time Management".
    add(container, raw) {
        const state = this._instances.get(container);
        if (!state) return;
        String(raw || '').split(',').map(t => t.replace(/^#/, '').trim()).filter(Boolean).forEach(t => {
            const tag = typeof splitTagWords === 'function' ? splitTagWords(t) : t;
            const lower = tag.toLowerCase();
            state.dismissed.delete(lower);
            if (!state.tags.some(x => x.toLowerCase() === lower)) state.tags.push(tag);
        });
        this._renderChips(container);
        this._suggest(container, state.lastTexts || [], state.lastTerms || []);
    },

    // ---- Suggestions as you type (Oct 29 2026, Craft) ----
    // One row under the chips:
    //  - typing #cl… in the title or notes: words that start with "cl"
    //    (tap one to finish the word and add the tag)
    //  - typing in "Add a tag": the same, for that box
    //  - otherwise: tags that fit what you wrote (a shared word start), and
    //    the skill a tagged word belongs to
    _pool(knownTerms) {
        const m = new Map();
        // Tags are short: skip whole sentences (quest task names and the like).
        const add = (t) => { t = String(t || '').trim(); if (t.length >= 2 && t.length <= 28 && t.split(/\s+/).length <= 3 && !m.has(t.toLowerCase())) m.set(t.toLowerCase(), t); };
        // Library words ("wake") suggest their skill ("Time Management") instead.
        const terms = typeof Vault !== 'undefined' && Vault.state && Vault.getDictionaryTerms ? Vault.getDictionaryTerms() : [];
        const libWords = new Set(terms.filter(t => t.source === 'library').map(t => t.name.toLowerCase()));
        (knownTerms || []).filter(t => !libWords.has(String(t).toLowerCase())).forEach(add);
        terms.forEach(t => { if (t.source !== 'library') add(t.name); add(t.category); });
        return [...m.values()];
    },
    _startsWithin(name, frag) {
        frag = frag.toLowerCase();
        const words = (typeof splitTagWords === 'function' ? splitTagWords(name) : name).toLowerCase().split(/[\s\-_.]+/);
        return name.toLowerCase().startsWith(frag) || words.some(w => w.startsWith(frag));
    },
    _caretHash() {
        const el = document.activeElement;
        if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.closest('.tag-add')) return null;
        const upto = el.value.slice(0, el.selectionStart || 0);
        // The word you're typing right now (no # needed, Oct 29 2026).
        const m = upto.match(/(^|[\s(\[,;:#])([A-Za-z][A-Za-z0-9_+.\-]{2,39})$/);
        return m ? { el, frag: m[2], start: upto.length - m[2].length, end: upto.length } : null;
    },
    _suggest(container, texts, knownTerms) {
        const state = this._instances.get(container);
        if (!state) return;
        state.lastTexts = texts; state.lastTerms = knownTerms;
        let row = container.parentElement && container.parentElement.querySelector(':scope > .tag-suggest');
        if (!row) { row = document.createElement('div'); row.className = 'tag-suggest'; container.insertAdjacentElement('afterend', row); }
        const have = new Set(state.tags.map(t => t.toLowerCase()));
        const pool = this._pool(knownTerms).filter(t => !have.has(t.toLowerCase()));
        const box = container.parentElement && container.parentElement.querySelector('.tag-add input');
        const hash = this._caretHash();
        let label = '', items = [], mode = 'add';
        const hashItems = hash ? pool.filter(t => this._startsWithin(t, hash.frag) && t.toLowerCase() !== hash.frag.toLowerCase()).slice(0, 6) : [];
        if (hashItems.length) {
            label = `${hash.frag}…`; mode = 'hash';
            items = hashItems;
        } else if (box && document.activeElement === box && box.value.trim()) {
            const frag = box.value.trim().replace(/^#/, '');
            label = 'Tags'; mode = 'box';
            items = pool.filter(t => this._startsWithin(t, frag)).slice(0, 6);
        } else {
            const words = new Set(((texts || []).join(' ').toLowerCase().match(/[a-z][a-z0-9+#.]{3,}/g) || []).filter(w => !this._STOP.has(w)));
            const stem = (w) => w.slice(0, Math.min(5, w.length));
            const stems = new Set([...words].map(stem));
            items = pool.filter(t => (typeof splitTagWords === 'function' ? splitTagWords(t) : t).toLowerCase().split(/[\s\-_.]+/).some(w => w.length >= 4 && stems.has(stem(w))));
            // The skill a tag belongs to.
            if (typeof Vault !== 'undefined' && Vault.getDictionaryTerms) {
                const terms = Vault.getDictionaryTerms();
                state.tags.forEach(tag => { const term = terms.find(x => x.name.toLowerCase() === tag.toLowerCase()); if (term && term.category && !have.has(term.category.toLowerCase())) items.push(term.category); });
            }
            items = [...new Map(items.map(t => [t.toLowerCase(), t])).values()].filter(t => !state.dismissed.has(t.toLowerCase())).slice(0, 5);
            label = 'Suggested';
        }
        // "Make it a skill?" for an everyday skill you don't have yet.
        const lib = typeof Vault !== 'undefined' && Vault.librarySuggestion ? Vault.librarySuggestion((texts || []).join(' ')) : null;
        const card = lib ? `<div class="tag-skillcard"><span class="ic">${lib.icon}</span><span class="tx"><b>${this._escapeAttr(lib.name)}</b><small>Make it a skill? ${lib.measure === 'times' ? 'It counts how often you do it.' : 'It counts your time.'}</small></span><button type="button" class="no" data-lib-no="${this._escapeAttr(lib.name)}">Not now</button><button type="button" class="yes" data-lib="${this._escapeAttr(lib.name)}">＋ Make it a skill</button></div>` : '';
        row.hidden = !items.length && !card;
        if (!items.length && !card) { row.innerHTML = ''; return; }
        row.innerHTML = card + (items.length ? `<small>${this._escapeAttr(label)}</small>` : '') + items.map(t => `<button type="button" class="tag-sug" data-sug="${this._escapeAttr(t)}">＋ ${this._escapeAttr(t)}</button>`).join('');
        row.querySelectorAll('[data-lib], [data-lib-no]').forEach(b => {
            b.addEventListener('pointerdown', (e) => e.preventDefault());
            b.addEventListener('click', () => {
                if (b.dataset.libNo) { Vault.declineLibrarySkill(b.dataset.libNo); this._suggest(container, state.lastTexts || [], state.lastTerms || []); return; }
                const name = Vault.createLibrarySkill(b.dataset.lib);
                if (!name) return;
                const meta = Vault.skillMeta(name);
                if (typeof Toast !== 'undefined') Toast.show(`${meta.icon} New skill: ${name}`, 'positive');
                this.add(container, name);
                if (typeof SkillMerge !== 'undefined') setTimeout(() => SkillMerge.offer(name), 600);
            });
        });
        row.querySelectorAll('[data-sug]').forEach(b => {
            b.addEventListener('pointerdown', (e) => e.preventDefault());   // keep the keyboard and caret where they are
            b.addEventListener('click', () => {
                const tag = b.dataset.sug;
                if (mode === 'hash' && hash && hash.el.isConnected) {
                    // Finish the word in the text: "clo" -> "Closure ".
                    const word = tag;
                    const v = hash.el.value;
                    hash.el.value = v.slice(0, hash.start) + word + ' ' + v.slice(hash.end);
                    const pos = hash.start + word.length + 1;
                    try { hash.el.setSelectionRange(pos, pos); } catch { /* some inputs */ }
                    hash.el.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (mode === 'box' && box) box.value = '';
                this.add(container, tag);
            });
        });
    },
    _STOP: new Set(['that', 'this', 'with', 'from', 'have', 'should', 'would', 'could', 'when', 'what', 'then', 'than', 'they', 'them', 'your', 'into', 'about', 'there', 'their', 'will', 'just', 'make', 'need', 'also', 'like', 'more', 'some', 'only', 'other', 'which', 'after', 'before', 'clicked', 'click']),
    _mountInput(container) {
        if (container.parentElement && container.parentElement.querySelector(':scope > .tag-add')) return;
        const box = document.createElement('label');
        box.className = 'tag-add hf-box';
        box.innerHTML = '<small>Add a tag</small><input type="text" maxlength="40" placeholder="e.g. JavaScript - press Enter" autocomplete="off" enterkeyhint="done">';
        container.insertAdjacentElement('afterend', box);
        const input = box.querySelector('input');
        const commit = () => { if (input.value.trim()) { this.add(container, input.value); input.value = ''; } };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } });
        input.addEventListener('blur', () => setTimeout(commit, 150));
        input.addEventListener('input', () => { const st = this._instances.get(container); this._suggest(container, st ? st.lastTexts || [] : [], st ? st.lastTerms || [] : []); });
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
            : '<p class="tags-empty">No tags yet. They show up from your title and notes, or type one below.</p>';
        container.dispatchEvent(new CustomEvent('tagschange', { bubbles: true }));

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
