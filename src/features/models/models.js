console.log("/// BEE MODELS ONLINE ///");

// Bee Models (2026-10-11): every bee in Bizzybee, drawn with the real art
// code - royals and brood cells (bee-art.js), eggs (egg-designs.js), card
// bees (bee-card.js), hive bees (mech-bee.js), the 3D model (model-viewer).
function renderBeeModels() {
const ASSETS = BEE_ART_ASSETS;
document.getElementById('royal-grid').innerHTML = ['queen', 'king'].map(k => `
    <div class="bm-tile"><div class="rstage">${royalStack(k)}</div><b>${ROYAL_ART[k].label}</b><small>${k === 'queen' ? 'Female · 4 layers' : 'Male · 3 layers'}</small></div>`).join('');
const rstate = { still: false, crown: true };
document.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.r === 'crown') rstate.crown = !rstate.crown; else rstate.still = b.dataset.r === 'still';
    document.querySelectorAll('.rstack').forEach(s => { s.classList.toggle('still', rstate.still); s.classList.toggle('nocrown', !rstate.crown); });
    document.querySelector('[data-r="fly"]').setAttribute('aria-pressed', String(!rstate.still));
    document.querySelector('[data-r="still"]').setAttribute('aria-pressed', String(rstate.still));
    const c = document.querySelector('[data-r="crown"]'); c.setAttribute('aria-pressed', String(rstate.crown)); c.textContent = rstate.crown ? 'Crown on' : 'Crown off';
}));

