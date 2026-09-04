console.log("/// CHECKLIST EDITOR MODULE ONLINE ///");

// Reusable checklist editor: real rows plus a trailing "ghost" row that
// promotes itself into a real row the moment its input goes from empty to
// non-empty (same input element, so focus/cursor position is never
// disturbed mid-word), immediately followed by a fresh ghost row for the
// next entry. This is what makes continuous entry work: type a whole
// line, it becomes real; a new blank "+" row is already waiting below by
// the time you're done.
//
// Extracted out of create-daily.js and create-todo.js, which each carried
// a byte-for-byte identical copy of this editor (only the DOM class
// prefix differed: daily-checklist-* vs todo-checklist-*) - see the
// project-tuning pass before Hive Defense. Renders into a given container
// (same "component owns its DOM" convention as BeeCard/ItemCard), with
// state keyed off the container (a WeakMap) so more than one editor per
// page would just work even though that's never been a real case.
const ChecklistEditor = {
    _instances: new WeakMap(),

    // Not the same escapeHTML/escapeAttr as other pages - kept private to
    // this file, same reasoning as map.js's escapeMapAttr and each
    // create-*.js's own escapeCreate*Attr.
    _escapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    _newId() {
        this._idCounter = (this._idCounter || 0) + 1;
        return `chk-${Date.now()}-${this._idCounter}`;
    },

    // Builds the editor inside `container`, seeded with `initialItems`
    // (each `{ id, text, done }`, or a fresh array if omitted/empty).
    render(container, initialItems) {
        if (!container) return;
        const items = (initialItems || []).map(item => ({ ...item }));
        this._instances.set(container, { items });

        container.innerHTML = '';
        items.forEach(item => container.appendChild(this._createRowEl(container, item)));
        container.appendChild(this._createGhostRowEl(container));
    },

    // Current items, in display order - this is what a page's submit
    // handler should read for its save payload.
    getItems(container) {
        const state = this._instances.get(container);
        return state ? state.items : [];
    },

    // A real checklist row - already-promoted (has its own remove button)
    // from the moment it's created, whether that's because it was loaded
    // from existing data or just got promoted out of a ghost row.
    _createRowEl(container, item) {
        const row = document.createElement('div');
        row.className = 'checklist-row';
        row.dataset.checklistId = item.id;
        row.innerHTML = `
            <button type="button" class="checklist-remove" aria-label="Remove entry">×</button>
            <input type="text" class="checklist-text" value="${this._escapeAttr(item.text)}">
        `;

        row.querySelector('.checklist-text').addEventListener('input', (e) => {
            item.text = e.target.value;
        });

        row.querySelector('.checklist-remove').addEventListener('click', () => {
            const state = this._instances.get(container);
            state.items = state.items.filter(i => i.id !== item.id);
            row.remove();
        });

        return row;
    },

    // The "+ New checklist entry" placeholder row.
    _createGhostRowEl(container) {
        const row = document.createElement('div');
        row.className = 'checklist-row checklist-row--ghost';
        row.innerHTML = `
            <span class="checklist-ghost-icon">+</span>
            <input type="text" class="checklist-text checklist-ghost-input" placeholder="New checklist entry">
        `;

        const input = row.querySelector('.checklist-ghost-input');
        let promotedItem = null;

        input.addEventListener('input', () => {
            const state = this._instances.get(container);

            if (!promotedItem) {
                if (!input.value) return;

                promotedItem = { id: this._newId(), text: input.value, done: false };
                state.items.push(promotedItem);

                row.classList.remove('checklist-row--ghost');
                input.classList.remove('checklist-ghost-input');
                input.placeholder = '';

                const icon = row.querySelector('.checklist-ghost-icon');
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'checklist-remove';
                removeBtn.setAttribute('aria-label', 'Remove entry');
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', () => {
                    state.items = state.items.filter(i => i.id !== promotedItem.id);
                    row.remove();
                });
                icon.replaceWith(removeBtn);

                container.appendChild(this._createGhostRowEl(container));
                return;
            }

            promotedItem.text = input.value;
            // Backspacing a promoted entry back to nothing removes it
            // outright (same as clicking its ×) rather than leaving a
            // blank real row behind - the explicit × is still there for a
            // deliberate delete at any point, this is just a convenience
            // for "never mind."
            if (!input.value) {
                state.items = state.items.filter(i => i.id !== promotedItem.id);
                row.remove();
            }
        });

        return row;
    }
};
