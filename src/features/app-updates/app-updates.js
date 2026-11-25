// Nov 21 2026 (Craft; approved): the Updates page. App-file updates no longer load by themselves.
(() => {
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
    async function render() {
        const now = document.getElementById('up-now'), box = document.getElementById('up-new');
        if (typeof WebUpdate === 'undefined' || !WebUpdate.isApp()) {
            now.innerHTML = '<b>You are on the website</b><small>The website updates by itself. Updates here are for the Android app.</small>';
            box.hidden = true; history(); return;
        }
        // Nov 24 2026 (Craft): the auto-update switch.
        const card = document.getElementById('up-auto-card'), sw = document.getElementById('up-auto'), note = document.getElementById('up-auto-note');
        if (card && sw) {
            const say = () => { note.textContent = sw.checked ? 'A new version downloads and restarts BizzyBee by itself. A safety copy is made first.' : 'Off: a new version waits here until you tap Update now.'; };
            card.hidden = false; sw.checked = WebUpdate.autoOn(); say();
            sw.onchange = () => { WebUpdate.setAuto(sw.checked); say(); if (typeof Toast !== 'undefined') Toast.show(sw.checked ? '🔄 Updates load by themselves.' : 'Updates wait for you.', 'positive'); };
        }
        const cur = await WebUpdate.current();
        now.innerHTML = `<b>Installed: ${esc(cur.label || 'unknown')}</b><small>Checking for an update…</small>`;
        const r = await WebUpdate.check({ force: true });
        const ready = WebUpdate.ready();
        if (!ready) {
            now.innerHTML = `<b>Installed: ${esc(cur.label || 'unknown')}</b><small>${r && r.offline ? 'Offline. Try again when connected.' : '✅ You have the newest version.'}</small>`;
            box.hidden = true;
        } else {
            now.innerHTML = `<b>Installed: ${esc(cur.label || 'unknown')}</b><small>${WebUpdate.autoOn() ? 'An update is ready. It loads by itself in a moment, or tap Update now.' : 'An update is ready.'}</small>`;
            const notes = (ready.notes || []).map(n => `<li>${esc(n)}</li>`).join('') || '<li>Fixes and improvements.</li>';
            box.innerHTML = `<h2>⬆️ ${esc(ready.label)}</h2><small>Published ${esc(when(ready.builtAt))}</small><ul>${notes}</ul>
                <small>Update makes a safety copy, saves your progress to the cloud, then restarts BizzyBee with the new files. It is written to the change log.</small>
                <button type="button" class="up-go" id="up-go">Update now</button>`;
            box.hidden = false;
            document.getElementById('up-go').onclick = async (e) => {
                const b = e.currentTarget; b.disabled = true; b.textContent = 'Updating…';
                const res = await WebUpdate.apply();
                if (!res.ok) { b.disabled = false; b.textContent = 'Update now'; if (typeof Toast !== 'undefined') Toast.show('Update failed: ' + res.error, 'negative'); }
            };
        }
        history();
    }
    function history() {
        const host = document.getElementById('up-history');
        const list = (typeof syncLogList === 'function' ? syncLogList() : []).filter(e => e.kind === 'update');
        host.innerHTML = list.length ? list.slice(0, 20).map(e => `<div class="up-row"><span>⬆️ ${esc(e.msg)}</span><small>${esc(when(e.at))}${e.lv != null ? ` · Lv ${e.lv} · ${Number(e.xp || 0).toLocaleString()} XP` : ''}</small></div>`).join('') : '<div class="up-row"><small>No updates yet.</small></div>';
    }
    if (typeof Vault !== 'undefined' && Vault.init) Vault.init().then(render, render); else render();
})();
