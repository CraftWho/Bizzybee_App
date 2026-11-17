// Study Focus tab (Nov 2026 draft): hourglass / ring timer, breaks, nudges, tips.
// Sessions are saved with Vault.addStudySession. Timer uses real clock time, so it
// stays right if the phone sleeps. No XP yet: waiting on Craft's OK for amounts.
(function () {
    const $ = id => document.getElementById(id);
    const GLASS = 'M20 10 H100 C100 50 66 70 62 90 C66 110 100 130 100 170 H20 C20 130 54 110 58 90 C54 70 20 50 20 10 Z';
    const TIPS = [
        ['Test yourself', 'Before you check the notes, write down what you remember. Pulling it out beats reading it again.'],
        ['Space it out', 'Come back tomorrow, then in 3 days, then in a week. Short reviews beat one long one.'],
        ['Teach it', 'Explain it out loud in plain words, as if to a friend. Where you stumble is what to study next.'],
        ['Sleep on it', 'Sleep is when the day\'s learning gets stored. Protect tonight\'s sleep.'],
        ['One thing at a time', 'Put the phone in another room. Switching tasks costs you minutes every time.'],
        ['25 on, 5 off', 'Work in short rounds. After four rounds take a long break. Breaks are part of the method.'],
        ['Look away, 20-20-20', 'Every 20 minutes look at something 20 feet away for 20 seconds.']
    ];
    const NUDGES = [
        ['💧', 'Drink some water', 'Even mild thirst makes it harder to concentrate. Fill your glass now.'],
        ['👀', 'Look far away', 'Find something about 20 feet away and look at it for 20 seconds.'],
        ['🧍', 'Stand up and stretch', 'Roll your shoulders, reach up, and walk to the next room and back.'],
        ['🌬️', 'Breathe slowly', 'In through your nose for 4 counts, hold for 7, out for 8. Do it three times.'],
        ['🚶', 'Take a short walk', 'Two minutes of walking brings your energy up better than your phone does.']
    ];
    const SAY = {
        low: 'Low is normal after a round. Drink water, take the full break, and do the next round on something easy.',
        ok: 'Good. Keep the same plan. Stand up for the last minute of this break.',
        high: 'Nice. Save your hardest lesson for the next round while you feel sharp.'
    };
    const KEY = 'bb_study_focus';
    let cfg = { f: 25, b: 5, style: 'glass' };
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
    const st = { mode: 'focus', n: 1, total: cfg.f * 60, left: cfg.f * 60, running: false, endAt: 0, subj: 'Anything' };
    let nudgeIx = 0, tipIx = 0, timer = null;

    function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }
    function fmt(s) { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60), r = s % 60; return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0'); }

    function build() {
        const g = $('sd-glass');
        if (cfg.style === 'glass') {
            g.innerHTML = '<svg viewBox="0 0 120 180" aria-hidden="true"><defs><clipPath id="sd-clip"><path d="' + GLASS + '"/></clipPath></defs>' +
                '<rect class="sd-cap" x="12" y="2" width="96" height="8" rx="2"/><rect class="sd-cap" x="12" y="170" width="96" height="8" rx="2"/>' +
                '<path class="sd-gfill" d="' + GLASS + '"/><g clip-path="url(#sd-clip)"><rect class="sd-sand" id="sd-top" x="0" width="120" y="15" height="75"/>' +
                '<rect class="sd-sand" id="sd-bot" x="0" width="120" y="170" height="0"/><line class="sd-stream" id="sd-stream" x1="60" x2="60" y1="88" y2="170"/></g>' +
                '<path class="sd-gline" d="' + GLASS + '"/></svg>';
        } else {
            g.innerHTML = '<svg class="sd-ringsvg" viewBox="0 0 120 120" aria-hidden="true"><circle class="sd-ringbg" cx="60" cy="60" r="50"/><circle class="sd-ringfg" id="sd-ring" cx="60" cy="60" r="50" stroke-dasharray="314.16" stroke-dashoffset="0"/></svg>';
        }
    }

    function draw() {
        const f = st.total ? st.left / st.total : 0, brk = st.mode !== 'focus';
        $('sd-time').textContent = fmt(st.left);
        if (cfg.style === 'glass') {
            const top = 75 * f, bot = 75 - top, a = $('sd-top'), b = $('sd-bot'), s = $('sd-stream');
            if (a) { a.setAttribute('y', 90 - top); a.setAttribute('height', top); }
            if (b) { b.setAttribute('y', 170 - bot); b.setAttribute('height', bot); }
            if (s) { s.setAttribute('y2', 170 - bot); s.style.display = st.running && st.left > 0 ? '' : 'none'; }
        } else {
            const r = $('sd-ring'); if (r) r.setAttribute('stroke-dashoffset', String(314.16 * (1 - f)));
        }
        $('sd-stage').classList.toggle('rest', brk);
        $('sd-phase').textContent = st.mode === 'focus' ? 'Focus ' + st.n + ' of 4' : (st.mode === 'long' ? 'Long break' : 'Short break');
        $('sd-go').textContent = st.running ? 'PAUSE' : (st.left >= st.total ? (brk ? 'START BREAK' : 'START') : 'RESUME');
        let d = '';
        for (let i = 1; i <= 4; i++) d += '<span class="sd-dot' + (i < st.n || (i === st.n && brk) ? ' done' : '') + (i === st.n && !brk ? ' now' : '') + '"></span>';
        $('sd-dots').innerHTML = d;
    }

    function showNudge() { const n = NUDGES[nudgeIx % NUDGES.length]; $('sd-nudge-ic').textContent = n[0]; $('sd-nudge-t').textContent = n[1]; $('sd-nudge-p').textContent = n[2]; }

    function setPhase(mode) {
        st.mode = mode; st.total = (mode === 'focus' ? cfg.f : mode === 'long' ? 15 : cfg.b) * 60;
        st.left = st.total; st.running = false; stop();
        $('sd-break').hidden = mode === 'focus';
        if (mode !== 'focus') showNudge();
        build(); draw();
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function tick() {
        if (!st.running) return;
        st.left = Math.max(0, (st.endAt - Date.now()) / 1000);
        draw();
        if (st.left <= 0) finish();
    }
    function start() { st.running = true; st.endAt = Date.now() + st.left * 1000; stop(); timer = setInterval(tick, 250); draw(); }
    function pause() { tick(); st.running = false; stop(); draw(); }

    function sheet(html, wire) { $('sd-sheet').innerHTML = html; $('sd-scrim').hidden = false; wire($('sd-sheet')); const b = $('sd-sheet').querySelector('button'); if (b) b.focus(); }
    function closeSheet() { $('sd-scrim').hidden = true; }

    function finish() {
        st.running = false; stop(); draw();
        if (st.mode === 'focus') {
            const mins = cfg.f, tip = TIPS[tipIx++ % TIPS.length];
            sheet('<h2 class="sd-h">SESSION DONE</h2><div class="sd-big">' + mins + ' min</div>' +
                '<p class="sd-say">You focused on <b>' + esc(st.subj) + '</b>. Log the time so it counts.</p>' +
                '<div class="sd-pair"><button type="button" class="btn solid" data-k="log">LOG TIME</button><button type="button" class="btn" data-k="later">FILL IN LATER</button></div>' +
                '<div class="sd-tip"><small class="sd-lbl">Tip of the session</small><p><b>' + esc(tip[0]) + '.</b> ' + esc(tip[1]) + '</p></div>', w => {
                    w.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
                        const logged = b.dataset.k === 'log';
                        Vault.addStudySession({ min: mins, topic: st.subj, logged });
                        Toast.show(logged ? '🎓 +' + mins + ' min logged' : 'Added to your fill-in list', 'positive');
                        closeSheet(); stats();
                        setPhase(st.n === 4 ? 'long' : 'break'); start();
                    }));
                });
        } else {
            Toast.show('Break over. Ready for the next round?', 'neutral');
            st.n = st.mode === 'long' ? 1 : st.n + 1; nudgeIx++;
            setPhase('focus');
        }
    }
    function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

    function stats() {
        const all = Vault.getStudySessions(), today = new Date(), iso = d => d.toLocaleDateString('en-CA');
        const t = iso(today), wk = new Date(today.getTime() - 6 * 864e5), w = iso(wk);
        const sum = list => list.reduce((n, e) => n + e.min, 0);
        const logged = all.filter(e => e.logged);
        $('sd-s-today').textContent = sum(logged.filter(e => e.date === t)) + ' min';
        $('sd-s-week').textContent = sum(logged.filter(e => e.date >= w)) + ' min';
        const pend = all.filter(e => !e.logged);
        $('sd-s-fill').textContent = pend.length;
        $('sd-fill-list').innerHTML = pend.length ? '<h2 class="sec">To fill in</h2><div class="card">' + pend.slice(-8).reverse().map(e =>
            '<div class="row sd-frow"><div class="mid"><b>' + esc(e.topic || 'Study') + '</b><small>' + e.min + ' min · ' + esc(e.date) + '</small></div><button type="button" class="btn" data-fill="' + e.id + '">LOG IT</button></div>').join('') + '</div>' : '';
        $('sd-fill-list').querySelectorAll('[data-fill]').forEach(b => b.addEventListener('click', () => { Vault.fillStudySession(b.dataset.fill); Toast.show('Logged', 'positive'); stats(); }));
    }

    function tips() {
        $('sd-tips').innerHTML = '<div class="card">' + TIPS.map(t => '<div class="row"><div class="mid sd-tipc"><b>' + esc(t[0]) + '</b><p>' + esc(t[1]) + '</p></div></div>').join('') + '</div><p class="sd-say">More tips will unlock as you study.</p>';
    }

    function pressed(group, el) { group.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === el ? 'true' : 'false')); }

    document.addEventListener('DOMContentLoaded', async () => {
        if (!$('sd-stage')) return;
        await Vault.init();
        if (typeof Plugins !== 'undefined' && !Plugins.isEnabled('study')) return;
        pressed($('sd-lens'), $('sd-lens').querySelector('[data-f="' + cfg.f + '"]') || $('sd-lens').firstElementChild);
        pressed($('sd-styles'), $('sd-styles').querySelector('[data-s="' + cfg.style + '"]'));
        document.querySelectorAll('.sd-tabs .chip').forEach(c => c.addEventListener('click', () => {
            pressed(c.parentNode, c);
            ['focus', 'topics', 'tips'].forEach(k => { $('sd-' + k).hidden = k !== c.dataset.tab; });
        }));
        $('sd-go').addEventListener('click', () => (st.running ? pause() : start()));
        $('sd-reset').addEventListener('click', () => { st.running = false; stop(); st.left = st.total; build(); draw(); });
        $('sd-lens').addEventListener('click', e => {
            const c = e.target.closest('.chip'); if (!c) return;
            pressed($('sd-lens'), c); cfg.f = +c.dataset.f; cfg.b = +c.dataset.b; saveCfg(); st.n = 1; setPhase('focus');
        });
        $('sd-styles').addEventListener('click', e => {
            const c = e.target.closest('.chip'); if (!c) return;
            pressed($('sd-styles'), c); cfg.style = c.dataset.s; saveCfg(); build(); draw();
        });
        $('sd-subj-btn').addEventListener('click', () => {
            const names = ['Anything'].concat(Vault.getStudyQueue().filter(i => i.status !== 'Complete').map(i => i.topic));
            const i = names.indexOf(st.subj); st.subj = names[(i + 1) % names.length]; $('sd-subj').textContent = st.subj;
        });
        $('sd-nudge-next').addEventListener('click', () => { nudgeIx++; showNudge(); });
        $('sd-energy').addEventListener('click', e => {
            const c = e.target.closest('.chip'); if (!c) return;
            pressed($('sd-energy'), c); $('sd-say').textContent = SAY[c.dataset.e];
        });
        $('sd-scrim').addEventListener('click', e => { if (e.target === $('sd-scrim')) closeSheet(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        build(); draw(); stats(); tips();
    });
})();
