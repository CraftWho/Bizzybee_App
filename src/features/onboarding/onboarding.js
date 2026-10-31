console.log("/// ONBOARDING: THE EGG GIFT ///");

// The egg gift - every player's first experience after this shipped (new
// AND existing players, Craft's launch call 2026-10-08). Full design in
// EGG_ORIGIN_STORY_SPEC.md; the approved demo it was built from lives in
// workshop/concepts/2026-10-onboarding/egg-opening.html.
//
//   gift note (a slow slideshow) -> egg (hold to bond) -> egg care habits
//   -> Habits unlock -> egg full: 10 taps to crack -> LARVA (To-Dos
//   unlock) -> larva full -> PUPA (sealed, 1 real hour; Dailies then
//   Quests unlock) -> wax cap: 10 taps -> "Are you male or female?" ->
//   silhouette at sunrise -> name it -> colour + crowning -> QUEEN / KING
//   -> founder card -> Home.
//
// Since 2026-10-09 every unlock adds that tab to the real bottom bar
// (AppShell onboarding mode), and its tutorial is done on the REAL pages:
// the steps (ONBOARDING_STEPS in db.js) are checked against what you
// actually made. Coming back to the egg turns that work into energy (or,
// while sealed, minutes off the wait) - see reconcile() below.
//
// Everything that matters is saved in Vault.state.onboarding (see
// freshOnboardingRecord in db.js) on every step, so closing the app never
// loses progress and reopening picks up exactly where you were. Habits and
// To-Dos made here are the player's REAL ones (Vault.addHabit/addTodo).
//
// ?practice=1 (Settings > Developer > Replay) runs the whole thing on an
// in-memory copy: nothing is saved, no habits/To-Dos/cards are created.

