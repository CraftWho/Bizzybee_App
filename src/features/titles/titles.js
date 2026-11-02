// Ranks & Titles page (Oct 31 2026, Craft, approved demo "BizzyBee Ranks & Titles").
// Nov 1 2026 (Craft, approved demo "BizzyBee Titles v2"):
//  - Two ladders, Ranks and Titles. You start at the bottom and climb; each
//    opens at your spot, so you never scroll to find yourself.
//  - Ranks: every level 1-50 is a step with its own badge (LevelBadges in
//    app.js); past 50, a Tier every 5 levels. Levels not reached show "???".
//  - Titles: Equip / Equipped (titles aren't clothes). Not earned = "???".
// Logic: db.js (getRank, getTitles, wearTitle).
document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let tab = location.hash === '#titles' ? 'titles' : 'ranks';

    // Title badges: the same hexagon shield as the rank badges, each with its own mark.
    const hex = (cx, cy, r) => [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 180 * (60 * i - 90); return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
    const D = '#2a1c08';
    const shield = (fill, edge, marks) => `<svg width="38" height="43" viewBox="0 0 64 72" aria-hidden="true"><polygon points="32,2 62,19 62,53 32,70 2,53 2,19" fill="${fill}" stroke="${edge}" stroke-width="3"/>${marks}</svg>`;
    const LOCK = shield('#2a2620', '#4a443a', '<text x="32" y="46" text-anchor="middle" font-family="Courier Prime,monospace" font-weight="700" font-size="26" fill="#6b6253">?</text>');
    const TITLE_BADGE = {
        'streak-keeper': () => shield('#e8a317', '#a87b00', [22, 32, 42].map(y => `<path d="M14 ${y + 8} L32 ${y} L50 ${y + 8}" fill="none" stroke="${D}" stroke-width="5" stroke-linejoin="round"/>`).join('')),
        faithful: () => shield('#ffcc00', '#a87b00', [[32, 22], [22, 30], [42, 30], [32, 38], [22, 46], [42, 46], [32, 54]].map(([x, y]) => `<polygon points="${hex(x, y, 5)}" fill="${D}"/>`).join('')),
        questmaster: () => shield('#c97b10', '#ffcc00', `<polygon points="32,14 36,32 54,36 36,40 32,58 28,40 10,36 28,32" fill="${D}"/><circle cx="32" cy="36" r="4" fill="#ffcc00"/>`),
        'swarm-lord': () => shield('#7a0f24', '#ffcc00', `<ellipse cx="21" cy="30" rx="12" ry="6" fill="#ffcc00" transform="rotate(-24 21 30)"/><ellipse cx="43" cy="30" rx="12" ry="6" fill="#ffcc00" transform="rotate(24 43 30)"/><ellipse cx="21" cy="44" rx="10" ry="5" fill="#e8a317" transform="rotate(20 21 44)"/><ellipse cx="43" cy="44" rx="10" ry="5" fill="#e8a317" transform="rotate(-20 43 44)"/><polygon points="${hex(32, 37, 7)}" fill="${D}" stroke="#ffcc00" stroke-width="2"/>`),
        centurion: () => shield('#4a0a18', '#ffcc00', `<path d="M20 50 Q12 36 22 22" fill="none" stroke="#ffcc00" stroke-width="3"/><path d="M44 50 Q52 36 42 22" fill="none" stroke="#ffcc00" stroke-width="3"/>${[26, 33, 40, 47].map(y => `<ellipse cx="17" cy="${y}" rx="4" ry="2.2" fill="#ffcc00"/><ellipse cx="47" cy="${y}" rx="4" ry="2.2" fill="#ffcc00"/>`).join('')}<rect x="25" y="32" width="14" height="9" rx="1" fill="#ffcc00"/>`),
        quest: () => shield('#ffcc00', '#a87b00', `<rect x="12" y="26" width="40" height="14" rx="2" fill="${D}"/><rect x="16" y="30" width="8" height="6" fill="#ffcc00"/><rect x="28" y="30" width="8" height="6" fill="#e8a317"/><rect x="40" y="30" width="8" height="6" fill="#ffcc00"/><path d="M26 46 L32 58 L38 46 Z" fill="${D}"/>`)
    };
    const titleBadge = (t) => (TITLE_BADGE[t.kind === 'quest' ? 'quest' : t.id] || TITLE_BADGE.quest)();
    const equipBtn = (id) => `<span class="tt-hxw"><span class="tt-hx"><button type="button" data-wear="${esc(id)}">Equip</button></span></span>`;
    const EQUIPPED = '<span class="tt-hxw on"><span class="tt-hx"><span>Equipped</span></span></span>';

    // Ladder steps: levels 1-50, then each Tier (55, 60...), a few past you.
    const steps = (level) => {
        const out = [];
        for (let l = 1; l <= 50; l++) out.push(l);
        for (let l = 55; l <= Math.max(60, level + 10); l += 5) out.push(l);
        return out;
    };

    const render = () => {
        const T = Vault.getTitles(), rk = Vault.getRank();
        const level = rk ? rk.level : 1;
        $('tt-now').innerHTML = `<small>You are</small><b>${esc(rk ? rk.rank.name : 'Larva')}${T.worn ? ` · ${esc(T.worn.name)}` : ''}</b><span>Level ${level}${T.worn ? ` · ${esc(T.worn.how)}` : ''}</span>`;
        document.querySelectorAll('.tt-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
        let html = '';
        if (tab === 'ranks') {
            // Your step: your level, or the Tier you're in past 50.
            const mine = steps(level).filter(l => l <= level).pop();
            $('tt-lead').textContent = 'Every level has its own badge. A new rank every 5 levels; past 50, a Tier every 5.';
            html = steps(level).map(l => {
                if (l > level) return `<div class="tt-row locked">${LOCK}<span class="mid"><b>Level ${l}</b><small>???</small></span></div>`;
                const info = LevelBadges.infoFor(l), here = l === mine;
                return `<div class="tt-row${here ? ' here' : ''}"${here ? ' id="tt-here"' : ''}>${LevelBadges.forLevel(l, 43)}<span class="mid"><b>Level ${l}</b><small>${esc(info.name)} · ${info.metal}${info.first ? ' · new rank!' : ''}</small></span>${here ? '<span class="tt-you">◆ YOU</span>' : '<span class="tt-tick" aria-label="Reached">✓</span>'}</div>`;
            }).join('');
        } else {
            $('tt-lead').textContent = `Earn titles by doing things. ${T.earned.length} earned${T.locked ? `, ${T.locked} still a secret` : ''}.`;
            const row = (t) => {
                if (!t.earned) return `<div class="tt-row locked">${LOCK}<span class="mid"><b>???</b><small>Not earned yet.</small></span></div>`;
                const on = T.worn && T.worn.id === t.id;
                return `<div class="tt-row${on ? ' here' : ''}"${on ? ' id="tt-here"' : ''}>${titleBadge(t)}<span class="mid"><b>${esc(t.name)}</b><small>${esc(t.how)}</small>${t.perk ? `<small class="tt-perk">🎁 ${esc(t.perk)} on every Daily bonus</small>` : ''}</span>${on ? EQUIPPED : equipBtn(t.id)}</div>`;   // Nov 1 2026 (Craft): perk
            };
            html = `<div class="tt-row${T.worn ? '' : ' here'}"${T.worn ? '' : ' id="tt-here"'}>${LevelBadges.forLevel(level, 43)}<span class="mid"><b>Rank only</b><small>Show just your rank.</small></span>${T.worn ? equipBtn('') : EQUIPPED}</div>`
                + T.earned.map(row).join('') + T.all.filter(t => !t.earned).map(row).join('');
        }
        const box = $('tt-list');
        box.innerHTML = html;
        // Open at your spot.
        const center = () => { const h = $('tt-here'); if (h) box.scrollTop += h.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2 + h.offsetHeight / 2; };
        center(); requestAnimationFrame(() => requestAnimationFrame(center));
    };
    document.addEventListener('click', (e) => {
        const tb = e.target.closest('.tt-tabs [data-tab]');
        if (tb) { tab = tb.dataset.tab; history.replaceState(null, '', '#' + tab); render(); return; }
        const w = e.target.closest('[data-wear]');
        if (!w) return;
        const t = Vault.wearTitle(w.dataset.wear || null);
        if (t && typeof Toast !== 'undefined') Toast.show(w.dataset.wear ? `🏅 Equipped: ${t.name}` : '🎖️ Showing your rank only.', 'positive');
        render();
        if (typeof AppShell !== 'undefined' && AppShell.refresh) AppShell.refresh();
    });
    render();
});
