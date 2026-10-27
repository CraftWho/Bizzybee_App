// Projects plugin (Oct 27 2026, approved demo): a gallery of your builds.
// Live sites get a small preview, code links go to GitHub, and projects
// that only live on your computer get a "Copy path" button (a website
// can't open your files). Saved in state.profile.projects, the same list
// the Profile page shows.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let pjF = 'All', pjQ = '';
const sheet = document.getElementById('pj-sheet');
const sheetBody = document.getElementById('pj-sheet-body');
const closeSheet = () => { sheet.hidden = true; };
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

const url = (u) => !u ? '' : /^https?:\/\//i.test(u) ? u : `https://${u}`;
const repoUrl = (r) => !r ? '' : /^https?:\/\//i.test(r) ? r : `https://github.com/${r.replace(/^github\.com\//i, '')}`;
// Never preview this app inside itself (it would boot a second copy).
const canPreview = (u) => { try { const x = new URL(url(u)); return x.protocol === 'https:' && x.origin !== location.origin; } catch { return false; } };
const kind = (p) => p.liveLink ? 'live' : p.localPath ? 'local' : 'code';

function render() {
    const all = Vault.getProjects();
    const tags = [...new Set(all.flatMap(p => p.tech || []))].sort((a, b) => a.localeCompare(b));
    const filters = ['All', 'Live', 'Local', ...tags];
    if (!filters.includes(pjF)) pjF = 'All';
    document.getElementById('pj-stats').innerHTML = `<span>${all.length} project${all.length === 1 ? '' : 's'}</span><span style="color:var(--green)">● ${all.filter(p => p.liveLink).length} live</span><span>${all.filter(p => !p.liveLink && p.localPath).length} local only</span>`;
    document.getElementById('pj-chips').innerHTML = filters.map(f => `<button type="button" data-f="${esc(f)}" aria-pressed="${f === pjF}">${esc(f)}</button>`).join('');
    const shown = all.filter(p => (pjF === 'All' || (pjF === 'Live' && p.liveLink) || (pjF === 'Local' && !p.liveLink && p.localPath) || (p.tech || []).includes(pjF))
        && (!pjQ || `${p.name} ${p.description || ''} ${(p.tech || []).join(' ')}`.toLowerCase().includes(pjQ)))
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    document.getElementById('pj-grid').innerHTML = shown.map(p => `<div class="p">
        <div class="shot">${esc(p.emoji || '🛠️')}${p.liveLink && canPreview(p.liveLink) ? `<iframe src="${esc(url(p.liveLink))}" loading="lazy" tabindex="-1" aria-hidden="true" sandbox="allow-scripts allow-same-origin"></iframe>` : ''}
            <span class="badge ${kind(p)}">${p.liveLink ? '● LIVE' : p.localPath ? 'LOCAL' : 'CODE ONLY'}</span>${p.pinned ? '<span class="pin">📌</span>' : ''}
            <button type="button" class="more" data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">⋯</button></div>
        <div class="body"><b>${esc(p.emoji || '🛠️')} ${esc(p.name)}</b><p>${esc(p.description || p.status || '')}</p>${(p.tech || []).length ? `<div class="tags">${p.tech.map(t => `<i>#${esc(t)}</i>`).join('')}</div>` : ''}</div>
        <div class="acts">${p.liveLink ? `<a class="go" href="${esc(url(p.liveLink))}" target="_blank" rel="noopener">Open ↗</a>` : p.localPath ? `<button type="button" data-copy="${esc(p.id)}">📁 Copy path</button>` : ''}${p.repoLink ? `<a href="${esc(repoUrl(p.repoLink))}" target="_blank" rel="noopener">Code</a>` : ''}</div>
    </div>`).join('') + (shown.length || !pjQ ? '' : '<p class="empty">No projects match.</p>') + '<button type="button" class="add" id="pj-add">＋ Add project</button>';
}