const $ = id => document.getElementById(id);
const PRACTICE = new URLSearchParams(location.search).get('practice') === '1';
const ASSETS = new URL('../../assets/bees/', document.currentScript.src).href;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canBuzz = typeof navigator.vibrate === 'function';
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Local calendar dates (the To-Dos page uses local dates for due dates).
// Oct 31 2026 (Craft): renamed from localISO - that name replaced db.js's
// localISO(date) on this page and broke habit tallies.
function obDayISO(offsetDays = 0) {
    const d = new Date(); d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const dayKey = () => (typeof todayISO === 'function' ? todayISO() : obDayISO());

// ---------------------------------------------------------------------------
// Numbers (all from the spec's decision log)
// ---------------------------------------------------------------------------
const HOLD = { seconds: 5, drain: 0.7, grace: 0.25 };
const MAX_E = 100;
const GAIN = { starter: 15, tut: 10, plus: 10, larvaTut: 15, todo: 10 };
const SHAVE_MINUTES = 5;   // each Dailies / Quests step while sealed
const DRAIN = 5, PLUS_CAP = 3, TODO_CAP = 5;
const CRACK_TAPS = 10, WAX_TAPS = 10;
const STRETCH_SECONDS = 180, PUPA_SECONDS = 3600;
const QUOTES = [
    ['Plans are worthless, but planning is everything.', 'Dwight D. Eisenhower'],
    ['Well begun is half done.', 'Aristotle'],
    ['The journey of a thousand miles begins with one step.', 'Lao Tzu'],
    ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Will Durant'],
];

// ---------------------------------------------------------------------------
// Store: the real save (Vault) or, in practice mode, a throwaway copy.
// ---------------------------------------------------------------------------
function makeStore() {
    if (!PRACTICE) {
        return {
            rec: Vault.getOnboarding(),
            save() { Vault.updateOnboarding({}); },
            habits: () => Vault.getHabits(),
            addHabit: ({ label, positive, negative }) => {
                Vault.addHabit({ label, xp: 20, difficulty: 'Easy', notes: 'Made while raising your egg.', positive, negative });
                const all = Vault.getHabits(); return all[all.length - 1];
            },
            bump: (id, dir) => Vault.bumpHabit(id, dir),
            todos: () => Vault.getTodos(),
            addTodo: ({ label, dueDate, checklist }) => {
                Vault.addTodo({ label, xp: 20, difficulty: 'Easy', dueDate, checklist });
                const all = Vault.getTodos(); return all[all.length - 1];
            },
            completeTodo: id => { const t = Vault.getTodos().find(x => x.id === id); if (t && !t.completed) Vault.toggleTodoComplete(id); },
            setChecklist: (id, checklist) => Vault.updateTodo(id, { checklist }),
            finish: (royal, name) => Vault.completeOnboarding({ royal, name })
        };
    }
    const mem = { habits: [], todos: [] };
    let n = 0;
    return {
        rec: freshOnboardingRecord(),
        save() {},
        habits: () => mem.habits,
        addHabit: ({ label, positive, negative }) => { const h = { id: 'p-h' + (++n), label, positive, negative, history: [] }; mem.habits.push(h); return h; },
        bump: (id, dir) => { const h = mem.habits.find(x => x.id === id); if (h) h.history.push({ direction: dir, date: dayKey() }); },
        todos: () => mem.todos,
        addTodo: ({ label, dueDate, checklist }) => { const t = { id: 'p-t' + (++n), label, dueDate, checklist, completed: false, completedDate: null }; mem.todos.push(t); return t; },
        completeTodo: id => { const t = mem.todos.find(x => x.id === id); if (t) { t.completed = true; t.completedDate = dayKey(); } },
        setChecklist: (id, checklist) => { const t = mem.todos.find(x => x.id === id); if (t) t.checklist = checklist; },
        finish: () => null
    };
}
let S, F;               // the store, and its onboarding record (F for short)
const T = { stretchT: null, stretchEnd: 0, pupaT: null };   // timers (never saved)
const save = () => S.save();

// ---------------------------------------------------------------------------
// The egg: design comes from the player's own seed (first egg = honeycomb)
// ---------------------------------------------------------------------------
const egg = $('egg'), shake = $('shake'), glow = $('glow'), aura = $('aura');
const rimWide = $('rimWide'), rimMid = $('rimMid'), rimLine = $('rimLine');
const eggSvg = $('eggSvg'), eggGlow = $('eggGlow');
let floorGlow, logoDisc;

function paintEgg() {
    const P = EggDesign.parts(F.seed, { style: 'hex', id: 'egg' });
    eggSvg.innerHTML = `<defs>${P.defs}${P.blur}<filter id="soft"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
        <ellipse cx="60" cy="147" rx="36" ry="4" fill="#000" opacity=".55" filter="url(#soft)"/>
        <ellipse id="floorGlow" cx="60" cy="148" rx="34" ry="3.5" fill="#d42a1e" opacity="0" filter="url(#soft)"/>
        <g clip-path="url(#egg-clip)">${P.base}<g fill="${P.inkFill}" stroke="${P.inkFill}">${P.ink}</g>
          <radialGradient id="logoShade"><stop offset="0" stop-color="#000" stop-opacity=".78"/><stop offset=".6" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
          <circle id="logoDisc" cx="60" cy="65" r="0" fill="url(#logoShade)"/>
          ${P.shade}</g>
        <path d="${P.outline}" fill="none" stroke="#000" stroke-width="1.2"/>`;
    eggGlow.innerHTML = `<defs><clipPath id="glow-clip"><path d="${P.outline}"/></clipPath></defs>
        <g clip-path="url(#glow-clip)"><g fill="#ff5a2a" stroke="#ff5a2a">${P.ink}</g></g>`;
    floorGlow = $('floorGlow'); logoDisc = $('logoDisc');
    [rimWide, rimMid, rimLine].forEach(el => el.querySelector('path').setAttribute('d', P.outline));
}
function growLogoPlate(to, ms) {
    const from = +logoDisc.getAttribute('r'), t0 = performance.now();
    const step = now => {
        const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
        logoDisc.setAttribute('r', (from + (to - from) * e).toFixed(2)); if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
const flashGo = () => { const fl = $('flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); };
const restart = (el, c) => { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };

// ---------------------------------------------------------------------------
// Hold to bond
// ---------------------------------------------------------------------------
let p = 0, holding = false, releasedAt = 0, mode = 'idle', last = performance.now(), buzzT = 0, idleT = 0;

function start(e) {
    if (e) e.preventDefault();
    if (mode === 'bonded') { eggTap(); return; }
    if (mode !== 'idle') return;
    holding = true; idleT = 0;
    try { if (e && e.pointerId != null) egg.setPointerCapture(e.pointerId); } catch (_) { /* not supported */ }
}
function stop() { if (holding) { holding = false; releasedAt = performance.now(); if (canBuzz) navigator.vibrate(0); } }
egg.addEventListener('pointerdown', start);
addEventListener('pointerup', stop);
addEventListener('pointercancel', stop);
egg.addEventListener('contextmenu', e => e.preventDefault());
egg.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
egg.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stop(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });

function render(dt) {
    const k = p;
    if (mode === 'idle') {
        rimLine.style.opacity = Math.min(1, k * 1.6).toFixed(3);
        rimMid.style.opacity = Math.pow(k, 1.1).toFixed(3);
        rimWide.style.opacity = Math.max(0, (k - .25) / .75).toFixed(3);
        aura.style.opacity = Math.min(1, k * 1.25).toFixed(3);
        aura.style.transform = `translate(-50%,-50%) scale(${(0.04 + Math.pow(k, 1.6) * 0.96).toFixed(4)})`;
        eggGlow.style.opacity = (k * 0.95).toFixed(3);
    }
    glow.style.setProperty('--g', (0.08 + k * 0.9).toFixed(3));
    if (floorGlow) floorGlow.setAttribute('opacity', (k * 0.8).toFixed(3));
    let sx = 0, sy = 0, r = 0;
    if (!reduce && mode === 'idle') {
        const amp = k * k * 3.2 + (holding ? 0.25 : 0);
        sx = (Math.random() - .5) * amp; sy = (Math.random() - .5) * amp * .6; r = (Math.random() - .5) * amp * .7;
        if (!holding && k === 0) { idleT += dt; const ph = idleT % 6; if (ph < .45) r = Math.sin(ph * 40) * (1 - ph / .45) * 1.6; }
        shake.style.transform = `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px) rotate(${r.toFixed(2)}deg)`;
    }
}
function frame(t) {
    const dt = Math.min(.05, (t - last) / 1000); last = t;
    if (mode === 'idle') {
        if (holding) p = Math.min(1, p + dt / HOLD.seconds);
        else if (p > 0 && (t - releasedAt) / 1000 > HOLD.grace) p = Math.max(0, p - dt * HOLD.drain / HOLD.seconds);
        if (canBuzz && holding) { buzzT -= dt; if (buzzT <= 0) { navigator.vibrate(Math.round(12 + p * 40)); buzzT = 0.34 - p * 0.26; } }
        if (p >= 1) bond(false);
    }
    render(dt);
    requestAnimationFrame(frame);
}

// instant = restoring a saved game (no flash, no stamp animation)
function bond(instant) {
    mode = 'bonding'; holding = false; p = 1;
    shake.style.transform = '';
    if (!instant) { if (canBuzz) navigator.vibrate([70, 40, 70, 40, 260]); flashGo(); restart($('shock'), 'go'); }
    glow.classList.add('gold');
    [rimWide, rimMid, rimLine].forEach(el => { el.style.transition = instant ? '' : 'opacity 1.6s ease'; el.style.opacity = el === rimLine ? .35 : 0; });
    eggGlow.style.opacity = 0;
    aura.classList.add('gold'); aura.style.opacity = .55; aura.style.transform = 'translate(-50%,-50%) scale(.45)';
    const badge = $('badge');
    if (instant) { badge.setAttribute('class', 'egg-logo breathe'); logoDisc.setAttribute('r', 13); }
    else setTimeout(() => { restart(badge, 'stamp'); growLogoPlate(13, 600); }, 250);
    setTimeout(() => {
        if (!instant) { badge.classList.remove('stamp'); badge.classList.add('breathe'); }
        mode = 'bonded'; p = .55;
        $('after').classList.add('show');
        $('stage').classList.add('feeding');
        egg.setAttribute('aria-label', 'Your egg. Tap it.');
        if (!F.bonded) { F.bonded = true; save(); }
        if (F.stage === 'egg') startFeeding(instant);
        if (!F.askedName) setTimeout(askPlayerName, instant ? 300 : 1600);
    }, instant ? 0 : 1500);
}

// ---------------------------------------------------------------------------
// Feeding (egg stage)
// ---------------------------------------------------------------------------
function startFeeding(instant) {
    if (F.step === 'quiet') {
        renderLog();
        // the egg glows for a moment... then goes completely still
        setTimeout(() => { F.step = 'tap'; save(); egg.classList.add('still'); renderLog(); }, instant ? 50 : 1400);
        return;
    }
    if (F.step === 'tap' && !F.done.tap) egg.classList.add('still');
    showEnergy();
    if (F.energy >= MAX_E) { F.step = 'crack'; egg.classList.add('ready', 'full'); drawShellCracks(); }
    renderLog();
}

function showEnergy() {
    $('energy').style.setProperty('--e', (F.energy / MAX_E * 100) + '%');
    $('energyNum').textContent = `${F.energy} / ${MAX_E}`;
}
function addEnergy(n) {
    if (!['egg', 'larva'].includes(F.stage)) return 0;
    const before = F.energy;
    F.energy = Math.max(0, Math.min(MAX_E, F.energy + n));
    showEnergy();
    if (n !== 0) floatText((n > 0 ? '+' : '−') + Math.abs(n), n > 0 ? 'good' : 'bad');
    if (n > 0) { pulse(1 + Math.min(.06, n / 300)); if (canBuzz) navigator.vibrate(40); }
    else if (n < 0) { egg.classList.add('hurt'); hurtShake(); if (canBuzz) navigator.vibrate([30, 40, 30]); setTimeout(() => egg.classList.remove('hurt'), 600); }
    if (F.energy >= MAX_E && before < MAX_E) {
        egg.classList.add('full');
        if (F.stage === 'egg') { F.step = 'crack'; egg.classList.add('ready'); setTimeout(() => renderLog(), 400); }
        else if (F.stage === 'larva') { setTimeout(() => startPupa(false), 1600); setTimeout(() => renderLog(), 400); }
    } else if (F.energy < MAX_E) egg.classList.remove('full');
    save();
    return F.energy - before;
}
function floatText(t, cls) {
    const el = document.createElement('div'); el.className = 'float ' + cls; el.textContent = t;
    egg.appendChild(el); setTimeout(() => el.remove(), 1300);
}
function pulse(k = 1.04) { shake.animate([{ transform: 'scale(1)' }, { transform: `scale(${k}) rotate(-1.5deg)` }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' }); }
function hurtShake() { shake.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px) rotate(-2deg)' }, { transform: 'translateX(5px) rotate(2deg)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 420 }); }
function heartbeat() {
    shake.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 900, easing: 'ease-out' });
    if (canBuzz) navigator.vibrate([60, 90, 90]);
}

// Any tap on the egg / cell once bonded.
function eggTap() {
    if (F.stage === 'egg' && F.step === 'crack') return crackTap();
    if (F.stage === 'ready') return readyTap();
    if (F.stage === 'larva') return larvaBounce();
    if (F.stage !== 'egg' || F.step !== 'tap') return pulse();
    F.taps++;
    if (F.taps < 4) {
        const k = F.taps;
        shake.animate([{ transform: 'rotate(0)' }, { transform: `rotate(${-1.5 * k}deg)` }, { transform: `rotate(${1.2 * k}deg)` }, { transform: 'rotate(0)' }], { duration: 260 + k * 60 });
        if (canBuzz) navigator.vibrate(15 + k * 10);
        save();
    } else {
        egg.classList.remove('still');
        heartbeat();
        F.done.tap = true; F.step = 'quote'; save();
        setTimeout(() => addEnergy(GAIN.starter), 500);
    }
    renderLog(F.done.tap);
}

function finishStarter(key) {
    if (F.done[key]) return;
    F.done[key] = true;
    if (key === 'quote' && !F.unlocked) {
        F.unlocked = true;
        unlockTab('habits');
        setTimeout(() => { $('introSheet').hidden = false; }, 900);
    }
    addEnergy(GAIN.starter);
    renderLog(true);
}
function finishTut(key) { if (F.tut[key]) return; F.tut[key] = true; addEnergy(GAIN.tut); }

function startStretch() {
    T.stretchEnd = Date.now() + STRETCH_SECONDS * 1000;
    clearInterval(T.stretchT);
    T.stretchT = setInterval(() => {
        const left = Math.max(0, Math.ceil((T.stretchEnd - Date.now()) / 1000));
        const el = $('stretchLeft'); if (el) el.textContent = fmtTime(left);
        if (left <= 0) { clearInterval(T.stretchT); T.stretchT = null; finishStarter('stretch'); }
    }, 250);
    renderLog();
}
const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---- the quest log ----
const SEEN = new Set();   // quests fade in once, not on every refresh
function item({ key, title, why, count, acts = '', extra = '', done, active }) {
    const fresh = !SEEN.has(key); SEEN.add(key);
    return `<div class="q${fresh ? ' new' : ''}${done ? ' done' : ''}${active && !done ? ' active' : ''}" data-k="${key}">
        <div class="q-top"><span class="box">${done ? '✓' : ''}</span><span class="qt">${title}</span>${count ? `<span class="qc">${count}</span>` : ''}</div>
        ${why ? `<p class="why">${why}</p>` : ''}${extra}${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
}
const tapsRow = (n, max) => `<div class="taps">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;

function todayCounts(h) {
    const d = dayKey(), hist = h.history || [];
    return { plus: hist.filter(x => x.date === d && x.direction === 'positive').length, minus: hist.filter(x => x.date === d && x.direction === 'negative').length };
}
function plusUsed(id) { const e = F.plusLog[id]; return e && e.date === dayKey() ? e.count : 0; }

function habitsHTML() {
    if (!F.unlocked) return '';
    const list = S.habits();
    let h = `<div class="sec">Your habits</div>`;
    if (!list.length) h += `<p class="why" style="margin:0 2px 8px">No habits yet.</p>`;
    h += list.map(o => {
        const pos = o.positive !== false, neg = o.negative !== false, c = todayCounts(o);
        return `<div class="own">${pos ? '<span class="tag good">good</span>' : ''}${neg ? '<span class="tag bad">bad</span>' : ''}<span class="nm" title="${esc(o.label)}">${esc(o.label)}</span>
            <span class="ct">${pos ? '+' + c.plus : ''}${pos && neg ? ' | ' : ''}${neg ? '−' + c.minus : ''}</span>
            ${pos ? `<button class="pm plus" data-a="plus" data-id="${esc(o.id)}" aria-label="I did it">+</button>` : ''}
            ${neg ? `<button class="pm minus" data-a="minus" data-id="${esc(o.id)}" aria-label="${pos ? "I didn't" : 'It slipped in'}">−</button>` : ''}</div>`;
    }).join('');
    h += `<div class="acts" style="margin:4px 0 10px"><button class="btn ghost" data-a="make">+ New habit</button></div>`;
    return h;
}

function todosHTML() {
    const today = dayKey();
    const list = S.todos().filter(t => !t.completed || t.completedDate === today);
    let h = `<div class="sec">Your To-Dos</div>`;
    if (!list.length) h += `<p class="why" style="margin:0 2px 8px">Nothing to do yet.</p>`;
    const dueLabel = d => d === obDayISO(0) ? 'Today' : d === obDayISO(1) ? 'Tomorrow' : d;
    h += [...list].sort((a, b) => a.completed - b.completed).map(t => {
        const steps = t.checklist || [];
        return `<div class="todo${t.completed ? ' done' : ''}"><div class="todo-top">
            <button class="ck" data-a="todoCheck" data-id="${esc(t.id)}" aria-label="Check off">${t.completed ? '✓' : ''}</button>
            <span class="tn" title="${esc(t.label)}">${esc(t.label)}</span>${t.dueDate && !t.completed ? `<span class="due">${esc(dueLabel(t.dueDate))}</span>` : ''}</div>
            ${steps.length && !t.completed ? `<ul class="steps">${steps.map((st, k) => `<li class="${st.done ? 'ok' : ''}" data-a="step" data-id="${esc(t.id)}" data-s="${k}"><i>${st.done ? '✓' : ''}</i>${esc(st.text)}</li>`).join('')}</ul>` : ''}</div>`;
    }).join('');
    h += `<div class="acts" style="margin:4px 0 10px"><button class="btn ghost" data-a="newTodo">+ New To-Do</button></div>`;
    return h;
}

function renderLog(focus) {
    if (F.stage !== 'egg') return renderLater(focus);
    const D = F.done;
    let h = `<div class="qlog-head"><i></i>Quest log</div>`;
    if (F.step === 'crack') h += `<p class="qlog-msg"><b style="color:#ffd76a">The egg is full of energy.</b> Something is moving inside it. Keep tapping the egg to help it out.</p>${tapsRow(F.crackTaps, CRACK_TAPS)}`;
    else if (F.step === 'quiet') h += `<p class="qlog-msg">A connection has been made. The egg needs energy to grow.</p>`;
    else if (F.step === 'tap' && !D.tap) h += `<p class="qlog-msg">The egg has gone completely still. Is it still alive?</p>`;
    else h += `<p class="qlog-msg">It's alive, and it's hungry. Good habits give it energy.</p>`;

    h += `<div class="sec">Egg care</div>`;
    if (F.step !== 'quiet') h += item({ key: 'tap', title: 'Tap the egg 4 times', count: `${Math.min(4, F.taps)} / 4`, done: D.tap, active: !D.tap,
        why: 'Curious? Check on it. Every habit starts with paying attention.' });
    if (D.tap) {
        const q = F.quote;
        h += item({ key: 'quote', title: 'Read a motivational quote', done: D.quote, active: !D.quote,
            why: "Don't go into the day without a plan. A quote makes you stop, think it through and prepare.",
            extra: q && !D.quote ? `<div class="quote">“${esc(q[0])}”<small>— ${esc(q[1])}</small></div>` : '',
            acts: q ? `<button class="btn" data-a="quoteDone">I read it ✓</button>` : `<button class="btn" data-a="quoteShow">Read a quote</button>` });
    }
    if (D.quote) {
        h += item({ key: 'walk', title: 'Walk 1,000 feet today', done: D.walk, active: !D.walk,
            why: 'Walking loosens your muscles and keeps you healthy. It takes about 4 minutes.',
            acts: `<button class="btn" data-a="walkDone">+ I walked it</button>` });
        const running = !!T.stretchT;
        h += item({ key: 'stretch', title: 'Stretch for 3 minutes', done: D.stretch, active: !D.stretch,
            why: 'A full stretch wakes you up. It keeps you flexible and lowers your risk of injury.',
            count: running ? `<span id="stretchLeft">${fmtTime(Math.max(0, Math.ceil((T.stretchEnd - Date.now()) / 1000)))}</span>` : '',
            acts: running ? `<button class="btn ghost" data-a="stretchStop">Stop</button>` : `<button class="btn" data-a="stretchGo">Start 3:00 timer</button>` });
    }
    if (F.unlocked && !PRACTICE) {
        h += tabGuideHTML('habits');
    } else if (F.unlocked) {
        const U = F.tut;
        h += `<div class="sec">Learn Habits</div>`;
        h += item({ key: 't1', title: 'Make your own habit', done: U.make, active: !U.make, why: 'Pick something small you want to do more of.',
            acts: `<button class="btn" data-a="make">+ New habit</button>` });
        h += item({ key: 't2', title: 'Tap + on your habit when you do it', done: U.plus, active: U.make && !U.plus, why: 'Each + on your own habit gives the egg energy.' });
        h += item({ key: 't3', title: 'Add a bad habit you want to break', done: U.bad, active: !U.bad,
            why: 'Be honest. If it slips in, tap −. It drains a little energy. Reality waits on no one.',
            acts: `<button class="btn ghost" data-a="makeBad">− New bad habit</button>` });
    }
    if (PRACTICE) h += habitsHTML();
    $('qlog').innerHTML = h;
    if (F.step === 'crack') $('qlog').scrollTop = 0;
    else if (focus) { const a = $('qlog').querySelector('.q.active'); if (a) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

function renderLater(focus) {
    let h = `<div class="qlog-head"><i></i>Quest log</div>`;
    const L = F.ltut;
    if (F.stage === 'larva') {
        h += F.energy >= MAX_E ? `<p class="qlog-msg"><b style="color:#ffd76a">The larva is full.</b> It's sealing itself in…</p>`
            : `<p class="qlog-msg">It's a larva now, and it's always hungry. To-Dos help it grow.</p>`;
        if (!PRACTICE) h += tabGuideHTML('todos', 'Larva care: learn To-Dos');
        else {
        h += `<div class="sec">Larva care</div>`;
        h += item({ key: 'l1', title: 'Add your first To-Do', done: L.add, active: !L.add, why: "Get it out of your head. Once it's written down, you don't have to keep remembering it.",
            acts: `<button class="btn" data-a="newTodo">+ New To-Do</button>` });
        h += item({ key: 'l2', title: 'Give a To-Do a due date', done: L.due, active: L.add && !L.due, why: "A due date turns 'someday' into a plan." });
        h += item({ key: 'l3', title: 'Break a To-Do into steps', done: L.steps, active: L.add && !L.steps, why: 'Big jobs feel smaller one step at a time.' });
        h += item({ key: 'l4', title: 'Check off a To-Do', done: L.check, active: L.add && !L.check, why: 'Finishing feels good. It feeds the larva too.' });
        }
        if (!PRACTICE && !stepsDone('habits')) h += tabGuideHTML('habits', 'Still to learn: Habits');
    } else if (F.stage === 'pupa') {
        const waiting = F.pupaEnd <= Date.now() && !sealedLessonsDone();
        h += waiting
            ? `<p class="qlog-msg"><b style="color:#ffd76a">It's ready to come out.</b> Finish learning ${stepsDone('dailies') ? 'Quests' : 'Dailies and Quests'} to let it out.</p>`
            : `<p class="qlog-msg">It has sealed itself in. It doesn't need food now. While it sleeps, learn the rest of your hive. Every step takes ${SHAVE_MINUTES} minutes off the wait.</p>
            <div class="q active"><div class="q-top"><span class="box">⏳</span><span class="qt">Hatching in</span><span class="qc" id="pupaLeft">${fmtTime(Math.max(0, Math.ceil((F.pupaEnd - Date.now()) / 1000)))}</span></div>
            <p class="why">You can close the app - it keeps going while you're away.</p></div>`;
        // The one still being learned goes first.
        const dl = tabGuideHTML('dailies', 'Learn Dailies');
        const qu = unlockedTabs().includes('quests') ? tabGuideHTML('quests', 'Learn Quests') : '';
        h += stepsDone('dailies') ? qu + dl : dl + qu;
    } else if (F.stage === 'ready') {
        h += `<p class="qlog-msg"><b style="color:#ffd76a">Something is breaking through the wax.</b> Keep tapping to help it out.</p>${tapsRow(F.readyTaps, WAX_TAPS)}`;
    } else if (F.stage === 'hatched') {
        const A = ROYAL_ART[F.royal];
        h += F.revealed ? `<p class="qlog-msg"><b style="color:#ffd76a">${esc(F.name || A.label)}</b> the ${A.label} has hatched. Welcome to the hive.</p>`
            : `<p class="qlog-msg">Something has hatched. It's looking at you.</p>`;
    }
    if (PRACTICE && (F.stage === 'larva' || F.stage === 'pupa')) h += todosHTML() + habitsHTML();
    else if (F.stage === 'pupa') {
        if (!stepsDone('todos')) h += tabGuideHTML('todos', 'Still to learn: To-Dos');
        if (!stepsDone('habits')) h += tabGuideHTML('habits', 'Still to learn: Habits');
    }
    $('qlog').innerHTML = h;
    if (F.stage === 'pupa' && focus) { const a = $('qlog').querySelector('.q.active:not(:first-of-type)'); $('qlog').scrollTop = 0; if (a) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    else if (F.stage !== 'larva' || F.energy >= MAX_E) $('qlog').scrollTop = 0;
    else if (focus) { const a = $('qlog').querySelector('.q.active'); if (a) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

$('qlog').addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, id = b.dataset.id;
    if (a === 'quoteShow') { F.quote = QUOTES[Math.floor(Math.random() * QUOTES.length)]; save(); renderLog(); }
    else if (a === 'quoteDone') { F.step = 'open'; finishStarter('quote'); }
    else if (a === 'walkDone') finishStarter('walk');
    else if (a === 'stretchGo') startStretch();
    else if (a === 'stretchStop') { clearInterval(T.stretchT); T.stretchT = null; renderLog(); }
    else if (a === 'make') openMake('good');
    else if (a === 'makeBad') openMake('bad');
    else if (a === 'plus') {
        S.bump(id, 'positive');
        const used = plusUsed(id);
        if (used < PLUS_CAP) { F.plusLog[id] = { date: dayKey(), count: used + 1 }; addEnergy(GAIN.plus); }
        else floatText('Max for today', 'good');
        finishTut('plus'); renderLog();
    }
    else if (a === 'minus') { S.bump(id, 'negative'); addEnergy(-DRAIN); renderLog(); }
    else if (a === 'newTodo') openTodo();
    else if (a === 'practiceStep') { creditStep(b.dataset.tab, b.dataset.key, 0); renderLog(true); }
    else if (a === 'todoCheck') checkTodo(id);
    else if (a === 'step') {
        const t = S.todos().find(x => x.id === id); if (!t) return;
        const list = (t.checklist || []).map((st, k) => k === +b.dataset.s ? { ...st, done: !st.done } : st);
        S.setChecklist(id, list); renderLog();
    }
});

// ---------------------------------------------------------------------------
// Dock tabs: unlock, guide steps, and turning real-page work into energy
// ---------------------------------------------------------------------------
const TAB_LINKS = {
    habits: { list: '../../features/habits/habits.html', make: '../../features/habits/create-habit.html' },
    todos: { list: '../../features/todos/todos.html', make: '../../features/todos/create-todo.html' },
    dailies: { list: '../dailies/dailies.html', make: '../dailies/create-daily.html' },
    quests: { list: '../quests/quests.html', make: '../quests/create-quest.html' }
};
const STEP_ACTS = {
    habits: { make: ['make', '+ New habit'], plus: ['list', 'Open Habits'], bad: ['bad', '− New bad habit'] },
    todos: { add: ['make', '+ New To-Do'], due: ['list', 'Open To-Dos'], steps: ['list', 'Open To-Dos'], check: ['list', 'Open To-Dos'] },
    dailies: { add: ['make', '+ New daily'], days: ['list', 'Open Dailies'], check: ['list', 'Open Dailies'] },
    quests: { make: ['make', '+ New quest'], focus: ['list', 'Open Quests'], check: ['list', 'Open Quests'] }
};
const CREDIT = { habits: 'tut', todos: 'ltut', dailies: 'dtut', quests: 'qtut' };
const TAB_NAMES = { habits: 'Habits', todos: 'To-Dos', dailies: 'Dailies', quests: 'Quests' };
let practiceTabs = [];

const unlockedTabs = () => PRACTICE ? practiceTabs : Vault.getOnboardingTabs();
function unlockTab(tab) {
    if (PRACTICE) { if (!practiceTabs.includes(tab)) practiceTabs.push(tab); return; }
    if (Vault.getOnboardingTabs().includes(tab) && Array.isArray(F.tabs)) return;
    Vault.unlockOnboardingTab(tab);
}
const stepsDone = tab => ONBOARDING_STEPS[tab].every(st => F[CREDIT[tab]][st.key]);
const sealedLessonsDone = () => stepsDone('dailies') && stepsDone('quests');

function tabGuideHTML(tab, heading) {
    const got = F[CREDIT[tab]];
    let h = `<div class="sec">${heading || 'Learn ' + TAB_NAMES[tab]}</div>`;
    let firstOpen = true;
    ONBOARDING_STEPS[tab].forEach(st => {
        const done = !!got[st.key], active = !done && firstOpen;
        if (!done) firstOpen = false;
        let acts = '';
        if (active && PRACTICE) acts = `<button class="btn" data-a="practiceStep" data-tab="${tab}" data-key="${st.key}">Mark done (practice)</button>`;
        else if (active) {
            const [kind, label] = STEP_ACTS[tab][st.key];
            const href = kind === 'bad' ? `${TAB_LINKS[tab].make}?bad=1` : TAB_LINKS[tab][kind];
            acts = `<a class="btn${kind === 'list' ? ' ghost' : ''}" href="${href}">${label}</a>`;
        }
        h += item({ key: `${tab}:${st.key}`, title: st.title, why: st.why, done, active, acts });
    });
    return h;
}

// Credits one tutorial step: energy while it's an egg or larva, minutes
// off the wait while it's sealed.
function creditStep(tab, key, delay) {
    const got = F[CREDIT[tab]];
    if (got[key]) return;
    got[key] = true;
    const reward = () => {
        if (F.stage === 'pupa') shave(SHAVE_MINUTES);
        else addEnergy(tab === 'todos' ? GAIN.larvaTut : GAIN.tut);
    };
    setTimeout(reward, delay);
    if (tab === 'dailies' && stepsDone('dailies') && !unlockedTabs().includes('quests')) setTimeout(unlockQuests, delay + 1600);
}
function shave(minutes) {
    if (F.stage !== 'pupa') return;
    F.pupaEnd = Math.max(Date.now(), F.pupaEnd - minutes * 60000);
    floatText(`−${minutes}:00`, 'good'); pulse(1.03);
    save();
    const el = $('pupaLeft'); if (el) el.textContent = fmtTime(Math.max(0, Math.ceil((F.pupaEnd - Date.now()) / 1000)));
}
function unlockQuests() {
    unlockTab('quests');
    story(`<h2>📜 Quests unlocked</h2>
        <p>Some goals take longer than a day. Those are quests.</p>
        <p>Give it a title and break it into tasks. Put one quest in focus 🎯 and it sits on top of Quests and on Home, so you always know your next step.</p>
        <p>Quests is the last tab on your bottom bar. Learn it, and your hive is complete.</p>
        <div class="row2"><button class="btn ghost" data-s="close">Later</button><button class="btn" data-s="quest">${PRACTICE ? 'OK' : 'Start my first quest'}</button></div>`);
    renderLog(true);
}

// Reads what you did on the real pages and pays it out here: tutorial
// steps, + taps (3 a day per habit), − taps, and To-Dos checked off today
// (5 a day). Runs on load and whenever you come back to this page.
function reconcile() {
    if (PRACTICE || !F || F.stage === 'gift') return;
    const tabs = Vault.getOnboardingTabs();
    let delay = 300;
    const next = () => { const d = delay; delay += 550; return d; };
    tabs.forEach(tab => {
        const status = Vault.onboardingStepStatus(tab);
        ONBOARDING_STEPS[tab].forEach(st => { if (status[st.key] && !F[CREDIT[tab]][st.key]) creditStep(tab, st.key, next()); });
    });
    const today = dayKey();
    if (tabs.includes('habits') && ['egg', 'larva'].includes(F.stage)) {
        Vault.onboardingNewItems('habits').forEach(hb => {
            const c = todayCounts(hb);
            const used = plusUsed(hb.id), want = Math.min(PLUS_CAP, c.plus);
            if (want > used) { F.plusLog[hb.id] = { date: today, count: want }; const n = want - used; setTimeout(() => addEnergy(GAIN.plus * n), next()); }
            const neg = F.negLog[hb.id] && F.negLog[hb.id].date === today ? F.negLog[hb.id].count : 0;
            if (c.minus > neg) { F.negLog[hb.id] = { date: today, count: c.minus }; const n = c.minus - neg; setTimeout(() => addEnergy(-DRAIN * n), next()); }
        });
    }
    if (tabs.includes('todos') && F.stage === 'larva') {
        const checked = Math.min(TODO_CAP, Vault.onboardingNewItems('todos').filter(t => t.completed && t.completedDate === today).length);
        const credited = F.todoChecks && F.todoChecks.date === today ? F.todoChecks.count : 0;
        if (checked > credited) { F.todoChecks = { date: today, count: checked }; const n = checked - credited; setTimeout(() => { addEnergy(GAIN.todo * n); larvaBounce(); }, next()); }
    }
    save();
    renderLog();
    setTimeout(() => renderLog(true), delay);
}

// ---- make a habit ----
let makePos = true, makeNeg = false;
function openMake(type) {
    makePos = type !== 'bad'; makeNeg = type === 'bad'; $('habitName').value = '';
    $('makeTitle').textContent = type === 'bad' ? 'A bad habit to break' : 'New habit';
    setSeg(); $('makeSheet').hidden = false; setTimeout(() => $('habitName').focus(), 50);
}
// + Good and − Bad are toggles: one or both can be on (at least one).
// Both on: + means you did it, − means you didn't.
function setSeg() {
    $('segGood').setAttribute('aria-pressed', makePos); $('segBad').setAttribute('aria-pressed', makeNeg);
    $('makeHint').textContent = makePos && makeNeg ? "+ means you did it. − means you didn't."
        : makePos ? 'Good habits feed the egg when you tap +.' : 'Tap − when it slips in. It drains a little energy.';
    $('habitName').placeholder = makePos && makeNeg ? 'e.g. Drink 1 glass of water daily' : makePos ? 'e.g. Drink a glass of water' : 'e.g. Scrolling in bed';
}
$('segGood').onclick = () => { if (makePos && !makeNeg) return; makePos = !makePos; setSeg(); };
$('segBad').onclick = () => { if (makeNeg && !makePos) return; makeNeg = !makeNeg; setSeg(); };
$('makeCancel').onclick = () => { $('makeSheet').hidden = true; };
$('makeSave').onclick = () => {
    const label = $('habitName').value.trim();
    if (!label) { $('habitName').focus(); return; }
    S.addHabit({ label, positive: makePos, negative: makeNeg });
    $('makeSheet').hidden = true;
    finishTut('make'); if (makeNeg) finishTut('bad');
    renderLog(true);
};
$('habitName').addEventListener('keydown', e => { if (e.key === 'Enter') $('makeSave').onclick(); });
$('introLater').onclick = () => { $('introSheet').hidden = true; };
$('introMake').onclick = () => {
    $('introSheet').hidden = true;
    if (PRACTICE) openMake('good'); else location.href = TAB_LINKS.habits.make;
};
[$('introSheet'), $('makeSheet')].forEach(sh => sh.addEventListener('click', e => { if (e.target === sh) sh.hidden = true; }));

// ---------------------------------------------------------------------------
// Life cycle: crack -> larva -> pupa -> ready -> hatch -> crowning
// ---------------------------------------------------------------------------
// The royals' art (ROYAL_ART, royalStack) and the brood cell (hexP, larvaSVG,
// cellSVG) live in src/core/ui/bee-art/bee-art.js, shared with Bee Models.

// ---- growing cracks: every tap grows the web, the light, the shake and the buzz ----
function crackWeb(seed, n, inside, startPt, scale = 1) {
    let x = seed % 2147483646 + 1; const r = () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
    const lines = [], pts = [startPt];
    for (let i = 0; i < n; i++) {
        let from, a;
        if (i % 3 === 0) { from = startPt; a = i * 2.4 + r() * .6; }
        else { from = pts[pts.length - 1 - Math.floor(r() * Math.min(pts.length - 1, 5))]; a = Math.atan2(from[1] - startPt[1], from[0] - startPt[0]) + (r() - .5) * 1.8; }
        let cx = from[0], cy = from[1];
        const d = [[cx, cy]];
        const steps = 4 + Math.floor(r() * 3);
        for (let k = 0; k < steps; k++) {
            a += (r() - .5) * 1.1; const len = scale * (6 + r() * 6);
            const nx = cx + Math.cos(a) * len, ny = cy + Math.sin(a) * len;
            if (!inside(nx, ny)) { a += Math.PI * .7; continue; }
            cx = nx; cy = ny; d.push([cx, cy]); pts.push([cx, cy]);
        }
        lines.push('M' + d.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'));
    }
    return lines;
}
const inEgg = (px, py) => { if (py < 12 || py > 140) return false; const t = py < 86 ? (86 - py) / 80 : (py - 86) / 58; return Math.abs(px - 60) < 48 * Math.sqrt(Math.max(0, 1 - t * t)); };
const inCap = (px, py) => Math.hypot(px - 60, (py - 80) * 1.05) < 38;
function drawCracks(g, lines, n, max) {
    const k = n / max;
    g.innerHTML = lines.map(d => `<path d="${d}" stroke="#ff8a3a" stroke-width="${(2.2 + k * 2.6).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#soft)" opacity="${(.55 + k * .45).toFixed(2)}"/>`).join('') +
        lines.map(d => `<path d="${d}" stroke="#fff6d8" stroke-width="${(.7 + k * .7).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
}
function buildUp(n, max) {
    const k = n / max, amp = 2 + k * 7;
    shake.animate([{ transform: 'rotate(0)' }, { transform: `rotate(${-amp}deg) scale(${1 + k * .03})` }, { transform: `rotate(${amp * .8}deg)` }, { transform: `rotate(${-amp * .4}deg)` }, { transform: 'rotate(0)' }], { duration: 300 + k * 200 });
    if (canBuzz) navigator.vibrate(Math.round(25 + k * 160));
    aura.style.opacity = (.35 + k * .55).toFixed(2); aura.style.transform = `translate(-50%,-50%) scale(${(.3 + k * .45).toFixed(3)})`;
}
function drawShellCracks() {
    if (!F.crackTaps) return;
    let g = eggSvg.querySelector('#cracks');
    if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.id = 'cracks'; eggSvg.appendChild(g); }
    drawCracks(g, crackWeb(F.seed * 7 + 3, F.crackTaps, inEgg, [60, 70]), F.crackTaps, CRACK_TAPS);
    eggGlow.style.transition = 'opacity .3s'; eggGlow.style.opacity = (F.crackTaps / CRACK_TAPS * .6).toFixed(2);
}
function crackTap() {
    if (F.crackTaps >= CRACK_TAPS) return;
    F.crackTaps++; save();
    drawShellCracks();
    buildUp(F.crackTaps, CRACK_TAPS);
    if (F.crackTaps >= CRACK_TAPS) setTimeout(() => breakEgg(false), 250); else renderLog();
}
function breakEgg(instant) {
    egg.classList.remove('ready', 'full', 'still'); eggGlow.style.opacity = 0;
    if (!instant) {
        const svgHTML = eggSvg.outerHTML.replace('id="eggSvg"', '');
        $('halves').innerHTML = `<div class="half-top">${svgHTML}</div><div class="half-bot">${svgHTML}</div>`;
        flashGo(); if (canBuzz) navigator.vibrate([80, 50, 160]);
        setTimeout(() => { $('halves').innerHTML = ''; }, 1400);
    }
    $('cellSvg').innerHTML = cellSVG('larva');
    egg.classList.add('cellmode');
    if (F.stage === 'egg') { F.stage = 'larva'; F.energy = 0; save(); }
    startLarva(instant);
}
function larvaBounce() {
    const l = $('larva'); if (!l) return;
    l.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-6px) scale(1.05,.95)' }, { transform: 'translateY(0) scale(1)' }], { duration: 380, easing: 'ease-out' });
}

// ---- larva: To-Dos ----
function startLarva(instant) {
    showEnergy();
    egg.setAttribute('aria-label', 'Your larva. Tap it.');
    renderLog(true);
    unlockTab('todos');
    if (!F.ltut.intro) {
        setTimeout(() => story(`<h2>📝 To-Dos unlocked</h2>
            <p>It's a larva now, and it's always hungry.</p>
            <p>To-Dos are one-time tasks. Write it down, then check it off when it's done. Give the bigger ones a due date so they don't slip.</p>
            <p>Finishing To-Dos feeds the larva. Your habits still count too.</p>
            ${PRACTICE ? '' : '<p>To-Dos is now on your bottom bar, next to Habits.</p>'}
            <div class="row2"><button class="btn ghost" data-s="close">Later</button><button class="btn" data-s="todo">Add my first To-Do</button></div>`), instant ? 50 : 1500);
        F.ltut.intro = true; save();
    }
    if (F.energy >= MAX_E) setTimeout(() => startPupa(false), 800);
}
let dueSel = '';
function openTodo() {
    $('todoName').value = ''; $('todoSteps').value = ''; dueSel = '';
    $('dueSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.d === ''));
    $('todoSheet').hidden = false; setTimeout(() => $('todoName').focus(), 50);
}
$('dueSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; dueSel = b.dataset.d; $('dueSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
$('todoCancel').onclick = () => { $('todoSheet').hidden = true; };
$('todoSheet').addEventListener('click', e => { if (e.target.id === 'todoSheet') $('todoSheet').hidden = true; });
$('todoName').addEventListener('keydown', e => { if (e.key === 'Enter') $('todoSave').onclick(); });
function finishL(key) { if (F.ltut[key]) return; F.ltut[key] = true; addEnergy(GAIN.larvaTut); }
$('todoSave').onclick = () => {
    const label = $('todoName').value.trim(); if (!label) { $('todoName').focus(); return; }
    const checklist = $('todoSteps').value.split('\n').map(t => t.trim()).filter(Boolean).slice(0, 8)
        .map((text, i) => ({ id: `chk-${Date.now()}-${i}`, text, done: false }));
    const dueDate = dueSel === 'today' ? obDayISO(0) : dueSel === 'tomorrow' ? obDayISO(1) : null;
    S.addTodo({ label, dueDate, checklist });
    $('todoSheet').hidden = true;
    if (F.stage === 'larva') { finishL('add'); if (dueDate) finishL('due'); if (checklist.length) finishL('steps'); }
    renderLog(true);
};
function checkTodo(id) {
    const t = S.todos().find(x => x.id === id); if (!t || t.completed) return;
    if (t.checklist && t.checklist.length) S.setChecklist(id, t.checklist.map(st => ({ ...st, done: true })));
    S.completeTodo(id);
    if (F.stage === 'larva') {
        const c = F.todoChecks && F.todoChecks.date === dayKey() ? F.todoChecks.count : 0;
        if (c < TODO_CAP) { F.todoChecks = { date: dayKey(), count: c + 1 }; addEnergy(GAIN.todo); }
        finishL('check'); larvaBounce();
    }
    renderLog(true);
}

// ---- pupa: sealed for an hour (real time - it keeps going while the app is closed) ----
function startPupa(instant) {
    if (F.stage === 'larva') { F.stage = 'pupa'; F.pupaEnd = Date.now() + PUPA_SECONDS * 1000; save(); }
    egg.classList.remove('full');
    $('after').classList.add('noenergy');
    const svg = $('cellSvg'); svg.innerHTML = cellSVG('pupa'); egg.classList.add('cellmode');
    if (!instant) { svg.classList.add('sealing'); setTimeout(() => svg.classList.remove('sealing'), 1700); }
    egg.setAttribute('aria-label', 'A sealed cell.');
    if (!unlockedTabs().includes('dailies')) {
        unlockTab('dailies');
        setTimeout(() => story(`<h2>📅 Dailies unlocked</h2>
            <p>It has sealed itself in to change. It will sleep for an hour.</p>
            <p>Dailies are the routine you keep. Pick the days, and each one resets every morning. Do it, check it off, and build a streak.</p>
            <p>Every step you learn now takes ${SHAVE_MINUTES} minutes off the wait.</p>
            <div class="row2"><button class="btn ghost" data-s="close">Later</button><button class="btn" data-s="daily">${PRACTICE ? 'OK' : 'Make my first daily'}</button></div>`), instant ? 50 : 1900);
    }
    clearInterval(T.pupaT);
    const tick = () => {
        const left = Math.max(0, Math.ceil((F.pupaEnd - Date.now()) / 1000));
        const el = $('pupaLeft'); if (el) el.textContent = fmtTime(left);
        if (left <= 0 && sealedLessonsDone()) { clearInterval(T.pupaT); T.pupaT = null; makeReady(false); }
        else if (left <= 0 && !T.waitShown) { T.waitShown = true; renderLog(); }
    };
    T.pupaT = setInterval(tick, 500);
    renderLog();
    tick();
}
function makeReady(instant) {
    if (F.stage === 'pupa') { F.stage = 'ready'; save(); }
    $('after').classList.add('noenergy');
    $('cellSvg').innerHTML = cellSVG('ready'); egg.classList.add('cellmode', 'ready');
    egg.setAttribute('aria-label', 'The cell is cracking. Tap it.');
    if (F.readyTaps) drawWaxCracks();
    if (!instant && canBuzz) navigator.vibrate([40, 60, 40]);
    renderLog();
    if (F.readyTaps >= WAX_TAPS) setTimeout(chooseRoyal, 300);
}
function drawWaxCracks() {
    const g = $('cellSvg').querySelector('#waxCracks'); if (!g) return;
    drawCracks(g, crackWeb(F.seed * 13 + 5, F.readyTaps, inCap, [60, 80], .75), F.readyTaps, WAX_TAPS);
}
function readyTap() {
    if (F.readyTaps >= WAX_TAPS) return;
    F.readyTaps++; save();
    drawWaxCracks();
    buildUp(F.readyTaps, WAX_TAPS);
    if (F.readyTaps >= WAX_TAPS) setTimeout(chooseRoyal, 500); else renderLog();
}

// ---- the choice, the hatch, the crowning ----
function chooseRoyal() {
    story(`<h2>It's about to hatch</h2><p>Are you male or female?</p>
        <div class="gender"><button data-s="king"><span>♂</span>Male</button><button data-s="queen"><span>♀</span>Female</button></div>`, true);
}
// The bee rises as a silhouette against a sunrise (no crown yet).
function hatch(kind, instant) {
    if (F.stage === 'ready') { F.stage = 'hatched'; F.royal = kind; F.revealed = false; save(); }
    egg.classList.remove('ready'); egg.classList.add('cellmode');
    $('after').classList.add('noenergy');
    if (!instant) { flashGo(); if (canBuzz) navigator.vibrate([60, 40, 60, 40, 300]); }
    $('cellSvg').innerHTML = cellSVG('empty');
    $('sunrise').classList.add('up');
    aura.classList.add('gold'); aura.style.opacity = .5; aura.style.transform = 'translate(-50%,-50%) scale(.5)';
    const r = $('royal'); r.innerHTML = royalStack(F.royal); r.className = 'royal silhouette'; void r.offsetWidth; r.classList.add('out');
    renderLog();
    askName(instant ? 600 : 3200);
}
function askName(delay) {
    const A = ROYAL_ART[F.royal];
    setTimeout(() => story(`<h2>It has hatched</h2><p>Give ${A.her} a name.</p>
        <input type="text" id="royalName" maxlength="24" placeholder="Name" autocomplete="off">
        <div class="row2"><button class="btn" data-s="named">That's ${A.her} name</button></div>`.replace(`That's him name`, `That's his name`), true), delay);
}
function reveal() {
    $('story').hidden = true;
    F.name = String(F.name || '').trim().slice(0, 24); save();
    const A = ROYAL_ART[F.royal], r = $('royal');
    setTimeout(() => {                                       // colour floods in (no crown yet)
        r.classList.remove('silhouette'); flashGo();
        if (canBuzz) navigator.vibrate([80, 60, 80]);
        aura.style.opacity = .75; aura.style.transform = 'translate(-50%,-50%) scale(.7)';
    }, 400);
    setTimeout(() => r.classList.add('crowned'), 1700);      // the crown descends...
    setTimeout(() => {                                       // ...and lands
        const stack = r.querySelector('.rstack');
        for (let i = 0; i < 16; i++) {
            const sp = document.createElement('span'); sp.className = 'spark';
            const a = Math.PI * 2 * i / 16 + Math.random() * .3, d = 30 + Math.random() * 50;
            sp.style.left = A.crown[0] + '%'; sp.style.top = A.crown[1] + '%';
            sp.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px'); sp.style.setProperty('--dy', (Math.sin(a) * d).toFixed(0) + 'px');
            stack.appendChild(sp); setTimeout(() => sp.remove(), 950);
        }
        flashGo(); if (canBuzz) navigator.vibrate([120, 60, 120, 60, 400]);
        aura.style.opacity = .95; aura.style.transform = 'translate(-50%,-50%) scale(.9)';
        const t = $('revealTitle'); t.innerHTML = `<small>${esc(F.name)}</small><b>${A.label.toUpperCase()}</b>`;
        restart(t, 'go');
        F.revealed = true; save(); renderLog();
    }, 2500);
    setTimeout(showCard, 5800);
}
function showCrowned() {   // restoring after the reveal
    const r = $('royal'); r.innerHTML = royalStack(F.royal); r.className = 'royal out crowned';
    $('sunrise').classList.add('up'); aura.classList.add('gold'); aura.style.opacity = .9; aura.style.transform = 'translate(-50%,-50%) scale(.85)';
}
function showCard() {
    const A = ROYAL_ART[F.royal], nm = esc(F.name || A.label);
    story(`<h2 style="text-align:center">A new card</h2>
        <div class="scard"><div class="scard-top"><span class="rp">ROYAL</span><b title="${nm}">${nm}</b><span>👑</span></div>
          <div class="scard-art">${royalStack(F.royal)}</div>
          <div class="scard-dex"><span>No.000</span><span>FOUNDER</span><span>${A.label.toUpperCase()}</span></div>
          <p class="scard-flavor">The heart of a new hive, hatched from a gift. Every bee to come answers to ${A.her}.</p></div>
        <div class="row2" style="justify-content:center"><button class="btn" data-s="done">${PRACTICE ? 'Finish practice' : 'Add to my colony'}</button></div>`, true);
}
function finish() {
    clearInterval(T.pupaT); clearInterval(T.stretchT);
    if (PRACTICE) { location.href = '../settings/settings.html'; return; }
    S.finish(F.royal, F.name);
    try { localStorage.setItem('bb_starter_skills', 'new'); } catch {}   // Home asks "What are you working on?"
    location.href = '../home/home.html';
}

// ---- your name (asked once, right after the bond) ----
function askPlayerName() {
    if (F.askedName || !$('story').hidden) return;
    story(`<h2>It knows you're here</h2><p>What should it call you?</p>
        <input type="text" id="playerName" maxlength="30" placeholder="Your name" autocomplete="given-name">
        <div class="row2"><button class="btn" data-s="me">That's me</button></div>`, true);
}
function savePlayerName() {
    const name = ($('playerName').value || '').trim();
    if (!name) { $('playerName').focus(); return; }
    if (!PRACTICE) Vault.setDisplayName(name);
    F.askedName = true; save();
    $('story').hidden = true;
}

// ---- one reusable story popup ----
function story(html, locked) {
    $('storyCard').innerHTML = html; $('story').dataset.locked = locked ? '1' : ''; $('story').hidden = false;
    const inp = $('storyCard').querySelector('input'); if (inp) setTimeout(() => inp.focus(), 60);
}
$('story').addEventListener('click', e => {
    if (e.target.id === 'story' && !$('story').dataset.locked) { $('story').hidden = true; return; }
    const b = e.target.closest('[data-s]'); if (!b) return;
    const a = b.dataset.s;
    if (a === 'close') $('story').hidden = true;
    else if (a === 'todo') { $('story').hidden = true; if (PRACTICE) openTodo(); else location.href = TAB_LINKS.todos.make; }
    else if (a === 'daily') { $('story').hidden = true; if (!PRACTICE) location.href = TAB_LINKS.dailies.make; }
    else if (a === 'quest') { $('story').hidden = true; if (!PRACTICE) location.href = TAB_LINKS.quests.make; }
    else if (a === 'queen' || a === 'king') { $('story').hidden = true; hatch(a, false); }
    else if (a === 'named') { F.name = ($('royalName').value || '').trim(); reveal(); }
    else if (a === 'done') finish();
    else if (a === 'me') savePlayerName();
});
$('story').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'royalName') { F.name = e.target.value.trim(); reveal(); }
    if (e.key === 'Enter' && e.target.id === 'playerName') savePlayerName();
});

// ---------------------------------------------------------------------------
// Gift note + practice bar + start / resume
// ---------------------------------------------------------------------------
// The developer's note, one sentence at a time - slow enough for anyone
// to read (Craft 2026-10-09). Tap moves on to the next sentence. The last
// one fades into the egg slowly.
const GIFT_SLIDES = [
    'Thank you for your interest in this project.',
    'I wish to share with you a journey that started out as an idea.',
    "And now, it's in the palm of your hand.",
    'A gift, to you.',
    'Care for it, and it will care for you.'
];
function showGift() {
    const g = $('gift'), box = $('giftSlides');
    g.hidden = false; g.focus();
    box.innerHTML = GIFT_SLIDES.map((t, i) => `<p class="gift-slide${i === GIFT_SLIDES.length - 1 ? ' last' : ''}">${esc(t)}</p>`).join('') +
        `<div class="gift-dots" aria-hidden="true">${GIFT_SLIDES.map(() => '<i></i>').join('')}</div>`;
    const slides = [...box.querySelectorAll('.gift-slide')], dots = [...box.querySelectorAll('.gift-dots i')];
    const FADE_IN = reduce ? 200 : 1600, FADE_OUT = reduce ? 200 : 1300;
    const readMs = t => Math.max(3400, t.split(/\s+/).length * 520);   // ~115 words a minute, never under 3.4s
    let i = -1, timer = null, busy = false, leaving = false;
    const next = () => {
        clearTimeout(timer);
        if (i >= 0) { slides[i].classList.remove('in'); slides[i].classList.add('out'); }
        i++;
        if (i >= slides.length) return leave();
        busy = true;
        setTimeout(() => {
            slides[i].classList.add('in');
            dots.forEach((d, k) => d.classList.toggle('on', k <= i));
            box.querySelector('.gift-dots').classList.add('show');
            setTimeout(() => { busy = false; }, FADE_IN);
            timer = setTimeout(next, FADE_IN + readMs(GIFT_SLIDES[i]) + (i === slides.length - 1 ? 1200 : 0));
        }, i === 0 ? 2000 : FADE_OUT);
    };
    const leave = () => {
        if (leaving) return; leaving = true;
        F.stage = 'egg'; save();
        g.classList.add('leaving');
        setTimeout(() => { g.hidden = true; }, reduce ? 300 : 3400);
    };
    const tap = () => { if (!busy && !leaving) next(); };
    g.addEventListener('click', tap);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
    next();
}

function setupPractice() {
    $('practiceBar').hidden = false;
    $('practiceExit').onclick = () => { location.href = '../settings/settings.html'; };
    $('practiceSkip').onclick = () => {
        if (T.stretchT) { T.stretchEnd = Date.now(); return; }
        if (F.stage === 'pupa') { F.pupaEnd = Date.now(); return; }
        if (F.stage === 'egg' && mode === 'idle') { bond(false); }
    };
}

// Puts the screen back exactly where the saved game was.
function restore() {
    if (F.stage === 'gift') { showGift(); return; }
    if (F.stage === 'egg' && !F.bonded) return;          // waiting to be held
    bond(true);
    if (F.stage === 'egg') return;                         // startFeeding handles the rest
    if (F.stage === 'larva') { breakEgg(true); return; }
    if (F.stage === 'pupa') { $('cellSvg').innerHTML = cellSVG('pupa'); egg.classList.add('cellmode'); startPupa(true); return; }
    if (F.stage === 'ready') { makeReady(true); return; }
    if (F.stage === 'hatched') {
        egg.classList.add('cellmode'); $('cellSvg').innerHTML = cellSVG('empty'); $('after').classList.add('noenergy');
        if (F.revealed) { showCrowned(); renderLog(); showCard(); }
        else hatch(F.royal, true);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    if (!PRACTICE && !Vault.isOnboarding()) { location.replace('../home/home.html'); return; }
    S = makeStore(); F = S.rec;
    ['done', 'tut', 'ltut', 'dtut', 'qtut', 'plusLog', 'negLog'].forEach(k => { if (!F[k] || typeof F[k] !== 'object') F[k] = {}; });
    if (PRACTICE) setupPractice();
    else {
        // Older saves: open the tabs they'd already reached (keeps their record).
        Vault.getOnboardingTabs().forEach(tab => { if (!(F.base && F.base[tab])) Vault.unlockOnboardingTab(tab); });
        AppShell.mountOnboardingDock('../../..');
        addEventListener('pageshow', e => { if (e.persisted) reconcile(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reconcile(); });
    }
    (() => { let h = ''; for (let i = 0; i < 26; i++) h += `<i style="left:${Math.random() * 100}%;top:${20 + Math.random() * 80}%;--d:${7 + Math.random() * 7}s;--dl:${-Math.random() * 10}s;--o:${(.15 + Math.random() * .35).toFixed(2)}"></i>`; $('motes').innerHTML = h; })();
    paintEgg();
    restore();
    reconcile();
    requestAnimationFrame(frame);
});
