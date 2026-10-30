// HIVE LIFE view (Oct 2026, approved demos). The hive is six combs (rooms):
// Royal Chamber, Nursery, Honey Store, Workshop, Rest Comb and Entrance.
// Each bee sits on its job's comb (BEE_CLASSES zone in db.js); Foragers and
// Scouts fly out from the Entrance to the meadow. Tap a comb to manage it:
// see its bees, change jobs, add resting bees, and pick jobs for eggs that
// haven't hatched yet. Faces pop out of bees: 😊 happy, 😢 lacking food,
// rest or health, 😠 no job for 3+ days (beeFeeling in db.js).
// Up to 3 bees are drawn per comb, then a +N badge. The old inside view
// stays available as "Classic" (colony.js).
const HiveLife = (() => {
    const COMBS = [
        { id: 'royal', icon: '👑', name: 'Royal Chamber', jobs: ['attendant', 'drone'], x: 34.5, y: 1, text: 'Your Queen lives here. Attendants groom her. Drones wait to mate with her.' },
        { id: 'nursery', icon: '🥚', name: 'Nursery', jobs: ['nurse'], x: 3, y: 17, text: 'New bees start as eggs here. What hatches is a surprise. Nurses speed hatching and healing.' },
        { id: 'honey', icon: '🍯', name: 'Honey Store', jobs: ['honeymaker', 'watercarrier'], x: 66, y: 17, text: 'Food for the hive. Honey Makers make Honey Drops. Water Carriers keep workers fresh.' },
        { id: 'workshop', icon: '🔨', name: 'Workshop', jobs: ['architect', 'cleaner'], x: 34.5, y: 33, text: 'Comb Builders add quest loot. Cleaners soften lost raids.' },
        { id: 'rest', icon: '💤', name: 'Rest Comb', jobs: [], x: 3, y: 49, text: 'Recuperating bees, bees with no job, and fainted bees. Recuperating bees eat, sleep and heal slowly. Bees with no job get upset after 3 days.' },
        { id: 'entrance', icon: '🛡️', name: 'Entrance', jobs: ['guardian', 'barrier', 'undertaker', 'collector', 'scout'], x: 66, y: 49, text: 'Guards and Sealers fight raids. Foragers and Scouts fly out from here.' }
    ];
    const ZONE_ROOM = { royal: 'royal', brood: 'nursery', honey: 'honey', comb: 'workshop', entrance: 'entrance', outside: 'entrance' };
    const CAP = 3;
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rand = (a, b) => a + Math.random() * (b - a);
    const zoneOf = (bee) => {
        if (!bee.life || bee.life.faintedAt || bee.life.hatchOn || bee.life.stamina < 10 || !bee.class) return 'rest';
        const info = BEE_CLASSES[bee.class];
        return info && info.zone ? info.zone : 'rest';
    };
    const roomOf = (bee) => beeIsBrood(bee) ? 'nursery' : (ZONE_ROOM[zoneOf(bee)] || 'rest');
    const nurseCount = () => Vault._workers('nurse').length;
    const jobsFor = (bee, list = Object.keys(BEE_CLASSES)) => list.filter(j => !!BEE_CLASSES[j].maleOnly === (bee.sex === 'm'));
    const isOut = (bee) => zoneOf(bee) === 'outside';

    // A face that floats up and fades (inside the hive or over the page).
    function popFace(parent, face, left, top, fixed = false) {
        const p = document.createElement('div');
        p.className = 'hl-face' + (fixed ? ' is-fixed' : '');
        p.textContent = face;
        p.style.left = typeof left === 'number' ? left + (fixed ? 'px' : '%') : left;
        p.style.top = typeof top === 'number' ? top + (fixed ? 'px' : '%') : top;
        parent.appendChild(p);
        setTimeout(() => p.remove(), 2300);
    }
    // Who gets a face this round: every unhappy bee, some happy ones.
    const wantsFace = (f) => f.key === 'sad' || f.key === 'upset' || (f.key === 'happy' && Math.random() < 0.4);

    // ---- the comb ----------------------------------------------------------
    function mountComb(host, { bees, onBeeClick, onChange }) {
        host.innerHTML = `<div class="hl-hive" role="group" aria-label="Your hive. Tap a comb to manage it.">
            <div class="hl-meadow" aria-hidden="true"><span>🌼</span><span>🌸</span><span>🌻</span><span>🌷</span><span>🌼</span></div></div>`;
        const hive = host.querySelector('.hl-hive');
        const walkers = [];
        const timers = [];
        const today = todayISO();
        const byRoom = {};
        COMBS.forEach(c => { byRoom[c.id] = []; });
        bees.forEach(b => byRoom[roomOf(b)].push(b));

        const place = (w) => {
            const [x1, y1, x2, y2] = w.box;
            const nx = rand(x1, x2), ny = rand(y1, y2);
            w.el.classList.toggle('flip', nx < w.x);
            w.x = nx; w.y = ny;
            w.el.style.left = nx + '%'; w.el.style.top = ny + '%';
        };
        const addWalker = (bee, box, kind = '') => {
            const el = document.createElement('span');
            el.className = 'hl-bee' + kind + (bee && bee.life && bee.life.faintedAt ? ' is-faint' : '');
            el.setAttribute('aria-hidden', 'true');
            el.innerHTML = kind === ' is-egg' ? `<span class="hl-b hl-egg">${typeof EggDesign !== 'undefined' ? EggDesign.forBee(bee) : '🥚'}</span>` : `<span class="hl-b">🐝</span>${kind === ' is-queen' ? '<span class="hl-tag">👑</span>' : ''}`;
            hive.appendChild(el);
            const w = { el, box, x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2, bee, still: kind === ' is-egg' || !!(bee && bee.life && bee.life.faintedAt) };
            walkers.push(w); place(w);
        };

        const needy = [];
        COMBS.forEach(c => {
            const list = byRoom[c.id];
            const eggs = list.filter(beeIsBrood);
            const shown = list.filter(b => !beeIsBrood(b) && !isOut(b));
            const out = list.filter(isOut).length;
            const unhappy = list.filter(b => { if (typeof beeNeedsHelp === 'function') return beeNeedsHelp(b); const k = beeFeeling(b, today).key; return k === 'sad' || k === 'upset' || k === 'fainted'; }).length;
            const count = c.id === 'nursery' ? `${shown.length} nurse${shown.length === 1 ? '' : 's'} · ${eggs.length} egg${eggs.length === 1 ? '' : 's'}`
                : c.id === 'entrance' ? `${shown.length} here${out ? ` · ${out} out` : ''}`
                : `${shown.length} bee${shown.length === 1 ? '' : 's'}`;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hl-cell' + (unhappy ? ' alert' : '');
            btn.style.left = c.x + '%'; btn.style.top = c.y + '%';
            btn.setAttribute('aria-label', `${c.name}, ${count}${unhappy ? `, ${unhappy} need${unhappy === 1 ? 's' : ''} help` : ''}. Tap to manage.`);
            // Oct 30 2026 (Craft): a red dot on a comb with jobs but nobody working.
            const empty = c.jobs.length && !shown.length && !list.filter(isOut).length;
            if (empty) needy.push(c.name);
            btn.innerHTML = `<span class="hl-in"><span class="hl-ic${c.id === 'nursery' ? ' hl-egg-ic' : ''}">${roomIcon(c)}</span><span class="hl-nm">${c.name}</span><span class="hl-ct">${count}</span></span>${unhappy ? `<span class="hl-dot">${unhappy}</span>` : ''}${empty ? '<span class="hl-need" title="Needs workers"></span>' : ''}`;
            if (empty) btn.setAttribute('aria-label', btn.getAttribute('aria-label') + ' Needs workers.');
            btn.addEventListener('click', () => openRoom(c.id, { onBeeClick, onChange }));
            hive.appendChild(btn);
            // Bees wander in the lower half of their comb.
            const box = [c.x + 8, c.y + 19, c.x + 23, c.y + 25];
            if (c.id === 'royal') addWalker(null, [c.x + 13, c.y + 19, c.x + 18, c.y + 22], ' is-queen');
            if (c.id === 'nursery') eggs.slice(0, CAP).forEach((b, i) => addWalker(b, [c.x + 7 + i * 6, c.y + 6, c.x + 7 + i * 6, c.y + 6], ' is-egg'));
            shown.slice(0, CAP).forEach(b => addWalker(b, box));
            if (shown.length > CAP) {
                const more = document.createElement('span');
                more.className = 'hl-more'; more.textContent = '+' + (shown.length - CAP);
                more.style.left = (c.x + 24) + '%'; more.style.top = (c.y + 17) + '%';
                hive.appendChild(more);
            }
        });

        if (needy.length) {
            const bz = document.createElement('div');
            bz.className = 'hl-buzz';
            bz.innerHTML = `🐝 <b>The Hive is Buzzing!</b> ${needy.length === 1 ? `The ${esc(needy[0])} needs` : `${needy.length} combs need`} workers. Tap a red dot.`;
            host.prepend(bz);
        }
        lastMount = { onBeeClick, onChange };
        timers.push(setInterval(() => { walkers.forEach(w => { if (!w.still && Math.random() < 0.7) place(w); }); }, 1700));

        // Faces pop out of the bees you can see.
        const faces = () => {
            if (document.hidden) return;
            walkers.filter(w => w.bee && !beeIsBrood(w.bee)).forEach((w, i) => {
                const f = beeFeeling(w.bee, todayISO());
                if (!wantsFace(f)) return;
                setTimeout(() => popFace(hive, f.face, w.x, w.y - 4), i * 240);
            });
        };
        timers.push(setTimeout(faces, 600));
        timers.push(setInterval(faces, 6500));

        // Foragers and Scouts: meadow -> Entrance comb -> meadow, with loot.
        const flyers = bees.filter(isOut);
        const door = COMBS.find(c => c.id === 'entrance');
        const trip = () => {
            if (!flyers.length || document.hidden) return;
            const bee = flyers[Math.floor(Math.random() * flyers.length)];
            const f = document.createElement('div');
            f.className = 'hl-flyer';
            f.innerHTML = `<span class="hl-b">🐝</span><span class="hl-name">${esc(bee.name)}</span>`;
            f.style.left = rand(5, 90) + '%'; f.style.top = '96%';
            hive.appendChild(f);
            requestAnimationFrame(() => requestAnimationFrame(() => { f.style.left = (door.x + 15) + '%'; f.style.top = (door.y + 26) + '%'; }));
            setTimeout(() => {
                const fe = beeFeeling(bee, todayISO());
                popFace(hive, wantsFace(fe) && fe.key !== 'happy' ? fe.face : (bee.class === 'scout' ? '💃' : '🌼'), door.x + 13, door.y + 20);
                f.style.left = rand(5, 90) + '%'; f.style.top = '106%';
                setTimeout(() => f.remove(), 2300);
            }, 2300);
        };
        if (flyers.length) { timers.push(setTimeout(trip, 800)); timers.push(setInterval(trip, 4800)); }
        else {
            const note = document.createElement('span');
            note.className = 'hl-label hl-meadow-note'; note.textContent = 'No Foragers out. Tap the Entrance to give a bee the Forager job.';
            hive.appendChild(note);
        }
        return { destroy() { timers.forEach(t => { clearInterval(t); clearTimeout(t); }); host.innerHTML = ''; } };
    }

    // ---- a comb's pop-up ---------------------------------------------------
    let sheet = null, backTo = null, lastMount = null;
    // After a bee's card closes, reopen the comb it was opened from.
    function reopenLast() {
        const id = backTo; backTo = null;
        if (id && lastMount) openRoom(id, lastMount);
    }
    function closeRoom() {
        if (!sheet) return;
        sheet.remove(); sheet = null;
        document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') closeRoom(); }

    function roomStats(c, list) {
        const mats = (Vault.state.inventory && Vault.state.inventory.materials) || {};
        const live = Vault._lifeBees().filter(b => !beeIsBrood(b));
        if (c.id === 'honey') {
            const full = live.length ? Math.round(live.reduce((n, b) => n + b.life.fullness, 0) / live.length) : 0;
            return `<div class="hl-meter"><span>Hive fullness</span><span>${full}%</span></div><span class="hl-bar"><i style="width:${full}%;background:#ffcc00"></i></span>
                <p class="hl-note">🍯 ${mats['honey-drop'] || 0} Honey Drops · 🌼 ${mats.pollen || 0} Pollen. Finishing tasks and dailies feeds every bee.</p>`;
        }
        if (c.id === 'nursery') {
            const n = nurseCount();
            return `<p class="hl-note">Eggs take ${LIFE.broodDays} days to hatch${n ? `. A Nurse is working, so it's ${LIFE.broodDays - 1} day` : '. A working Nurse Bee makes it 1 day faster'}.</p>`;
        }
        if (c.id === 'royal') {
            const drone = !!(Vault.state.colony && Vault.state.colony.droneBoost);
            return `<p class="hl-note">♂️ Drone boost: ${drone ? '<b>ready</b> for your next pull' : 'not yet'}. Each working Attendant gives +1 ✨ Royal Nectar when you level up.</p>`;
        }
        if (c.id === 'workshop') {
            const rolls = Math.min(3, Vault._workers('architect').length);
            return `<p class="hl-note">🔨 Quest loot: +${rolls} roll${rolls === 1 ? '' : 's'} (max 3). ${Vault._workers('cleaner').length ? 'Cleaners are keeping the hive tidy.' : 'No Cleaner yet.'}</p>`;
        }
        if (c.id === 'entrance') {
            const def = 15 + Vault._workers('guardian').reduce((n, b) => n + (b.stats.defense || 0) + (b.life.birthTrait === 'iron-shell' ? 10 : 0), 0)
                + Vault._workers('barrier').reduce((n, b) => n + Math.round((b.stats.hp || 0) * 0.4), 0);
            return `<p class="hl-note">🛡️ Raid defense ${def} · ${Math.round(raidChance(Vault.getHiveStreak()) * 100)}% raid risk a day. ${list.filter(isOut).length} out foraging.</p>`;
        }
        return `<p class="hl-note">Recuperating: +4 stamina and −3 fatigue an hour by day, more asleep at night. Tap a fainted bee to revive it.</p>`;
    }

    // ⭐ = the bee's natural talent (+20% at it). A Named Beast's job is
    // locked by its title, so its picker is shown but can't change.
    // The Nursery's icon is a real BizzyBee egg, not an emoji (Oct 29 2026).
    function roomIcon(c) {
        if (c.id === 'nursery' && typeof EggDesign !== 'undefined') return EggDesign.svg(7, { style: 'hex', id: 'nursery-ic' });
        return c.icon;
    }
    function jobSelect(bee, allowed, { blank = '— No job —', mark = [] } = {}) {
        const locked = typeof beeLockedJob === 'function' ? beeLockedJob(bee) : null;
        if (locked) return `<select class="hl-job" disabled aria-label="${esc(bee.name)}'s job is set by its title" title="Set by its title"><option>🔒 ${BEE_CLASSES[locked].icon} ${esc(BEE_CLASSES[locked].label)}</option></select>`;
        return `<select class="hl-job" data-bee="${esc(bee.id)}" aria-label="Job for ${esc(bee.name)}">
            <option value="">${blank}</option>${typeof beeNurseryOption === 'function' ? beeNurseryOption(bee) : ''}<option value="recuperate"${bee.life && bee.life.recuperate ? ' selected' : ''}>💤 Recuperate</option>${allowed.map(j => `<option value="${j}"${bee.class === j ? ' selected' : ''}>${BEE_CLASSES[j].icon} ${esc(BEE_CLASSES[j].label)}${bee.talent === j ? ' ⭐' : ''}${mark.includes(j) ? ' ★' : ''}</option>`).join('')}</select>`;
    }
    function beeRow(bee, c, today) {
        const f = beeFeeling(bee, today);
        const L = bee.life || {};
        const where = isOut(bee) ? ' · out foraging' : '';
        return `<div class="hl-row"><span class="hl-rface" title="${esc(f.key)}">${f.face}</span>
            <button type="button" class="hl-who-btn" data-card="${esc(bee.id)}"><b>${esc(bee.name)}${bee.sex === 'm' ? ' ♂' : ''}</b><small>${esc(f.why)}${where} · 🍯${Math.round(L.fullness ?? 0)} ⚡${Math.round(L.stamina ?? 0)} ❤️${Math.round(L.health ?? 0)}</small></button>
            <button type="button" class="hl-ren" data-ren="${esc(bee.id)}" aria-label="Rename ${esc(bee.name)}">✏️</button>
            ${jobSelect(bee, jobsFor(bee), { mark: c.jobs })}</div>`;
    }

    function openRoom(id, opts = {}) {
        const c = COMBS.find(x => x.id === id);
        if (!c) return;
        const today = todayISO();
        const all = Vault.getColonyBees().filter(b => b.rarity !== 'Royal');
        const list = all.filter(b => roomOf(b) === id && !beeIsBrood(b));
        const eggs = id === 'nursery' ? all.filter(beeIsBrood) : [];
        const idle = c.jobs.length ? all.filter(b => roomOf(b) === 'rest' && !b.class && !beeIsBrood(b) && !(b.life && b.life.faintedAt) && jobsFor(b, c.jobs).length) : [];
        const n = nurseCount();

        let html = `<div class="hl-sheet" role="dialog" aria-modal="true" aria-label="${esc(c.name)}">
            <div class="hl-sheet-head"><span class="hl-sheet-ic${c.id === 'nursery' ? ' hl-egg-ic' : ''}">${roomIcon(c)}</span><div><h2>${c.name}</h2><small>${c.text}</small></div><button type="button" class="hl-x" aria-label="Close">×</button></div>
            ${roomStats(c, list)}`;
        if (id === 'nursery') {
            html += `<h3 class="hl-sub">Eggs (${eggs.length})</h3>`;
            html += eggs.length ? eggs.map(b => {
                const left = broodDaysLeft(b, today, n);
                // Eggs keep everything secret until they hatch (Oct 27 2026).
                const inInc = Vault.state.incubator && (Vault.state.incubator.slots || []).includes(b.id);
                const ready = Vault.isEggReady && Vault.isEggReady(b);
                return `<div class="hl-row is-egg"><span class="hl-rface hl-egg">${typeof EggDesign !== 'undefined' ? EggDesign.forBee(b) : '🥚'}</span><span class="hl-who-btn"><b>Unknown egg</b><small>${inInc ? '🔆 In the incubator · ' : ''}${ready ? 'Ready to hatch!' : `Hatches ${left <= 1 ? 'tomorrow' : `in ${left} days`}`}</small></span>${ready ? `<button type="button" class="hl-hatch" data-hatch="${esc(b.id)}">🐣 Hatch</button>` : ''}
</div>`;
            }).join('') + '<p class="hl-note">What hatches is a surprise. Name it and pick its job once it hatches.</p>'
                + ((Vault.state.incubator && (Vault.state.incubator.owned || []).length) ? `<a class="hl-inc-link" href="../incubator/incubator.html">🥚 Egg Incubator: hatch eggs faster with your steps ›</a>` : `<a class="hl-inc-link" href="../honey-store/honey-store.html#incubators">🥚 Get an Egg Incubator in the Honey Store ›</a>`)
                : '<p class="hl-note">No eggs right now. New bees from the Pollination Chamber, level-ups and skills start here.</p>';
        }
        // Oct 30 2026 (Craft): how strong this comb is, best workers first,
        // and the best free bees with the % each would add (WorkerCard).
        const WC = typeof WorkerCard !== 'undefined' ? WorkerCard : null;
        const power = WC && c.jobs.length ? WC.combPower(list, c.jobs) : null;
        if (power !== null) html += `<div class="hl-meter"><span>Comb strength</span><span>${power}%</span></div><span class="hl-bar"><i style="width:${power}%;background:${power >= 70 ? '#5fd38a' : power >= 35 ? '#ffcc00' : '#ff5a5a'}"></i></span>`;
        const sorted = WC ? list.slice().sort((a, b) => WC.score(b, b.class) - WC.score(a, a.class)) : list;
        html += `<h3 class="hl-sub">${id === 'rest' ? 'Resting' : 'Working here'} (${list.length})</h3>`;
        html += sorted.length ? sorted.map(b => beeRow(b, c, today)).join('') : `<p class="hl-note">${id === 'rest' ? 'Nobody is resting. Every bee has work.' : 'No bees here yet.'}</p>`;
        if (idle.length) {
            const picks = idle.map(b => ({ b, best: WC ? WC.bestJob(b, c.jobs) : { j: jobsFor(b, c.jobs)[0], s: 0 } })).filter(x => x.best && x.best.j)
                .sort((a, b) => b.best.s - a.best.s);
            html += `<h3 class="hl-sub">Best free bees for this comb</h3>` + picks.map(({ b, best }) => {
                if (!WC) return '';
                const after = WC.combPower([...list, { ...b, class: best.j }], c.jobs);
                return WC.html(b, { job: best.j, effect: `Comb ${power}% → ${after}% (+${after - power}%)`, action: 'add', label: `Add as ${BEE_CLASSES[best.j].label}` });
            }).join('') + '<p class="hl-note">Bees already working in another comb aren\'t listed. Change their job there first.</p>';
        }
        if (c.jobs.length) html += '<p class="hl-note">★ = jobs done in this comb. ⭐ = the bee\'s natural talent (+20% at it). 🔒 = a Named Beast, its title sets its job.</p>';
        html += '</div>';

        const fresh = !sheet;
        if (fresh) {
            sheet = document.createElement('div');
            sheet.className = 'hl-sheet-scrim';
            document.body.appendChild(sheet);
            document.addEventListener('keydown', onKey);
        }
        const scroll = sheet.querySelector('.hl-sheet') ? sheet.querySelector('.hl-sheet').scrollTop : 0;
        sheet.innerHTML = html;
        const box = sheet.querySelector('.hl-sheet');
        box.scrollTop = scroll;
        if (!fresh) box.style.animation = 'none';
        sheet.onclick = (e) => {
            if (e.target === sheet || e.target.closest('.hl-x')) { closeRoom(); return; }
            const hb = e.target.closest('[data-hatch]');
            if (hb) { closeRoom(); AppShell.hatch(hb.dataset.hatch, () => { if (opts.onChange) opts.onChange(); }); }
        };
        sheet.querySelectorAll('.hl-job').forEach(sel => sel.addEventListener('change', () => {
            const bee = Vault.getColonyBees().find(b => b.id === sel.dataset.bee);
            const job = sel.value || null;
            const r = Vault.assignBeeClass(sel.dataset.bee, job);
            if (typeof Toast !== 'undefined' && bee) {
                if (!r) Toast.show(Vault.lastJobError || "That bee can't do that job.", 'negative');
                else Toast.show(job === 'nursery' ? `🛏️ ${r.name} is in a Nursery bed. +4 health an hour.` : job === 'recuperate' ? `💤 ${r.name} is recuperating.` : job ? `${beeIsBrood(r) ? '🥚' : BEE_CLASSES[job].icon} ${r.name} ${beeIsBrood(r) ? 'will be a' : 'is now a'} ${BEE_CLASSES[job].label}.` : `${r.name} has no job.`, 'positive');
            }
            if (opts.onChange) opts.onChange();
            openRoom(id, opts);
        }));
        // ✏️ opens a name box (with 🎲) right under that bee.
        sheet.querySelectorAll('[data-ren]').forEach(btn => btn.addEventListener('click', () => {
            const row = btn.closest('.hl-row');
            const open = row.nextElementSibling && row.nextElementSibling.classList.contains('hl-ren-box');
            sheet.querySelectorAll('.hl-ren-box').forEach(x => x.remove());
            if (open || typeof BeeName === 'undefined') return;
            const bee = Vault.getColonyBees().find(b => b.id === btn.dataset.ren);
            if (!bee) return;
            const box = document.createElement('div');
            box.className = 'hl-ren-box';
            row.after(box);
            BeeName.mount(box, bee, { compact: true, onSaved: () => { if (opts.onChange) opts.onChange(); openRoom(id, opts); } });
            box.querySelector('.bn-in').focus();
        }));
        sheet.querySelectorAll('[data-wk="add"]').forEach(btn => btn.addEventListener('click', () => {
            const r = Vault.assignBeeClass(btn.dataset.bee, btn.dataset.job);
            if (typeof Toast !== 'undefined') Toast.show(r ? `${BEE_CLASSES[btn.dataset.job].icon} ${r.name} is now a ${BEE_CLASSES[btn.dataset.job].label}.` : (Vault.lastJobError || "That bee can't do that job."), r ? 'positive' : 'negative');
            if (opts.onChange) opts.onChange();
            openRoom(id, opts);
        }));
        sheet.querySelectorAll('[data-card]').forEach(btn => btn.addEventListener('click', () => {
            const bee = Vault.getColonyBees().find(b => b.id === btn.dataset.card);
            if (!bee || !opts.onBeeClick) return;
            backTo = id;   // Oct 30 2026 (Craft): closing the bee brings you back to this comb
            closeRoom();
            opts.onBeeClick(bee);
        }));
        if (fresh) { const x = sheet.querySelector('.hl-x'); if (x) x.focus({ preventScroll: true }); }
    }
    // ---- one bee's life panel (vitals + Revive / Royal Jelly) ---------------
    function vitalRow(icon, label, value, color) {
        return `<div class="hl-vital"><span>${icon} ${label}</span><span class="hl-bar" role="progressbar" aria-label="${label}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><i style="width:${value}%;background:${color}"></i></span><span class="hl-num">${value}</span></div>`;
    }
    function renderPanel(host, bee, onChange) {
        if (!host) return;
        if (!bee || !bee.life) { host.innerHTML = ''; return; }
        const L = bee.life;
        const streak = Vault.getHiveStreak();
        const mood = beeMood(bee, streak);
        const age = beeAgeDays(bee), span = beeLifespan(bee);
        const trait = L.birthTrait && BIRTH_TRAITS[L.birthTrait];
        const mats = (Vault.state.inventory && Vault.state.inventory.materials) || {};
        const drops = mats['honey-drop'] || 0, jelly = mats['royal-jelly'] || 0;
        const faintDays = L.faintedAt ? (daysBetween(L.faintedAt, todayISO()) || 0) : 0;
        if (L.hatchOn) {
            const left = broodDaysLeft(bee, todayISO(), Vault._workers('nurse').length);
            host.innerHTML = `<div class="hl-panel"><div class="hl-panel-head"><b>Unknown egg</b></div>
                <p class="hl-trait">Still an egg in the Nursery. Hatches ${left <= 1 ? 'tomorrow' : 'in ' + left + ' days'}. What's inside is a secret until then.</p></div>`;
            return;
        }
        host.innerHTML = `<div class="hl-panel${L.faintedAt ? ' is-faint' : ''}">
            <div class="hl-panel-head"><b>${esc(bee.name)}</b><span>${bee.sex === 'm' ? '♂ Male' : '♀ Female'} · ${mood.face} ${mood.label}</span></div>
            ${L.hatchOn ? `<p class="hl-trait">🥚 Still an egg in the Nursery. Hatches ${broodDaysLeft(bee, todayISO(), Vault._workers('nurse').length) <= 1 ? 'tomorrow' : 'in ' + broodDaysLeft(bee, todayISO(), Vault._workers('nurse').length) + ' days'}.</p>` : `<p class="hl-hint" style="margin:0 0 4px">${beeFeeling(bee).face} ${esc(beeFeeling(bee).why)}</p>`}
            ${vitalRow('❤️', 'Health', L.health, '#5fd38a')}
            ${vitalRow('⚡', 'Stamina', L.stamina, '#5aa9ff')}
            ${vitalRow('🥱', 'Fatigue', L.fatigue || 0, '#ff8a3d')}
            ${vitalRow('🍯', 'Fullness', L.fullness, '#ffcc00')}
            ${vitalRow('😊', 'Happiness', L.happiness, '#e58fff')}
            ${LIFE.deathEnabled
                ? `<div class="hl-age">Age: day ${age} of about ${span}${L.royalJelly ? ' · 👑 Royal Jelly' : ''}<span class="hl-bar"><i style="width:${Math.min(100, age / span * 100)}%"></i></span></div>`
                : `<div class="hl-age">Age: ${age} day${age === 1 ? '' : 's'}</div>`}
            ${trait ? `<p class="hl-trait">✨ ${trait.label}: ${trait.text}</p>` : ''}
            ${L.faintedAt ? `<div class="hl-revive"><p><b>😵 Fainted ${faintDays === 0 ? 'today' : faintDays + ' day' + (faintDays === 1 ? '' : 's') + ' ago'}.</b> ${LIFE.deathEnabled ? `After ${LIFE.faintDays} days fainted, ${esc(bee.name)} dies for good.` : `${esc(bee.name)} can't work until revived.`}</p>
                <button type="button" class="hl-btn solid" data-act="revive"${drops < LIFE.reviveCost ? ' disabled' : ''}>Revive · 🍯 ×${LIFE.reviveCost} Honey Drops</button><small>You have ${drops}.</small></div>` : ''}
            ${LIFE.deathEnabled && !L.royalJelly && !L.faintedAt ? `<div class="hl-actions">${jelly > 0 ? `<button type="button" class="hl-btn" data-act="jelly">👑 Give Royal Jelly (${jelly})</button>` : `<button type="button" class="hl-btn" data-act="craft"${drops < LIFE.jellyCost ? ' disabled' : ''}>👑 Make Royal Jelly · 🍯 ×${LIFE.jellyCost}</button>`}</div>` : ''}
            <p class="hl-hint">Finishing tasks feeds your bees. A good daily streak makes them happy.</p>
        </div>`;
        host.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const act = btn.dataset.act;
            const r = act === 'revive' ? Vault.reviveBee(bee.id) : act === 'jelly' ? Vault.giveRoyalJelly(bee.id) : Vault.craftRoyalJelly();
            if (typeof Toast !== 'undefined') Toast.show(r.ok ? (act === 'revive' ? `💛 ${bee.name} is back on ${bee.sex === 'm' ? 'his' : 'her'} feet.` : act === 'jelly' ? `👑 ${bee.name} will live far longer now.` : '👑 Royal Jelly made.') : r.error, r.ok ? 'positive' : 'negative');
            const fresh = Vault.getColonyBees().find(b => b.id === bee.id);
            renderPanel(host, fresh, onChange);
            if (onChange) onChange();
        }));
    }

    // ---- hive news + counter-raid -----------------------------------------
    function renderNews(host, onChange) {
        if (!host) return;
        const streak = Vault.getHiveStreak();
        const risk = Math.round(raidChance(streak) * 100);
        const fainted = Vault.getColonyBees().filter(b => b.life && b.life.faintedAt);
        const events = Vault.getLifeEvents().slice(0, 8);
        const raidedToday = Vault.state.colony.lastCounterRaid === todayISO();
        host.innerHTML = `<div class="hl-news">
            <div class="hl-stats">
                <span><b>${streak > 0 ? '+' + streak : streak}</b><small>Daily streak</small></span>
                <span class="${risk > 30 ? 'warn' : ''}"><b>${risk}%</b><small>Raid risk / day</small></span>
                <span class="${fainted.length ? 'warn' : ''}"><b>${fainted.length}</b><small>Fainted</small></span>
                ${LIFE.deathEnabled ? `<span><b>${Vault.getFallenBees().length}</b><small>Fallen</small></span>` : `<span><b>${Vault.getColonyBees().filter(b => b.life && !b.life.faintedAt).length}</b><small>Healthy</small></span>`}
            </div>
            <button type="button" class="hl-btn${raidedToday ? '' : ' solid'}" data-act="counter"${raidedToday ? ' disabled' : ''}>⚔️ ${raidedToday ? 'Counter-raid done today' : 'Send a counter-raid'}</button>
            <ul class="hl-events">${events.length ? events.map(e => `<li><span>${new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>${esc(e.text)}</li>`).join('') : '<li>Nothing has happened yet. Raids and fainted bees show up here.</li>'}</ul>
        </div>`;
        const btn = host.querySelector('[data-act=counter]');
        if (btn) btn.addEventListener('click', () => {
            const r = Vault.counterRaid();
            if (typeof Toast !== 'undefined') Toast.show(r.ok ? r.text : r.error, r.ok && r.won ? 'positive' : 'negative');
            renderNews(host, onChange);
            if (onChange) onChange();
        });
    }

    return { mountComb, renderPanel, renderNews, zoneOf, roomOf, openRoom, closeRoom, reopenLast, popFace, wantsFace };
})();
