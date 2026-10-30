// Secret (Oct 30 2026, Craft). Locks text with a passcode only you know,
// on your device (Web Crypto: PBKDF2 → AES-256-GCM). The save keeps only
// the scrambled text, so nobody can read it - not the cloud, not the
// creator. Forget the passcode and the note is gone. Used by quest notes;
// the Notes app can reuse it later.
//   await Secret.lock(text, passcode)  -> { v, salt, iv, ct }
//   await Secret.unlock(box, passcode) -> text (throws on a wrong passcode)
const Secret = (() => {
    const enc = new TextEncoder(), dec = new TextDecoder();
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    async function key(pass, salt) {
        const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    async function lock(text, pass) {
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt), enc.encode(String(text)));
        return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
    }
    async function unlock(box, pass) {
        if (!box || box.v !== 1) throw new Error('Unknown lock.');
        try {
            const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, await key(pass, unb64(box.salt)), unb64(box.ct));
            return dec.decode(out);
        } catch { throw new Error('Wrong passcode.'); }
    }
    return { lock, unlock, ok: () => !!(window.crypto && crypto.subtle) };
})();
