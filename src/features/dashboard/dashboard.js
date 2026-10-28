console.log("/// DASHBOARD ONLINE ///");

// Dashboard (Oct 2026 redesign, approved "Dashboard v2" demo).
//  - tiles: total XP, level (with hours), best streak, quests
//  - Skill mastery: hours per skill on the road to 10,000, stage, pace
//  - XP per day (14 days), Today, Streaks
// Everything is computed live from your save (db.js), XP = time.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayKey = (v) => String(v || '').slice(0, 10);
const fmtH = (h) => h < 10 ? (+h.toFixed(1)).toString() : Math.round(h).toLocaleString();
const GOAL_H = 10000;
const SOURCE_NAMES = { daily: 'Dailies', habit: 'Habits', todo: 'To-Dos', quest: 'Quests', history: 'Codex history' };

// XP earned per day, from the same sources (and minutes) as your total XP.
function xpByDay(S) {
    const m = {};
    const add = (date, xp) => { if (date) m[dayKey(date)] = (m[dayKey(date)] || 0) + (Number(xp) || 0); };
    (S.dailyTasks || []).forEach(t => { const log = t.minutesLog || {}; (t.completedDates || []).forEach(d => add(d, completionXP(t, log[d]))); });
    (S.habits || []).forEach(h => (h.history || []).forEach(x => add(x.date, x.direction === 'positive' ? completionXP(h, x.minutes) : -habitPenaltyXP(h))));
    (S.todos || []).filter(t => t.completed).forEach(t => add(t.completedDate, completionXP(t, t.minutesSpent)));
    (S.quests || []).forEach(q => (q.tasks || []).filter(t => t.completed).forEach(t => add(t.dateCompleted, completionXP(t, t.minutesSpent))));
    return m;
}

function renderTiles(S) {
    const user = Vault.getUser(), bar = Vault.getCharacterLevelBar();
    const dailies = Vault.getDailyTasks();
    const best = dailies.reduce((a, d) => Math.max(a, d.streak || 0), 0);
    const questsDone = (S.quests || []).filter(q => q.status === 'completed').length;
    const hoursLeft = Math.max(0, (bar.cap - bar.xpIntoLevel) / 60);
    document.getElementById('db-tiles').innerHTML = `
        <div class="tile hero"><small>Total XP</small><b>${user.totalXP.toLocaleString()}</b><span>≈ ${fmtH(user.totalXP / 60)} h of work</span></div>
        <div class="tile"><small>${bar.level > LEVEL_CAP ? 'Prestige Tier' : 'Level'}</small><b>${bar.level > LEVEL_CAP ? bar.level - LEVEL_CAP : bar.level}</b><div class="bar"><i style="width:${bar.percentage}%"></i></div><span>${bar.maxed ? 'Ready - claim it on Home' : `~${fmtH(hoursLeft)} h to ${levelName(bar.level + 1)}`}</span></div>
        <div class="tile"><small>Best streak</small><b>${best}</b><span>days in a row</span></div>
        <div class="tile"><small>Quests done</small><b>${questsDone}</b><span>${(S.quests || []).length - questsDone} in progress</span></div>`;
}

function renderChart(m) {
    const daysList = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); daysList.push({ d, xp: Math.max(0, m[isoLocal(d)] || m[d.toISOString().slice(0, 10)] || 0) }); }
    const total = daysList.reduce((a, x) => a + x.xp, 0), max = Math.max(...daysList.map(x => x.xp), 1);
    document.getElementById('db-total').textContent = `${total.toLocaleString()} XP`;
    document.getElementById('db-avg').textContent = `${Math.round(total / 14)} a day on average`;
    const W = 340, H = 150, top = 18, gap = 2, bw = (W - gap * 13) / 14;
    const nice = Math.ceil(max * 1.2 / 50) * 50, y = (v) => top + (H - top) * (1 - v / nice);
    const maxIdx = daysList.reduce((bi, x, i, a) => x.xp > a[bi].xp ? i : bi, 0);
    let svg = `<svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="XP earned per day, last 14 days"><g class="grid">${[0.5, 1].map(f => `<line x1="0" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}"/>`).join('')}</g>`;
    svg += `<text x="${W}" y="${y(nice) - 4}" text-anchor="end">${nice}</text>`;
    daysList.forEach((x, i) => {
        const bx = i * (bw + gap), h = Math.max(0, H - y(x.xp)), isToday = i === 13;
        if (x.xp > 0) svg += `<path class="b" d="M${bx},${H} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${Math.max(0, h - 4)} z" fill="${isToday ? 'var(--gold)' : 'var(--bar)'}"/>`;
        if ((i === maxIdx || isToday) && x.xp > 0) svg += `<text class="lab" x="${bx + bw / 2}" y="${y(x.xp) - 5}" text-anchor="middle">${x.xp}</text>`;
        svg += `<text x="${bx + bw / 2}" y="${H + 13}" text-anchor="middle">${isToday ? 'Today' : (i % 2 === 1 ? x.d.toLocaleDateString([], { weekday: 'narrow' }) : '')}</text>`;
        svg += `<rect class="hit" x="${bx - gap / 2}" y="0" width="${bw + gap}" height="${H}" data-i="${i}"/>`;
    });
    svg += `<line class="base" x1="0" x2="${W}" y1="${H}" y2="${H}"/></svg><div class="tip" id="db-tip" hidden></div>`;
    const chart = document.getElementById('db-chart');
    chart.innerHTML = svg;
    const tip = document.getElementById('db-tip');
    const show = (e) => {
        const r = e.target.closest('rect.hit'); if (!r) { tip.hidden = true; return; }
        const x = daysList[+r.dataset.i], box = chart.getBoundingClientRect(), rb = r.getBoundingClientRect();
        tip.innerHTML = `<b>${x.xp} XP</b> · ${x.d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`;
        tip.style.left = `${rb.left - box.left + rb.width / 2}px`; tip.style.top = `${y(x.xp) / (H + 18) * box.height - 6}px`; tip.hidden = false;
    };
    chart.onpointermove = show; chart.onpointerdown = show; chart.onpointerleave = () => { tip.hidden = true; };
    document.getElementById('db-table').innerHTML = daysList.map(x => `<tr><td>${x.d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</td><td style="text-align:right">${x.xp} XP</td></tr>`).join('');
}

