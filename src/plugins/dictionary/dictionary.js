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
    const shown = terms.filter(t => (dcCat === 'All' || t.category === dcCat) && (!dcQ || `${t.name} ${t.full || ''} ${t.definition} ${t.category}`.toLowerCase().includes(dcQ)));
    const groups = dcCat === 'All' ? cats : [dcCat];
    document.getElementById('dc-list').innerHTML = shown.length ? groups.map(c => {
        const list = shown.filter(t => t.category === c).sort((a, b) => a.name.localeCompare(b.name));
        if (!list.length) return '';
        const m = matrix[c];
        return `<h2 class="sec">${esc(c)}${m ? ` · Lv ${m.level} · ${m.hours < 10 ? m.hours.toFixed(1) : Math.round(m.hours)} h` : ''}</h2>` + list.map(t => `
            <button type="button" class="term" data-id="${esc(t.id)}"><span class="hx">${esc(t.name.replace(/^</, '').slice(0, 2).toUpperCase())}</span>
                <span class="body"><span class="row1"><b>${esc(t.name)}</b><span class="cat">${esc(t.category)}</span>${t.code ? '<span class="cd">&lt;/&gt;</span>' : ''}</span>${t.definition ? `<p>${esc(t.definition)}</p>` : '<p class="def-missing">＋ Add a definition</p>'}</span></button>`).join('');
    }).join('') : `<p class="empty">${dcQ ? 'No terms match.' : 'No terms yet. Tap New term to add your first.'}</p>`;
}

// Links (Oct 28 2026). MDN text is CC-BY-SA, so a filled term keeps a
// credit line. W3Schools doesn't allow copying, so it's a link only.
const mdnSearch = (q) => `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(q)}`;
// Oct 30 2026 (Craft): open the W3Schools page itself, not a Google results
// list. DuckDuckGo's "\" search jumps straight to the top result on that site.
// The term's category (e.g. JavaScript, CSS) is added so the right page wins.
const w3Search = (q, cat) => `https://duckduckgo.com/?q=${encodeURIComponent(`\\ site:w3schools.com ${cat && !/general|other/i.test(cat) ? cat + ' ' : ''}${q}`)}`;
const safeUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

// Best effort: MDN's public search API, from your own browser. If it can't
// be reached we open MDN's search page instead.
async function fillFromMDN(q) {
    const r = await fetch(`https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(q)}&locale=en-US&size=3`);
    if (!r.ok) throw new Error('search');
    const doc = ((await r.json()).documents || [])[0];
    if (!doc) return null;
    const out = { title: doc.title, definition: doc.summary || '', mdnUrl: `https://developer.mozilla.org${doc.mdn_url}` };
    try {
        const page = await fetch(`https://developer.mozilla.org${doc.mdn_url}/index.json`);
        if (page.ok) {
            const html = ((await page.json()).doc?.body || []).map(b => b.value?.content || '').join('');
            const pre = new DOMParser().parseFromString(html, 'text/html').querySelector('pre');
            if (pre) out.code = pre.textContent.trim().slice(0, 4000);
        }
    } catch { /* code is optional */ }
    return out;
}

