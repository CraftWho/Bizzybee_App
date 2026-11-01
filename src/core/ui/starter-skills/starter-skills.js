// Starter skills (Oct 28 2026, approved demo). "What are you working on?"
// Shows once after "Add to my hive" for new players, and once on the
// Dashboard for players with no skills yet. Each skill brings a word pack:
// those words go into the Dictionary under that skill, so normal task names
// ("Morning run") count toward it. No #hashtags needed.
const StarterSkills = (() => {
    const SKILLS = [
        ['💪', 'Fitness', ['run', 'running', 'jog', 'gym', 'workout', 'walk', 'yoga', 'stretch', 'push-ups', 'lift', 'swim', 'bike']],
        ['📚', 'Study', ['study', 'read', 'reading', 'homework', 'class', 'lecture', 'notes', 'exam', 'flashcards', 'course']],
        ['💻', 'Coding', ['code', 'coding', 'javascript', 'html', 'css', 'python', 'react', 'debug', 'github', 'leetcode', 'bug']],
        ['🍳', 'Cooking', ['cook', 'cooking', 'meal prep', 'recipe', 'bake', 'dinner', 'lunch', 'breakfast']],
        ['💼', 'Work', ['work', 'meeting', 'email', 'report', 'client', 'project', 'deadline', 'presentation']],
        ['🧘', 'Mindfulness', ['meditate', 'meditation', 'journal', 'breathe', 'gratitude', 'mindful']],
        ['🏠', 'Home', ['clean', 'laundry', 'dishes', 'vacuum', 'tidy', 'groceries', 'chores']],
        ['🎨', 'Creative', ['draw', 'paint', 'write', 'writing', 'design', 'photo', 'sketch']],
        ['🎵', 'Music', ['guitar', 'piano', 'practice', 'sing', 'song', 'drums', 'music']],
        ['💰', 'Money', ['budget', 'bills', 'save', 'invest', 'expenses', 'taxes']],
        ['🗣️', 'Language', ['spanish', 'french', 'duolingo', 'vocab', 'language', 'japanese']],
        ['🤝', 'Social', ['call', 'friend', 'family', 'text', 'visit', 'date night']],
    ];
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const toast = (m, t = 'positive') => { if (typeof Toast !== 'undefined') Toast.show(m, t); };

    function open() {
        if (document.querySelector('.ss-scrim')) return Promise.resolve(null);
        return new Promise(resolve => {
            const picked = new Set(), custom = [];
            const s = document.createElement('div');
            s.className = 'ss-scrim';
            s.innerHTML = `<div class="ss-story" role="dialog" aria-modal="true" aria-label="Pick your skills">
              <section class="ss-step on" data-step="1">
                <div class="ss-dots"><i class="on"></i><i></i></div>
                <div class="ss-hex">🌱</div>
                <h2>WHAT ARE YOU WORKING ON?</h2>
                <p class="ss-sub">Pick a few. Your bees track the time you put into each one.</p>
                <div class="ss-grid"></div>
                <div class="ss-own"><input maxlength="30" placeholder="Something else? e.g. Guitar" aria-label="Your own skill"><button type="button" class="ss-btn" data-k="own">Add</button></div>
                <p class="ss-count">Pick at least one, or skip.</p>
                <div class="ss-row"><button type="button" class="ss-btn" data-k="skip">Skip for now</button><button type="button" class="ss-btn gold" data-k="next">Continue</button></div>
              </section>
              <section class="ss-step" data-step="2">
                <div class="ss-dots"><i></i><i class="on"></i></div>
                <div class="ss-hex">🐝</div>
                <h2>YOUR SKILLS</h2>
                <div class="ss-chips"></div>
                <div class="ss-try">
                  <label for="ss-task">Try it: type a task the way you normally would</label>
                  <input id="ss-task" placeholder="e.g. Morning run">
                  <div class="ss-res" aria-live="polite"></div>
                  <div class="ss-ex"></div>
                </div>
                <p class="ss-how"><b>That's it.</b> Tasks that mention these words count toward the skill on your Dashboard. You can also pick a skill on any task, and add more words in the Dictionary.</p>
                <div class="ss-row"><button type="button" class="ss-btn" data-k="back">Back</button><button type="button" class="ss-btn gold" data-k="done">Enter the hive</button></div>
              </section></div>`;
            document.body.appendChild(s);
            const $ = (q) => s.querySelector(q);
            const grid = $('.ss-grid'), own = $('.ss-own input'), task = $('#ss-task');
            const draw = () => {
                grid.innerHTML = SKILLS.map(([i, n]) => `<button type="button" class="ss-sk" data-n="${esc(n)}" aria-pressed="${picked.has(n)}"><span class="i">${i}</span>${esc(n)}</button>`).join('')
                    + custom.map(n => `<button type="button" class="ss-sk" data-n="${esc(n)}" aria-pressed="${picked.has(n)}"><span class="i">⭐</span>${esc(n)}</button>`).join('');
                $('.ss-count').textContent = picked.size ? `${picked.size} picked` : 'Pick at least one, or skip.';
            };
            const words = () => [...picked].map(n => { const k = SKILLS.find(x => x[1] === n); return [n, k ? k[2] : [n.toLowerCase()]]; });
            const match = (text) => { const t = ' ' + text.toLowerCase() + ' '; return words().filter(([, w]) => w.some(x => new RegExp(`(^|[^a-z])${reEsc(x)}([^a-z]|$)`).test(t))).map(([n]) => n); };
            const update = () => {
                const v = task.value.trim(), m = match(v);
                $('.ss-res').innerHTML = !v ? '' : m.length ? `Counts toward <b>${m.map(esc).join(', ')}</b> ✓` : 'No skill yet. Pick one on the task, or add the word to a skill.';
            };
            const go = (n) => s.querySelectorAll('.ss-step').forEach(x => x.classList.toggle('on', x.dataset.step === String(n)));
            const addOwn = () => {
                const v = own.value.trim();
                if (!v) return;
                const known = SKILLS.find(x => x[1].toLowerCase() === v.toLowerCase());
                const name = known ? known[1] : v;
                if (!known && !custom.includes(name)) custom.push(name);
                picked.add(name); own.value = ''; draw();
            };
            const close = (v) => { s.remove(); resolve(v); };
            own.addEventListener('keydown', e => { if (e.key === 'Enter') addOwn(); });
            task.addEventListener('input', update);
            s.addEventListener('click', e => {
                const sk = e.target.closest('.ss-sk');
                if (sk) { const n = sk.dataset.n; picked.has(n) ? picked.delete(n) : picked.add(n); draw(); return; }
                const ex = e.target.closest('.ss-ex button');
                if (ex) { task.value = ex.textContent; update(); return; }
                const b = e.target.closest('[data-k]');
                if (!b) return;
                const k = b.dataset.k;
                if (k === 'own') addOwn();
                if (k === 'skip') { Vault.setStarterSkills(null); toast('Skipped. The Dashboard keeps a "Pick your skills" card for later.', 'neutral'); close(null); }
                if (k === 'back') go(1);
                if (k === 'next') {
                    if (!picked.size) { toast('Pick at least one, or tap Skip.', 'neutral'); return; }
                    $('.ss-chips').innerHTML = [...picked].map(n => { const x = SKILLS.find(q => q[1] === n); return `<span class="ss-chip">${x ? x[0] : '⭐'} ${esc(n)}</span>`; }).join('');
                    const ex = words().map(([n, w]) => n === 'Fitness' ? 'Morning run' : n === 'Coding' ? 'Fix CSS bug' : n === 'Study' ? 'Read chapter 3' : n === 'Cooking' ? 'Meal prep for the week' : `${w[0][0].toUpperCase() + w[0].slice(1)} for 20 min`);
                    $('.ss-ex').innerHTML = ex.slice(0, 4).map(x => `<button type="button">${esc(x)}</button>`).join('');
                    go(2); update(); task.focus();
                }
                if (k === 'done') {
                    const added = Vault.setStarterSkills(words().map(([name, w]) => ({ name, words: w })));
                    toast(`🐝 ${picked.size} skill${picked.size === 1 ? '' : 's'} saved${added ? ` · ${added} words in your Dictionary` : ''}.`);
                    close([...picked]);
                }
            });
            draw();
            setTimeout(() => { const f = grid.querySelector('.ss-sk'); if (f) f.focus(); }, 50);
        });
    }

    // No skills yet = no Dictionary words under a skill (other than General).
    const hasSkills = () => (Vault.state && Vault.state.dictionary || []).some(t => t.category && t.category !== 'General');
    return { open, hasSkills, SKILLS };
})();
