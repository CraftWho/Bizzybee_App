// Settings groups (Oct 29 2026, approved demo; back on Nov 1 2026, Craft). Like a phone's settings:
// tap a group and only its settings show, on this same page. ← (or the
// phone's back button) returns to the list. Old links still work:
// settings.html#cloud opens Account & cloud, #weather opens Look & feel...
// Red dots mark anything that needs you (cloud signed out or stuck,
// notifications blocked, an app update waiting).
const SettingsTabs = (() => {
    const OLD = { cloud: 'account', permissions: 'notify', 'phone-features': 'notify', weather: 'look', about: 'about' };
    const ATTN_KEY = 'bizzybee_settings_attn', UPD_KEY = 'bizzybee_upd_seen';
    const $ = (id) => document.getElementById(id);
    const groups = () => [...document.querySelectorAll('.st-group')];
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function show(id, target) {
        const g = $('g-' + id);
        if (!g) return false;
        groups().forEach(x => { x.hidden = x !== g; x.classList.toggle('open', x === g); });
        document.body.classList.add('st-in-group');
        window.scrollTo(0, 0);
        const el = target && (typeof target === 'string' ? document.getElementById(target) : target);
        if (el) {
            const d = el.closest('details'); if (d) d.open = true;
            setTimeout(() => { el.scrollIntoView({ block: 'center' }); el.classList.add('st-flash'); setTimeout(() => el.classList.remove('st-flash'), 1700); }, 60);
        } else g.querySelector('.st-back').focus({ preventScroll: true });
        return true;
    }
    function hide() {
        groups().forEach(x => { x.hidden = true; x.classList.remove('open'); });
        document.body.classList.remove('st-in-group');
    }
    function open(id, target) {
        if (!show(id, target)) return;
        if (location.hash !== '#' + id) history.pushState({ st: id }, '', '#' + id);
    }
    function back() {
        if (history.state && history.state.st) history.back();
        else { history.replaceState(null, '', location.pathname + location.search); hide(); }
    }
    function fromHash() {
        const h = decodeURIComponent(location.hash.slice(1));
        if (!h) { hide(); return; }
        if ($('g-' + h)) { show(h); return; }
        if (OLD[h]) show(OLD[h], h);                 // old anchors: open the group, point at the spot
    }

    // ---- Search every setting by its name and note ----
    function search(q) {
        const list = $('st-groups'), hits = $('st-hits');
        q = q.trim().toLowerCase();
        if (!q) { list.hidden = false; hits.hidden = true; return; }
        const found = [];
        groups().forEach(g => g.querySelectorAll('.row').forEach(r => {
            const b = r.querySelector('.mid b'); if (!b) return;
            const text = (b.textContent + ' ' + (r.querySelector('.mid small')?.textContent || '')).toLowerCase();
            if (text.includes(q)) found.push({ g, r, name: b.textContent });
        }));
        list.hidden = true; hits.hidden = false;
        hits.innerHTML = found.length ? found.slice(0, 20).map(({ g, r, name }, i) => `<button type="button" class="row" data-hit="${i}"><span class="hx">${esc(r.querySelector('.hx')?.textContent || '⚙️')}</span><span class="mid"><b>${esc(name)}</b><small class="st-hit-group">${esc(g.dataset.title)}</small></span><span class="chev">›</span></button>`).join('')
            : '<div class="row"><span class="mid"><small>No settings match.</small></span></div>';
        hits.onclick = (e) => {
            const b = e.target.closest('[data-hit]'); if (!b) return;
            const { g, r } = found[+b.dataset.hit];
            $('st-q').value = ''; search('');
            open(g.id.slice(2), r);
        };
    }

    // ---- Red dots ----
    // Each check returns null (all good) or { why, row } where row is the
    // setting to point at inside the group.
    const CHECKS = {
        account: async () => {
            if (typeof Vault !== 'undefined' && Vault.pcLocal) return null;   // Nov 1 2026 (Craft): no cloud on PC LOCAL
            const out = $('cloud-sync-signed-out');
            if (out && !out.hidden) return { why: 'Not signed in to Cloud sync', row: null };
            if (typeof CloudSyncAuto !== 'undefined' && CloudSyncAuto.hasConflict && CloudSyncAuto.hasConflict()) return { why: 'Cloud sync needs you to pick a copy', row: 'cloud-sync-status' };
            return null;
        },
        notify: async () => {
            if (typeof BizzyPhone === 'undefined' || !BizzyPhone.isApp) return null;   // Nov 1 2026 (Craft): web has no reminders by design
            const st = await BizzyPhone.status('notifications').catch(() => 'unsupported');
            if (st === 'denied' || (st === 'prompt' && BizzyPhone.isApp)) return { why: st === 'denied' ? 'Notifications are blocked' : 'Notifications are off', row: 'permissions-card' };
            return null;
        },
        about: async () => {
            if (typeof BizzyUpdates === 'undefined' || !BizzyUpdates.isApp) return null;
            let r = null;
            try { r = JSON.parse(localStorage.getItem(UPD_KEY) || 'null'); } catch { /* none */ }
            if (!r || Date.now() - r.at > 60 * 60 * 1000) {                    // GitHub: at most once an hour
                const c = await BizzyUpdates.check({ quiet: true }).catch(() => null);
                r = { at: Date.now(), available: !!(c && c.state === 'available'), version: c && c.latest ? c.latest.version : null };
                try { localStorage.setItem(UPD_KEY, JSON.stringify(r)); } catch { /* storage off */ }
            }
            return r.available ? { why: `App update ${r.version || ''} is ready`.replace('  ', ' '), row: 'about-card' } : null;
        },
    };
    async function attention() {
        let count = 0;
        for (const [id, check] of Object.entries(CHECKS)) {
            const res = await check().catch(() => null);
            const row = document.querySelector(`#st-groups [data-g="${id}"]`);
            if (!row) continue;
            row.querySelector('.st-dot')?.remove(); row.querySelector('.st-why')?.remove();
            document.querySelectorAll(`#g-${id} .st-attn`).forEach(x => x.classList.remove('st-attn'));
            if (!res) continue;
            count++;
            row.querySelector('.chev').insertAdjacentHTML('beforebegin', '<span class="st-dot" aria-label="Needs attention"></span>');
            row.querySelector('.mid').insertAdjacentHTML('beforeend', `<small class="st-why">${esc(res.why)}</small>`);
            const spot = res.row && $(res.row);
            if (spot) spot.classList.add('st-attn');
        }
        try { localStorage.setItem(ATTN_KEY, String(count)); } catch { /* storage off */ }
        window.dispatchEvent(new CustomEvent('settings-attention', { detail: count }));
        return count;
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('st-groups').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) open(b.dataset.g); });
        groups().forEach(g => g.querySelector('.st-back').addEventListener('click', back));
        $('st-q').addEventListener('input', (e) => search(e.target.value));
        window.addEventListener('popstate', fromHash);
        window.addEventListener('hashchange', fromHash);
        fromHash();
        setTimeout(attention, 1500);                         // after cloud sync has had a moment
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') attention(); });
        window.addEventListener('cloud-sync-status', () => attention());
    });
    return { open, back, attention };
})();
