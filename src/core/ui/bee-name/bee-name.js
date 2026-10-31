// Bee name editor (Oct 2026): a text box, a 🎲 random-name button and Save.
// Used on the Pollination Chamber reveal, the Hive Bees sheet and the
// Hive Life comb pop-ups. BeeName.mount(el, bee, { onSaved, compact }).
const BeeName = {
    mount(el, bee, { onSaved = null, compact = false, label = 'Name' } = {}) {
        if (!el || !bee) return;
        const id = 'bn-' + String(bee.id).replace(/[^a-z0-9_-]/gi, '');
        const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        el.innerHTML = `<div class="bn${compact ? ' bn--compact' : ''}">
            ${compact ? '' : `<label class="bn-lbl" for="${id}">${esc(label)}</label>`}
            <div class="bn-line">
                <input class="bn-in" id="${id}" type="text" maxlength="40" value="${esc(bee.name)}" aria-label="Name for this bee" autocomplete="off">
                <button type="button" class="bn-dice" aria-label="Random name" title="Random name">🎲</button>
                <button type="button" class="bn-save">Save</button>
            </div></div>`;
        const input = el.querySelector('.bn-in');
        const save = () => {
            const next = input.value.trim();
            if (!next) { input.focus(); return; }
            if (next === bee.name) { if (onSaved) onSaved(bee, false); return; }
            const r = Vault.renameBee(bee.id, next);
            if (typeof Toast !== 'undefined') Toast.show(r ? `✏️ Renamed to ${r.name}.` : "Couldn't rename that bee.", r ? 'positive' : 'negative');
            if (r) { bee.name = r.name; if (onSaved) onSaved(r, true); }
        };
        el.querySelector('.bn-dice').addEventListener('click', (e) => {
            e.stopPropagation();
            const taken = Vault.getHiveBees().map(b => b.name).concat(input.value);
            input.value = typeof randomBeeName === 'function' ? randomBeeName(taken) : input.value;
            input.focus();
        });
        el.querySelector('.bn-save').addEventListener('click', (e) => { e.stopPropagation(); save(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        input.addEventListener('click', (e) => e.stopPropagation());
    }
};
