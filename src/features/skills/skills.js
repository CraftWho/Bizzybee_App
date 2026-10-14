console.log("/// SKILL TREE PROTOCOLS INITIALIZED ///");

// Skills page (Oct 2026 redesign, approved demo). Two parts:
//  - Skill tree: nodes master themselves from real hours (Vault.getSkillTree)
//  - Mastery: each skill's hours, stage and level; Level Up hands out the
//    rewards (Vault.levelUpSkill: material every level, tickets every 5th,
//    a bee for a new stage).
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtH = (h) => h < 10 ? (+h.toFixed(1)).toString() : Math.round(h).toLocaleString();
const PILL = { mastered: 'MASTERED', progress: 'IN PROGRESS', locked: 'LOCKED' };

const sheet = document.getElementById('sk-sheet');
const sheetBody = document.getElementById('sk-sheet-body');
function openSheet(html) { sheetBody.innerHTML = html; sheet.hidden = false; const b = sheetBody.querySelector('button'); if (b) b.focus({ preventScroll: true }); }
function closeSheet() { sheet.hidden = true; }
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

function needText(s) {
    return s.needSkills ? `${s.needHours} h of ${s.needSkills[0]}` : `${s.needHours} h of practice`;
}

function renderTree() {
    const tree = Vault.getSkillTree();
    (Vault.lastMastered || []).forEach(s => Toast.show(`🌿 Skill mastered: ${s.name}!`, 'positive'));
    document.getElementById('sk-count').textContent = `${tree.filter(s => s.unlocked).length}/${tree.length}`;
    const root = tree.find(s => s.parentId === null);
    const node = (s, depth) => {
        const pct = Math.min(100, s.progressHours / Math.max(1, s.needHours) * 100);
        const kids = tree.filter(c => c.parentId === s.id);
        return `<button type="button" class="sk-node" data-id="${s.id}" data-depth="${depth}"><span class="sk-hx ${s.status}">${s.icon}</span>
            <span class="sk-txt"><b>${esc(s.name)}</b><small>${s.status === 'mastered' ? 'Mastered' : `${fmtH(s.progressHours)} / ${needText(s)}`}</small>
            ${s.status === 'progress' ? `<span class="sk-mini"><i style="width:${pct}%"></i></span>` : ''}</span><span class="sk-pill ${s.status}">${PILL[s.status]}</span></button>`
            + kids.map(k => node(k, depth + 1)).join('');
    };
    document.getElementById('sk-tree').innerHTML = `
        <button type="button" class="sk-root" data-id="${root.id}"><span class="sk-hx ${root.status}">${root.icon}</span><span><b>${esc(root.name)}</b><small>${root.status === 'mastered' ? 'Mastered' : `${fmtH(root.progressHours)} / ${needText(root)}`}</small></span></button>
        ${tree.filter(s => s.parentId === root.id).map(b => `<div class="sk-branch">${node(b, 1)}</div>`).join('')}`;
}

function renderMastery() {
    const matrix = Vault.getSkillMatrix();
    document.getElementById('sk-mastery').innerHTML = matrix.length ? matrix.map(m => `
        <div class="sk-mrow"><span class="sk-hx lv" style="--c:${m.stageColor}">${m.level}</span>
            <div class="sk-mid"><div class="sk-mtop"><b>${esc(m.category)} <span class="sk-stage" style="--sc:${m.stageColor}">${m.stage}</span></b><span class="sk-h">${fmtH(m.hours)} h</span></div>
                <div class="sk-bar" role="img" aria-label="Level ${m.level}: ${Math.round(m.percentage)}%"><i style="width:${m.percentage}%"></i></div>
                <small>${m.maxed ? `Ready for level ${m.level + 1}` : `${fmtH(m.hoursCap - m.hoursIntoLevel)} h to level ${m.level + 1}`}${m.nextStage ? ` · ${fmtH(m.hoursToNextStage)} h to ${m.nextStage}` : ''}</small></div>
            ${m.maxed ? `<button type="button" class="sk-lvl" data-cat="${esc(m.category)}">⬆ Level up</button>` : ''}</div>`).join('')
        : '<p class="sk-empty">No skill hours yet. Finish a task that mentions a skill (like HTML), or tag one.</p>';
}

function render() { renderTree(); renderMastery(); }

document.getElementById('sk-tree').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const tree = Vault.getSkillTree();
    const s = tree.find(x => x.id === b.dataset.id);
    const parent = tree.find(p => p.id === s.parentId);
    const pct = Math.min(100, s.progressHours / Math.max(1, s.needHours) * 100);
    openSheet(`<div class="sk-head"><span class="sk-hx ${s.status}">${s.icon}</span><h1>${esc(s.name)}</h1></div>
        <p>${esc(s.description)}</p>
        <p><b>Needs:</b> ${needText(s)}${parent ? `, after ${esc(parent.name)}` : ''}.</p>
        ${s.status === 'mastered' ? `<p class="sk-ok">🌿 Mastered ${new Date(s.masteredAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}.</p>`
        : s.status === 'progress' ? `<div class="sk-bar"><i style="width:${pct}%"></i></div><p>${fmtH(s.progressHours)} of ${s.needHours} h so far.</p>`
        : `<p>🔒 Master <b>${esc(parent ? parent.name : 'its parent')}</b> first.</p>`}
        <button type="button" class="sk-go" data-close>OK</button>`);
});

document.getElementById('sk-mastery').addEventListener('click', async e => {
    const b = e.target.closest('.sk-lvl');
    if (!b || b.disabled) return;
    b.disabled = true;
    const r = await Vault.levelUpSkill(b.dataset.cat);
    if (!r) { render(); return; }
    const mat = (id) => { const m = (typeof MATERIAL_CATALOG !== 'undefined' ? MATERIAL_CATALOG : []).find(x => x.id === id); return m ? `${m.icon} ${m.label}` : id; };
    const loot = [
        ...(r.materials || []).map(id => `<div><b>${mat(id).split(' ')[0]}</b>${esc(mat(id).split(' ').slice(1).join(' '))}</div>`),
        r.pollen ? `<div><b>🌼</b>${r.pollen} pollen</div>` : '',
        r.bonusMaterialId ? `<div><b>${mat(r.bonusMaterialId).split(' ')[0]}</b>bonus</div>` : '',
        r.ticketsGranted ? `<div><b>🎟️</b>${r.ticketsGranted} ticket${r.ticketsGranted > 1 ? 's' : ''}</div>` : '',
        ...(r.bees || []).map(bee => `<div><b>🐝</b>${esc(bee.name)}</div>`)
    ].join('');
    openSheet(`<div class="sk-reward"><div class="sk-burst">${r.newLevel}</div>
        <h1>${esc(r.category)} reached level ${r.newLevel}${r.stageUp ? ` · ${esc(r.stage)}!` : '!'}</h1>
        ${r.stageUp ? `<p>New stage: <b>${esc(r.stage)}</b></p>` : ''}
        <div class="sk-loot">${loot}</div>
        <button type="button" class="sk-go" data-close>Collect</button></div>`);
    render();
});

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    render();
    window.addEventListener('time-logged', render);
    Waggle.setActions(baseWaggleActions());
});
