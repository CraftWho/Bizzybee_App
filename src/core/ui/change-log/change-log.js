// One change log (Nov 21 2026, Craft: "merge the two change logs").
// Before: History › Change log showed the honesty record (unchecks, edits,
// deletes, late fill-ins, ⚑ big changes) and Settings › Change log showed
// every save change with "Go back to here". Now both pages show this one
// timeline:
//   - every save change (Vault.journalList, kept on this phone), newest first,
//     with who made it, level/XP after, and Go back to here;
//   - the honesty notes (Vault.getChangeLog, kept in the save forever) sit on
//     the change they belong to. Ones with no matching change (older ones, or
//     made on another device) show on their own;
//   - cloud events (uploads, sign-ins, failures) when "Cloud" is picked.
// ChangeLog.mount(host, { limit, more, filters }) draws it; it redraws itself
// when a new change is logged.
const ChangeLog = (() => {
    const SRC = { app: '📱', phone: '📱', pc: '💻', claude: '🤖', voice: '🎙️', bixby: '🎙️', update: '⬆️', restore: '↩️', cloud: '☁️', import: '📥', api: '🤖' };
    const TAG = { uncheck: ['Unchecked', 'un'], edit: ['Edited', 'edit'], delete: ['Deleted', 'del'], restore: ['Restored', 'res'], fill: ['Filled in', 'fill'] };
    const CLOUD = { fail: '⚠️', upload: '☁️', load: '⬇️', inactive: '🔴', review: '❓', choice: '👆', restore: '↩️', login: '🔑', open: '📱', update: '⬆️' };
    const MATCH_MS = 3 * 60000;   // a save change is logged a few seconds after the honesty note
    const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    // Pure merge (tested): journal entries + honesty notes + cloud events -> rows.
    function merge(journal, notes, cloud) {
        const rows = (journal || []).map(e => ({ kind: 'change', at: e.at, e, notes: [] }));
        const byTime = rows.slice().sort((a, b) => a.at.localeCompare(b.at));
        (notes || []).forEach(n => {
            const t = Date.parse(n.at);
            const hit = byTime.find(r => { const d = Date.parse(r.at) - t; return d >= -2000 && d <= MATCH_MS; });
            if (hit) hit.notes.push(n); else rows.push({ kind: 'note', at: n.at, notes: [n] });
        });
        (cloud || []).filter(x => x.kind !== 'save-point').forEach(x => rows.push({ kind: 'cloud', at: x.at, x }));
        rows.forEach(r => { r.flag = r.notes ? r.notes.some(n => n.flag) : false; r.honest = !!(r.notes && r.notes.length); });
        return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    }

    function noteLine(n) {
        const [tag, cls] = TAG[n.type] || [n.type, 'edit'];
        const p = el('div', 'cl-note');
        p.append(el('span', `cl-tag t-${cls}`, tag), document.createTextNode(' ' + String(n.text || '').replace(/^(Unchecked|Edited|Deleted|Restored|Filled in)\s*/, '')));
        if (n.note || n.flag) { const s = el('small'); if (n.flag) s.append(el('b', 'cl-flag', '⚑ ')); s.append(document.createTextNode(n.note || '')); p.append(s); }
        return p;
    }

    function goBack(btn, e) {
        btn.onclick = async () => {
            if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = 'Tap again to go back'; setTimeout(() => { btn.dataset.sure = ''; btn.textContent = 'Go back to here'; }, 4000); return; }
            btn.disabled = true;
            try {
                const res = await Vault.journalGoBack(e.id);
                if (!res.ok) throw new Error(res.error);
                if (typeof Toast !== 'undefined') Toast.show(`↩️ Back to ${when(res.at)}. A safety copy was made first.`, 'positive');
                setTimeout(() => window.location.reload(), 800);
            } catch (err) {
                btn.disabled = false;
                if (typeof Toast !== 'undefined') Toast.show((err && err.message) || 'Could not go back.', 'negative');
            }
        };
    }

    function rowEl(r) {
        const row = el('div', `cl-row cl-${r.kind}${r.flag ? ' cl-flagged' : ''}`);
        if (r.kind === 'cloud') {
            row.append(el('span', 'cl-main', `${CLOUD[r.x.kind] || '•'} ${r.x.msg}`), el('small', 'cl-when', when(r.x.at)));
            return row;
        }
        if (r.kind === 'note') {
            row.append(el('small', 'cl-when', `${when(r.at)} · saved in your hive's record`));
            r.notes.forEach(n => row.append(noteLine(n)));
            return row;
        }
        const e = r.e;
        row.append(el('span', 'cl-main', `${SRC[e.src] || '📱'} ${(e.note ? [e.note] : []).concat(e.sum || []).join(' · ') || 'Small changes'}`));
        r.notes.forEach(n => row.append(noteLine(n)));
        row.append(el('small', 'cl-when', `${when(e.at)} · Lv ${e.lv ?? '?'} · ${Number(e.xp || 0).toLocaleString()} XP${e.dev ? ' · ' + e.dev : ''}`));
        const go = el('button', 'btn cl-go', 'Go back to here'); go.type = 'button'; goBack(go, e);
        row.append(go);
        return row;
    }

    const FILTERS = [['all', 'All'], ['honest', '⚑ Unchecks & edits'], ['cloud', '☁️ Cloud']];
    function mount(host, { limit = 25, step = 50, filters = true } = {}) {
        if (!host) return null;
        const st = { filter: 'all', shown: limit };
        host.classList.add('cl');
        const bar = el('div', 'cl-filters');
        const list = el('div', 'cl-list');
        const more = el('button', 'btn cl-more', 'Show More'); more.type = 'button';
        if (filters) FILTERS.forEach(([k, l]) => { const b = el('button', k === st.filter ? 'on' : '', l); b.type = 'button'; b.dataset.f = k; bar.append(b); });
        host.replaceChildren(...(filters ? [bar] : []), list, more);
        bar.onclick = (ev) => { const b = ev.target.closest('[data-f]'); if (!b) return; st.filter = b.dataset.f; st.shown = limit; [...bar.children].forEach(x => x.classList.toggle('on', x === b)); draw(); };
        more.onclick = () => { st.shown += step; draw(); };
        async function draw() {
            let journal = [];
            try { journal = await Vault.journalList(Math.max(300, st.shown + 50)); } catch { /* no IndexedDB here */ }
            const notes = typeof Vault.getChangeLog === 'function' ? Vault.getChangeLog() : [];
            const cloud = typeof syncLogList === 'function' ? syncLogList() : [];
            let rows = merge(journal, notes, cloud);
            if (st.filter === 'all') rows = rows.filter(r => r.kind !== 'cloud');
            else if (st.filter === 'honest') rows = rows.filter(r => r.honest);
            else rows = rows.filter(r => r.kind === 'cloud');
            list.replaceChildren(...rows.slice(0, st.shown).map(rowEl));
            if (!rows.length) list.append(el('p', 'cl-empty', st.filter === 'honest' ? 'No unchecks, edits or deletes yet.' : st.filter === 'cloud' ? 'No cloud events yet.' : 'Nothing yet. Changes show up here a few seconds after you make them.'));
            more.hidden = rows.length <= st.shown;
        }
        window.addEventListener('journal-entry', () => draw());
        draw();
        return { draw, set: (f) => { const b = bar.querySelector(`[data-f="${f}"]`); if (b) b.click(); } };
    }

    return { mount, merge };
})();
if (typeof globalThis !== 'undefined') globalThis.ChangeLog = ChangeLog;
