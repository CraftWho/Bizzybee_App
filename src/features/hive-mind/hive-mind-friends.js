// Friends' hives in your Hive Mind (Oct 29 2026). Your friends' hives hang
// in the distance on both sides of yours, smaller and softer, with their
// name and a few bees. Tap one to visit. Data comes from Social's saved
// copy, refreshed at most once an hour (keeps Netlify free).
const ColonyFriends = (() => {
    const SPOTS = [{ x: 3, y: 34 }, { x: 77, y: 30 }, { x: 4, y: 58 }, { x: 76, y: 55 }];
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tierFor = (lvl) => (typeof nestTier === 'function' ? nestTier(lvl) : 1);

    function mini(level) {
        const h = ColonyHive.build(tierFor(level));
        const box = document.createElement('div');
        box.innerHTML = h.svg;
        const svg = box.querySelector('svg');
        // Just the hive and its branch: no sky, glow, trees or fireflies.
        svg.querySelectorAll('.ch-sky, .ch-firefly, .ch-fly-front, .ch-fly-back').forEach(n => n.remove());
        [...svg.children].forEach(n => { if (n.tagName === 'g' && /blur3/.test(n.getAttribute('filter') || '')) n.remove(); });
        const half = Math.max(h.maxA * 1.25, (h.bottom + 30 - 40) * 0.36);
        svg.setAttribute('viewBox', `${h.cx - half} 40 ${half * 2} ${h.bottom + 30 - 40}`);
        svg.removeAttribute('class');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.overflow = 'hidden';
        return svg.outerHTML;
    }

    function render() {
        const scene = document.getElementById('colony-nest-scene');
        if (!scene || typeof Social === 'undefined' || typeof ColonyHive === 'undefined') return;
        let host = document.getElementById('colony-friends');
        if (!host) { host = document.createElement('div'); host.id = 'colony-friends'; host.className = 'cf-wrap'; scene.appendChild(host); }
        const list = ((Social.cachedFriends() || {}).list || []).filter(f => f.status === 'ok').slice(0, SPOTS.length);
        host.innerHTML = list.map((f, i) => {
            const s = SPOTS[i], bees = Math.min(4, Math.max(1, Math.round(f.card.bees.length / 4)));
            return `<a class="cf-hive" href="./hive-visit.html?code=${encodeURIComponent(f.code)}" style="left:${s.x}%;top:${s.y}%;--sw:${(5 + i * 1.3).toFixed(1)}s" aria-label="Visit ${esc(f.card.owner)}'s hive">
                ${mini(f.card.level)}
                ${Array.from({ length: bees }, (_, k) => `<i class="cf-bee" style="--d:${(3.2 + k * .9).toFixed(1)}s;--dl:-${(k * 1.1).toFixed(1)}s"></i>`).join('')}
                <span class="cf-name">${esc(f.card.owner)}</span></a>`;
        }).join('');
    }

    async function refresh() {
        render();
        try { await Social.friends(false); render(); } catch { /* signed out or offline: keep the saved copy */ }
    }
    return { render, refresh };
})();