function form(p) {
    sheetBody.innerHTML = `<h1>${p ? 'Edit project' : 'New project'}</h1>
        <div class="two"><div><label for="f-emoji">ICON</label><input id="f-emoji" value="${esc(p ? p.emoji : '🛠️')}" maxlength="4"></div>
        <div><label for="f-name">NAME</label><input id="f-name" value="${esc(p ? p.name : '')}" placeholder="e.g. Business Card" maxlength="60"></div></div>
        <label for="f-desc">ABOUT</label><textarea id="f-desc" maxlength="200" placeholder="One line about it">${esc(p ? p.description || '' : '')}</textarea>
        <label for="f-live">LIVE LINK</label><input id="f-live" value="${esc(p ? p.liveLink || '' : '')}" placeholder="e.g. my-site.netlify.app" inputmode="url">
        <label for="f-repo">CODE (GITHUB)</label><input id="f-repo" value="${esc(p ? p.repoLink || '' : '')}" placeholder="e.g. CraftWho/Business-card">
        <label for="f-local">FOLDER ON YOUR COMPUTER</label><input id="f-local" value="${esc(p ? p.localPath || '' : '')}" placeholder="e.g. C:\\Users\\me\\Desktop\\Projects\\Site">
        <label for="f-tags">TAGS</label><input id="f-tags" value="${esc(p ? (p.tech || []).join(', ') : '')}" placeholder="e.g. HTML, CSS, Game">
        <div class="btns">${p ? `<button type="button" class="del" id="f-del">Delete</button><button type="button" class="pinb" id="f-pin">${p.pinned ? 'Unpin' : '📌 Pin'}</button>` : ''}<button type="button" class="save" id="f-save">Save</button></div>`;
    sheet.hidden = false;
    document.getElementById('f-name').focus();
    document.getElementById('f-save').onclick = () => {
        const name = document.getElementById('f-name').value.trim();
        if (!name) { document.getElementById('f-name').focus(); return; }
        Vault.saveProject({ id: p && p.id, name, emoji: document.getElementById('f-emoji').value, description: document.getElementById('f-desc').value,
            liveLink: document.getElementById('f-live').value, repoLink: document.getElementById('f-repo').value, localPath: document.getElementById('f-local').value,
            tech: document.getElementById('f-tags').value.split(',') });
        closeSheet(); render(); Toast.show(`🛠️ ${p ? 'Saved' : 'Added'} ${name}.`, 'positive');
    };
    if (p) {
        document.getElementById('f-del').onclick = () => { if (!confirm(`Delete "${p.name}"?`)) return; Vault.deleteProject(p.id); closeSheet(); render(); };
        document.getElementById('f-pin').onclick = () => { Vault.toggleProjectPin(p.id); closeSheet(); render(); };
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    if (typeof Waggle !== 'undefined' && typeof baseWaggleActions === 'function') Waggle.setActions(baseWaggleActions());
    const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('projects');
    document.getElementById('projects-not-installed').hidden = installed;
    document.getElementById('pj-main').hidden = !installed;
    if (!installed) return;
    render();
    document.getElementById('pj-chips').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { pjF = b.dataset.f; render(); } });
    document.getElementById('pj-q').addEventListener('input', e => { pjQ = e.target.value.trim().toLowerCase(); render(); });
    document.getElementById('pj-grid').addEventListener('click', async e => {
        const all = Vault.getProjects();
        const ed = e.target.closest('[data-edit]');
        if (ed) { form(all.find(p => p.id === ed.dataset.edit)); return; }
        const cp = e.target.closest('[data-copy]');
        if (cp) {
            const p = all.find(x => x.id === cp.dataset.copy);
            try { await navigator.clipboard.writeText(p.localPath); cp.textContent = '✓ Copied'; }
            catch { prompt('Copy this path:', p.localPath); }
            return;
        }
        if (e.target.closest('#pj-add')) form(null);
    });
});
