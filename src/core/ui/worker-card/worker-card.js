// WorkerCard (Nov 1 2026, Craft; from 1.0.7, approved demo). One small
// rectangle for a bee at work: face, name, rarity, job, power, and health /
// stamina / fullness bars. The scores live in db.js (beeJobScore, combPower)
// so auto-manage uses the same numbers.
//   WorkerCard.html(bee, { job, effect, action, label, leader, note, extra, actClass })
//   WorkerCard.state(bee) -> 'faint' | 'sick' | 'ready' | 'rest' | 'hungry' | 'worn' | 'work' | 'idle'
//   WorkerCard.bestJob(bee, jobs) -> { j, s } or null
// Nov 17 2026 (Craft; approved demo): the card's color says how the bee is doing.
const WorkerCard = (() => {
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const score = (bee, job) => beeJobScore(bee, job);
    function bestJob(bee, jobs) {
        const ok = jobs.filter(j => BEE_CLASSES[j] && !!BEE_CLASSES[j].maleOnly === (bee.sex === 'm'));
        return ok.map(j => ({ j, s: score(bee, j) })).sort((a, b) => b.s - a.s)[0] || null;
    }
    function state(bee) {
        const L = bee.life || {};
        if (L.faintedAt) return 'faint';
        if (L.nursery || L.sickUntil || (typeof RESCUE_BELOW !== 'undefined' && L.health < RESCUE_BELOW)) return 'sick';
        if (typeof Vault !== 'undefined' && Vault.beeIsReady && Vault.beeIsReady(bee)) return 'ready';
        if (L.recuperate || (L.stamina != null && L.stamina < 10)) return 'rest';
        if (typeof CAFE !== 'undefined' && L.fullness < CAFE.below) return 'hungry';
        if (L.fatigue >= 80 || L.stamina < 30) return 'worn';
        return bee.class ? 'work' : 'idle';
    }
    function html(bee, { job = bee.class, effect = '', action = '', label = '', leader = false, note = '', extra = '', actClass = '' } = {}) {
        const info = job && BEE_CLASSES[job];
        const f = typeof beeFeeling === 'function' ? beeFeeling(bee) : { face: '🙂' };
        const L = bee.life || {};
        const st = state(bee);
        const bar = (v, c) => `<i style="--v:${Math.round(v ?? 0)}%;--c:${c}"></i>`;
        return `<div class="wk-card r-${esc(bee.rarity)} st-${st}" data-bee="${esc(bee.id)}">
            <button type="button" class="wk-face" data-card="${esc(bee.id)}" aria-label="Open ${esc(bee.name)}">${f.face}</button>
            <div class="wk-mid"><b>${esc(bee.name)}${bee.sex === 'm' ? ' ♂' : ''}</b>
                <small><span class="wk-r">${esc(bee.rarity)}</span>${info ? ` · ${info.icon} ${esc(info.label)}` : ''}${bee.talent && bee.talent === job ? ' ⭐' : ''}${info ? ` · power ${score(bee, job)}` : ''}${leader ? ' · <span class="wk-lead">🎖 Leader</span>' : ''}</small>
                <span class="wk-bars" aria-label="Health ${Math.round(L.health ?? 0)}, stamina ${Math.round(L.stamina ?? 0)}, fullness ${Math.round(L.fullness ?? 0)}">${bar(L.health, '#5fd38a')}${bar(L.stamina, '#5aa9ff')}${bar(L.fullness, '#ffcc00')}</span>
                ${note || (st !== 'work' && st !== 'idle') ? `<small class="wk-why">${note || esc(f.why || '')}</small>` : ''}
                ${effect ? `<small class="wk-eff">${effect}</small>` : ''}</div>
            ${extra}${action ? `<button type="button" class="wk-act${actClass ? ' ' + actClass : ''}" data-wk="${esc(action)}" data-job="${esc(job || '')}" data-bee="${esc(bee.id)}">${esc(label)}</button>` : ''}
        </div>`;
    }
    return { score, bestJob, html, state };
})();
