// Merge skills (Oct 29 2026, approved). When a new skill covers an old one
// ("Time" inside "Time Management"), ask once: merge or keep both. Merging
// moves every past task, Dictionary word and level to the new skill, with a
// short Undo. SkillMerge.pick(from) lets you merge any skill into another.
const SkillMerge = (() => {
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const CSS = `.smg-scrim{position:fixed;inset:0;z-index:9800;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.65)}
.smg{width:min(520px,100%);box-sizing:border-box;padding:18px 16px calc(18px + env(safe-area-inset-bottom));border-radius:22px 22px 0 0;background:var(--bb-surface,#120d06);border-top:2px solid var(--bb-accent,#ffcc00);color:var(--bb-ink,#f1ede2);font-family:system-ui,sans-serif}
.smg h3{margin:0 0 6px;padding:0;border:0;background:none;text-align:left;font:800 1rem var(--font-main,monospace);letter-spacing:.06em;color:var(--bb-accent,#ffcc00)}
.smg p{margin:0 0 12px;color:var(--bb-muted,#b5a888);font-size:.9rem;line-height:1.5}
.smg .row{display:flex;gap:8px}.smg .row button{flex:1}
.smg button{padding:12px;border-radius:12px;border:1px solid var(--bb-edge,rgba(255,204,0,.28));background:var(--bb-surface-2,#1a140b);color:var(--bb-ink,#f1ede2);font:700 .86rem system-ui,sans-serif;cursor:pointer}
.smg button.go{border:0;background:var(--bb-accent,#ffcc00);color:var(--bb-accent-ink,#1a1000)}
.smg .list{display:grid;gap:6px;max-height:45vh;overflow-y:auto;margin-bottom:12px}
.smg .list button{text-align:left;display:flex;gap:10px;align-items:center}`;
    function sheet(html) {
        if (!document.getElementById('smg-css')) { const st = document.createElement('style'); st.id = 'smg-css'; st.textContent = CSS; document.head.appendChild(st); }
        document.querySelector('.smg-scrim')?.remove();
        const s = document.createElement('div');
        s.className = 'smg-scrim';
        s.innerHTML = `<div class="smg" role="dialog" aria-modal="true">${html}</div>`;
        s.addEventListener('click', (e) => { if (e.target === s) s.remove(); });
        document.body.appendChild(s);
        return s;
    }
    function done(from, to) {
        const n = Vault.mergeSkill(from, to);
        document.querySelector('.smg-scrim')?.remove();
        window.dispatchEvent(new CustomEvent('skills-changed'));
        if (typeof Toast !== 'undefined') Toast.show(`Merged "${from}" into ${to}${n ? ` · ${n} moved` : ''}.`, 'positive', { ms: 10000, action: { label: 'Undo', onClick: () => { if (Vault.undoMerge()) { window.dispatchEvent(new CustomEvent('skills-changed')); Toast.show('Merge undone.', 'neutral'); } } } });
    }
    // Ask about each old skill the new one covers, one at a time.
    function offer(to) {
        if (typeof Vault === 'undefined' || !Vault.mergeCandidates) return;
        const c = Vault.mergeCandidates(to)[0];
        if (!c) return;
        const meta = Vault.skillMeta(to);
        const s = sheet(`<h3>${meta.icon} MERGE INTO ${esc(to.toUpperCase())}?</h3>
            <p>You already have <b>"${esc(c.from)}"</b>. ${c.count ? `${c.count} past task${c.count === 1 ? '' : 's'} and words` : 'It'} can move to <b>${esc(to)}</b>, so all their time and XP count there.</p>
            <div class="row"><button type="button" data-k="keep">Keep both</button><button type="button" class="go" data-k="merge">Merge</button></div>`);
        s.querySelector('[data-k="keep"]').onclick = () => { Vault.skipMerge(c.from, to); s.remove(); offer(to); };
        s.querySelector('[data-k="merge"]').onclick = () => { done(c.from, to); setTimeout(() => offer(to), 400); };
    }
    // "Merge into…" from the Skills page.
    function pick(from) {
        const others = Vault.getSkillMatrix().map(m => m.category).filter(c => c.toLowerCase() !== String(from).toLowerCase());
        if (!others.length) { if (typeof Toast !== 'undefined') Toast.show('No other skill to merge into yet.', 'neutral'); return; }
        const s = sheet(`<h3>MERGE "${esc(String(from).toUpperCase())}" INTO…</h3>
            <p>Its past tasks, words, time and XP move to the skill you pick. You can undo right after.</p>
            <div class="list">${others.map(o => { const m = Vault.skillMeta(o); return `<button type="button" data-to="${esc(o)}"><span>${m.icon}</span>${esc(o)}</button>`; }).join('')}</div>
            <div class="row"><button type="button" data-k="cancel">Cancel</button></div>`);
        s.querySelector('[data-k="cancel"]').onclick = () => s.remove();
        s.querySelectorAll('[data-to]').forEach(b => { b.onclick = () => done(from, b.dataset.to); });
    }
    return { offer, pick };
})();
