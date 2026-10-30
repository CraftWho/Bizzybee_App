// Friends' hives (Oct 29 2026, approved demo). Rules: core/services/social.
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (at) => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

function render(data) {
    if (!data) return;
    if (data.code) $('hf-code').textContent = data.code;
    $('hf-sharing').checked = data.sharing !== false;
    const list = data.list || [];
    $('hf-list').innerHTML = list.length ? list.map(f => {
        if (f.status === 'ok') {
            const eggs = f.card.bees.filter(b => b.egg).length;
            return `<div class="hf-row"><span class="hex">${esc(f.card.owner[0] || '?')}</span><span class="mid"><b>${esc(f.card.owner)}</b><small>⭐ Level ${f.card.level} · 🐝 ${f.card.bees.length - eggs} bees${eggs ? ` · 🥚 ${eggs}` : ''}</small></span><a class="bb-btn bb-btn--main" href="../colony/hive-visit.html?code=${encodeURIComponent(f.code)}">Visit</a><button type="button" class="x" data-remove="${esc(f.code)}" aria-label="Remove ${esc(f.code)}">✕</button></div>`;
        }
        const why = f.status === 'pending' ? 'Waiting for them to add you back' : f.status === 'hidden' ? 'Not sharing their hive right now' : 'This hive is gone';
        return `<div class="hf-row"><span class="hex dim">?</span><span class="mid"><b>${esc(f.name || f.code)}</b><small>${why}</small></span><button type="button" class="x" data-remove="${esc(f.code)}" aria-label="Remove ${esc(f.code)}">✕</button></div>`;
    }).join('') : '<p class="hf-empty">No friends yet. Add a code below.</p>';
    $('hf-updated').textContent = data.at ? `Updated ${ago(data.at)}. Hives update about once an hour.` : '';
}

async function load(force) {
    render(Social.cachedFriends());
    try { render(await Social.friends(force)); $('hf-signin').hidden = true; }
    catch (e) {
        $('hf-signin').hidden = false;
        $('hf-signin').innerHTML = `${esc(e.message)} <a href="../settings/settings.html#cloud">Open Settings</a>`;
        if (!Social.cachedFriends()) $('hf-list').innerHTML = '<p class="hf-empty">Sign in to see your friends.</p>';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    if (typeof Waggle !== 'undefined' && typeof baseWaggleActions === 'function') Waggle.setActions(baseWaggleActions());
    load(false);
    Social.publish(false).then(r => { if (r && r.code) $('hf-code').textContent = r.code; }).catch(() => {});
    $('hf-refresh').onclick = () => load(true);
    $('hf-copy').onclick = () => {
        const code = $('hf-code').textContent;
        navigator.clipboard?.writeText(code).then(() => Toast.show('📋 Code copied.', 'positive')).catch(() => Toast.show(code, 'neutral'));
    };
    $('hf-share').onclick = () => {
        const code = $('hf-code').textContent, text = `Visit my BizzyBee hive! My hive code is ${code}. Add it in Friends' hives.`;
        if (navigator.share) navigator.share({ text }).catch(() => {});
        else navigator.clipboard?.writeText(text).then(() => Toast.show('📋 Message copied.', 'positive')).catch(() => {});
    };
    $('hf-sharing').onchange = async (e) => {
        try { const on = await Social.sharing(e.target.checked); Toast.show(on ? 'Friends can visit your hive.' : 'Your hive is hidden.', 'positive'); }
        catch (err) { e.target.checked = !e.target.checked; Toast.show(err.message, 'negative'); }
    };
    $('hf-add').onsubmit = async (e) => {
        e.preventDefault();
        const code = $('hf-input').value.trim();
        if (!code) return;
        try { await Social.add(code); $('hf-input').value = ''; Toast.show('🤝 Added. They need to add you back.', 'positive'); render(Social.cachedFriends()); }
        catch (err) { Toast.show(err.message, 'negative'); }
    };
    $('hf-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-remove]');
        if (!b) return;
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Remove?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '✕'; }, 2500); return; }
        try { render(await Social.remove(b.dataset.remove)); Toast.show('Removed.', 'neutral'); } catch (err) { Toast.show(err.message, 'negative'); }
    });
});
