console.log("/// BEE MODELS ONLINE ///");

// Bee Models (Oct 2026 rebuild, from the approved reward-models demo):
// every kind of bee in Bizzybee, drawn with the real art code. Each tile
// stays a dark silhouette until you've met that kind of bee
// (Vault.getSeenModels in db.js). Tapping a found tile opens it up close;
// tapping a locked tile says how to find it. Species live in the KeeperDex.

// The job a title locks its bee to, by name ('' = any job).
const bmTitleJob = (t) => (t.job && BEE_CLASSES[t.job] ? BEE_CLASSES[t.job].label : '');

function bmSections() {
    const sec = [
        { id: 'royals', tab: '♛ Royals', title: 'Royals', sub: 'hatched from your egg', items: [
            { key: 'royal:queen', name: 'Queen', small: 'Female royal', art: 'royal', arg: 'queen', how: 'Hatch your egg as a Queen.', text: 'Layered art: body, wings and crown are separate pieces, so the wings flap and the crown drops on when she hatches.' },
            { key: 'royal:king', name: 'King', small: 'Male royal', art: 'royal', arg: 'king', how: 'A hive has one royal. Hatch your egg as a King to meet him.', text: 'Layered art: body, wings and crown are separate pieces, so the wings flap and the crown drops on when he hatches.' }] },
        { id: 'life', tab: '🥚 Life cycle', title: 'Life cycle', sub: 'egg → larva → pupa → bee', items: [
            { key: 'life:egg', name: 'Egg', small: `${LIFE.broodDays} days in the Nursery`, art: 'egg', how: 'Get any new bee.', text: 'Every egg gets its own pattern from a number, so no two eggs match.' },
            { key: 'life:larva', name: 'Larva', small: 'fed by To-Dos', art: 'cell', arg: 'larva', how: 'Raise your egg gift.', text: 'The larva grows as you finish To-Dos.' },
            { key: 'life:pupa', name: 'Pupa', small: 'sealed in wax', art: 'cell', arg: 'pupa', how: 'Raise your egg gift.', text: 'Sealed in wax while it changes.' },
            { key: 'life:ready', name: 'Ready', small: 'tap the wax cap', art: 'cell', arg: 'ready', how: 'Raise your egg gift.', text: 'Tap the wax cap to hatch.' },
            { key: 'life:drone', name: 'Drone', small: 'male worker', art: 'card', arg: ['Common', null], how: 'Hatch a male bee. About 1 in 10 bees is a drone.', text: 'Drones are the hive\'s male bees. A drone\'s mating can give your next pull a better shot at a Rare.' }] },
        { id: 'rarities', tab: '🐝 Rarities', title: 'Rarities', sub: 'the card bee', items: [
            { key: 'rar:Common', name: 'Common', small: 'grey frame', art: 'card', arg: ['Common', null], how: 'Pull any bee.' },
            { key: 'rar:Rare', name: 'Rare', small: 'blue frame', art: 'card', arg: ['Rare', 'water'], how: 'Pull a Rare. Every 6th pull without one is a sure Rare.' },
            // Oct 31 2026 (Craft): Epic/Legendary hints match the real combine odds (small chance).
            { key: 'rar:Epic', name: 'Epic', small: 'purple frame', art: 'card', arg: ['Epic', 'water'], how: 'Pull an Epic. Combining two Rares has a small chance too.' },
            { key: 'rar:Legendary', name: 'Legendary', small: 'gold frame', art: 'card', arg: ['Legendary', 'water'], how: 'Pull a Legendary (1 in 1,000). Combining two Epics has a tiny chance too.' },
            { key: 'rar:Named', name: 'Named Beast', small: 'pink frame + title', art: 'card', arg: ['Named', 'fire'], how: `Unwrap one with ${NAMED_BEAST_TICKETS} tickets in the Pollination Chamber.` },
            { key: 'rar:Royal', name: 'Royal card', small: 'your Queen or King', art: 'card', arg: ['Royal', null], how: 'Hatch your egg.' }] },
        { id: 'elements', tab: '🔥 Elements', title: 'Elements', sub: 'the card backgrounds', items: BEE_ELEMENT_KEYS.map(el => ({
            key: 'el:' + el, name: BEE_ELEMENTS[el].label, small: 'card background', art: 'card', arg: ['Rare', el], icon: BEE_ELEMENTS[el].emoji,
            how: `Get a ${BEE_ELEMENTS[el].label} bee.`, text: `${BEE_ELEMENTS[el].emoji} The element tints the card and sets the bee's weakness.` })) },
        { id: 'titles', tab: '🌟 Titles', title: 'Named titles', sub: `${Object.keys(NAMED_TITLES).length} to collect`, items: Object.entries(NAMED_TITLES).map(([k, t]) => ({
            key: 'title:' + k, name: t.label, small: bmTitleJob(t) || 'any job', art: 'card', arg: ['Named', 'fire'], icon: t.icon,
            how: `Unwrap Named Beasts (${NAMED_BEAST_TICKETS} tickets). Each gets one random title.`,
            text: `${t.icon} ${t.power}: ${t.text}${bmTitleJob(t) ? ` Its job is locked to ${bmTitleJob(t)}.` : ' It can do any job.'}` })) },
        { id: 'hive', tab: '🏰 Hive', title: 'Hive bees', sub: 'the mech bees around your hive', items: [
            { key: 'hive:worker', name: 'Mech worker', small: 'flies by the hive', art: 'mech', arg: 1, how: 'Give any bee a job.', text: 'Working bees fly around the outside of your hive. The stripe shows the element.' },
            { key: 'hive:swarm', name: 'Swarm', small: '10+ bees working', art: 'mech', arg: 6, how: 'Have 10 bees working at the same time.', text: 'A busy hive: ten or more bees out working at once.' },
            { key: 'hive:raider', name: 'Raiders', small: 'enemies at the gate', art: 'raid', how: 'Live through your first raid. Guards and Propolis Sealers help you win it.', text: 'Hornets, wasps, robber bees and mites try to break in. Guards and Propolis Sealers fight them off.' }] }
    ];
    return sec;
}

