console.log("/// PROFILE PROTOCOLS INITIALIZED ///");

// Profile (Oct 2026 redesign, approved demo): who you are, your royal,
// stats, mastered skills (auto from hours), titles, what's in progress
// (quests + projects with links) and your service record. Account links
// live in Settings and the top-right menu now.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => { const t = new Date(String(d).length <= 10 ? d + 'T12:00' : d); return isNaN(t) ? String(d || '') : t.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); };
const safeUrl = (u) => /^https?:\/\//i.test(String(u || '')) ? u : null;

function materialDisplay(id) {
    const m = (typeof MATERIAL_CATALOG !== 'undefined' ? MATERIAL_CATALOG : []).find(x => x.id === id);
    return m ? `${m.icon} ${m.label}` : id;
}

function avatarSrc() {
    return Vault.getProfilePhoto ? Vault.getProfilePhoto() : null;
}

function renderHero() {
    const user = Vault.getUser(), bar = Vault.getCharacterLevelBar(), royal = Vault.getRoyalBee();
    const kind = royal && royal.royal === 'king' ? 'King' : 'Queen';
    const name = Vault.state.displayName || (royal && royal.name) || user.name;
    const photo = avatarSrc();
    document.getElementById('pf-hero').innerHTML = `<div class="prof">
        <div class="avatar"><img id="pf-avatar" src="${photo ? esc(photo) : '../../assets/images/me.jpg'}" alt=""></div>
        <div class="who"><span class="hi">Profile</span><b>${esc(name)}</b><span class="title">👑 ${kind} of the hive${user.title ? ` · ${esc(user.title)}` : ''}</span>
            <div class="lv"><span class="chip">${levelLabel(bar.level)}</span><div class="bar"><i style="width:${bar.percentage}%"></i></div></div>
            <small style="color:var(--muted);font-size:.72rem">${bar.xpIntoLevel.toLocaleString()}/${bar.cap.toLocaleString()} XP · ${user.totalXP.toLocaleString()} XP total (≈ ${Math.round(user.totalXP / 60)} h)</small>
            ${bar.maxed ? '<button type="button" class="lvup" id="pf-lvup">⬆ Level up</button>' : ''}</div></div>`;
    const img = document.getElementById('pf-avatar');
    img.onerror = () => { img.onerror = null; img.src = '../../assets/images/avatar-placeholder.svg'; };
    // Oct 27 2026: tap your picture to take a new one or pick one (camera /
    // Android photo picker; the camera is asked for only when you use it).
    img.style.cursor = 'pointer';
    img.title = 'Change photo';
    img.onclick = () => changePhoto();
}

function renderRoyal() {
    const royal = Vault.getRoyalBee();
    const kind = royal && royal.royal === 'king' ? 'King' : 'Queen';
    const el = document.getElementById('pf-royal');
    let art = '';
    if (typeof beeCardApplyTheme === 'function' && typeof beeCardArtHTML === 'function') {
        const tile = document.createElement('div'); tile.className = 'art bc-tile';
        const key = beeCardApplyTheme(tile, 'Royal', null);
        tile.innerHTML = beeCardArtHTML({ rarityKey: key, rivets: 2, royal: royal ? royal.royal : 'queen' });
        art = tile.outerHTML;
    }
    el.innerHTML = `${art}<div><b>Your ${kind}${royal && royal.name ? ` · ${esc(royal.name)}` : ''}</b><small>Founder of your hive · ${Vault.getHiveBees().length} bees</small><small style="color:var(--gold);margin-top:6px">Visit the hive →</small></div>`;
}

function activeDays(S) {
    const days = new Set();
    (S.dailyTasks || []).forEach(t => (t.completedDates || []).forEach(d => days.add(d)));
    (S.habits || []).forEach(h => (h.history || []).filter(x => x.direction === 'positive').forEach(x => days.add(x.date)));
    (S.todos || []).filter(t => t.completed && t.completedDate).forEach(t => days.add(String(t.completedDate).slice(0, 10)));
    (S.quests || []).forEach(q => (q.tasks || []).filter(t => t.completed && t.dateCompleted).forEach(t => days.add(localDayOf(t.dateCompleted))));   // Oct 31 2026 (Craft): local day
    return days.size;
}

