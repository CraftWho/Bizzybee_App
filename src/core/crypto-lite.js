console.log("/// CRYPTO-LITE ONLINE ///");

// Optional, client-side password encryption for exported save files - pure
// Web Crypto API (crypto.subtle), no dependency, no server involved at all.
// This is NOT meant to defend against a sophisticated, motivated attacker
// (see login.js's own disclaimer above PERSONAL_PASSWORD_HASH for the same
// honest framing about this app's threat model) - it's meant to stop the
// realistic case: someone stumbles on your exported .json file (synced
// folder, old phone, a Drive link) and opens it in a text editor. AES-256-
// GCM with a PBKDF2-derived key (250,000 iterations, SHA-256) is a solid,
// standard way to make that a dead end without a password.
//
// Envelope shape - what actually gets written to the export file once a
// password is set. Still plain, inspectable JSON (so a file explorer or
// "open with text editor" doesn't look broken/corrupt), just none of your
// real data is readable from it without the password:
//   { bizzybeeEncrypted: true, salt: "<base64>", iv: "<base64>", ciphertext: "<base64>" }
const CryptoLite = {
    ITERATIONS: 250000,

    _toBase64(buffer) {
        let binary = '';
        new Uint8Array(buffer).forEach(byte => { binary += String.fromCharCode(byte); });
        return btoa(binary);
    },

    _fromBase64(base64) {
        return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    },

    async _deriveKey(password, saltBytes) {
        const keyMaterial = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBytes, iterations: CryptoLite.ITERATIONS, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    // Returns the envelope above as a JSON string. A fresh random salt+iv
    // every call, so encrypting the exact same save twice in a row never
    // produces the same ciphertext (standard AES-GCM hygiene).
    async encrypt(plainText, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await CryptoLite._deriveKey(password, salt);
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plainText)
        );
        return JSON.stringify({
            bizzybeeEncrypted: true,
            salt: CryptoLite._toBase64(salt),
            iv: CryptoLite._toBase64(iv),
            ciphertext: CryptoLite._toBase64(ciphertext)
        });
    },

    // Throws on a wrong password (AES-GCM's built-in authentication tag
    // fails to verify - this is what actually catches a wrong password,
    // there's no separate "check the password" step) or a malformed
    // envelope. Callers must wrap this in a try/catch and show a real error
    // rather than letting garbage flow into Vault.importFullState.
    async decrypt(envelopeJsonString, password) {
        const envelope = JSON.parse(envelopeJsonString);
        if (!envelope || !envelope.bizzybeeEncrypted) {
            throw new Error('Not an encrypted Bizzybee save file.');
        }
        const salt = CryptoLite._fromBase64(envelope.salt);
        const iv = CryptoLite._fromBase64(envelope.iv);
        const ciphertext = CryptoLite._fromBase64(envelope.ciphertext);
        const key = await CryptoLite._deriveKey(password, salt);
        const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return new TextDecoder().decode(plainBuffer);
    },

    // Cheap shape-only pre-check so a caller (settings.js, login.js) can
    // decide whether to even prompt for a password before attempting a real
    // decrypt - never touches crypto.subtle, just looks at the JSON shape.
    isEncryptedEnvelope(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            return !!(parsed && parsed.bizzybeeEncrypted === true);
        } catch (error) {
            return false;
        }
    }
};
