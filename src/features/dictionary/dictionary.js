console.log("/// DICTIONARY PROTOCOLS INITIALIZED ///");

function escapeDictHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Renders every term grouped by category, sorted alphabetically within
// each group, categories sorted alphabetically too - browsing order, not
// DP order (that's the Dashboard's job).
function renderDictionaryList() {
    const container = document.getElementById('dictionary-list');
    const terms = Vault.getDictionaryTerms();

    if (terms.length === 0) {
        container.innerHTML = '<p class="dictionary-empty-state">No terms yet - add your first one above.</p>';
        return;
    }

    const byCategory = {};
    terms.forEach(term => {
        if (!byCategory[term.category]) byCategory[term.category] = [];
        byCategory[term.category].push(term);
    });

    const categories = Object.keys(byCategory).sort((a, b) => a.localeCompare(b));

    container.innerHTML = categories.map(category => {
        const termsInCategory = byCategory[category].sort((a, b) => a.name.localeCompare(b.name));
        return `
            <div class="dictionary-category-group">
                <h4 class="dictionary-category-heading">${escapeDictHTML(category)}</h4>
                ${termsInCategory.map(term => `
                    <div class="dictionary-term-row" data-term-id="${term.id}">
                        <div class="dictionary-term-main">
                            <span class="dictionary-term-name">${escapeDictHTML(term.name)}</span>
                            ${term.definition ? `<p class="dictionary-term-definition">${escapeDictHTML(term.definition)}</p>` : ''}
                        </div>
                        <button type="button" class="dictionary-term-remove" data-role="remove-term" aria-label="Remove term">🗑️</button>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-role="remove-term"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.dictionary-term-row');
            const term = terms.find(t => t.id === row.dataset.termId);
            if (!term) return;
            if (!confirm(`Remove term "${term.name}"? Its DP history moves to a category named after any tag still using it.`)) return;
            Vault.removeDictionaryTerm(term.id);
            renderDictionaryList();
            refreshCategoryDatalist();
        });
    });
}

// Existing categories become autocomplete suggestions in the "Category"
// field, via a <datalist> - keeps new terms grouping into the same
// buckets you already use instead of near-duplicate categories
// ("CSS" vs "Css" vs "css-stuff") fragmenting the Skill Matrix.
function refreshCategoryDatalist() {
    const datalist = document.getElementById('dictionary-category-list');
    const categories = [...new Set(Vault.getDictionaryTerms().map(t => t.category))].sort((a, b) => a.localeCompare(b));
    datalist.innerHTML = categories.map(c => `<option value="${escapeDictHTML(c)}"></option>`).join('');
}

// A Quest's "Related Terms" button (quests.js) links here as
// dictionary.html?term=<termId> - scrolls to and briefly flashes that
// term's row so arriving from a quest actually lands you somewhere
// specific instead of just the top of a long unfiltered list.
function highlightTermFromURL() {
    const params = new URLSearchParams(window.location.search);
    const termId = params.get('term');
    if (!termId) return;

    const row = document.querySelector(`[data-term-id="${termId}"]`);
    if (!row) return;

    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('dictionary-term-row--highlight');
    setTimeout(() => row.classList.remove('dictionary-term-row--highlight'), 2000);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    renderDictionaryList();
    refreshCategoryDatalist();
    highlightTermFromURL();
    Waggle.setActions(baseWaggleActions());

    document.getElementById('add-term-btn').addEventListener('click', () => {
        const nameInput = document.getElementById('term-name-input');
        const categoryInput = document.getElementById('term-category-input');
        const definitionInput = document.getElementById('term-definition-input');

        const name = nameInput.value.trim();
        if (!name) {
            Toast.show('Give the term a name first.', 'negative');
            return;
        }

        const added = Vault.addDictionaryTerm({
            name,
            category: categoryInput.value.trim(),
            definition: definitionInput.value.trim()
        });

        if (!added) {
            Toast.show('Could not add that term.', 'negative');
            return;
        }

        Toast.show(`📖 Added "${added.name}" to ${added.category}`, 'positive');
        nameInput.value = '';
        categoryInput.value = '';
        definitionInput.value = '';
        renderDictionaryList();
        refreshCategoryDatalist();
    });
});
