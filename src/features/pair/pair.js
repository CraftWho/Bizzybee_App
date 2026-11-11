// Link Steam Deck (Nov 11 2026, Craft). The Deck's QR code opens this page with ?c=<code>.
// Signed in -> one tap on Link. No typing.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const code = (new URLSearchParams(location.search).get('c') || '').toLowerCase();
const sub = document.getElementById('pr-sub'), body = document.getElementById('pr-body');
const say = (s, html) => { sub.textContent = s; body.innerHTML = html || ''; };

async function link() {
    const btn = body.querySelector('[data-link]'); if (btn) btn.disabled = true;
    try {
        await CloudSyncAuto.request('deck', { action: 'approve', code, name: 'Steam Deck' });
        Vault.setDeckLinked(true);
        say('Linked! Your Deck will connect in a few seconds.', '<a class="btn" href="../../plugins/gaming/gaming.html">🎮 Open Gaming</a>');
    } catch (e) {
        say(e && e.message ? e.message : 'That did not work. Show a new code on the Deck.', '<button type="button" class="btn ghost" id="pr-retry">Try again</button>');
        document.getElementById('pr-retry').onclick = start;
    }
}
function start() {
    if (!/^[a-f0-9]{24}$/.test(code)) return say('This link is not a Deck code. Scan the QR on your Deck again.');
    if (typeof CloudSyncAuto === 'undefined' || !CloudSyncAuto.isEnabled || !CloudSyncAuto.isEnabled()) {
        return say('Sign in to your cloud account first (Profile), then scan the QR again.', '<a class="btn" href="../profile/profile.html">Go to Profile</a>');
    }
    say('Link this Steam Deck to your BizzyBee?', '<button type="button" class="btn" data-link>🔗 Link it</button>');
    body.querySelector('[data-link]').onclick = link;
}
// Cloud sign-in can take a moment after the page opens.
let tries = 0;
(function wait() { if (typeof CloudSyncAuto !== 'undefined' && CloudSyncAuto.isEnabled && CloudSyncAuto.isEnabled()) return start(); if (++tries > 8) return start(); setTimeout(wait, 500); })();
