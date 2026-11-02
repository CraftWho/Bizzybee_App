// Terminal shell (Nov 1 2026, Craft; from 1.0.7). Makes the Terminal feel like a real
// one, on top of terminal.js:
//   ls / cd / pwd / cat / find / grep / head / wc / get / set
//   pipes:  ls quests | grep html   ·   find bee | head 5
//   Tab completes commands and paths
// Your save is the "disk": /quests/0/tasks, /hive/bees, /user/name...
// Safety: a backup is made when the Terminal opens (the Revert button puts
// it back), cloud sync pauses while you're here, and `set` (moderator+)
// asks for YES. Nov 1 2026 (Craft): `set` only works on the TEST or PC LOCAL
// save, never your real one. Reading needs Terminal access (user+).
(() => {
    let cwd = [];   // path inside Vault.state
    let openBackupId = null;
    const S = () => Vault.state;
    const fmtPath = (p) => '/' + p.join('/');
    const isObj = (v) => v && typeof v === 'object';
    const labelOf = (v) => isObj(v) ? (v.label || v.name || v.title || v.id || '') : '';
    function resolve(arg) {
        const parts = String(arg || '').trim();
        let p = parts.startsWith('/') ? [] : cwd.slice();
        parts.split('/').filter(Boolean).forEach(seg => { if (seg === '..') p.pop(); else if (seg !== '.') p.push(seg); });
        return p;
    }
    function nodeAt(path) {
        let n = S();
        for (const seg of path) {
            if (!isObj(n)) return undefined;
            if (Array.isArray(n)) {
                const i = /^\d+$/.test(seg) ? Number(seg) : n.findIndex(x => isObj(x) && (x.id === seg || String(labelOf(x)).toLowerCase() === seg.toLowerCase()));
                n = n[i];
            } else n = n[seg];
        }
        return n;
    }
    const short = (v) => {
        if (Array.isArray(v)) return `[${v.length}]`;
        if (isObj(v)) return `{${Object.keys(v).length}}`;
        const s = JSON.stringify(v);
        return s && s.length > 48 ? s.slice(0, 46) + '…"' : String(s);
    };
    function list(node) {
        if (Array.isArray(node)) return node.map((v, i) => `  ${String(i).padEnd(4)}${isObj(v) ? (labelOf(v) ? labelOf(v) : short(v)) : short(v)}${isObj(v) ? '/' : ''}`);
        if (isObj(node)) return Object.keys(node).sort().map(k => `  ${k}${isObj(node[k]) ? '/' : ''}${isObj(node[k]) ? '  ' + short(node[k]) : '  = ' + short(node[k])}`);
        return [`  ${short(node)}`];
    }
    // Every path whose key or text value contains the word (max 60).
    function find(word, base = []) {
        const w = String(word || '').toLowerCase(), out = [];
        const walk = (n, p) => {
            if (out.length >= 60) return;
            if (isObj(n)) Object.keys(n).forEach(k => {
                const v = n[k], here = [...p, k];
                if (String(k).toLowerCase().includes(w) || (!isObj(v) && String(v).toLowerCase().includes(w))) out.push(`  ${fmtPath(here)}${isObj(v) ? '/' : ' = ' + short(v)}`);
                if (isObj(v) && here.length < 7) walk(v, here);
            });
        };
        walk(nodeAt(base), base);
        return out;
    }
    const lines = (arr, kind) => arr.map(t => [t, kind]);
    const SHELL = [
        { name: 'pwd', need: 'user', help: 'Where you are in your save.', run: () => [[fmtPath(cwd)]] },
        { name: 'ls', usage: 'ls [path]', need: 'user', args: true, help: 'List what\'s here (or at a path).', run: (a) => {
            const n = nodeAt(resolve(a[0] || '.'));
            return n === undefined ? [['No such path.', 'err']] : lines(list(n));
        } },
        { name: 'cd', usage: 'cd <path>', need: 'user', args: true, help: 'Go into a part of your save (.. = up, / = top).', run: (a) => {
            const p = resolve(a[0] || '/'), n = nodeAt(p);
            if (!isObj(n)) return [['That isn\'t a folder.', 'err']];
            cwd = p; return [[fmtPath(cwd), 'dim']];
        } },
        { name: 'cat', usage: 'cat <path>', need: 'user', args: true, help: 'Show something in full.', run: (a) => {
            const n = nodeAt(resolve(a[0] || '.'));
            if (n === undefined) return [['No such path.', 'err']];
            const txt = JSON.stringify(n, null, 2) || String(n);
            return lines(txt.split('\n').slice(0, 400).concat(txt.split('\n').length > 400 ? ['… (cut at 400 lines)'] : []));
        } },
        { name: 'get', usage: 'get <path>', need: 'user', args: true, help: 'One value.', run: (a) => [[short(nodeAt(resolve(a[0] || '.')))]] },
        { name: 'find', usage: 'find <word>', need: 'user', args: true, help: 'Search names and values from here down.', run: (a) => { const r = find(a.join(' '), cwd); return r.length ? lines(r) : [['Nothing found.', 'dim']]; } },
        { name: 'grep', usage: '… | grep <word>', need: 'user', args: true, help: 'Keep lines with a word (after a |), or search like find.', run: (a, raw, input) => {
            const w = a.join(' ').toLowerCase();
            if (!input) { const r = find(w, cwd); return r.length ? lines(r) : [['Nothing found.', 'dim']]; }
            return input.filter(([t]) => String(t).toLowerCase().includes(w));
        } },
        { name: 'head', usage: '… | head [n]', need: 'user', args: true, help: 'First n lines (10).', run: (a, raw, input) => (input || []).slice(0, parseInt(a[0], 10) || 10) },
        { name: 'wc', usage: '… | wc', need: 'user', help: 'Count lines.', run: (a, raw, input) => [[String((input || []).length)]] },
        { name: 'set', usage: 'set <path> <value>', need: 'moderator', args: true, confirm: true, help: 'Change one value (JSON). Test or PC LOCAL save only.', run: (a) => {
            if (!(Vault.devTest || Vault.pcLocal)) return [['set only works on the test save. Type: testmode on', 'warn']];   // Nov 1 2026 (Craft)
            const p = resolve(a[0]), key = p.pop(), parent = nodeAt(p);
            if (!isObj(parent) || key === undefined) return [['No such path.', 'err']];
            let v = a.slice(1).join(' ');
            try { v = JSON.parse(v); } catch { /* plain text */ }
            const k = Array.isArray(parent) && /^\d+$/.test(key) ? Number(key) : key;
            const before = short(parent[k]);
            parent[k] = v; Vault.save();
            return [[`${fmtPath([...p, key])}: ${before} → ${short(v)}`, 'ok']];
        } },
        { name: 'revert', need: 'user', confirm: true, help: 'Put your save back to how it was when you opened the Terminal.', run: () => revert() }
    ];
    TERM_COMMANDS.push(...SHELL);

    function revert() {
        const b = Vault.getLocalBackups().find(x => x.id === openBackupId);
        if (!b) return [['No backup from this visit.', 'err']];
        const r = Vault.importFullState(b.data);
        if (!r.ok) return [['Revert failed: ' + r.error, 'err']];
        setTimeout(() => location.reload(), 900);
        return [['Save put back to when you opened the Terminal. Reloading…', 'ok']];
    }

    // Pipes: each part is a command; read-only ones only.
    const run0 = termRun;
    termRun = async function (raw) {
        const text = String(raw || '').trim();
        if (!text.includes('|') || termPending) return run0(raw);
        termPrint('> ' + text, 'cmd');
        termHistory.unshift(text); termHistoryAt = -1;
        let input = null;
        for (const part of text.split('|').map(x => x.trim())) {
            const m = termMatch(part);
            if (!m || !termCan(m.cmd.need)) { termPrint(`Unknown command "${part}". Type help.`, 'err'); return; }
            if (m.cmd.confirm) { termPrint(`"${m.cmd.name}" can't be used in a pipe.`, 'err'); return; }
            try { input = (await m.cmd.run(m.args, part, input)) || []; }
            catch (e) { termPrint('Error: ' + (e.message || e), 'err'); return; }
        }
        (input || []).forEach(([t, k]) => termPrint(t, k));
    };

    // Tab: complete a command, or the last path piece.
    function complete(input) {
        const v = input.value, parts = v.split(' ');
        if (parts.length === 1) {
            const hits = TERM_COMMANDS.filter(c => termCan(c.need) && c.name.startsWith(v)).map(c => c.name.split(' ')[0]);
            const uniq = [...new Set(hits)];
            if (uniq.length === 1) input.value = uniq[0] + ' ';
            else if (uniq.length) termPrint(uniq.join('   '), 'dim');
            return;
        }
        const last = parts.pop(), slash = last.lastIndexOf('/');
        const dir = slash >= 0 ? last.slice(0, slash + 1) : '', stem = last.slice(slash + 1).toLowerCase();
        const n = nodeAt(resolve(dir || '.'));
        if (!isObj(n)) return;
        const keys = Array.isArray(n) ? n.map((_, i) => String(i)) : Object.keys(n);
        const hits = keys.filter(k => k.toLowerCase().startsWith(stem));
        if (hits.length === 1) input.value = [...parts, dir + hits[0] + (isObj(n[hits[0]]) ? '/' : '')].join(' ');
        else if (hits.length) termPrint(hits.slice(0, 40).join('   '), 'dim');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('tm-input');
        if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); complete(input); } });
        // Wait until terminal.js has set up (Vault ready, access known).
        const ready = setInterval(() => {
            if (!Vault.state || document.getElementById('terminal-app').hidden) return;
            clearInterval(ready);
            try { Vault.createLocalBackup('Terminal opened'); openBackupId = (Vault.getLocalBackups()[0] || {}).id || null; } catch { /* no room */ }
            try { sessionStorage.setItem('bizzybee_sync_paused', '1'); } catch { /* storage off */ }
            const bar = document.querySelector('.tm-bar');
            if (bar && !bar.querySelector('.tm-revert')) {
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'tm-revert'; b.textContent = '↺ Revert';
                b.title = 'Put your save back to how it was when you opened the Terminal';
                b.addEventListener('click', () => {
                    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '↺ Revert'; }, 3000); return; }
                    revert().forEach(([t, k]) => termPrint(t, k));
                });
                bar.appendChild(b);
            }
            termPrint('Backup made. Cloud sync is paused while the Terminal is open. Tab completes; | pipes.', 'dim');
        }, 300);
    });
    // Leaving the Terminal turns cloud sync back on.
    window.addEventListener('pagehide', () => { try { sessionStorage.removeItem('bizzybee_sync_paused'); } catch { /* storage off */ } });
})();
