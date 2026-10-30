// WorkerCard (Oct 30 2026, Craft). One small rectangle for a bee at work,
// made once and used wherever bees are managed (Hive Life combs now; other
// pages can use it too). Also scores how good a bee is at a job, so lists
// can show the best bees first and the live % a bee would add to a comb.
//   WorkerCard.score(bee, job)          -> number (about 0-100)
//   WorkerCard.html(bee, { job, effect, action, label }) -> markup
//   WorkerCard.combPower(bees, jobs)    -> 0-100 % of a full team
const WorkerCard = (() => {
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const FULL_TEAM = 3;   // three good workers = 100%
    // Stat for the job (bee stats run ~20-100), +20% for its talent, less
    // if it's not well or tired. Capped at 100.
    function score(bee, job) {
        const info = typeof BEE_CLASSES !== 'undefined' && BEE_CLASSES[job];
        if (!bee || !info) return 0;
        let s = Number((bee.stats || {})[info.stat === 'hp' ? 'hp' : info.stat]) || 40;
        if (info.stat === 'hp') s = s / 3;   // hp runs ~3x the other stats
        if (bee.talent === job) s *= 1.2;
        const probs = typeof beeProblems === 'function' ? beeProblems(bee) : 0;
        if (probs) s *= probs >= 2 ? 0.7 : 0.85;
        const L = bee.life || {};
        if (L.stamina != null) s *= 0.6 + 0.4 * Math.min(1, L.stamina / 60);
        return Math.max(1, Math.min(100, Math.round(s)));
    }
    function bestJob(bee, jobs) {
        const ok = jobs.filter(j => BEE_CLASSES[j] && !!BEE_CLASSES[j].maleOnly === (bee.sex === 'm'));
        return ok.map(j => ({ j, s: score(bee, j) })).sort((a, b) => b.s - a.s)[0] || null;
    }
    function combPower(bees, jobs) {
        const total = bees.reduce((n, b) => n + (jobs.includes(b.class) ? score(b, b.class) : 0), 0);
        return Math.min(100, Math.round(total / (FULL_TEAM * 70) * 100));
    }
    function html(bee, { job = bee.class, effect = '', action = '', label = '' } = {}) {
        const info = job && BEE_CLASSES[job];
        const f = typeof beeFeeling === 'function' ? beeFeeling(bee) : { face: '🙂', why: '' };
        const L = bee.life || {};
        const bar = (v, c) => `<i style="--v:${Math.round(v ?? 0)}%;--c:${c}"></i>`;
        return `<div class="wk-card r-${esc(bee.rarity)}" data-bee="${esc(bee.id)}">
            <button type="button" class="wk-face" data-card="${esc(bee.id)}" aria-label="Open ${esc(bee.name)}">${f.face}</button>
            <div class="wk-mid"><b>${esc(bee.name)}${bee.sex === 'm' ? ' ♂' : ''}</b>
                <small><span class="wk-r">${esc(bee.rarity)}</span>${info ? ` · ${info.icon} ${esc(info.label)}` : ''}${bee.talent && bee.talent === job ? ' ⭐' : ''} · power ${score(bee, job)}</small>
                <span class="wk-bars" aria-label="Health ${Math.round(L.health ?? 0)}, stamina ${Math.round(L.stamina ?? 0)}, fullness ${Math.round(L.fullness ?? 0)}">${bar(L.health, '#5fd38a')}${bar(L.stamina, '#5aa9ff')}${bar(L.fullness, '#ffcc00')}</span>
                ${effect ? `<small class="wk-eff">${effect}</small>` : ''}</div>
            ${action ? `<button type="button" class="wk-act" data-wk="${esc(action)}" data-job="${esc(job || '')}" data-bee="${esc(bee.id)}">${esc(label)}</button>` : ''}
        </div>`;
    }
    return { score, bestJob, combPower, html, FULL_TEAM };
})();
