console.log("/// LEVEL BAR (shared) INITIALIZED ///");

// Shared "gated leveling" progress bar system - the standard for any bar in
// this app that represents progress toward a level: it fills toward a cap,
// and once maxed it does NOT advance on its own - it shakes in place and
// offers a Level Up button instead, and only actually advances (and grants
// whatever it's worth) once that button is pressed and the reward is
// revealed through a confetti + tada + gift-box celebration. First built
// for the Dashboard's Skill Mastery matrix, then generalized so any other
// bar (character level on Home/Profile, and anything future) can reuse the
// exact same ritual instead of each page reinventing its own version.
//
// This module has NO idea what a "skill" or "character level" or "pollen"
// is - it only knows about rows (bar + label + level badge) and rewards
// (a title + a list of already-formatted display lines). All of the
// domain-specific logic (what the cap is, what pressing the button
// actually grants) lives with the caller.
const LevelBar = {
    // Renders (and re-renders, after every level-up attempt) a set of
    // gated bars into `container`.
    //
    // options.getRows()      -> () => Row[] - called on first render and
    //                           again after every level-up attempt, so the
    //                           display always reflects fresh state.
    // options.onLevelUp(key) -> async (key) => Reward|null|undefined -
    //                           attempt to level up the row with this key.
    //                           Return null/undefined if there's nothing to
    //                           claim (a guard on the caller's side
    //                           failed - the row is just re-rendered as-is,
    //                           no celebration). Return a Reward to
    //                           celebrate a real claim.
    // options.emptyMessage   -> string shown when getRows() returns [].
    //
    // Row:    { key, icon, label, levelBadge, xpIntoLevel, cap, percentage,
    //           maxed, gradient, shadow }
    // Reward: { title: string, lines: string[] } - `lines` are already
    //         fully-formatted, pre-escaped display strings (e.g.
    //         "🌼 +7 Pollen") - this module has no idea what's actually
    //         inside them. If a line embeds any user-controlled text (a
    //         category name, a custom bee name, etc.), the CALLER is
    //         responsible for escaping it before building the line -
    //         same convention every other feature in this app already
    //         follows (escape at the point of interpolation).
    renderRows(container, options) {
        if (!container) return;
        const { getRows, emptyMessage } = options;
        const rows = getRows() || [];

        if (rows.length === 0) {
            container.innerHTML = `<p class="level-bar-empty-state">${emptyMessage || 'Nothing to track yet.'}</p>`;
            return;
        }

        container.innerHTML = rows.map(row => `
            <div class="level-bar-row">
                <div class="level-bar-labels">
                    <span>${row.icon || ''} ${row.label}${row.levelBadge ? ` <span class="level-bar-badge">${row.levelBadge}</span>` : ''}</span>
                    <span class="text-gold">${row.xpIntoLevel} / ${row.cap}</span>
                </div>
                <div class="level-bar-track-wrap">
                    <div class="hive-progress-track">
                        <div class="hive-progress-fill${row.maxed ? ' hive-progress-fill--maxed' : ''}"
                             data-target-width="${row.percentage}%"
                             style="width: 0%; background: ${row.gradient}; box-shadow: ${row.shadow};"></div>
                    </div>
                </div>
                ${row.maxed ? `<button type="button" class="level-bar-up-btn" data-key="${LevelBar._escapeAttr(row.key)}">⬆ LEVEL UP!</button>` : ''}
            </div>
        `).join('');

        // Kicks the fill from 0% to its real width (the CSS transition on
        // .hive-progress-fill carries it there smoothly - see global.css),
        // then, once that transition has actually landed, pops a small
        // confetti burst right at the tip of the bar. This is the little
        // "confetti at the end of the fill" touch every bar used to be
        // missing - now standard on every LevelBar row, not just Home's.
        setTimeout(() => {
            container.querySelectorAll('.hive-progress-fill').forEach(fill => {
                const targetWidth = fill.getAttribute('data-target-width');
                fill.style.width = targetWidth;

                const percentage = parseFloat(targetWidth);
                const wrap = fill.closest('.level-bar-track-wrap');
                if (wrap && percentage > 0) {
                    setTimeout(() => LevelBar._burstFillConfetti(wrap, percentage), 1500);
                }
            });
        }, 150);

        container.querySelectorAll('.level-bar-up-btn').forEach(btn => {
            btn.addEventListener('click', () => LevelBar._handleClick(btn, container, options));
        });
    },

    // A small radial confetti puff anchored at the fill's current leading
    // edge (left: X%, matching the bar's own percentage) - deliberately
    // separate from the bigger "falling from the top" confetti the
    // celebration modal uses (launchConfetti below): this one is subtle,
    // lives right on the bar itself, and plays every time a bar fills in,
    // not just on a level-up claim.
    _burstFillConfetti(wrap, percentage) {
        const anchor = document.createElement('div');
        anchor.className = 'level-bar-fill-confetti-anchor';
        anchor.style.left = `${Math.min(100, percentage)}%`;
        wrap.appendChild(anchor);

        for (let i = 0; i < 14; i++) {
            const piece = document.createElement('span');
            piece.className = 'level-bar-fill-confetti-piece';
            const angle = Math.random() * Math.PI * 2;
            const distance = 22 + Math.random() * 30;
            piece.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
            piece.style.setProperty('--ty', `${Math.sin(angle) * distance - 14}px`);
            piece.style.setProperty('--rot', `${Math.random() * 360}deg`);
            piece.style.background = LevelBar._confettiColors[Math.floor(Math.random() * LevelBar._confettiColors.length)];
            piece.style.animationDelay = `${Math.random() * 100}ms`;
            anchor.appendChild(piece);
        }

        setTimeout(() => anchor.remove(), 1300);
    },

    async _handleClick(btn, container, options) {
        const key = btn.dataset.key;
        const originalLabel = btn.textContent;
        btn.textContent = '🐝 Leveling up...';
        btn.disabled = true;

        try {
            const reward = await options.onLevelUp(key);
            if (!reward) {
                if (typeof Toast !== 'undefined') Toast.show("That one isn't ready to level up yet.", 'negative');
                LevelBar.renderRows(container, options);
                return;
            }
            LevelBar.celebrate(reward);
            LevelBar.renderRows(container, options);
        } catch (error) {
            if (typeof Toast !== 'undefined') Toast.show(`⚠️ Could not process the level-up: ${error.message}`, 'negative');
            btn.textContent = originalLabel;
            btn.disabled = false;
        }
    },

    _escapeAttr(str) {
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // --- CELEBRATION: confetti + tada + gift box ---------------------------

    // A short synthesized fanfare (4 ascending notes) via the Web Audio
    // API - no external sound file to fetch or ship, works fully offline.
    // Wrapped defensively since some browsers block audio until a user
    // gesture has happened elsewhere on the page - the celebration should
    // never break just because the chime didn't play.
    playTadaSound() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;

                const start = ctx.currentTime + i * 0.09;
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

                osc.connect(gain).connect(ctx.destination);
                osc.start(start);
                osc.stop(start + 0.4);
            });
        } catch (error) {
            // Sound is a nice-to-have - never let it break the celebration.
        }
    },

    _confettiColors: ['#ffd700', '#dc143c', '#ffffff', '#4caf50', '#3498db'],

    // Bursts ~60 falling/rotating pieces into `layer`, each one removing
    // itself once its own fall animation ends - no ongoing interval to
    // clean up later.
    launchConfetti(layer) {
        for (let i = 0; i < 60; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = `${Math.random() * 100}%`;
            piece.style.background = LevelBar._confettiColors[Math.floor(Math.random() * LevelBar._confettiColors.length)];
            piece.style.animationDelay = `${Math.random() * 0.35}s`;
            piece.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
            piece.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 160)}px`);
            layer.appendChild(piece);
            piece.addEventListener('animationend', () => piece.remove());
        }
    },

    // The level-up reward screen (Oct 2026 rebuild, from the approved demo).
    // Stage 1: a sealed honeycomb - tap it, it shakes and bursts open.
    // Stage 2: the new level, its perks, each reward as its own tile, and
    // how far it is to the next level.
    //   reward = { title, lines }              (any caller - lines become tiles)
    //   reward.rich = { cap, level, ribbon, perks[], loot[], next, beeId }
    //     loot item: { bee } or { icon, name, qty, sub }
    //     next: { level, now, cap }
    celebrate(reward) {
        const esc = LevelBar._escapeHTML;
        const rich = reward.rich || LevelBar._richFromLines(reward);
        const overlay = document.createElement('div');
        overlay.className = 'lvr';
        overlay.innerHTML = `
            <canvas class="lvr-cv"></canvas>
            <div class="lvr-box" role="dialog" aria-modal="true" aria-label="${esc(reward.title || 'Level up')}">
                <div class="lvr-st1">
                    <span class="lvr-ribbon">${esc(rich.ribbon || 'LEVEL UP')}</span>
                    <button type="button" class="lvr-seal" aria-label="Open your reward">${LevelBar._sealSVG()}</button>
                    <p class="lvr-tap">TAP TO OPEN</p>
                </div>
                <div class="lvr-st2">
                    <div class="lvr-cap">${esc(rich.cap || '')}</div>
                    <div class="lvr-lvl">${rich.level != null ? esc(String(rich.level)) : '🎉'}</div>
                    <div class="lvr-perks">${(rich.perks || []).map(p => `<span>${esc(p)}</span>`).join('')}</div>
                    <div class="lvr-bees">${(rich.loot || []).filter(l => l.bee).map(l => LevelBar._lootHTML(l)).join('')}</div>
                    <div class="lvr-loot">${(rich.loot || []).filter(l => !l.bee).map(l => LevelBar._lootHTML(l)).join('')}</div>
                    ${rich.next ? `<p class="lvr-next">Level ${esc(String(rich.next.level))}: ${esc(String(rich.next.now))} / ${esc(String(rich.next.cap))} XP</p><div class="lvr-bar"><i></i></div>` : ''}
                    <div class="lvr-btns">
                        ${rich.beeId ? '<button type="button" class="lvr-btn" data-lvr="bee">🐝 See my bee</button>' : ''}
                        <button type="button" class="lvr-btn gold" data-lvr="close">Collect</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelectorAll('[data-card]').forEach(host => {
            try {
                const [r, el] = host.dataset.card.split('|');
                const key = beeCardApplyTheme(host, r, r === 'Common' ? null : (el || null));
                host.innerHTML = beeCardArtHTML({ rarityKey: key, rivets: 2 });
            } catch (e) { host.textContent = '🐝'; }
        });

        let opened = false;
        const close = () => { overlay.classList.add('out'); setTimeout(() => overlay.remove(), 250); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        const open = () => {
            if (opened) return;
            opened = true;
            const seal = overlay.querySelector('.lvr-seal');
            seal.classList.add('shake');
            setTimeout(() => {
                overlay.classList.add('open');
                LevelBar.playTadaSound();
                LevelBar._hexBurst(overlay.querySelector('.lvr-cv'));
                overlay.querySelectorAll('.lvr-item').forEach((el, i) => setTimeout(() => el.classList.add('in'), 450 + i * 260));
                const bar = overlay.querySelector('.lvr-bar i');
                if (bar && rich.next && rich.next.cap) setTimeout(() => { bar.style.width = `${Math.min(100, Math.round(rich.next.now / rich.next.cap * 100))}%`; }, 900 + (rich.loot || []).length * 260);
                const btn = overlay.querySelector('[data-lvr="close"]');
                if (btn) btn.focus();
            }, 500);
        };
        overlay.querySelector('.lvr-seal').addEventListener('click', open);
        overlay.addEventListener('click', (e) => {
            const b = e.target.closest('[data-lvr]');
            if (!b) return;
            if (b.dataset.lvr === 'close') close();
            if (b.dataset.lvr === 'bee') {
                const path = `src/features/colony-bees/colony-bees.html?bee=${encodeURIComponent(rich.beeId)}`;
                location.href = typeof AppShell !== 'undefined' && AppShell.url ? AppShell.url(path) : `../../../${path}`;
            }
        });
        setTimeout(() => { const s = overlay.querySelector('.lvr-seal'); if (s) s.focus(); }, 50);
    },

    // Callers that only give { title, lines }: each line ("🎟️ +1 Gacha
    // Ticket") becomes a tile with its leading emoji as the icon.
    _richFromLines(reward) {
        const m = String(reward.title || '').match(/^(.*?)\s*(?:reached\s+)?Level\s+(\d+)/i);
        const loot = (reward.lines || []).filter(l => l && l !== 'Onward!').map(line => {
            const text = String(line).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            const parts = text.trim().split(/\s+/);
            const icon = /\p{Extended_Pictographic}/u.test(parts[0]) ? parts.shift() : '✨';
            return { icon, name: parts.join(' ') };
        });
        return {
            cap: m && m[1] ? `${m[1].replace(/[!]/g, '').trim().toUpperCase()} LEVEL` : String(reward.title || 'LEVEL UP').toUpperCase(),
            level: m ? m[2] : null,
            ribbon: 'LEVEL UP',
            perks: [],
            loot
        };
    },

    _lootHTML(l) {
        const esc = LevelBar._escapeHTML;
        if (l.bee) {
            const b = l.bee;
            const info = (typeof BEE_RARITIES !== 'undefined' ? BEE_RARITIES : []).find(r => r.rarity === b.rarity);
            const rc = info ? info.color : '#ffcc00';
            const talent = b.talent && typeof BEE_CLASSES !== 'undefined' && BEE_CLASSES[b.talent] ? `⭐ Born ${BEE_CLASSES[b.talent].label}` : '';
            const where = b.life && b.life.hatchOn ? 'in the Nursery' : 'in your colony';
            const art = typeof beeCardArtHTML === 'function' ? `<span class="art-tile bc-tile" data-card="${esc(b.rarity)}|${esc(b.element || '')}"></span>` : '<span class="lvr-emo">🐝</span>';
            const name = typeof beeFullName === 'function' ? beeFullName(b) : b.name;
            return `<div class="lvr-item bee" style="--rc:${rc}"><div class="lvr-mini">${art}</div>
                <div><span class="lvr-rar">${esc(String(b.rarity || '').toUpperCase())}</span><b>New bee: ${esc(name)}</b><small>${esc([talent, where].filter(Boolean).join(' · '))}</small></div></div>`;
        }
        return `<div class="lvr-item">${l.qty ? `<span class="lvr-qty">×${esc(String(l.qty))}</span>` : ''}<div class="lvr-ic">${esc(l.icon || '✨')}</div><b>${esc(l.name || '')}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</div>`;
    },

    _sealSVG() {
        return `<svg viewBox="0 0 170 190" aria-hidden="true"><defs>
            <linearGradient id="lvrG1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#ffcc00"/><stop offset="1" stop-color="#8a6000"/></linearGradient>
            <radialGradient id="lvrG2" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#5a3c06"/><stop offset="1" stop-color="#140c02"/></radialGradient></defs>
            <polygon points="85,4 164,49 164,141 85,186 6,141 6,49" fill="url(#lvrG2)" stroke="url(#lvrG1)" stroke-width="5"/>
            <g stroke="rgba(255,204,0,.35)" stroke-width="1.5" fill="none">
                <polygon points="85,40 110,54 110,82 85,96 60,82 60,54"/><polygon points="60,82 85,96 85,124 60,138 35,124 35,96"/><polygon points="110,82 135,96 135,124 110,138 85,124 85,96"/></g>
            <circle cx="85" cy="112" r="24" fill="#b3121f" stroke="#ff5a4a" stroke-width="2"/>
            <text x="85" y="121" text-anchor="middle" font-size="24">🐝</text></svg>`;
    },

    // Gold hexes bursting out of the seal.
    _hexBurst(cv) {
        if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const ctx = cv.getContext('2d');
        const W = innerWidth, H = innerHeight, dpr = window.devicePixelRatio || 1;
        cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cx = W / 2, cy = H * 0.36;
        let parts = Array.from({ length: 140 }, () => {
            const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
            const c = Math.random() < 0.75 ? '#ffcc00' : (Math.random() < 0.5 ? '#fff2b0' : '#ff8a3d');
            return { x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, r: 4 + Math.random() * 8, rot: Math.random() * 6, life: 1, c };
        });
        const hex = (x, y, r, rot) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); };
        const loop = () => {
            ctx.clearRect(0, 0, W, H);
            parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.985; p.rot += 0.05; p.life -= 0.009; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; hex(p.x, p.y, p.r, p.rot); ctx.fill(); });
            parts = parts.filter(p => p.life > 0);
            ctx.globalAlpha = 1;
            if (parts.length && cv.isConnected) requestAnimationFrame(loop);
        };
        loop();
    }
};
