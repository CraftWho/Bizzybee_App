console.log("/// BEE ART ONLINE ///");

// Shared bee art (2026-10-11): the royals (Queen / King, layered so the
// wings flap and the crown can drop on) and the brood cell (empty, larva,
// sealed pupa, ready to hatch). Used by the egg gift (onboarding.js) and
// Bee Models. Moved here out of onboarding.js unchanged; the only addition
// is an optional `sfx` on cellSVG/larvaSVG so several cells can share a
// page without their SVG ids clashing (the egg page passes none, so its
// markup is exactly what it was).
const BEE_ART_ASSETS = new URL('../../assets/bees/', document.currentScript.src).href;

const ROYAL_ART = {
    // paint order; 'base' = body with the crown removed, 'crown' drops on at the end
    queen: { label: 'Queen', her: 'her', hx: '47.5%', hy: '47.6%', crown: [63.9, 36.7],
        layers: [['rl rw back', 'queen/queen-wing-back.webp'], ['base', 'queen/queen-body-nocrown.webp'], ['rl crown', 'queen/queen-crown.webp'], ['rl rw', 'queen/queen-wing-front.webp']] },
    king: { label: 'King', her: 'him', hx: '48.4%', hy: '47%', crown: [66.3, 26.4],
        layers: [['base', 'king/king-body-nocrown.webp'], ['rl rw', 'king/king-wings.webp'], ['rl crown', 'king/king-crown.webp']] },
};
function royalStack(kind, still) {
    const A = ROYAL_ART[kind];
    return `<div class="rstack${still ? ' still' : ''}" style="--hx:${A.hx};--hy:${A.hy}">` +
        A.layers.map(([c, f]) => `<img class="${c}" src="${BEE_ART_ASSETS}${f}" alt="${c === 'base' ? A.label + ' bee' : ''}" draggable="false">`).join('') + '</div>';
}

const hexP = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i - Math.PI / 2; return (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1); }).join(' ');
function larvaSVG(sfx = '') {
    const cx = 60, cy = 86, R = 17, N = 11; let segs = '';
    for (let i = N - 1; i >= 0; i--) {
        const th = (-40 - i * (270 / (N - 1))) * Math.PI / 180, r = 9.6 - i * .5;
        const x = cx + R * Math.cos(th), y = cy + R * Math.sin(th);
        segs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#lvSkin${sfx})" stroke="#8a6a3a" stroke-width=".7"/>`;
        if (i % 2 === 1) segs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * .72).toFixed(1)}" fill="none" stroke="#d9a520" stroke-width=".6" opacity=".7"/>`;
    }
    const th0 = -40 * Math.PI / 180, hx = cx + R * Math.cos(th0), hy = cy + R * Math.sin(th0);
    segs += `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="9.8" fill="url(#lvHead${sfx})" stroke="#8a6a3a" stroke-width=".7"/>
        <circle cx="${(hx + 3).toFixed(1)}" cy="${(hy - 2).toFixed(1)}" r="1.1" fill="#2a1a08"/><circle cx="${(hx + 6).toFixed(1)}" cy="${(hy + 1).toFixed(1)}" r="1" fill="#2a1a08"/>
        <path d="M${(hx + 7).toFixed(1)} ${(hy + 4).toFixed(1)} q2 1 1 3" stroke="#b8861e" stroke-width="1" fill="none"/>`;
    return `<g id="larva${sfx}">${segs}</g>`;
}
function cellSVG(kind, sfx = '') {
    const cx = 60, cy = 80;
    let s = `<defs>
        <linearGradient id="cWall${sfx}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".35" stop-color="#e8c25a"/><stop offset=".7" stop-color="#b8861e"/><stop offset="1" stop-color="#5a3a04"/></linearGradient>
        <radialGradient id="cCav${sfx}" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#3a1a04"/><stop offset="1" stop-color="#0a0502"/></radialGradient>
        <radialGradient id="lvSkin${sfx}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#f4dfb4"/><stop offset="1" stop-color="#d9b27a"/></radialGradient>
        <radialGradient id="lvHead${sfx}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff6e0"/><stop offset="1" stop-color="#e2bd82"/></radialGradient>
        <radialGradient id="cWax${sfx}" cx="42%" cy="36%" r="70%"><stop offset="0" stop-color="#fff2c4"/><stop offset=".5" stop-color="#e9c46a"/><stop offset="1" stop-color="#a8721e"/></radialGradient>
        <radialGradient id="cJelly${sfx}" cx="45%" cy="35%" r="65%"><stop offset="0" stop-color="#fffdf2"/><stop offset=".6" stop-color="#f8e6b0" stop-opacity=".85"/><stop offset="1" stop-color="#e8c470" stop-opacity=".35"/></radialGradient>
        <filter id="cSoft${sfx}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter>
        <filter id="soft${sfx}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
      </defs>
      <ellipse cx="60" cy="140" rx="42" ry="5" fill="#000" opacity=".5" filter="url(#cSoft${sfx})"/>
      <polygon points="${hexP(cx, cy, 52)}" fill="url(#cWall${sfx})" stroke="#2a1a04" stroke-width="1.2"/>
      <polygon points="${hexP(cx, cy, 43)}" fill="url(#cCav${sfx})" stroke="#6e4806" stroke-width="1"/>`;
    if (kind === 'larva') s += `<ellipse cx="60" cy="104" rx="28" ry="7.5" fill="url(#cJelly${sfx})"/>${larvaSVG(sfx)}<ellipse cx="50" cy="102" rx="8" ry="1.6" fill="#fff" opacity=".35"/>`;
    else if (kind === 'pupa' || kind === 'ready') {
        s += `<g class="ci-wax"><polygon points="${hexP(cx, cy, 43)}" fill="url(#cWax${sfx})" stroke="#8a5a12" stroke-width="1"/>
          <path d="M30 62 Q45 52 62 50" stroke="#fff" stroke-width="2.4" fill="none" opacity=".35" stroke-linecap="round"/>
          <path class="pglow" d="M44 70 L52 78 L48 88 L58 96 M66 64 L70 76 L78 82 M62 104 L70 110" stroke="#ff5a2a" stroke-width="${kind === 'ready' ? 2.2 : 1.3}" fill="none" stroke-linecap="round" filter="url(#cSoft${sfx})"/>
          <path d="M44 70 L52 78 L48 88 L58 96 M66 64 L70 76 L78 82 M62 104 L70 110" stroke="#ffd27a" stroke-width=".6" fill="none" opacity="${kind === 'ready' ? .9 : .35}"/><g id="waxCracks${sfx}"></g></g>`;
    }
    return s;   // 'empty' = just the open cell
}
