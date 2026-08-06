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
    // Row:    { key, icon, label, levelBadge, dpIntoLevel, cap, percentage,
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
                    <span class="text-gold">${row.dpIntoLevel} / ${row.cap}</span>
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

    // Opens the shared celebration modal. The reward is already fully
    // known by the time this is called (see _handleClick above) - stage 1
    // is a closed gift box waiting for a tap, stage 2 (revealed on tap)
    // shows the real reward lines plus the confetti/sound. Click-outside
    // or the close button dismisses it, same convention as every other
    // overlay in this app (EeveeChat, the Map's Key window, etc.).
    celebrate(reward) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay level-up-overlay';
        overlay.innerHTML = `
            <div class="modal-box level-up-modal-box">
                <div class="level-up-confetti-layer" id="level-up-confetti-layer"></div>
                <button class="modal-close level-up-close" aria-label="Close">✕</button>
                <div class="level-up-stage" id="level-up-giftbox-stage">
                    <p class="level-up-heading">🎉 ${LevelBar._escapeHTML(reward.title)}</p>
                    <button type="button" class="level-up-giftbox-btn" id="level-up-giftbox-btn" aria-label="Open gift">🎁</button>
                    <p class="level-up-hint">Tap the gift box!</p>
                </div>
                <div class="level-up-stage" id="level-up-reward-stage" style="display: none;">
                    <p class="level-up-heading">🎉 Rewards!</p>
                    <ul class="level-up-reward-list">
                        ${(reward.lines || []).map(line => `<li>${line}</li>`).join('')}
                    </ul>
                    <button type="button" class="level-up-done-btn" id="level-up-done-btn">Nice!</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close();
        });
        overlay.querySelector('.level-up-close').addEventListener('click', close);
        overlay.querySelector('#level-up-done-btn').addEventListener('click', close);

        overlay.querySelector('#level-up-giftbox-btn').addEventListener('click', () => {
            LevelBar.playTadaSound();
            LevelBar.launchConfetti(overlay.querySelector('#level-up-confetti-layer'));
            overlay.querySelector('#level-up-giftbox-stage').style.display = 'none';
            overlay.querySelector('#level-up-reward-stage').style.display = '';
        }, { once: true });
    }
};
