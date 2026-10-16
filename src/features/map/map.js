console.log("/// MAP PROTOCOLS INITIALIZED ///");

// Map v2 (Oct 2026, approved demo): your campaigns as a hex trail.
// Finished campaigns at the bottom, the current one in red, the rest
// ahead, and the finish line on top.
const escMap = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function questProgress(q) {
    const tasks = q.tasks || [];
    const done = tasks.filter(t => t.completed).length;
    return { done, total: tasks.length, pct: tasks.length ? Math.round(done / tasks.length * 100) : (q.status === 'completed' ? 100 : 0) };
}

function renderMapV2() {
    const quests = Vault.getQuests() || [];
    const activeId = Vault.getActiveQuestId();
    const finished = quests.filter(q => q.status === 'completed')
        .map((q, i) => ({ q, i }))
        .sort((a, b) => (Date.parse(a.q.completedAt) || 0) - (Date.parse(b.q.completedAt) || 0) || a.i - b.i)
        .map(x => x.q);
    const open = quests.filter(q => q.status !== 'completed');
    const current = open.find(q => q.id === activeId) || open[0] || null;
    const ahead = open.filter(q => q !== current);
    const road = [...finished, ...(current ? [current] : []), ...ahead];
    const link = (q) => `../quests/quest.html?id=${encodeURIComponent(q.id)}`;

    const now = document.getElementById('mp-now');
    if (current) {
        const p = questProgress(current);
        now.innerHTML = `<div class="mp-now"><div class="hx big" aria-hidden="true">📍</div><div class="mid"><b>${escMap(current.title)}</b><small>${p.done} of ${p.total} tasks · ${p.pct}%</small><div class="bar" role="progressbar" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Campaign progress"><i style="width:${p.pct}%"></i></div></div></div>
            <div class="actions"><a class="btn solid" href="${link(current)}">Continue →</a><a class="btn" href="../quests/quests.html">Quest Log</a></div>`;
    } else {
        now.innerHTML = `<p class="sub">${quests.length ? 'Every campaign is done. Start a new one!' : 'No campaigns yet.'}</p><div class="actions"><a class="btn solid" href="../quests/create-quest.html">+ New Quest</a></div>`;
    }

    document.getElementById('mp-road-title').textContent = `The road · ${finished.length} of ${quests.length} done`;
    const stops = road.map((q, i) => {
        const p = questProgress(q);
        const state = q.status === 'completed' ? 'done' : q === current ? 'now' : 'ahead';
        const label = state === 'done' ? 'Done' : state === 'now' ? 'In progress' : 'Ahead';
        return { html: `<a class="hx" href="${link(q)}" aria-label="${escMap(q.title)}, ${label}">${state === 'done' ? '✓' : i + 1}</a><a class="lab" href="${link(q)}"><b>${escMap(q.title)}</b><small>${label} · ${p.done}/${p.total} tasks</small></a>`, state };
    });
    // Newest at the top: reverse the road and put the finish line first.
    const items = [{ html: '<span class="hx" aria-hidden="true">🏆</span><span class="lab"><b>Finish line</b><small>Your career goal</small></span>', state: 'goal' }, ...stops.reverse()];
    document.getElementById('mp-trail').innerHTML = items.map((s, i) => `<li class="stop ${s.state} ${i % 2 ? 'l' : 'r'}">${s.html}</li>`).join('');
    const cur = document.querySelector('.stop.now');
    if (cur && road.length > 6) cur.scrollIntoView({ block: 'center' });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    Waggle.setActions(baseWaggleActions());
    renderMapV2();
});