let bmMechScenes = [];
function bmArt(item, big = false) {
    const id = item.key.replace(/[^a-z0-9]/gi, '') + (big ? 'v' : '');
    switch (item.art) {
        case 'royal': return `<div class="rstage">${royalStack(item.arg)}</div>`;
        case 'egg': return `<span class="bm-egg">${EggDesign.svg(big ? 1 + Math.floor(Math.random() * 99999) : 4242, { id: 'bm' + id })}</span>`;
        case 'cell': return `<svg class="bm-cell" viewBox="0 0 120 150">${cellSVG(item.arg, '-' + id)}</svg>`;
        case 'card': return `<span class="art-tile bc-tile bm-card" data-card="${item.arg[0]}|${item.arg[1] || ''}"></span>${item.icon ? `<span class="bm-badge">${item.icon}</span>` : ''}`;
        case 'mech': return `<svg class="bm-mech" data-mech="${item.arg}" viewBox="0 0 200 120"><g class="ch-fly-back"></g><g class="ch-fly-front"></g></svg>`;
        case 'raid': return `<span class="bm-raid">${RAID_ENEMIES.map(e => `<i>${e.icon}</i>`).join('')}</span>`;
        default: return '';
    }
}
// Card art and mech scenes need a live element, so they're filled in after
// the HTML is on the page.
function bmHydrate(root) {
    root.querySelectorAll('[data-card]').forEach(host => {
        const [r, el] = host.dataset.card.split('|');
        const locked = !!host.closest('.bm-tile.lock');
        const key = beeCardApplyTheme(host, locked ? 'Common' : r, locked || r === 'Common' || r === 'Royal' ? null : (el || null));
        host.innerHTML = beeCardArtHTML({ rarityKey: key, rivets: 2, silhouette: locked, royal: r === 'Royal' ? (Vault.getRoyalBee() && Vault.getRoyalBee().royal) || 'queen' : null });
    });
    root.querySelectorAll('[data-mech]').forEach(svg => {
        if (typeof MechBeeScene === 'undefined') return;
        const n = +svg.dataset.mech;
        const scene = new MechBeeScene(svg, { front: svg.querySelector('.ch-fly-front'), back: svg.querySelector('.ch-fly-back'), timeScale: 1 });
        const els = ['', 'fire', 'water', 'earth', 'wind'];
        if (n === 1) scene.hover({ x: 100, y: 60, bee: { scale: 1.1, stripe: MechBee.stripeFor('water') } });
        else for (let i = 0; i < n; i++) scene.orbit({ cx: 100, y: 60, rx: 70 - (i % 3) * 12, ry: 26 + (i % 2) * 8, speed: .5 + i * .08, bee: { scale: .55, stripe: MechBee.stripeFor(els[i % els.length]) } });
        scene.start();
        bmMechScenes.push(scene);
    });
}

