// Bee Care (Nov 2026, Craft; approved demo). Eve's bubble opens this page.
// Real bee cards at a small size, what each bee needs, and the fixes:
// a smart Heal / Eat / Rest button (Vault.sendBeeToNeed), a Job picker,
// Rest, and Combine, which has its own page (../combine/combine.html).
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let filter = new URLSearchParams(location.search).get('show') === 'all' ? 'all' : 'help';

function rarityColor(r) { const i = BEE_RARITIES.find(x => x.rarity === r); return i ? i.color : '#aaaaaa'; }
function toast(m, t = 'positive') { if (typeof Toast !== 'undefined') Toast.show(m, t); }
function careBees() {
    return Vault.getHiveBees().filter(b => b.rarity !== 'Royal' && b.life && !beeIsBrood(b));
}
function bar(label, v, color) {
    v = Math.round(Math.max(0, Math.min(100, v || 0)));
    return `<div><span>${label}</span><i><b style="width:${v}%;background:${color}"></b></i><em>${v}</em></div>`;
}
function jobText(b) {
    const j = b.class && BEE_CLASSES[b.class];
    if (b.life.nursery) return '🛏️ In the Nursery';
    if (b.life.recuperate) return '💤 Resting';
    return j ? `${j.icon} ${j.label}` : 'No job';
}
function fixLabel(b) {
    const n = Vault.beeNeed(b);
    return n === 'nursery' ? '🛏️ Heal' : n === 'cafe' ? '🍽️ Eat' : '😴 Rest';
}
function beeHTML(b) {
    const L = b.life, needs = beeNeeds(b), mood = beeMood(b, 0);
    const col = rarityColor(b.rarity);
    const chips = needs.length ? needs.map(n => `<span class="bc-chip bad">${esc(n.need)} · ${esc(n.value)}</span>`).join('') : '<span class="bc-chip ok">✓ Doing fine</span>';
    const fainted = !!L.faintedAt;
    const canFix = needs.some(n => n.need !== 'No job' && n.need !== 'Unhappy' && n.need !== 'Fainted');
    const locked = beeLockedJob(b);
    const showRest = !(canFix && fixLabel(b) === '😴 Rest') && !L.recuperate;
    return `<section class="bc-bee ${needs.length ? 'is-bad' : ''}" data-id="${esc(b.id)}">
        <div class="bc-card-wrap"><div class="bc-card" data-card></div><span class="bc-face" aria-hidden="true">${mood.face}</span></div>
        <div class="bc-info">
            <div class="bc-nm" style="color:${col}">${esc(b.name)}<span class="bc-tag">${esc(b.rarity)}</span></div>
            <div class="bc-chips">${chips}</div>
            <div class="bc-bars">
                ${bar('❤️ Health', L.health, '#5fd38a')}${bar('⚡ Stamina', L.stamina, '#5aa9ff')}${bar('🥱 Fatigue', L.fatigue || 0, '#ff8a3d')}${bar('🍯 Fullness', L.fullness, '#ffcc00')}${bar('😊 Happy', L.happiness, '#e58fff')}
            </div>
            <div class="bc-job">${mood.face} ${esc(mood.label)} · ${esc(jobText(b))}</div>
            <div class="bc-acts">
                ${fainted ? '<button type="button" class="btn solid" data-a="revive">💛 Revive</button>' : canFix ? `<button type="button" class="btn solid" data-a="fix">${fixLabel(b)}</button>` : ''}
                ${fainted ? '' : `<button type="button" class="btn" data-a="job"${locked ? ' disabled title="Its title sets its job"' : ''}>Job</button>${showRest ? `<button type="button" class="btn" data-a="rest"${locked ? ' disabled' : ''}>Rest</button>` : ''}`}
                <a class="btn" href="../combine/combine.html?a=${encodeURIComponent(b.id)}">🧬 Combine</a>
            </div>
        </div></section>`;
}
function render() {
    const all = careBees();
    const need = all.filter(b => beeNeeds(b).length);
    const lead = document.getElementById('bc-lead');
    lead.textContent = need.length ? `${need.length} bee${need.length === 1 ? '' : 's'} need${need.length === 1 ? 's' : ''} help. Fix them here.` : 'Everyone is doing fine.';
    const list = filter === 'help' ? need : all;
    const box = document.getElementById('bc-list');
    box.innerHTML = list.length ? list.map(beeHTML).join('') : `<p class="bc-empty">${filter === 'help' ? 'Nothing to fix. Nice.' : 'No bees yet.'}</p>`;
    box.querySelectorAll('.bc-bee').forEach(sec => {
        const b = all.find(x => x.id === sec.dataset.id);
        if (b) BeeCard.render(sec.querySelector('[data-card]').appendChild(document.createElement('div')), b, { editable: false });
    });
    document.querySelectorAll('#bc-filter .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.f === filter)));
}
function flash(id) { const s = document.querySelector(`.bc-bee[data-id="${CSS.escape(id)}"]`); if (s) s.classList.add('bc-fx'); }

function jobSheet(b) {
    const sex = b.sex === 'm';
    const cats = {};
    Object.entries(BEE_CLASSES).filter(([, j]) => !!j.maleOnly === sex).forEach(([k, j]) => { (cats[j.category || 'Other'] = cats[j.category || 'Other'] || []).push([k, j]); });
    const html = Object.entries(cats).map(([c, js]) => `<div class="bc-jcat">${esc(c)}</div>${js.map(([k, j]) => {
        let why = k === b.class ? 'Doing this now' : Vault.jobBlock(b, k);
        if (why && !Vault.hiveOpenJobs().includes(k)) { const l = Vault.hiveJobLadder().find(x => x.job === k); if (l) why = `🔒 Opens at level ${l.lv}`; }
        return `<button type="button" class="bc-job-btn" data-job="${k}"${why ? ' disabled' : ''}><span>${j.icon}</span><span><b>${esc(j.label)}</b><small>${esc(why || j.description)}</small></span></button>`;
    }).join('')}`).join('');
    const box = PV2.sheet(`<div class="head"><div><h2>Job for ${esc(b.name)}</h2><small>Now: ${esc(jobText(b))}</small></div><button type="button" class="x" data-close aria-label="Close">×</button></div><div class="bc-jobs">${html}</div>`, 'Pick a job');
    box.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-job]'); if (!btn || btn.disabled) return;
        const r = Vault.assignBeeClass(b.id, btn.dataset.job);
        PV2.close();
        if (!r) { toast(Vault.lastJobError || 'It can\'t take that job.', 'negative'); return; }
        toast(`${b.name} is now a ${BEE_CLASSES[btn.dataset.job].label}.`);
        render(); flash(b.id);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    render();
    document.getElementById('bc-filter').addEventListener('click', (e) => {
        const c = e.target.closest('[data-f]'); if (!c) return;
        filter = c.dataset.f; render();
    });
    document.getElementById('bc-list').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-a]'); if (!btn) return;
        const id = btn.closest('.bc-bee').dataset.id;
        const b = Vault.getHiveBees().find(x => x.id === id); if (!b) return;
        const a = btn.dataset.a;
        if (a === 'job') return jobSheet(b);
        if (a === 'fix') {
            const r = Vault.sendBeeToNeed(id);
            if (!r) { toast('Nothing to do right now.', 'negative'); return; }
            toast(r.to === 'nursery' ? `🛏️ ${b.name} went to a Nursery bed.` : r.to === 'cafe' ? `🍽️ ${b.name} ate a meal.` : `💤 ${b.name} is resting.${r.note ? ' ' + r.note : ''}`);
            render(); flash(id); return;
        }
        if (a === 'rest') {
            const r = Vault.assignBeeClass(id, 'recuperate');
            if (!r) { toast('It can\'t rest right now.', 'negative'); return; }
            toast(`💤 ${b.name} is resting.`); render(); flash(id); return;
        }
        if (a === 'revive') {
            const r = Vault.reviveBee(id);
            toast(r.ok ? `💛 ${b.name} was revived.` : r.error, r.ok ? 'positive' : 'negative');
            render(); return;
        }
    });
});
