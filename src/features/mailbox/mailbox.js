// Mailbox (Oct 29 2026). Letters from the creator; players react 👍 / 👎.
// Rules: core/services/social/social.js and netlify/functions/mail.mjs.
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const ago = (at) => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
let seenBefore = {};

function render(data) {
    if (!data) return;
    $('mb-write').hidden = !data.creator;
    const mine = Social.myCode();
    $('mb-list').innerHTML = data.letters.length ? data.letters.map(l => {
        const unread = !seenBefore[l.id];
        const connect = l.hive && l.hive !== mine ? `<button type="button" class="bb-btn bb-btn--main" data-connect="${esc(l.hive)}" data-letter="${esc(l.id)}">🤝 Connect · ${esc(l.hive)}</button>` : '';
        const totals = l.totals ? `<span class="mb-totals">👍 ${l.totals.up} · 👎 ${l.totals.down}</span><button type="button" class="mb-del" data-del="${esc(l.id)}">Delete</button>` : '';
        return `<article class="bb-box mb-letter${unread ? ' unread' : ''}">
            <div class="top"><h3 class="bb-title">${esc(l.title)}</h3>${unread ? '<span class="new">NEW</span>' : ''}</div>
            <small>From ${esc(l.from)} · ${when(l.at)}</small>
            <p class="body">${esc(l.body)}</p>
            <div class="mb-row">${connect}
                <button type="button" class="mb-react" data-react="up" data-id="${esc(l.id)}" aria-pressed="${l.mine === 'up'}" aria-label="Like">👍</button>
                <button type="button" class="mb-react" data-react="down" data-id="${esc(l.id)}" aria-pressed="${l.mine === 'down'}" aria-label="Dislike">👎</button>${totals}</div>
        </article>`;
    }).join('') : '<p class="mb-empty">No letters yet.</p>';
    $('mb-updated').textContent = data.at ? `Checked ${ago(data.at)}. New mail arrives about once an hour.` : '';
    data.letters.forEach(l => Social.markRead(l.id));
}

async function load(force) {
    render(Social.cachedMail());
    try { render(await Social.mail(force)); $('mb-signin').hidden = true; }
    catch (e) {
        $('mb-signin').hidden = false;
        $('mb-signin').innerHTML = `${esc(e.message)} <a href="../settings/settings.html#cloud">Open Settings</a>`;
        if (!Social.cachedMail()) $('mb-list').innerHTML = '<p class="mb-empty">Sign in to get mail.</p>';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    if (typeof Waggle !== 'undefined' && typeof baseWaggleActions === 'function') Waggle.setActions(baseWaggleActions());
    try { seenBefore = JSON.parse(localStorage.getItem('bizzybee_mail_seen') || '{}'); } catch { seenBefore = {}; }
    load(false);
    $('mb-refresh').onclick = () => load(true);
    $('mb-send').onclick = async () => {
        const title = $('mb-title').value.trim(), body = $('mb-body').value.trim();
        if (!title || !body) { Toast.show('Add a title and a message.', 'negative'); return; }
        const btn = $('mb-send'); btn.disabled = true;
        try {
            let hive = null;
            if ($('mb-hive').checked) hive = Social.myCode() || (await Social.publish(true)).code;
            const from = (Vault.state.displayName || 'The creator');
            await Social.send({ title, body, hive, from });
            $('mb-title').value = ''; $('mb-body').value = '';
            Toast.show('📬 Sent to everyone.', 'positive');
            render(Social.cachedMail());
        } catch (e) { Toast.show(e.message, 'negative'); }
        finally { btn.disabled = false; }
    };
    $('mb-list').addEventListener('click', async (e) => {
        const r = e.target.closest('[data-react]'), c = e.target.closest('[data-connect]'), d = e.target.closest('[data-del]');
        if (r) {
            const value = r.getAttribute('aria-pressed') === 'true' ? null : r.dataset.react;
            try { await Social.react(r.dataset.id, value); render(Social.cachedMail()); } catch (err) { Toast.show(err.message, 'negative'); }
        } else if (c) {
            try { await Social.add(c.dataset.connect, c.dataset.letter); Toast.show('🤝 Connected! Find them in Friends\' hives.', 'positive'); }
            catch (err) { Toast.show(err.message, 'negative'); }
        } else if (d) {
            if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = 'Tap again'; setTimeout(() => { d.dataset.armed = ''; d.textContent = 'Delete'; }, 2500); return; }
            try { render(await Social.del(d.dataset.del)); Toast.show('Deleted.', 'neutral'); } catch (err) { Toast.show(err.message, 'negative'); }
        }
    });
});
