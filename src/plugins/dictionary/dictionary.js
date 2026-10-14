// Dictionary (Oct 2026 redesign, approved demo): search, category chips
// (each category is a skill - shown with its level), term cards, and a
// sheet to add / edit / delete. Still a plugin: shows a Plugin Hub link
// when it isn't installed.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let dcCat = 'All', dcQ = '';
const sheet = document.getElementById('dc-sheet');
const sheetBody = document.getElementById('dc-sheet-body');
const closeSheet = () => { sheet.hidden = true; };
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

function renderDict() {
    const terms = Vault.getDictionaryTerms();
    const cats = [...new Set(terms.map(t => t.category))].sort((a, b) => a.localeCompare(b));
    if (dcCat !== 'All' && !cats.includes(dcCat)) dcCat = 'All';
    document.getElementById('dc-count').textContent = terms.length;
    document.getElementById('dc-chips').innerHTML = ['All', ...cats].map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === dcCat}">${esc(c)}<span>${c === 'All' ? terms.length : terms.filter(t => t.category === c).length}</span></button>`).join('');
    const matrix = Object.fromEntries(Vault.getSkillMatrix().map(m => [m.category, m]));
    const shown = terms.filter(t => (dcCat === 'All' || t.category === dcCat) && (!dcQ || `${t.name} ${t.definition} ${t.category}`.toLowerCase().includes(dcQ)));
    const groups = dcCat === 'All' ? cats : [dcCat];
    document.getElementById('dc-list').innerHTML = shown.length ? groups.map(c => {
        const list = shown.filter(t => t.category === c).sort((a, b) => a.name.localeCompare(b.name));
        if (!list.length) return '';
        const m = matrix[c];
        return `<h2 class="sec">${esc(c)}${m ? ` · Lv ${m.level} · ${m.hours < 10 ? m.hours.toFixed(1) : Math.round(m.hours)} h` : ''}</h2>` + list.map(t => `
            <button type="button" class="term" data-id="${esc(t.id)}"><span class="hx">${esc(t.name.replace(/^</, '').slice(0, 2).toUpperCase())}</span>
                <span class="body"><span class="row1"><b>${esc(t.name)}</b><span class="cat">${esc(t.category)}</span></span>${t.definition ? `<p>${esc(t.definition)}</p>` : '<p class="def-missing">＋ Add a definition</p>'}</span></button>`).join('');
    }).join('') : `<p class="empty">${dcQ ? 'No terms match.' : 'No terms yet. Tap New term to add your first.'}</p>`;
}

function termForm(t) {
    const cats = [...new Set(Vault.getDictionaryTerms().map(x => x.category))].sort((a, b) => a.localeCompare(b));
    sheetBody.innerHTML = `<h1>${t ? 'Edit term' : 'New term'}</h1>
        <label for="f-name">TERM</label><input id="f-name" value="${esc(t ? t.name : '')}" placeholder="e.g. Flexbox" maxlength="80">
        <label for="f-cat">SKILL (CATEGORY)</label><input id="f-cat" value="${esc(t ? t.category : (dcCat !== 'All' ? dcCat : ''))}" placeholder="e.g. CSS" maxlength="40">
        <div class="picks">${cats.map(c => `<button type="button" data-pick="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <label for="f-def">DEFINITION</label><textarea id="f-def" placeholder="What does it mean?" maxlength="600">${esc(t ? t.definition : '')}</textarea>
        <div class="btns">${t ? '<button type="button" class="del" id="f-del">Delete</button>' : ''}<button type="button" class="save" id="f-save">Save</button></div>`;
    sheet.hidden = false;
    sheetBody.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => { document.getElementById('f-cat').value = b.dataset.pick; }; });
    document.getElementById(t && !t.definition ? 'f-def' : 'f-name').focus();
    document.getElementById('f-save').onclick = () => {
        const name = document.getElementById('f-name').value.trim();
        const category = document.getElementById('f-cat').value.trim() || 'General';
        const definition = document.getElementById('f-def').value.trim();
        if (!name) { Toast.show('Give the term a name first.', 'negative'); return; }
        if (t) Vault.updateDictionaryTerm(t.id, { name, category, definition });
        else Toast.show(`📖 Added "${Vault.addDictionaryTerm({ name, category, definition }).name}"`, 'positive');
        closeSheet(); renderDict();
    };
    const del = document.getElementById('f-del');
    if (del) {
        let armed = false;
        del.onclick = () => {
            if (!armed) { armed = true; del.textContent = 'Tap again'; setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 2500); return; }
            Vault.removeDictionaryTerm(t.id); closeSheet(); renderDict();
        };
    }
}

// A quest's "Related Terms" link opens dictionary.html?term=<id>.
function highlightTermFromURL() {
    const id = new URLSearchParams(window.location.search).get('term');
    const el = id && document.querySelector(`.term[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2000);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    Waggle.setActions(baseWaggleActions());
    const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('dictionary');
    document.getElementById('dictionary-not-installed').hidden = installed;
    document.getElementById('dc-main').hidden = !installed;
    if (!installed) return;
    renderDict();
    highlightTermFromURL();
    document.getElementById('dc-chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; dcCat = b.dataset.cat; renderDict(); });
    document.getElementById('dc-q').addEventListener('input', e => { dcQ = e.target.value.trim().toLowerCase(); renderDict(); });
    document.getElementById('dc-list').addEventListener('click', e => { const b = e.target.closest('.term'); if (b) termForm(Vault.getDictionaryTerms().find(t => t.id === b.dataset.id)); });
    document.getElementById('dc-new').addEventListener('click', () => termForm(null));
});