function bmRender() {
    const seen = Vault.getSeenModels();
    const viewed = Vault.getViewedModels();
    const secs = bmSections();
    let found = 0, total = 0;
    document.getElementById('bm-tabs').innerHTML = secs.map((s, i) => `<a href="#${s.id}"${i ? '' : ' class="on"'}>${s.tab}</a>`).join('');
    document.getElementById('bm-secs').innerHTML = secs.map(s => {
        const got = s.items.filter(i => seen[i.key]).length;
        found += got; total += s.items.length;
        return `<section class="bm-sec" id="${s.id}">
            <h2>${s.title} <small>${got} / ${s.items.length} · ${s.sub}</small></h2>
            <div class="bm-grid three">${s.items.map(i => {
                const on = !!seen[i.key];
                const fresh = on && !viewed.includes(i.key);
                return `<button type="button" class="bm-tile${on ? '' : ' lock'}${fresh ? ' new' : ''}" data-key="${i.key}">
                    <span class="bm-art">${bmArt(i)}</span>
                    <b>${on ? i.name : '???'}</b><small>${on ? i.small : 'not found yet'}</small></button>`;
            }).join('')}</div></section>`;
    }).join('');
    document.getElementById('bm-count').textContent = `${found} / ${total}`;
    document.getElementById('bm-bar').style.width = `${total ? Math.round(found / total * 100) : 0}%`;
    bmMechScenes.forEach(s => s.destroy && s.destroy());
    bmMechScenes = [];
    bmHydrate(document.getElementById('bm-secs'));

    // Tabs follow the scroll.
    const tabs = [...document.querySelectorAll('#bm-tabs a')];
    const io = new IntersectionObserver(entries => entries.forEach(en => {
        if (en.isIntersecting) tabs.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
    }), { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('.bm-sec[id]').forEach(s => io.observe(s));
}

let bmHintTimer;
function bmHint(text) {
    const h = document.getElementById('bm-hint');
    h.textContent = text;
    h.classList.add('on');
    clearTimeout(bmHintTimer);
    bmHintTimer = setTimeout(() => h.classList.remove('on'), 3200);
}

function bmOpen(key) {
    const item = bmSections().flatMap(s => s.items).find(i => i.key === key);
    if (!item) return;
    const seen = Vault.getSeenModels();
    if (!seen[key]) { bmHint('🔒 ' + item.how); return; }
    Vault.markModelViewed(key);
    const tile = document.querySelector(`.bm-tile[data-key="${key}"]`);
    if (tile) tile.classList.remove('new');
    const view = document.getElementById('bm-view');
    const art = document.getElementById('bm-view-art');
    art.innerHTML = item.art === 'egg'
        ? `<div class="bm-eggs">${[0, 1, 2, 3].map(() => bmArt(item, true)).join('')}</div>`
        : bmArt(item, true);
    bmHydrate(art);
    document.getElementById('bm-view-name').textContent = item.name;
    document.getElementById('bm-view-text').textContent = item.text || item.small;
    const d = seen[key];
    document.getElementById('bm-view-date').textContent = d ? `Found ${new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
    view.hidden = false;
}
function bmClose() { document.getElementById('bm-view').hidden = true; document.getElementById('bm-view-art').innerHTML = ''; }

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const head = document.getElementById('app-head');
    if (head) document.documentElement.style.setProperty('--bm-top', `${head.offsetHeight}px`);
    bmRender();
    document.getElementById('bm-secs').addEventListener('click', (e) => {
        const t = e.target.closest('.bm-tile');
        if (t) bmOpen(t.dataset.key);
    });
    document.getElementById('bm-view-x').addEventListener('click', bmClose);
    document.getElementById('bm-view').addEventListener('click', (e) => { if (e.target.id === 'bm-view') bmClose(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') bmClose(); });
    Waggle.setActions(baseWaggleActions());
});

// 3D bee: only loaded once the 3D Bee Model pack is downloaded.
(async function show3dBee() {
    if (typeof Packs === 'undefined' || !(await Packs.isDownloaded('bee3d'))) return;
    const s = document.createElement('script');
    s.type = 'module';
    s.src = MODEL_VIEWER_URL;
    document.head.appendChild(s);
    document.getElementById('m3d-host').innerHTML = '<model-viewer id="mv" src="../../assets/3d/bizzy-bee.glb" auto-rotate camera-controls shadow-intensity="1" exposure="1.1" alt="3D Bizzy Bee"></model-viewer>';
})();