function renderToday(S, m) {
    const dailies = Vault.getDailyTasks();
    const due = dailies.filter(d => d.dueToday), doneD = due.filter(d => d.completedToday).length;
    const today = todayISO();
    const todosToday = (S.todos || []).filter(t => t.completed && dayKey(t.completedDate) === today).length;
    const taps = (S.habits || []).reduce((a, h) => a + (h.history || []).filter(x => x.direction === 'positive' && x.date === today).length, 0);
    const pct = due.length ? doneD / due.length : 0, C = 2 * Math.PI * 38;
    document.getElementById('db-today').innerHTML = `
        <svg class="ring" viewBox="0 0 92 92" role="img" aria-label="${doneD} of ${due.length} dailies done"><circle cx="46" cy="46" r="38" stroke="rgba(255,255,255,.07)"/><circle cx="46" cy="46" r="38" stroke="#ffcc00" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}" transform="rotate(-90 46 46)"/>
            <text x="46" y="50" text-anchor="middle" fill="#f1ede2" font-family="monospace" font-weight="700" font-size="18">${doneD}/${due.length}</text></svg>
        <ul><li>Dailies done <b>${doneD} of ${due.length}</b></li><li>To-Dos finished <b>${todosToday}</b></li><li>Good habit taps <b>${taps}</b></li><li>XP today <b>${Math.max(0, m[today] || 0)}</b></li></ul>`;
}

function renderStreaks() {
    const streaks = Vault.getDailyTasks().filter(d => d.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 4);
    document.getElementById('db-streaks').innerHTML = streaks.map(d => `<div class="row"><span class="hx">🔥</span><div class="mid"><b>${esc(d.label)}</b><small>${d.completedToday ? 'done today' : 'not done yet today'}</small></div><span class="val">${d.streak}d</span></div>`).join('') || '<p class="sub">Check off a Daily to start a streak.</p>';
}