function render() {
    const S = Vault.state;
    renderHero();
    renderRoyal();
    const tree = Vault.getSkillTree(), mastered = tree.filter(s => s.unlocked);
    (Vault.lastMastered || []).forEach(s => Toast.show(`🌿 Skill mastered: ${s.name}!`, 'positive'));
    const questsDone = (S.quests || []).filter(q => q.status === 'completed');
    document.getElementById('pf-tiles').innerHTML = `
        <div class="tile"><small>Bees</small><b>${Vault.getHiveBees().length}</b><span>in your hive</span></div>
        <div class="tile"><small>Quests done</small><b>${questsDone.length}</b><span>long-term goals</span></div>
        <div class="tile"><small>Skills</small><b>${mastered.length}/${tree.length}</b><span>mastered</span></div>
        <div class="tile"><small>Active days</small><b>${activeDays(S)}</b><span>days you got something done</span></div>`;
    document.getElementById('pf-skills').innerHTML = mastered.length
        ? mastered.map(s => `<span class="schip" title="Mastered ${esc(fmtDate(s.masteredAt))}">${s.icon} ${esc(s.name)}</span>`).join('')
        : '<p class="sub" style="margin:0">None yet - skills master themselves as your hours grow.</p>';
    const titles = S.titles || [];
    document.getElementById('pf-titles').innerHTML = titles.length
        ? titles.map(t => `<span class="schip title" title="${esc(t.ability || '')}">${esc(t.title)}</span>`).join('')
        : '<p class="sub" style="margin:0">No titles yet.</p>';

    const active = (S.quests || []).filter(q => q.status !== 'completed');
    const projects = ((S.profile || {}).projects || []).filter(p => p.name !== 'Your First Project');
    document.getElementById('pf-active').innerHTML = active.map(q => {
        const tasks = q.tasks || [], done = tasks.filter(t => t.completed).length, pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
        return `<a class="row" href="../quests/quest.html?id=${encodeURIComponent(q.id)}" style="color:inherit;text-decoration:none"><span class="hx">${pct}%</span><div class="mid"><b>${esc(q.title)}</b><small>${done}/${tasks.length} tasks${q.objective ? ` · ${esc(q.objective)}` : ''}</small><div class="bar"><i style="width:${pct}%"></i></div></div></a>`;
    }).join('') + projects.map(p => `<div class="row"><span class="hx">✦</span><div class="mid"><b>${esc(p.name)}</b><small>${esc(p.status || '')}</small>
            ${safeUrl(p.liveLink) ? `<a href="${esc(p.liveLink)}" target="_blank" rel="noopener">Live ↗</a>` : ''}${safeUrl(p.repoLink) ? `<a href="${esc(p.repoLink)}" target="_blank" rel="noopener">Code ↗</a>` : ''}</div></div>`).join('')
        || '<p class="sub" style="margin:0">Nothing in progress.</p>';

    const record = [
        ...questsDone.map(q => ({ date: q.dateCompleted || '', html: `<b>${esc(q.title)}</b><small>Quest completed${q.dateCompleted ? ' · ' + esc(fmtDate(q.dateCompleted)) : ''}</small>` })),
        ...((S.profile || {}).serviceRecord || []).filter(r => r && r.date !== '—').map(r => typeof r === 'string'
            ? { date: '', html: `<b>${esc(r)}</b>` }
            : { date: r.date || '', html: `<b>${esc(r.note)}</b>${r.date ? `<small>${esc(fmtDate(r.date))}</small>` : ''}` })
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const row = r => `<div class="row"><span class="hx">★</span><div class="mid">${r.html}</div></div>`;
    document.getElementById('pf-record').innerHTML = record.length
        ? record.slice(0, 8).map(row).join('') + (record.length > 8 ? `<details class="more"><summary>Show all ${record.length}</summary>${record.slice(8).map(row).join('')}</details>` : '')
        : '<p class="sub" style="margin:0">Your finished quests and milestones show up here.</p>';
}

const sheet = document.getElementById('pf-sheet');
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.hidden = true; });

document.addEventListener('click', e => {
    if (!e.target.closest('#pf-lvup')) return;
    const r = Vault.levelUpCharacterBar();
    if (!r) { render(); return; }
    const lines = [];
    (r.awardedBees || []).forEach(b => lines.push(`🐝 ${esc(b.name)} joined your hive`));
    if (r.ticketsGranted) lines.push(`🎟️ +${r.ticketsGranted} ticket${r.ticketsGranted === 1 ? '' : 's'}`);
    (r.awardedMaterials || []).forEach(id => lines.push(`${esc(materialDisplay(id))} +1`));
    document.getElementById('pf-sheet-body').innerHTML = `<div class="pf-burst">${r.newLevel}</div><h3>You reached level ${r.newLevel}!</h3><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul><button type="button" data-close>Collect</button>`;
    sheet.hidden = false;
    render();
});

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    render();
    Waggle.setActions(baseWaggleActions());
});

function changePhoto() {
    if (typeof BizzyPhone === 'undefined' || typeof Vault.setProfilePhoto !== 'function') return;
    const s = document.createElement('div');
    s.className = 'pm-scrim';
    s.innerHTML = `<div class="pm-sheet" role="dialog" aria-modal="true" aria-label="Change photo"><div class="pm-hex">🖼️</div><h2>CHANGE PHOTO</h2>
        <p>Take a new picture or pick one. Only that photo is used.</p>
        <div class="pm-btns"><button type="button" class="pm-btn" data-src="camera">📷 Take photo</button><button type="button" class="pm-btn" data-src="photos">🖼️ Choose photo</button></div>
        <div class="pm-btns"><button type="button" class="pm-btn" data-src="cancel">Cancel</button></div></div>`;
    s.addEventListener('click', async e => {
        const b = e.target.closest('[data-src]');
        if (e.target !== s && !b) return;
        s.remove();
        if (!b || b.dataset.src === 'cancel') return;
        const url = await BizzyPhone.Photo.pick(b.dataset.src);
        if (!url) return;
        Vault.setProfilePhoto(url);
        renderHero();
        Toast.show('📸 New profile photo saved.', 'positive');
    });
    document.body.appendChild(s);
}
