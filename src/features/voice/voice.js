// Nov 21 2026 (Craft; approved): the voice screen and Bixby links.
const VoiceParse = (() => {
    const KIND = (w) => /habit/i.test(w) ? 'habit' : /to-?\s?do/i.test(w) ? 'todo' : /daily|dailies/i.test(w) ? 'daily' : null;
    const clean = (t) => String(t || '').trim().replace(/[.!?]+$/, '').replace(/^["“']|["”']$/g, '').trim();
    const mins = (t) => { const m = String(t).match(/(\d+)\s*(?:min|mins|minutes)\b/i); return m ? Number(m[1]) : null; };
    function parse(said) {
        const t = clean(said).replace(/\s+/g, ' ');
        let m;
        if ((m = t.match(/^(?:please\s+)?(?:add|make|create|new)\s+(?:a\s+|an\s+)?(daily|to-?\s?do|habit)\s+(?:called\s+|named\s+|for\s+)?(.+)$/i))) return { op: 'add', kind: KIND(m[1]), label: clean(m[2]), minutes: mins(m[2]) };
        if ((m = t.match(/^(?:please\s+)?(?:add|make|create|put)\s+(.+?)\s+(?:as\s+|into\s+|to\s+)?(?:a\s+|an\s+|my\s+)?(daily|dailies|to-?\s?dos?|habits?)$/i))) return { op: 'add', kind: KIND(m[2]), label: clean(m[1]), minutes: mins(m[1]) };
        if ((m = t.match(/^(?:uncheck|undo|un-?complete)\s+(.+)$/i))) return { op: 'uncomplete', label: clean(m[1]) };
        if ((m = t.match(/^(?:plus|add one to|tick|log|one more)\s+(.+)$/i))) return { op: 'habit', kind: 'habit', label: clean(m[1]), dir: '+' };
        if ((m = t.match(/^(?:minus|take one from)\s+(.+)$/i))) return { op: 'habit', kind: 'habit', label: clean(m[1]), dir: '-' };
        if ((m = t.match(/^(?:complete|completed|finish|finished|check off|check|mark|done with|done)\s+(.+?)(?:\s+(?:as\s+)?(?:done|complete|completed))?$/i))) return { op: 'complete', label: clean(m[1]) };
        if ((m = t.match(/^(.+?)\s+(?:is\s+)?(?:done|complete|completed|finished)$/i))) return { op: 'complete', label: clean(m[1]) };
        return null;
    }
    // Find which list a "complete X" means: dailies, then To-Dos, then quest tasks, then habits. Loose match.
    function resolve(cmd, state) {
        if (!cmd) return null;
        if (cmd.op === 'add') return cmd.kind ? cmd : null;
        const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        const want = norm(cmd.label);
        const hit = (label) => { const l = norm(label); return l === want || (want.length >= 3 && (l.includes(want) || want.includes(l))); };
        const pools = cmd.op === 'habit' ? [['habit', state.habits]] : [['daily', state.dailyTasks], ['todo', (state.todos || []).filter(t => cmd.op === 'uncomplete' || !t.completed)], ['habit', state.habits]];
        for (const [kind, list] of pools) {
            const found = (list || []).find(x => norm(x.label) === want) || (list || []).find(x => hit(x.label));
            if (found) return kind === 'habit' && cmd.op !== 'uncomplete' ? { op: 'habit', kind, id: found.id, label: found.label, dir: cmd.dir || '+' } : { ...cmd, kind, id: found.id, label: found.label };
        }
        for (const q of state.quests || []) {
            const t = (q.tasks || []).find(x => hit(x.label || x.title));
            if (t && cmd.op !== 'habit') return { ...cmd, kind: 'quest-task', id: t.id, questId: q.id, label: t.label || t.title };
        }
        return { ...cmd, missing: true };
    }
    const describe = (c) => c.missing ? `I couldn't find “${c.label}”.` : c.op === 'add' ? `Add ${c.kind === 'todo' ? 'To-Do' : c.kind} “${c.label}”${c.minutes ? ` (${c.minutes} min)` : ''}` :
        c.op === 'habit' ? `${c.dir === '-' ? '−1' : '+1'} on habit “${c.label}”` : `${c.op === 'uncomplete' ? 'Uncheck' : 'Complete'} ${c.kind === 'todo' ? 'To-Do' : c.kind === 'quest-task' ? 'quest task' : c.kind} “${c.label}”`;
    return { parse, resolve, describe };
})();

(() => {
    if (typeof document === 'undefined' || !document.getElementById('vc-mic')) return;
    const Cap = window.Capacitor;
    const F = Cap && Cap.isNativePlatform && Cap.isNativePlatform() && Cap.Plugins && Cap.Plugins.BeeFiles;
    const out = document.getElementById('vc-out'), mic = document.getElementById('vc-mic');
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function show(said) {
        const cmd = VoiceParse.resolve(VoiceParse.parse(said), Vault.state || {});
        out.hidden = false;
        if (!cmd) { out.innerHTML = `<b>“${esc(said)}”</b><span>I didn't get that. Try “complete gym” or “make reading a daily”.</span>`; return; }
        out.innerHTML = `<small>You said: “${esc(said)}”</small><b>${esc(VoiceParse.describe(cmd))}</b>${cmd.missing ? '' : '<div class="btns"><button type="button" class="btn solid" id="vc-ok">OK</button><button type="button" class="btn" id="vc-no">Cancel</button></div>'}`;
        if (cmd.missing) return;
        document.getElementById('vc-no').onclick = () => { out.hidden = true; };
        document.getElementById('vc-ok').onclick = () => {
            const [r] = Vault.applyOps([cmd], { src: 'voice', note: `Voice: “${said}”` });
            try { if (typeof CloudSyncAuto !== 'undefined') CloudSyncAuto.schedule(); } catch { /* uploads later */ }
            out.innerHTML = r.ok ? `<b>✅ Done: ${esc(VoiceParse.describe(cmd))}</b><small>It's in the change log.</small>` : `<b>⚠️ ${esc(r.why || 'That did not work.')}</b>`;
        };
    }
    async function listen() {
        if (!F) { document.getElementById('vc-text').focus(); return; }
        mic.classList.add('on');
        try { const r = await F.listen({ prompt: 'Tell BizzyBee' }); if (r && r.text) show(r.text); }
        catch (e) { if (!/cancel/i.test(String(e && e.message))) Toast.show('Voice: ' + ((e && e.message) || 'not available'), 'negative'); }
        finally { mic.classList.remove('on'); }
    }
    mic.onclick = listen;
    const go = () => { const v = document.getElementById('vc-text').value.trim(); if (v) show(v); };
    document.getElementById('vc-go').onclick = go;
    document.getElementById('vc-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const pin = document.getElementById('vc-pin');
    pin.hidden = !F;
    pin.onclick = async () => { try { await BizzyNative.pinSaveButton(); Toast.show('Android will ask to add the button. Tap Add.', 'positive'); } catch (e) { Toast.show('Could not add it: ' + (e.message || 'update the app'), 'negative'); } };
    Vault.init().then(() => {
        const S = Vault.state || {};
        const links = [['💾 Save BizzyBee', 'bizzybee://save'], ['🎙️ Open Voice', 'bizzybee://voice'],
            ...(S.dailyTasks || []).map(d => [`☀️ Daily done: ${d.label}`, `bizzybee://done?daily=${encodeURIComponent(d.label)}`]),
            ...(S.habits || []).map(h => [`➕ Habit +1: ${h.label}`, `bizzybee://habit?name=${encodeURIComponent(h.label)}`]),
            ...(S.todos || []).filter(t => !t.completed).map(t => [`✅ To-Do done: ${t.label}`, `bizzybee://done?todo=${encodeURIComponent(t.label)}`])];
        const host = document.getElementById('vc-links');
        host.innerHTML = links.map(([name, url], i) => `<div class="vc-link"><div class="row2"><span>${esc(name)}</span><button type="button" class="btn" data-i="${i}">Copy</button></div><code>${esc(url)}</code></div>`).join('');
        host.onclick = async (e) => { const b = e.target.closest('[data-i]'); if (!b) return; try { await navigator.clipboard.writeText(links[b.dataset.i][1]); Toast.show('Link copied.', 'positive'); } catch { Toast.show('Copy failed: long-press the link instead.', 'negative'); } };
    });
    if (new URLSearchParams(location.search).get('listen') === '1') setTimeout(listen, 500);
})();