// ---- Life cycle (brood cells: bee-art.js) ----
const cell = (kind, sfx) => `<svg viewBox="0 0 120 150">${cellSVG(kind, sfx)}</svg>`;
let eggStyle = 'hex', eggSeed = 4242;
function renderLife() {
    document.getElementById('life-grid').innerHTML = `
        <div class="bm-tile"><span class="egg-wrap">${EggDesign.svg(eggSeed, { style: eggStyle, id: 'demo' })}</span><b>Egg</b><small>${eggStyle} pattern · seed ${eggSeed}</small></div>
        <div class="bm-tile">${cell('larva', '-l')}<b>Larva</b><small>fed by To-Dos</small></div>
        <div class="bm-tile">${cell('pupa', '-p')}<b>Pupa</b><small>sealed in wax · 1 hour</small></div>
        <div class="bm-tile">${cell('ready', '-r')}<b>Ready</b><small>tap the wax cap to hatch</small></div>`;
}
document.getElementById('egg-styles').innerHTML = EggDesign.STYLES.map(s => `<button class="bm-chip" data-egg="${s}" aria-pressed="${s === eggStyle}">${s}</button>`).join('') + '<button class="bm-chip" data-egg="roll">🎲 New egg</button>';
document.getElementById('egg-styles').addEventListener('click', e => {
    const b = e.target.closest('[data-egg]'); if (!b) return;
    if (b.dataset.egg === 'roll') eggSeed = 1 + Math.floor(Math.random() * 99999); else eggStyle = b.dataset.egg;
    document.querySelectorAll('[data-egg]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.egg === eggStyle)));
    renderLife();
});
renderLife();

// ---- Workers (card bee art: bee-card.js) ----
let workerEl = 'water';
function renderWorkers() {
    document.getElementById('worker-grid').innerHTML = ['Common', 'Rare', 'Epic', 'Legendary', 'Named', 'Royal'].map(r => `<div class="bm-tile" data-rar="${r}"><div class="host"></div><b>${r === 'Royal' ? 'Royal (Queen art)' : r}</b><small>${BEE_CARD_RARITY_SYMBOLS[r.toLowerCase()] || ''}</small></div>`).join('');
    document.querySelectorAll('#worker-grid [data-rar]').forEach(t => {
        const r = t.dataset.rar, host = t.querySelector('.host');
        host.className = 'art-tile bc-tile';
        const key = beeCardApplyTheme(host, r, r === 'Common' || r === 'Royal' ? null : workerEl);
        host.innerHTML = beeCardArtHTML({ rarityKey: key, rivets: 2, royal: r === 'Royal' ? 'queen' : null });
    });
}
document.getElementById('worker-els').innerHTML = Object.entries(BEE_ELEMENTS).map(([k, v]) => `<button class="bm-chip" data-el="${k}" aria-pressed="${k === workerEl}">${v.emoji} ${v.label}</button>`).join('');
document.getElementById('worker-els').addEventListener('click', e => {
    const b = e.target.closest('[data-el]'); if (!b) return; workerEl = b.dataset.el;
    document.querySelectorAll('[data-el]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.el === workerEl))); renderWorkers();
});
renderWorkers();

// ---- Hive bees (MechBeeScene) ----
(function () {
    const svg = document.getElementById('hive-scene');
    const scene = new MechBeeScene(svg, { front: svg.querySelector('.ch-fly-front'), back: svg.querySelector('.ch-fly-back'), timeScale: 1 });
    ['', 'fire', 'water', 'earth', 'wind'].forEach((el, i) => scene.hover({ x: 50 + i * 75, y: 70 + (i % 2) * 50, bee: { scale: .8, stripe: MechBee.stripeFor(el) } }));
    scene.orbit({ cx: 200, y: 100, rx: 170, ry: 40, speed: .7, bee: { scale: .55, stripe: MechBee.stripeFor('fire') } });
    scene.start();
})();

// ---- Marks ----
document.getElementById('marks-grid').innerHTML = `
    <div class="bm-tile"><img class="mk-img" src="${ASSETS}bizzybee-logo.svg" alt=""><b>Gold logo</b><small>launch screen, egg mark</small></div>
    <div class="bm-tile"><img class="mk-img" src="${ASSETS}bizzybee-badge.webp" alt=""><b>Badge</b><small>app badge</small></div>
    <div class="bm-tile"><span class="mk-nano" id="nano"></span><b>Mini bee</b><small>the 🐝 button mascot</small></div>
    <div class="bm-tile"><img class="mk-img" src="${ASSETS}starter-bee.svg" alt=""><b>Starter bee</b><small>first worker art</small></div>`;
NanoBee.render(document.getElementById('nano'), 'model', { color: '#ffd700', hideCore: true, noFlight: true });

// ---- Species (KeeperDex catalog, card-bee art) ----
document.getElementById('species-grid').innerHTML = KEEPERDEX_ENTRIES.map(e => `<div class="bm-tile" data-dex="${e.dexNumber}"><span class="sp-no">No.${String(e.dexNumber).padStart(3, '0')}</span><div class="host"></div><b>${e.name}</b><small>${e.rarity} · ${BEE_ELEMENTS[e.element] ? BEE_ELEMENTS[e.element].label : ''}</small></div>`).join('');
document.querySelectorAll('#species-grid [data-dex]').forEach(t => {
    const e = KEEPERDEX_ENTRIES.find(x => String(x.dexNumber) === t.dataset.dex);
    const host = t.querySelector('.host'); host.className = 'art-tile bc-tile';
    const key = beeCardApplyTheme(host, e.rarity, e.element);
    host.innerHTML = beeCardArtHTML({ rarityKey: key, rivets: 2 });
});

// ---- tabs follow the scroll ----
const tabs = [...document.querySelectorAll('#bm-tabs a')];
const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) tabs.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('.bm-sec').forEach(s => io.observe(s));
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    // Section tabs stick just under the top bar.
    const head = document.getElementById('app-head');
    if (head) document.documentElement.style.setProperty('--bm-top', `${head.offsetHeight}px`);
    renderBeeModels();
    Waggle.setActions(baseWaggleActions());
});

// 3D bee (Oct 2026): only loaded once the 3D Bee Model pack is downloaded.
(async function show3dBee() {
    if (typeof Packs === 'undefined' || !(await Packs.isDownloaded('bee3d'))) return;
    const s = document.createElement('script');
    s.type = 'module';
    s.src = MODEL_VIEWER_URL;
    document.head.appendChild(s);
    document.getElementById('m3d-host').innerHTML = '<model-viewer id="mv" src="../../assets/3d/bizzy-bee.glb" auto-rotate camera-controls shadow-intensity="1" exposure="1.1" alt="3D Bizzybee"></model-viewer>';
})();
