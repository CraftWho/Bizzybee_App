console.log("/// DIFFICULTY PICKER MODULE ONLINE ///");

// Reusable difficulty-tier tile grid. The tier VALUES are deliberately
// different per page (create-daily.js's DIFFICULTY_TIERS vs
// create-habit.js's HABIT_DIFFICULTY_TIERS - different XP economics per
// task type) and stay page-owned, passed in at render() time rather than
// hardcoded here.
//
// Extracted out of create-daily.js, create-todo.js and create-habit.js,
// which each carried a byte-for-byte identical copy of this render/click
// logic (only the DOM id and tier data differed) - see the project-tuning
// pass before Hive Defense. Renders into a given container (same
// "component owns its DOM" convention as BeeCard/ItemCard), with state
// keyed off the container (a WeakMap) so more than one picker per page
// would just work even though that's never been a real case.
const DifficultyPicker = {
    _instances: new WeakMap(),

    // `tiers`: array of `{ level, xp, icon }`. `selected`: the initially
    // selected tier's `level`. `onSelect(tier)`: called whenever the
    // worker bee picks a different tile, so the page can update its own
    // selectedDifficulty/selectedXP state and XP-value display - this
    // component only owns which tile looks selected, not what a
    // selection means to the page.
    render(container, tiers, selected, onSelect) {
        if (!container) return;
        this._instances.set(container, { tiers, selected, onSelect });
        this._renderTiles(container);
    },

    getSelected(container) {
        const state = this._instances.get(container);
        return state ? state.selected : null;
    },

    _renderTiles(container) {
        const state = this._instances.get(container);
        container.innerHTML = state.tiers.map(tier => `
            <button type="button" class="difficulty-tile${tier.level === state.selected ? ' difficulty-tile--selected' : ''}" data-difficulty="${tier.level}">
                <span class="difficulty-icon">${tier.icon}</span>
                <span class="difficulty-label">${tier.level}</span>
            </button>
        `).join('');

        container.querySelectorAll('.difficulty-tile').forEach(btn => {
            btn.addEventListener('click', () => {
                state.selected = btn.dataset.difficulty;
                this._renderTiles(container);
                const tier = state.tiers.find(t => t.level === state.selected);
                if (state.onSelect) state.onSelect(tier);
            });
        });
    }
};
