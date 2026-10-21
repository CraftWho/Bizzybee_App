// Start My Day (Oct 2026, approved demo). On the first open of a new day,
// asks what you did YESTERDAY: unfinished dailies (with their checklists)
// and to-dos that were due yesterday. Checked ones count for yesterday.
// Then a "Streak savers" step shows what happened to each missed daily:
// a Guard Bee or Streak Charm kept the streak, or it was lost - and how
// much health your Queen lost. Data: Vault.getDayReview/finishDayReview.
// Loaded by app.js (AppShell.dayStart) on app pages only.
const DayStart = (() => {
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const HIT = { Trivial: 1, Easy: 2, Medium: 4, Hard: 7 };
    let scrim = null;

    function longDay(iso) {
        const d = new Date(`${iso}T12:00:00`);
        return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }

    function close() { if (scrim) { scrim.remove(); scrim = null; } document.body.classList.remove('ds-open'); }

    function open(review) {
        if (!review || scrim) return;
        const royal = typeof Vault.getRoyalBee === 'function' ? Vault.getRoyalBee() : null;
        const rawName = (Vault.state && Vault.state.displayName) || (royal && royal.name) || ((Vault.getUser() || {}).name) || '';
        const name = /^worker bee$/i.test(rawName) ? '' : rawName;
        const h = new Date().getHours();
        const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        const stock = [
            ...review.guards.map(g => `🛡️ ${esc(g.name)}: ${g.left} save${g.left === 1 ? '' : 's'} left`),
            review.charms ? `🎁 ${review.charms} Streak Charm${review.charms === 1 ? '' : 's'}` : ''
        ].filter(Boolean);
        const row = (kind, t) => {
            const subs = kind === 'daily' && t.checklist.length ? `<div class="ds-subs">${t.checklist.map(c => `<label><input type="checkbox" data-sub> ${esc(c.label)}</label>`).join('')}</div>` : '';
            const meta = kind === 'daily'
                ? `${t.streak > 0 ? `🔥 ${t.streak} streak at risk · ` : ''}−${HIT[t.difficulty] || 2} ❤️ if missed${t.checklist.length ? ` · checklist 0/${t.checklist.length}` : ''}`
                : 'was due yesterday';
            return `<div class="ds-item${kind === 'todo' ? ' is-todo' : ''}" data-kind="${kind}" data-id="${esc(t.id)}">
                <label><input type="checkbox" data-main aria-label="I did ${esc(t.label)} yesterday"><span><b>${esc(t.label)}</b><small>${meta}</small></span></label>${subs}</div>`;
        };
        scrim = document.createElement('div');
        scrim.className = 'ds-scrim';
        scrim.innerHTML = `<div class="ds-pop" role="dialog" aria-modal="true" aria-labelledby="ds-title">
            <div class="ds-step1">
                <div class="ds-sun" aria-hidden="true">🌅</div>
                <h2 id="ds-title">${hello.toUpperCase()}${name ? `, ${esc(name).toUpperCase()}` : ''}</h2>
                ${stock.length ? `<div class="ds-stock">${stock.map(s => `<span>${s}</span>`).join('')}</div>` : ''}
                <p class="ds-sub">Did you do any of these <b>yesterday</b> (${esc(longDay(review.yesterday))})? Check them and they count for yesterday.</p>
                ${review.dailies.length ? `<div class="ds-grp">Dailies due yesterday</div>${review.dailies.map(t => row('daily', t)).join('')}` : ''}
                ${review.todos.length ? `<div class="ds-grp">To-dos due yesterday</div>${review.todos.map(t => row('todo', t)).join('')}` : ''}
                <div class="ds-sum"><span data-count>0 checked</span></div>
                <button type="button" class="ds-go" data-go>START MY DAY</button>
                <button type="button" class="ds-skip" data-skip>I didn't do any of these</button>
            </div>
            <div class="ds-step2" hidden></div>
        </div>`;
        document.body.appendChild(scrim);
        document.body.classList.add('ds-open');
        const pop = scrim.firstElementChild;

        pop.querySelectorAll('.ds-item').forEach(it => {
            const main = it.querySelector('[data-main]');
            const subs = [...it.querySelectorAll('[data-sub]')];
            const meta = it.querySelector('small');
            const sync = () => {
                it.classList.toggle('on', main.checked);
                if (subs.length) meta.textContent = meta.textContent.replace(/checklist \d+\/\d+/, `checklist ${subs.filter(s => s.checked).length}/${subs.length}`);
                pop.querySelector('[data-count]').textContent = `${pop.querySelectorAll('.ds-item.on').length} checked`;
            };
            main.addEventListener('change', () => { subs.forEach(s => { s.checked = main.checked; }); sync(); });
            subs.forEach(s => s.addEventListener('change', () => { main.checked = subs.every(x => x.checked); sync(); }));
        });

        const finish = (none) => {
            const picked = (kind) => none ? [] : [...pop.querySelectorAll(`.ds-item.on[data-kind="${kind}"]`)].map(x => x.dataset.id);
            const result = Vault.finishDayReview({ doneDailyIds: picked('daily'), doneTodoIds: picked('todo') });
            showSaves(pop, result);
        };
        pop.querySelector('[data-go]').addEventListener('click', () => finish(false));
        pop.querySelector('[data-skip]').addEventListener('click', () => finish(true));
        const first = pop.querySelector('[data-main]');
        if (first) first.focus({ preventScroll: true });
    }

    function showSaves(pop, r) {
        if (!r.saves.length) {
            close();
            if (typeof Toast !== 'undefined') Toast.show(r.credited ? `✓ ${r.credited} counted for yesterday. Have a good day!` : '☀️ New day started.', 'positive');
            return;
        }
        const line = (s) => {
            if (s.by === 'guard') return `<div class="ds-save ok"><span>🛡️</span><div><b>${esc(s.label)}</b><small>${esc(s.guard)} the Guard Bee kept your ${s.streak}-day streak</small></div></div>`;
            if (s.by === 'charm') return `<div class="ds-save ok"><span>🎁</span><div><b>${esc(s.label)}</b><small>Streak Charm used · ${s.streak}-day streak kept</small></div></div>`;
            if (s.by === 'none') return `<div class="ds-save"><span>▫️</span><div><b>${esc(s.label)}</b><small>Missed · no streak to lose</small></div></div>`;
            return `<div class="ds-save lost"><span>💔</span><div><b>${esc(s.label)}</b><small>Streak lost (was ${s.streak})</small></div></div>`;
        };
        const step2 = pop.querySelector('.ds-step2');
        step2.innerHTML = `<div class="ds-sun" aria-hidden="true">🛡️</div><h2>STREAK SAVERS</h2>
            <p class="ds-sub">Dailies you missed yesterday, and what happened.</p>
            ${r.saves.map((s, i) => line(s).replace('class="ds-save', `style="animation-delay:${i * 0.25}s" class="ds-save`)).join('')}
            ${r.damage ? `<div class="ds-save lost ds-hp"><span>👑</span><div><b>Your Queen took −${r.damage} ❤️</b><small>${r.fainted ? '😵 She fainted! You lost some coins and this level\'s XP. Health is back to half.' : 'Saved streaks still count as missed for health. Finish tasks to heal.'}</small></div></div>` : ''}
            <button type="button" class="ds-go" data-done>START MY DAY</button>`;
        pop.querySelector('.ds-step1').hidden = true;
        step2.hidden = false;
        step2.querySelector('[data-done]').addEventListener('click', close);
        step2.querySelector('[data-done]').focus({ preventScroll: true });
    }

    return { open, close };
})();
