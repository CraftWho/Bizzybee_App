// Egg Incubator plugin (Oct 28 2026, approved demo). The rules live in
// db.js (INCUBATORS, Vault.getIncubator / buyIncubator / incubatorAdd ...).
// This page draws the machine with your real eggs, today's progress, the
// eggs waiting in the Nursery, and the incubator store.
const isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nurses = () => (typeof Vault._workers === 'function' ? Vault._workers('nurse').length : 0);
const daysLeft = (bee) => (typeof broodDaysLeft === 'function' ? broodDaysLeft(bee, todayISO(), nurses()) : 0);
const eggArt = (bee) => (typeof EggDesign !== 'undefined' ? EggDesign.forBee(bee) : '🥚');
const PERKS = (T) => [
    `${T.slots} egg slot${T.slots > 1 ? 's' : ''}`,
    `1 day off per ${T.goal.toLocaleString()} steps`,
    `Up to ${T.cap} days off a day`,
    T.full && T.happy ? 'Hatchlings start happy and full' : T.full ? 'Hatchlings start full (no hunger)' : null,
    T.trait ? `+${Math.round(T.trait * 100)}% birth trait chance` : null,
].filter(Boolean);

function render() {
    if (typeof Vault.incubatorTick === 'function' && Vault.incubatorTick()) Vault.save();
    const I = Vault.getIncubator();
    const T = I.info, d = I.today;
    $('ic-coins').textContent = I.coins.toLocaleString();
    $('ic-steps').textContent = isApp ? (Number(Vault.state.steps && Vault.state.steps[todayISO()]) || 0).toLocaleString() : '—';   // real steps even without an incubator
    $('ic-eggs').textContent = I.slots.length + I.waiting.length;

    // the machine
    $('ic-name').textContent = T ? T.label.toUpperCase() : 'NO INCUBATOR YET';
    $('ic-tier').textContent = T ? `${T.icon} TIER ${INCUBATOR_ORDER.indexOf(I.tier) + 1}` : '🔒 BUY ONE BELOW';
    const progress = !T ? 0 : d.off >= d.cap ? 1 : isApp ? (d.steps % T.goal) / T.goal : (d.dailies % INCUBATOR_DAILIES) / INCUBATOR_DAILIES;
    $('ic-machine').innerHTML = IncubatorArt.svg({ tier: I.tier, progress, eggs: I.slots.map(b => ({ bee: b, days: daysLeft(b) })) });

    // today
    const pct = Math.round(progress * 100);
    const ring = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="#2a2010" stroke-width="5"/><circle cx="20" cy="20" r="16" fill="none" stroke="${d.off >= d.cap && T ? '#3ddc84' : '#ffcc00'}" stroke-width="5" stroke-linecap="round" stroke-dasharray="100.5" stroke-dashoffset="${(100.5 * (1 - progress)).toFixed(1)}" transform="rotate(-90 20 20)"/><text x="20" y="24" text-anchor="middle" font-size="10" fill="#ffcc00" font-weight="800">${T ? `${d.off}/${d.cap}` : '–'}</text></svg>`;
    let text;
    if (!T) text = `<b>Get an incubator</b><small>Eggs take 7 days on their own. An incubator speeds them up with your steps.</small>`;
    else if (d.off >= d.cap) text = `<b class="ok">Done for today ✓</b><small>${d.cap} days off every egg inside. Come back tomorrow.</small>`;
    else if (isApp) text = `<b>${(d.steps || 0).toLocaleString()} steps today</b><small>${d.toNext.toLocaleString()} more steps for 1 day off every egg.</small><small>Or ${d.dailiesToNext} more finished ${d.dailiesToNext === 1 ? 'daily' : 'dailies'}.</small>`;
    else text = `<b>${d.dailies} ${d.dailies === 1 ? 'daily' : 'dailies'} done today</b><small>${d.dailiesToNext} more for 1 day off every egg.</small><small>The Android app adds your steps too.</small>`;
    $('ic-today').innerHTML = ring + `<div>${text}</div>`;

    renderSteps();

    // eggs waiting
    const free = T ? T.slots - I.slots.length : 0;
    $('ic-waiting').innerHTML = I.waiting.length ? I.waiting.map(b => {
        const n = daysLeft(b);
        return `<div class="ic-row"><span class="egg">${eggArt(b)}</span><span class="mid"><b>${esc(b.name)}</b><small>Mystery egg · hatches ${n <= 0 ? 'tonight' : n === 1 ? 'tomorrow' : `in ${n} days`}</small></span>
            <button type="button" class="ic-btn gold" data-add="${esc(b.id)}" ${free > 0 ? '' : 'disabled'}>${T ? (free > 0 ? 'Put in' : 'Full') : 'No incubator'}</button></div>`;
    }).join('') : `<p class="ic-empty">No eggs waiting. New bees from pulls and level-ups start as eggs.</p>`;

    // store
    $('ic-shop').innerHTML = INCUBATOR_ORDER.map(id => {
        const t = INCUBATORS[id], own = I.owned.includes(id), use = I.tier === id;
        const btn = use ? '<button type="button" class="ic-btn" disabled>In use</button>'
            : own ? `<button type="button" class="ic-btn" data-use="${id}">Use this one</button>`
            : `<button type="button" class="ic-btn gold" data-buy="${id}" ${I.coins >= t.price ? '' : 'disabled'}>${I.coins >= t.price ? 'Buy' : 'Not enough'}</button>`;
        return `<div class="ic-item${own ? ' owned' : ''}${use ? ' in-use' : ''}">${IncubatorArt.svg({ tier: id, mini: true, eggs: [] })}
            <div><h3 style="color:${id === 'royal' ? '#ff8fa3' : '#ffcc00'}">${t.icon} ${esc(t.label.toUpperCase())}</h3>
            <ul>${PERKS(t).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
            <div class="row"><span class="ic-price">${own ? '✓ Owned' : `🪙 ${t.price.toLocaleString()}`}</span>${btn}</div></div></div>`;
    }).join('');
}

// ---- Step stats (Nov 21 2026, Craft: approved Steps Page Demo) ----
const ST = { tab: '14', rows: 14, month: 0, open: new Set() };
const fmt = (n) => (Number(n) || 0).toLocaleString();
const hourName = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const dayName = (iso, o) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, o || { weekday: 'short', month: 'short', day: 'numeric' });
const short = (iso) => dayName(iso, { month: 'short', day: 'numeric' });
function hourBars(h, nowHour, cls) {
    const max = Math.max(1, ...h);
    return `<div class="${cls}">${h.map((v, i) => `<i class="${i > nowHour ? 'later' : v ? '' : 'none'}" style="height:${v ? Math.max(4, Math.round(v / max * 100)) : 2}%" title="${hourName(i)} · ${fmt(v)} steps"></i>`).join('')}</div>`;
}
function spanText(sp) {
    if (!sp) return '';
    return `Most steps ${hourName(sp.busy)}–${hourName((sp.busy + 1) % 24)} · first steps around ${hourName(sp.first)} · last around ${hourName(sp.last)}`;
}
function renderSteps() {
    if (typeof Vault.getStepPage !== 'function') return;
    const P = Vault.getStepPage(), T = P.today, today = todayISO(), nowH = new Date().getHours();
    const pct = Math.min(100, Math.round(T.steps / P.goal * 100));
    $('ic-strip').innerHTML = `<div class="ics-top"><b>👟 ${fmt(T.steps)}</b><span>of ${fmt(P.goal)} goal · 🔥 ${P.streak.cur}-day streak · +${T.xp} XP</span></div>
        <div class="ics-bar"><i style="width:${pct}%"></i></div>${isApp ? '' : '<small class="ics-web">Steps count in the Android app. This shows what it last saved.</small>'}`;

    // today: ring + numbers
    const C = 2 * Math.PI * 52, off = (C * (1 - pct / 100)).toFixed(1);
    const todayCard = `<section class="ics-card"><div class="ics-hero">
        <div class="ics-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg${T.hit ? ' hit' : ''}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off}"/></svg>
            <div><b>${fmt(T.steps)}</b><small>of ${fmt(P.goal)}</small></div></div>
        <div class="ics-nums"><p><span>🚶 Walked</span><b>${T.min} min</b></p><p><span>⚡ XP so far</span><b>+${T.xp} XP</b></p><p><span>🎯 To the goal</span><b>${T.hit ? 'Done ✓' : fmt(T.toGoal)}</b></p>
            <span class="ics-pill">🎁 ${T.hit ? 'Goal bonus earned' : `Goal bonus +${P.goalXP} XP and a prize`}</span></div></div></section>`;

    // today by hour
    let hours;
    if (T.hours && T.hours.some(v => v > 0)) {
        hours = `<section class="ics-card"><h3>Today by hour</h3><p class="ics-sub">Busiest: ${hourName(T.span.busy)}–${hourName((T.span.busy + 1) % 24)} · ${fmt(T.span.busySteps)} steps</p>
            ${hourBars(T.hours, nowH, 'ics-bars')}<div class="ics-axis"><span>12 AM</span><span>6 AM</span><span>Noon</span><span>6 PM</span><span>11 PM</span></div>
            ${T.span.src === 'snap' ? '<p class="ics-sub">Your step app only saves day totals, so BizzyBee counts the hours itself while it runs.</p>' : ''}</section>`;
    } else hours = `<section class="ics-card"><h3>Today by hour</h3><p class="ics-sub">${isApp ? 'Hours show up after your first steps sync today.' : 'Hours come from the Android app.'}</p></section>`;

    // streak + month calendar
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + ST.month);
    const y = base.getFullYear(), m = base.getMonth(), daysIn = new Date(y, m + 1, 0).getDate(), lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const byDay = {}; P.days.forEach(x => { byDay[x.day] = x; });
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<i class="blank"></i>';
    for (let d = 1; d <= daysIn; d++) {
        const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, x = byDay[k];
        const c = k > today ? 'future' : x && x.hit ? 'hit' : x && x.steps ? 'part' : '';
        cells += `<i class="${c}${k === today ? ' today' : ''}" title="${x ? fmt(x.steps) + ' steps' : ''}">${d}</i>`;
    }
    const oldest = P.records.since || today, canBack = `${y}-${String(m + 1).padStart(2, '0')}-01` > oldest;
    const streak = `<section class="ics-card"><h3>🔥 Streak</h3>
        <div class="ics-recs"><div><b>${P.streak.cur} day${P.streak.cur === 1 ? '' : 's'}</b><small>Current goal streak</small></div>
        <div><b>${P.streak.best} day${P.streak.best === 1 ? '' : 's'}</b><small>Best streak${P.streak.best ? ` · ${short(P.streak.bestFrom)}${P.streak.bestTo !== P.streak.bestFrom ? '–' + short(P.streak.bestTo) : ''}` : ''}</small></div></div>
        <div class="ics-month"><button type="button" class="ic-btn" data-st-mon="-1" ${canBack ? '' : 'disabled'} aria-label="Last month">‹</button><b>${base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button type="button" class="ic-btn" data-st-mon="1" ${ST.month < 0 ? '' : 'disabled'} aria-label="Next month">›</button></div>
        <div class="ics-dow"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
        <div class="ics-cal">${cells}</div><p class="ics-sub">Gold = goal hit · dim = some steps · green ring = today</p></section>`;

    // history
    const n = ST.tab === 'all' ? P.days.length : Number(ST.tab);
    const range = P.days.slice(0, n), chart = range.slice().reverse();
    let bars = chart;
    if (chart.length > 62) {   // all time: one bar per week
        const wk = {}; chart.forEach(x => { const dt = new Date(x.day + 'T12:00:00'); const mon = shiftISODate(x.day, -((dt.getDay() + 6) % 7)); (wk[mon] = wk[mon] || { day: mon, steps: 0, n: 0 }); wk[mon].steps += x.steps; wk[mon].n++; });
        bars = Object.values(wk).map(w => ({ day: w.day, steps: Math.round(w.steps / w.n), hit: w.steps / w.n >= P.goal }));
    }
    const maxB = Math.max(P.goal, ...bars.map(x => x.steps));
    const rows = range.slice(0, ST.rows).map(x => `<div class="ics-row${ST.open.has(x.day) ? ' open' : ''}" data-st-day="${x.day}" role="button" tabindex="0" aria-expanded="${ST.open.has(x.day)}">
        <b>${x.day === today ? 'Today' : dayName(x.day)}</b><span class="r">${fmt(x.steps)}</span>
        <small>🚶 ${x.min} min · +${x.xp} XP</small><small class="r ${x.hit ? 'ok' : ''}">${x.hit ? 'Goal ✓' : '—'}</small>
        <div class="ics-detail">${x.hours && x.hours.some(v => v > 0) ? `${spanText(x.span)}${hourBars(x.hours, x.day === today ? nowH : 23, 'ics-mini')}` : 'No hourly times for this day. Times are saved from Nov 21, 2026 on.'}</div></div>`).join('');
    const history = `<section class="ics-card"><h3>History</h3>
        <div class="ics-tabs">${[['14', '2 weeks'], ['30', 'Month'], ['all', 'All time']].map(([k, l]) => `<button type="button" data-st-tab="${k}" class="${ST.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="ics-bars short">${bars.map(x => `<i class="${x.steps >= P.goal ? '' : 'under'}" style="height:${Math.max(2, Math.round(x.steps / maxB * 100))}%" title="${short(x.day)} · ${fmt(x.steps)}"></i>`).join('')}</div>
        <div class="ics-axis"><span>${chart.length ? short(chart[0].day) : ''}${chart.length > 62 ? ' · weekly average' : ''}</span><span>Today</span></div>
        <div class="ics-list">${rows}</div>${range.length > ST.rows ? `<button type="button" class="ic-btn ics-more" data-st-more>Show more days</button>` : ''}</section>`;

    // records
    const R = P.records;
    const records = `<section class="ics-card"><h3>🏆 Records</h3><div class="ics-recs">
        <div><b>${R.bestDay.steps ? fmt(R.bestDay.steps) : '—'}</b><small>Best day${R.bestDay.steps ? ' · ' + short(R.bestDay.day) : ''}</small></div>
        <div><b>${R.bestWeek.steps ? fmt(R.bestWeek.steps) : '—'}</b><small>Best week${R.bestWeek.steps ? ` · week of ${short(R.bestWeek.from)}` : ''}</small></div>
        <div><b>${fmt(R.total)}</b><small>All steps · since ${short(R.since)}</small></div>
        <div><b>${R.minutes >= 60 ? Math.round(R.minutes / 60) + ' h' : R.minutes + ' min'}</b><small>Walking · +${fmt(R.xp)} XP · ${R.goalDays} goal day${R.goalDays === 1 ? '' : 's'}</small></div></div></section>`;

    // goal
    const goal = `<section class="ics-card"><h3>Daily goal</h3>
        <div class="ics-goal">${[6000, 8000, 10000, 12000].map(g => `<button type="button" data-goal="${g}" class="${P.goal === g ? 'on' : ''}">${fmt(g)}</button>`).join('')}</div>
        <div class="st-goal"><input type="number" id="st-goal" min="1000" max="50000" step="500" value="${P.goal}" aria-label="Daily step goal"><button type="button" class="ic-btn gold" data-setgoal>Set goal</button></div>
        <p class="ics-sub">Every ${P.perMin} steps = 1 minute of Fitness and Health = 1 XP (up to ${P.capMin} min a day). Hit the goal for +${P.goalXP} XP and a small prize. Double it for another prize.</p></section>`;

    $('ic-stepstats').innerHTML = todayCard + hours + streak + history + records + goal;
}

function sheet(bee) {
    const n = daysLeft(bee);
    $('ic-sheet-body').innerHTML = `<div class="egg">${eggArt(bee)}</div><h3>${esc(bee.name.toUpperCase())}</h3>
        <p>${n <= 0 ? 'Ready. It hatches tonight.' : `Hatches in ${n} day${n === 1 ? '' : 's'}. Walk or finish dailies to speed it up.`}<br>What's inside stays a secret until it hatches.</p>
        <div class="btns">${n <= 0 && Vault.isEggReady(bee) ? `<button type="button" class="ic-btn gold" data-hatch="${esc(bee.id)}">🐣 Hatch it</button>` : `<button type="button" class="ic-btn red" data-out="${esc(bee.id)}">Take it out</button>`}<button type="button" class="ic-btn${n <= 0 ? '' : ' gold'}" data-close>Close</button></div>`;
    $('ic-sheet').hidden = false;
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const installed = typeof Plugins === 'undefined' || Plugins.isEnabled('incubator');
    $('ic-not-installed').hidden = installed;
    $('ic-main').hidden = !installed;
    if (!installed) return;
    // Fresh steps first (Android app).
    if (isApp) {
        let tries = 0;
        const steps = async () => {
            if (typeof BizzyPhone === 'undefined') { if (++tries < 40) setTimeout(steps, 150); return; }
            await BizzyPhone.Steps.sync().catch(() => null);
            render();
        };
        steps();
    }
    render();

    document.body.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-st-tab]'), day = e.target.closest('[data-st-day]'), more = e.target.closest('[data-st-more]'), mon = e.target.closest('[data-st-mon]'), chip = e.target.closest('[data-goal]');
        if (tab) { ST.tab = tab.dataset.stTab; ST.rows = 14; renderSteps(); return; }
        if (day) { const k = day.dataset.stDay; ST.open.has(k) ? ST.open.delete(k) : ST.open.add(k); day.classList.toggle('open'); day.setAttribute('aria-expanded', day.classList.contains('open')); return; }
        if (more) { ST.rows += 30; renderSteps(); return; }
        if (mon) { ST.month += Number(mon.dataset.stMon); renderSteps(); return; }
        if (chip || e.target.closest('[data-setgoal]')) {
            const r = Vault.setStepGoal(chip ? chip.dataset.goal : document.getElementById('st-goal').value);
            Toast.show(r.ok ? `👟 Step goal: ${r.goal.toLocaleString()}` : r.error, r.ok ? 'positive' : 'negative');
            if (r.ok) { Vault.stepGoalTick(); Vault.save(); } render(); return;
        }
        const add = e.target.closest('[data-add]'), buy = e.target.closest('[data-buy]'), use = e.target.closest('[data-use]'), out = e.target.closest('[data-out]');
        if (add) {
            const r = Vault.incubatorAdd(add.dataset.add);
            Toast.show(r.ok ? '🥚 Egg is in the incubator. Keep walking.' : r.error, r.ok ? 'positive' : 'negative');
            render(); return;
        }
        if (buy) {
            const t = INCUBATORS[buy.dataset.buy];
            if (!confirm(`Buy the ${t.label} for ${t.price} Honey coins?`)) return;
            const r = Vault.buyIncubator(buy.dataset.buy);
            Toast.show(r.ok ? `${t.icon} ${t.label} is in your Nursery.` : r.error, r.ok ? 'positive' : 'negative');
            render(); if (r.ok) window.scrollTo({ top: 0, behavior: 'smooth' }); return;
        }
        if (use) { Vault.useIncubator(use.dataset.use); Toast.show(`${INCUBATORS[use.dataset.use].icon} Switched incubators.`, 'positive'); render(); return; }
        const hatch = e.target.closest('[data-hatch]');
        if (hatch) { $('ic-sheet').hidden = true; AppShell.hatch(hatch.dataset.hatch, render); return; }
        if (out) { Vault.incubatorRemove(out.dataset.out); $('ic-sheet').hidden = true; Toast.show('Egg moved back to the Nursery.', 'neutral'); render(); return; }
        if (e.target.closest('[data-close]') || e.target === $('ic-sheet')) { $('ic-sheet').hidden = true; return; }
        // Tap an egg in the machine.
        if (e.target.closest('#ic-machine')) {
            const I = Vault.getIncubator();
            if (!I.info) { document.getElementById('store').scrollIntoView({ behavior: 'smooth' }); return; }
            if (I.slots.length === 1) sheet(I.slots[0]);
            else if (I.slots.length > 1) {
                const box = $('ic-machine').getBoundingClientRect();
                const i = Math.min(I.slots.length - 1, Math.max(0, Math.floor((e.clientX - box.left) / box.width * I.info.slots)));
                if (I.slots[i]) sheet(I.slots[i]);
            }
        }
    });
    document.body.addEventListener('keydown', (e) => { const r = e.target.closest && e.target.closest('[data-st-day]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
    // Remember whether Step stats is open (this phone only). #steps opens it.
    const det = $('steps');
    let open = false; try { open = localStorage.getItem('bb_ic_stats_open') === '1'; } catch { /* fine */ }
    if (location.hash === '#steps') open = true;
    det.open = open;
    det.addEventListener('toggle', () => { try { localStorage.setItem('bb_ic_stats_open', det.open ? '1' : '0'); } catch { /* fine */ } });
    window.addEventListener('vault-saved', () => render());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
    if (typeof Waggle !== 'undefined' && typeof baseWaggleActions === 'function') Waggle.setActions(baseWaggleActions());
});
