console.log("/// PLUGIN HUB PROTOCOLS INITIALIZED ///");

// Plugins & Packs (Oct 2026, approved demo). Switch on = a pop-up asks to
// download, then the files go into this device's storage (Packs). Switch
// off = a pop-up asks to delete them. Plugins also turn on/off in the save.
const escPH = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtKB = (kb) => kb >= 1000 ? `${(kb / 1000).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
const busy = {};      // id -> progress 0..1 while downloading
const stored = {};    // id -> downloaded?

function isOn(item) {
    return item.kind === 'plugin' ? Plugins.isEnabled(item.id) && stored[item.id] : stored[item.id];
}

function rowHTML(item) {
    const entry = item.kind === 'plugin' ? Plugins.getEntry(item.id) : null;
    const desc = item.description || (entry && entry.description) || '';
    const on = isOn(item);
    const enabledOnly = item.kind === 'plugin' && Plugins.isEnabled(item.id) && !stored[item.id];
    const b = busy[item.id];
    const state = b !== undefined ? '' : on ? '<span class="state dl">· DOWNLOADED</span>' : enabledOnly ? '<span class="state off">· ON, NOT SAVED HERE</span>' : '<span class="state off">· NOT DOWNLOADED</span>';
    const href = item.kind === 'plugin' ? `../../plugins/${item.id}/${item.id}.html` : item.id === 'bee3d' ? '../models/models.html#model3d' : '';
    return `<div class="pl${on ? ' on' : ''}" id="${item.id}"><div class="hx" aria-hidden="true">${item.icon}</div>
        <div class="mid"><b>${escPH(item.label)}</b><small>${escPH(desc)}</small>
            <span class="size${item.hd ? ' hd' : ''}">${item.hd ? 'HD · ' : ''}${item.kb >= 1000 ? 'about ' : ''}${fmtKB(item.kb)}</span> ${state}
            ${b !== undefined ? `<div class="prog" role="progressbar" aria-label="Downloading" aria-valuenow="${Math.round(b * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.round(b * 100)}%"></i></div>` : ''}
            ${(on || enabledOnly) && href ? `<br><a href="${href}">Open →</a>` : ''}</div>
        <button type="button" class="sw" role="switch" aria-checked="${on || enabledOnly}" aria-label="${escPH(item.label)}" data-id="${item.id}"${b !== undefined ? ' disabled' : ''}></button></div>`;
}

async function renderHub() {
    await Promise.all(Packs.list().map(async p => { stored[p.id] = await Packs.isDownloaded(p.id); }));
    document.getElementById('ph-plugins').innerHTML = Packs.list('plugin').map(rowHTML).join('');
    document.getElementById('ph-packs').innerHTML = Packs.list('pack').map(rowHTML).join('');
    document.getElementById('ph-soon').innerHTML = Plugins.getCatalog().filter(e => e.status !== 'available').map(e =>
        `<div class="pl soon"><div class="hx" aria-hidden="true">${e.icon}</div><div class="mid"><b>${escPH(e.label)}</b><small>${escPH(e.description)}</small></div><span class="tag">SOON</span></div>`).join('');
    let used = 0;
    for (const p of Packs.list()) if (stored[p.id]) used += (await Packs.storedBytes(p.id)) / 1000;
    const all = Packs.list().reduce((n, p) => n + p.kb, 0);
    const left = Packs.list().filter(p => !stored[p.id]).reduce((n, p) => n + p.kb, 0);
    document.getElementById('ph-used').textContent = used ? fmtKB(used) : '0 KB';
    document.getElementById('ph-usedbar').style.width = `${Math.min(100, used / all * 100)}%`;
    document.getElementById('ph-usedsub').textContent = left ? `About ${fmtKB(left)} more available to download.` : 'Everything is downloaded.';
}

function confirmPack(item, download) {
    return new Promise(resolve => {
        const modal = document.getElementById('ph-modal');
        const size = `${item.kb >= 1000 ? 'about ' : ''}${fmtKB(item.kb)}`;
        modal.innerHTML = `<div class="box${download ? '' : ' del'}" role="dialog" aria-modal="true" aria-labelledby="ph-mt" aria-describedby="ph-md">
            <div class="hx" aria-hidden="true">${download ? '⬇️' : '🗑️'}</div>
            <h3 id="ph-mt">${download ? 'Download' : 'Delete'} ${escPH(item.label)}?</h3>
            <p id="ph-md">${download ? `This downloads <b>${size}</b> to this device. Best on Wi-Fi.` : `This frees <b>${size}</b> on this device${item.kind === 'plugin' ? ' and hides it from your menu' : ''}. Your saved progress stays. You can download it again anytime.`}</p>
            <div class="row2"><button type="button" class="btn" data-a="no">Cancel</button><button type="button" class="btn ${download ? 'solid' : 'danger'}" data-a="yes">${download ? 'Download' : 'Delete'}</button></div></div>`;
        modal.hidden = false;
        const last = document.activeElement;
        modal.querySelector('[data-a=yes]').focus();
        const done = (ok) => { modal.hidden = true; modal.onclick = null; document.removeEventListener('keydown', onKey); if (last) last.focus(); resolve(ok); };
        const onKey = (e) => { if (e.key === 'Escape') done(false); };
        document.addEventListener('keydown', onKey);
        modal.onclick = (e) => {
            const a = e.target.closest('[data-a]');
            if (a) done(a.dataset.a === 'yes'); else if (e.target === modal) done(false);
        };
    });
}

async function onSwitch(id) {
    const item = Packs.get(id);
    if (!item || busy[id] !== undefined) return;
    const enabledOnly = item.kind === 'plugin' && Plugins.isEnabled(id) && !stored[id];
    const turningOn = !isOn(item) && !enabledOnly;
    if (!(await confirmPack(item, turningOn))) return;
    if (turningOn) {
        busy[id] = 0; renderHub();
        try {
            await Packs.download(id, (p) => { busy[id] = p; const bar = document.querySelector(`#${id} .prog i`); if (bar) bar.style.width = `${Math.round(p * 100)}%`; });
            if (item.kind === 'plugin' && !Plugins.isEnabled(id)) Plugins.toggle(id);
            Toast.show(`${item.icon} ${item.label} downloaded!`, 'positive');
        } catch (error) {
            Toast.show(`Download failed: ${error.message}`, 'negative');
        }
        delete busy[id];
    } else {
        await Packs.remove(id);
        if (item.kind === 'plugin' && Plugins.isEnabled(id)) Plugins.toggle(id);
        Toast.show(`${item.icon} ${item.label} deleted from this device.`, 'neutral');
    }
    await renderHub();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    Waggle.setActions(baseWaggleActions());
    document.querySelector('.phv2').addEventListener('click', (e) => {
        const sw = e.target.closest('.sw');
        if (sw && !sw.disabled) onSwitch(sw.dataset.id);
    });
    await renderHub();
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target) { target.scrollIntoView({ block: 'center' }); target.classList.add('flash'); }
});