function termView(t) {
    const mdn = safeUrl(t.mdnUrl), w3 = safeUrl(t.w3Url), img = safeUrl(t.image);
    sheetBody.innerHTML = `<div class="tv-head"><h1>${esc(t.name)}</h1><span class="cat">${esc(t.category)}</span></div>
        ${t.full ? `<p class="tv-full">${esc(t.full)}</p>` : ''}
        <label>MEANING</label>${t.definition ? `<p class="tv-def">${esc(t.definition)}</p>` : '<p class="tv-def def-missing">No meaning yet. Tap Edit to add one.</p>'}
        ${img ? `<img class="tv-img" src="${esc(img)}" alt="${esc(t.name)}" loading="lazy" onerror="this.remove()">` : ''}
        ${t.code ? `<label>CODE</label><div class="tv-code"><button type="button" class="tv-copy">Copy</button><pre><code>${esc(t.code)}</code></pre></div>` : ''}
        ${t.examples?.length ? `<label>EXAMPLES</label><ul class="tv-ex">${t.examples.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <label>LEARN MORE</label>
        <div class="tv-links"><a href="${esc(mdn || mdnSearch(t.name))}" target="_blank" rel="noopener">MDN ↗</a><a href="${esc(w3 || w3Search(t.name, t.category))}" target="_blank" rel="noopener">W3Schools ↗</a></div>
        ${t.source === 'mdn' && mdn ? `<p class="tv-credit">Meaning${t.code ? ' and code' : ''} from <a href="${esc(mdn)}" target="_blank" rel="noopener">"${esc(t.name)}"</a> by Mozilla Contributors, <a href="https://creativecommons.org/licenses/by-sa/2.5/" target="_blank" rel="noopener">CC-BY-SA 2.5</a>.</p>` : ''}
        <div class="btns"><button type="button" class="del" id="tv-close">Close</button><button type="button" class="save" id="tv-edit">Edit</button></div>`;
    sheet.hidden = false;
    const copy = sheetBody.querySelector('.tv-copy');
    if (copy) copy.onclick = () => navigator.clipboard?.writeText(t.code).then(() => { copy.textContent = 'Copied ✓'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); }).catch(() => Toast.show('Copy failed.', 'negative'));
    document.getElementById('tv-close').onclick = closeSheet;
    document.getElementById('tv-edit').onclick = () => termForm(t);
}

function termForm(t) {
    const cats = [...new Set(Vault.getDictionaryTerms().map(x => x.category))].sort((a, b) => a.localeCompare(b));
    let source = t?.source || '';
    sheetBody.innerHTML = `<h1>${t ? 'Edit term' : 'New term'}</h1>
        <label for="f-name">TERM</label><input id="f-name" value="${esc(t ? t.name : '')}" placeholder="e.g. Flexbox" maxlength="80">
        <label for="f-full">FULL TERM <small>optional</small></label><input id="f-full" value="${esc(t?.full || '')}" placeholder="e.g. CSS Flexible Box Layout" maxlength="160">
        <label for="f-cat">SKILL (CATEGORY)</label><input id="f-cat" value="${esc(t ? t.category : (dcCat !== 'All' ? dcCat : ''))}" placeholder="e.g. CSS" maxlength="40">
        <div class="picks">${cats.map(c => `<button type="button" data-pick="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <label for="f-def">MEANING</label><textarea id="f-def" placeholder="What does it mean?" maxlength="600">${esc(t ? t.definition : '')}</textarea>
        <button type="button" class="fill" id="f-mdn">📥 Fill from MDN</button>
        <label for="f-code">CODE <small>optional</small></label><textarea id="f-code" class="mono" placeholder="display: flex;" maxlength="4000">${esc(t?.code || '')}</textarea>
        <label for="f-ex">EXAMPLES <small>one per line</small></label><textarea id="f-ex" placeholder="Center a button in a card" maxlength="1200">${esc((t?.examples || []).join('\n'))}</textarea>
        <label for="f-img">PICTURE LINK <small>optional</small></label><input id="f-img" value="${esc(t?.image || '')}" placeholder="https://..." inputmode="url">
        <label for="f-mdnurl">MDN LINK</label><input id="f-mdnurl" value="${esc(t?.mdnUrl || '')}" placeholder="Blank = MDN search" inputmode="url">
        <label for="f-w3">W3SCHOOLS LINK</label><input id="f-w3" value="${esc(t?.w3Url || '')}" placeholder="Blank = W3Schools search" inputmode="url">
        <div class="btns">${t ? '<button type="button" class="del" id="f-del">Delete</button>' : ''}<button type="button" class="save" id="f-save">Save</button></div>`;
    sheet.hidden = false;
    const $f = (id) => document.getElementById(id);
    sheetBody.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => { $f('f-cat').value = b.dataset.pick; }; });
    $f(t && !t.definition ? 'f-def' : 'f-name').focus();
    $f('f-mdn').onclick = async () => {
        const q = $f('f-name').value.trim();
        if (!q) { Toast.show('Type the term first.', 'negative'); return; }
        const btn = $f('f-mdn'); btn.disabled = true; btn.textContent = 'Looking up…';
        try {
            const got = await fillFromMDN(`${$f('f-cat').value.trim()} ${q}`.trim()) || await fillFromMDN(q);
            if (!got) { Toast.show(`MDN has no page for "${q}".`, 'neutral'); return; }
            if (got.definition) $f('f-def').value = got.definition;
            if (got.code && !$f('f-code').value.trim()) $f('f-code').value = got.code;
            if (!$f('f-full').value.trim() && got.title && got.title.toLowerCase() !== q.toLowerCase()) $f('f-full').value = got.title;
            $f('f-mdnurl').value = got.mdnUrl;
            source = 'mdn';
            Toast.show('📥 Filled from MDN. A credit line is added.', 'positive');
        } catch {
            Toast.show("Couldn't reach MDN from here. Opening its search.", 'neutral');
            window.open(mdnSearch(q), '_blank', 'noopener');
        } finally { btn.disabled = false; btn.textContent = '📥 Fill from MDN'; }
    };
    $f('f-save').onclick = () => {
        const name = $f('f-name').value.trim();
        if (!name) { Toast.show('Give the term a name first.', 'negative'); return; }
        const links = ['f-img', 'f-mdnurl', 'f-w3'].map(id => $f(id).value.trim());
        if (links.some(u => u && !safeUrl(u))) { Toast.show('Links must start with https://', 'negative'); return; }
        const data = {
            name, category: $f('f-cat').value.trim() || 'General', definition: $f('f-def').value.trim(),
            full: $f('f-full').value, code: $f('f-code').value, examples: $f('f-ex').value,
            image: links[0], mdnUrl: links[1], w3Url: links[2], source: links[1] ? source : '',
        };
        let saved;
        if (t) saved = Vault.updateDictionaryTerm(t.id, data);
        else { saved = Vault.addDictionaryTerm(data); Toast.show(`📖 Added "${saved.name}"`, 'positive'); }
        renderDict();
        if (saved) termView(saved); else closeSheet();
    };
    const del = $f('f-del');
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
    document.getElementById('dc-list').addEventListener('click', e => { const b = e.target.closest('.term'); if (!b) return; const t = Vault.getDictionaryTerms().find(x => x.id === b.dataset.id); if (t) (t.definition ? termView(t) : termForm(t)); });
    document.getElementById('dc-new').addEventListener('click', () => termForm(null));
});