// ---- Skill mastery: hours on the road to 10,000 ----
const roadPos = (h) => Math.max(0, Math.min(100, Math.log10(Math.max(1, h)) / 4 * 100));
function renderMastery(S) {
    const list = Vault.getSkillMatrix();
    const since = new Date(); since.setDate(since.getDate() - 30);
    const sinceKey = isoLocal(since);
    const recent = {};
    computeSkillContributions(S.dailyTasks, S.dictionary, S.quests, S.habits, S.todos).forEach(c => {
        if (c.date && dayKey(c.date) >= sinceKey && c.source !== 'history') recent[c.category] = (recent[c.category] || 0) + c.minutes;
    });
    const totalH = computeTotalPracticeMinutes(S.dailyTasks, S.quests, S.habits, S.todos) / 60;
    const recentH = Object.values(recent).reduce((a, x) => a + x, 0) / 60;
    const eta = (s) => {
        if (s.hours >= GOAL_H) return 'Mastered';
        const perDay = (recent[s.category] || 0) / 60 / 30;
        if (perDay <= 0) return 'No practice in the last 30 days';
        const days = (GOAL_H - s.hours) / perDay, years = days / 365;
        return `At your 30-day pace (${Math.round(perDay * 60)} min/day): ~${years >= 1 ? Math.round(years).toLocaleString() + ' years' : Math.round(days) + ' days'} to 10,000 h`;
    };
    let html = `<div class="m-sum"><div><b>${fmtH(totalH)} h</b><small>practice logged</small></div><div><b>${fmtH(recentH)} h</b><small>last 30 days</small></div><div><b>${list.length}</b><small>skills</small></div></div>`;
    html += list.map(s => {
        const ticks = [10, 100, 1000].map(t => `<span class="tick${s.hours >= t ? ' on' : ''}" style="left:${roadPos(t)}%"></span>`).join('');
        const src = Object.entries(s.bySource || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SOURCE_NAMES[k] || k} ${fmtH(v / 60)} h`).join(' · ');
        const stagePct = s.nextStage ? Math.min(100, 100 - s.hoursToNextStage / (s.hours + s.hoursToNextStage - SKILL_STAGES.find(x => x.name === s.stage).from) * 100) : 100;
        return `<div class="sk">
            <div class="sk-top"><span class="hx" style="--c:${s.stageColor}">${s.level}</span>
                <div class="mid"><b>${esc(s.category)}</b><span class="stage" style="--sc:${s.stageColor}">${s.stage}</span></div>
                <div class="hrs"><b>${fmtH(s.hours)} h</b><small>${(s.hours / GOAL_H * 100).toFixed(s.hours < 100 ? 2 : 1)}% of 10,000</small></div></div>
            <div class="bar" role="img" aria-label="${s.stage}: ${Math.round(stagePct)}% to ${s.nextStage || 'done'}"><i style="width:${stagePct}%"></i></div>
            <div class="cap"><span>${s.nextStage ? `${fmtH(s.hoursToNextStage)} h to <b>${s.nextStage}</b>` : 'Top stage'}</span><span>Level ${s.level}</span></div>
            ${s.maxed ? `<button type="button" class="sk-up" data-cat="${esc(s.category)}"><span>⬆ Level up</span><small>Level ${s.level + 1} is ready · tap for rewards</small></button>` : ''}
            <div class="cap"><span>From: ${src}</span></div>
            <div class="road"><span class="line"></span><span class="fill" style="width:${roadPos(s.hours)}%"></span>${ticks}<span class="me" style="left:${roadPos(s.hours)}%"></span></div>
            <div class="road-lab"><span>1 h</span><span>10</span><span>100</span><span>1,000</span><span>10,000 h</span></div>
            <div class="cap"><span>${eta(s)}</span></div>
        </div>`;
    }).join('') || '<p class="sub">No skill practice yet. Finish a task that mentions a skill (like HTML), or tag one.</p>';
    html += `<details class="how"><summary>How hours are counted</summary><table>
        <tr><td>1 XP</td><td>≈ 1 minute of practice</td></tr>
        <tr><td>Trivial / Easy</td><td>3 min ×0.75 / 15 min ×1</td></tr>
        <tr><td>Medium / Hard</td><td>45 min ×1.25 / 90 min ×1.5</td></tr>
        <tr><td>Which skill</td><td>tags, or Dictionary words in the task</td></tr>
        ${SKILL_STAGES.map(s => `<tr><td><span class="stage" style="--sc:${s.color};margin:0">${s.name}</span></td><td>${s.to === Infinity ? '10,000 h +' : `${s.from.toLocaleString()} - ${s.to.toLocaleString()} h`}</td></tr>`).join('')}
    </table><p>Hours are real minutes (no effort bonus). The road under each bar is a log scale, so the first hours show.</p></details>`;
    document.getElementById('db-mastery').innerHTML = html;
}

// "Pick your skills" card (Oct 28 2026) until you have at least one skill.
// It opens by itself once, the first time you visit with no skills.
function renderStarter() {
    const host = document.getElementById('db-starter');
    if (!host || typeof StarterSkills === 'undefined') return;
    host.hidden = StarterSkills.hasSkills();
    if (host.hidden) return;
    host.innerHTML = `<button type="button" class="ss-card" id="db-starter-btn"><span class="i">🌱</span><span><b>Pick your skills</b><small>Choose what you're working on. Your tasks start counting toward it.</small></span><span class="chev">›</span></button>`;
    document.getElementById('db-starter-btn').onclick = async () => { await StarterSkills.open(); render(); };
}

function render() {
    const S = Vault.state;
    renderStarter();
    const m = xpByDay(S);
    renderTiles(S);
    renderMastery(S);
    renderChart(m);
    renderToday(S, m);
    renderStreaks();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    render();
    window.addEventListener('time-logged', render);
    if (typeof StarterSkills !== 'undefined' && !StarterSkills.hasSkills() && !(Vault.state.starterSkills || {}).seen) {
        Vault.state.starterSkills = { ...(Vault.state.starterSkills || {}), seen: true };
        Vault.save();
        setTimeout(async () => { await StarterSkills.open(); render(); }, 600);
    }
    // Skill level-up right here (Oct 2026), same reward screen as the Skills page.
    document.getElementById('db-mastery').addEventListener('click', async (e) => {
        const b = e.target.closest('.sk-up');
        if (!b || b.disabled) return;
        b.disabled = true;
        await AppShell.levelUpSkill(b.dataset.cat);
        render();
    });
    Waggle.setActions(baseWaggleActions());
});
