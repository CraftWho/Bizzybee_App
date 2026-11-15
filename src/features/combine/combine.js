// Combine page (Nov 2026, Craft; approved demo). Two real cards, a strip of
// partners, and the full-screen combine effect (GachaFX.combine) on the merge.
// ?a=<beeId> starts with that bee in the first slot (Bee Care's Combine button).
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATS = [['hp', 'HP'], ['offense', 'ATK'], ['defense', 'DEF'], ['speed', 'SPD'], ['power', 'PWR']];
let pickA = null, pickB = null, armed = false, armT = null, busy = false;

function rc(r) { const i = BEE_RARITIES.find(x => x.rarity === r); return i ? i.color : '#aaaaaa'; }
function toast(m, t = 'positive') { if (typeof Toast !== 'undefined') Toast.show(m, t); }
function total(b) { const s = b.stats || {}; return BEE_SKILL_STATS.reduce((n, k) => n + (Number(s[k]) || 0), 0) + (Number(s.hp) || 0) / 4; }
function status(b) { return Vault.beeMergeStatus(b); }
function candidates() { return Vault.getHiveBees().filter(b => status(b)); }
function find(id) { return id && Vault.getHiveBees().find(b => b.id === id); }

function cardInto(host, cls, bee) {
    host.className = cls;
    const inner = document.createElement('div');
    host.appendChild(inner);
    BeeCard.render(inner, bee, { editable: false });
}
function slotHTML(el, bee, label) {
    el.innerHTML = '';
    if (!bee) { el.innerHTML = `<div class="cmb-empty" aria-label="${label}">?</div><span>${label}</span>`; return; }
    const wrap = document.createElement('div');
    cardInto(wrap, 'cmb-big drop', bee);
    el.appendChild(wrap);
    el.insertAdjacentHTML('beforeend', `<span class="cmb-nm" style="color:${rc(bee.rarity)}">${esc(bee.name)}</span>`);
}
function chance(a, b) {
    const top = RARITY_ORDER.indexOf(a.rarity) > RARITY_ORDER.indexOf(b.rarity) ? a : b;
    return { top, pct: Math.round((COMBINE_UPGRADE_CHANCE[top.rarity] || 0) * 1000) / 10 };
}
function renderStage() {
    slotHTML(document.getElementById('slot-a'), pickA, 'First bee');
    slotHTML(document.getElementById('slot-b'), pickB, 'Partner');
    const ready = !!(pickA && pickB);
    const stage = document.getElementById('cmb-stage');
    stage.classList.toggle('ready', ready);
    if (ready) stage.style.setProperty('--cmb-glow', rc(chance(pickA, pickB).top.rarity));
    const info = document.getElementById('cmb-info');
    if (ready) {
        const c = chance(pickA, pickB);
        info.innerHTML = `Keeps the best of each stat plus a small boost. <b>${c.pct}%</b> chance to climb above ${esc(c.top.rarity)}. <b style="color:#ff8fa3">Both bees are used up.</b>`;
    } else info.textContent = pickA ? 'Now pick a partner below.' : 'Pick the first bee below.';
    const go = document.getElementById('cmb-go');
    go.disabled = !ready || busy;
    go.textContent = armed ? '⚠️ Tap again to confirm' : '🧬 Combine';
}
const GROUPS = [['spare', 'Merge these first', 'They have no job or the job is full.'], ['idle', 'Could work: a slot is free', ''], ['work', 'Working', 'They will leave their job.']];
function renderPick() {
    const slot = pickA ? 'partner' : 'first bee';
    document.getElementById('cmb-sec').textContent = pickA && pickB ? 'Change a bee' : `Pick the ${slot}`;
    const list = candidates();
    const out = GROUPS.map(([k, title, note]) => {
        const g = list.filter(b => status(b) === k).sort((x, y) => total(x) - total(y));
        if (!g.length) return '';
        return `<div class="cmb-grp">${title}${note ? ` · ${note}` : ''}</div><div class="cmb-grid">${g.map(b => {
            const on = (pickA && pickA.id === b.id) || (pickB && pickB.id === b.id);
            return `<button type="button" class="cmb-opt" data-id="${esc(b.id)}" aria-pressed="${on}"><span data-card></span><span class="cmb-nm" style="color:${rc(b.rarity)}">${esc(b.name)}</span><small>${esc(b.rarity)}</small></button>`;
        }).join('')}</div>`;
    }).join('');
    const box = document.getElementById('cmb-pick');
    box.innerHTML = out || '<p class="cmb-info">You need at least two bees that can be combined.</p>';
    box.querySelectorAll('.cmb-opt').forEach(btn => {
        const b = find(btn.dataset.id);
        if (b) cardInto(btn.querySelector('[data-card]'), 'cmb-sm', b);
    });
}
function choose(id) {
    if (busy) return;
    const b = find(id); if (!b) return;
    armed = false; clearTimeout(armT);
    if (pickA && pickA.id === id) pickA = null;
    else if (pickB && pickB.id === id) pickB = null;
    else if (!pickA) pickA = b;
    else if (!pickB) pickB = b;
    else pickB = b;
    renderStage(); renderPick();
}

