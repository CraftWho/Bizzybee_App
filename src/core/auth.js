console.log("/// AUTH SHARED ONLINE ///");

// Shared SHA-256 helper. Used by the Account PIN (db.js). The old personal
// login passcode that lived here was removed on 2026-10-08 - the local dev
// tools (src/local/admin.local.js, gitignored) replaced it.
const Auth = {
    async sha256Hex(text) {
        const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
};
