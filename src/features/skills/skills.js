// Skills page (Oct 29 2026, approved demos): a honeycomb of skills. Tap a
// cell for its stats, Level up (Vault.levelUpSkill) and its own path of
// milestones (Vault.getSkillPath), which replaced the separate skill tree.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtH = (h) => h < 10 ? (+h.toFixed(1)).toString() : Math.round(h).toLocaleString();

const sheet = document.getElementById('sk-sheet');
const sheetBody = document.getElementById('sk-sheet-body');
function openSheet(html) { sheetBody.innerHTML = html; sheet.hidden = false; const b = sheetBody.querySelector('button'); if (b) b.focus({ preventScroll: true }); }
function closeSheet() { sheet.hidden = true; }
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

// Honeycomb (Oct 29 2026, approved demo): each skill is a hex cell in its own
// color with a bar inside. Tap a cell for real vs estimated time, XP, how it
// counts, recent check-offs, Level up and Merge. Rows go 3-2-3.
const fmtM = (m) => m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} m` : `${m / 60} h`) : `${Math.round(m)} m`;
function renderMastery() {
    const matrix = Vault.getSkillMatrix();
    const host = document.getElementById('sk-mastery');
    document.getElementById('sk-count').textContent = matrix.length;
    if (!matrix.length) { host.innerHTML = '<p class="sk-empty">No skills yet. Finish a task that mentions one (like "Wake up on time" or "Study HTML"), or add a tag.</p>'; return; }
    const cells = matrix.map(m => `<button type="button" class="sk-cell${m.maxed ? ' ready' : ''}" data-skill="${esc(m.category)}" style="--c:${m.color}"
            aria-label="${esc(m.category)}, level ${m.level}${Vault.skillPathWaiting(m.category, m) ? ', reward waiting' : ''}${m.maxed ? ', ready to level up' : `, ${Math.round(m.percentage)}% to next`}">
        ${Vault.skillPathWaiting(m.category, m) ? '<span class="dot" aria-hidden="true"></span>' : ''}<span class="rim"></span><span class="core"><span class="ic">${m.icon}</span><span class="nm">${esc(m.category)}</span>
        <span class="lv">LV ${m.level}${m.maxed ? ' ⬆' : ''}</span><span class="bar"><i style="width:${m.percentage}%"></i></span>
        <span class="st">${m.measure === 'times' ? `✔ ${m.count}×` : `${fmtH(m.realHours)} h real`}</span></span></button>`);
    cells.push('<button type="button" class="sk-cell add" data-addskill aria-label="How to add a skill"><span class="rim"></span><span class="core"><span class="ic">＋</span><span class="nm">Add skill</span></span></button>');
    const rows = [];
    for (let i = 0, r = 0; i < cells.length; r++) {
        const n = r % 2 ? 2 : 3, row = cells.slice(i, i + n);
        while (row.length < n) row.push('<span class="sk-cell gap" aria-hidden="true"></span>');   // keeps the comb lined up
        rows.push(row); i += n;
    }
    host.innerHTML = `<div class="sk-comb">${rows.map(c => `<div class="sk-crow">${c.join('')}</div>`).join('')}</div>`;
}

function recentFor(cat) {
    const S = Vault.state;
    return computeSkillContributions(S.dailyTasks, S.dictionary, S.quests, S.habits, S.todos)
        .filter(c => c.category === cat && c.source !== 'history')
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 6);
}
function pathHtml(m) {
    const P = Vault.getSkillPath(m.category, m), times = P.measure === 'times';
    const unit = (v) => times ? `${v} time${v === 1 ? '' : 's'}` : `${v} h`;
    const cur = P.milestones.findIndex(x => !x.reached);
    const shown = times ? Math.floor(P.progress) : fmtH(P.progress);
    const rows = P.milestones.map((x, i) => {
        const prev = i ? P.milestones[i - 1].need : 0;
        const st = x.reached ? 'done' : i === cur ? 'now' : 'lock';
        const mp = x.reached ? 100 : i === cur ? Math.max(0, Math.min(100, (P.progress - prev) / Math.max(1e-9, x.need - prev) * 100)) : 0;
        const right = x.reached ? (x.claimed ? '<span class="sk-ok2" aria-label="Claimed">✓</span>' : `<button type="button" class="sk-claim" data-claim="${esc(x.id)}">Claim</button>`)
            : `<span class="sk-rw">${x.reward.icon} ${esc(x.reward.qty > 1 ? x.reward.qty + ' ' + x.reward.name : x.reward.name)}</span>`;
        return `<div class="sk-ms ${st}" style="--mp:${mp}%"><span class="sk-mhx">${x.icon}</span><span class="sk-mtx"><b>${esc(x.name)}</b>
            <small>${x.reached ? `Reached · ${unit(x.need)}` : i === cur ? `${shown} / ${unit(x.need)}` : unit(x.need)}</small>${i === cur ? '<span class="sk-mbar"><i></i></span>' : ''}</span>${right}</div>`;
    }).join('');
    return `<p><b>Path</b>${P.from ? ` <span class="sk-note">· from ${esc(P.from)}</span>` : ''}</p><div class="sk-path" style="--c:${m.color}">${rows}</div>
        <p class="sk-note">${times ? 'Milestones count check-offs.' : 'Milestones count hours, real and estimated.'} Switch "Counts by" and the path switches too.</p>`;
}
async function celebrateMilestone(r) {
    const loot = r.bees.map(bee => ({ bee }));
    if (r.reward.kind !== 'bee') loot.push({ icon: r.reward.icon, name: r.reward.name, qty: r.reward.qty, sub: r.reward.kind === 'tickets' ? 'Spend in the Pollination Chamber' : 'Material' });
    const title = `${r.milestone.name} reached!`;
    try { await AppShell.loadLevelBar(); } catch (e) { /* toast below */ }
    if (typeof LevelBar !== 'undefined') LevelBar.celebrate({ title, lines: [], rich: { cap: `${String(r.category).toUpperCase()} · PATH`, level: null, ribbon: 'MILESTONE', perks: [`${r.milestone.icon} ${r.milestone.name}`], loot, beeId: r.bees.length ? r.bees[0].id : null } });
    else Toast.show(`🏅 ${title}`, 'positive');
}
function openSkill(cat) {
    const m = Vault.getSkillMatrix().find(x => x.category === cat);
    if (!m) return;
    const times = m.measure === 'times';
    const stats = times
        ? `<div><b>✔ ${m.count}</b><small>times done</small></div><div><b>${fmtH(m.realHours)} h</b><small>real time logged</small></div><div><b>${m.xp.toLocaleString()}</b><small>XP</small></div>`
        : `<div><b>${fmtH(m.realHours)} h</b><small>real</small></div><div><b>≈ ${fmtH(m.estHours)} h</b><small>estimated</small></div><div><b>${m.xp.toLocaleString()}</b><small>XP</small></div>`;
    const left = m.hoursCap - m.hoursIntoLevel;
    const cap = m.maxed ? `Level ${m.level + 1} is ready` : times ? `About ${Math.max(1, Math.ceil(left * 6))} more easy check-offs to level ${m.level + 1}` : `${fmtH(left)} h to level ${m.level + 1}`;
    const day = d => { if (!d) return ''; const k = String(d).slice(0, 10), t = new Date(); const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        if (k === iso(t)) return 'today'; t.setDate(t.getDate() - 1); if (k === iso(t)) return 'yesterday';
        return new Date(k + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric' }); };
    const hist = recentFor(cat).map(c => `<div><span>${esc(c.label)}</span><span>${c.real ? '⏱️ ' + fmtM(c.minutes) : times ? '✔' : '≈ ' + fmtM(c.minutes)}${c.date ? ' · ' + day(c.date) : ''}</span></div>`).join('');
    openSheet(`<div class="sk-head" style="--c:${m.color}"><span class="sk-hx lv" style="--c:${m.color}">${m.icon}</span><div><h1>${esc(cat)}</h1><small class="sk-lvtag">LV ${m.level} · ${esc(m.stage)} · ${times ? 'times done' : 'time spent'}</small></div></div>
        <div class="sk-bar sk-bar-own" style="--skc:${m.color}"><i style="width:${m.percentage}%"></i></div>
        <div class="sk-cap"><span>${cap}</span><span>${Math.round(m.percentage)}%</span></div>
        ${m.maxed ? `<button type="button" class="sk-lvl" data-cat="${esc(cat)}">⬆ Level up</button>` : ''}
        <div class="sk-stat3">${stats}</div>
        ${pathHtml(m)}
        <p class="sk-note">XP uses difficulty bonuses. Hours never do.</p>
        <p><b>Counts by</b></p>
        <div class="sk-measure" style="--c:${m.color}"><button type="button" data-measure="time" class="${times ? '' : 'on'}">⏱️ Time spent</button><button type="button" data-measure="times" class="${times ? 'on' : ''}">✔ Times done</button></div>
        ${hist ? `<p><b>Recent</b></p><div class="sk-hist">${hist}</div>` : ''}
        <button type="button" class="sk-go sk-alt" data-merge="${esc(cat)}">Merge into another skill…</button>
        <button type="button" class="sk-go" data-close>Done</button>`);
    sheetBody.dataset.skill = cat;
}

function render() { renderMastery(); }

document.getElementById('sk-mastery').addEventListener('click', e => {
    const c = e.target.closest('[data-skill]');
    if (c) return openSkill(c.dataset.skill);
    if (e.target.closest('[data-addskill]')) Toast.show('Skills make themselves after 2 check-offs, like "Wake up on time". Or add a tag to a task.', 'info');
});
sheetBody.addEventListener('click', async e => {
    const m = e.target.closest('[data-measure]'), g = e.target.closest('[data-merge]'), l = e.target.closest('.sk-lvl'), c = e.target.closest('[data-claim]');
    const cat = sheetBody.dataset.skill;
    if (c && !c.disabled) {
        c.disabled = true;
        const r = Vault.claimSkillMilestone(cat, c.dataset.claim);
        render(); openSkill(cat);
        if (r) await celebrateMilestone(r);
        return;
    }
    if (m) { Vault.setSkillMeasure(cat, m.dataset.measure); render(); openSkill(cat); }
    else if (g) { sheet.hidden = true; SkillMerge.pick(g.dataset.merge); }
    else if (l && !l.disabled) { l.disabled = true; sheet.hidden = true; await AppShell.levelUpSkill(l.dataset.cat); render(); }
});
window.addEventListener('skills-changed', () => render());
window.addEventListener('skill-created', () => render());

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    render();
    window.addEventListener('time-logged', render);
    Waggle.setActions(baseWaggleActions());
});