function showResult(res, snapA, snapB) {
    const bee = res.newBee;
    const over = document.getElementById('cmb-over'), panel = document.getElementById('cmb-res');
    const card = document.getElementById('cmb-res-card'), title = document.getElementById('cmb-res-title');
    over.hidden = false;
    title.textContent = res.upgraded ? `✨ Upgraded into ${bee.name}!` : `🧬 ${bee.name} emerged!`;
    card.className = 'cmb-res-card ring'; card.style.setProperty('--rc', rc(bee.rarity));
    BeeCard.render(card, bee, { editable: false });
    const before = (k) => Math.max(Number((snapA.stats || {})[k]) || 0, Number((snapB.stats || {})[k]) || 0);
    document.getElementById('cmb-gains').innerHTML = STATS.map(([k, l]) => {
        const now = Number((bee.stats || {})[k]) || 0, d = now - before(k);
        return `<div class="${d > 0 ? 'up' : ''}"><span>${l}</span><b>${now}</b><i>${d > 0 ? '+' + d : ''}</i></div>`;
    }).join('');
    const nameHost = document.getElementById('cmb-res-name');
    if (typeof BeeName !== 'undefined') BeeName.mount(nameHost, bee, { label: 'Name your new bee', onSaved: (r) => { title.textContent = `${r.name} joined the hive!`; BeeCard.render(card, r, { editable: false }); } });
    panel.hidden = false;
    document.getElementById('cmb-res-close').onclick = () => { over.hidden = true; panel.hidden = true; pickA = pickB = null; renderStage(); renderPick(); };
}

async function doCombine() {
    if (!pickA || !pickB || busy) return;
    if (!armed) {
        armed = true; renderStage();
        armT = setTimeout(() => { armed = false; renderStage(); }, 4000);
        return;
    }
    armed = false; clearTimeout(armT); busy = true;
    const snapA = JSON.parse(JSON.stringify(pickA)), snapB = JSON.parse(JSON.stringify(pickB));
    const stage = document.getElementById('cmb-stage');
    stage.classList.add('slam');
    await new Promise(r => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 560));
    const res = Vault.combineBees(pickA.id, pickB.id);
    stage.classList.remove('slam');
    if (!res) { busy = false; toast('Those two can\'t be combined.', 'negative'); renderStage(); return; }
    if (typeof GachaFX !== 'undefined') { try { await GachaFX.combine(snapA, snapB, res.newBee, res.upgraded); } catch (e) { console.error(e); } }
    busy = false;
    showResult(res, snapA, snapB);
    pickA = pickB = null;
    renderStage(); renderPick();
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const a = new URLSearchParams(location.search).get('a');
    const first = find(a);
    if (first && status(first)) pickA = first;
    renderStage(); renderPick();
    document.getElementById('cmb-pick').addEventListener('click', (e) => { const o = e.target.closest('.cmb-opt'); if (o) choose(o.dataset.id); });
    document.getElementById('slot-a').addEventListener('click', () => { if (pickA && !busy) { pickA = null; armed = false; renderStage(); renderPick(); } });
    document.getElementById('slot-b').addEventListener('click', () => { if (pickB && !busy) { pickB = null; armed = false; renderStage(); renderPick(); } });
    document.getElementById('cmb-go').addEventListener('click', doCombine);
});
