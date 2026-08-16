console.log("/// AUTH SHARED ONLINE ///");

// Shared personal-passcode logic, factored out of login.js so a second
// locked surface (src/features/account-info/) can check the SAME passcode
// without duplicating the hash or the digest logic. Same honest framing as
// before: this is a casual-visitor deterrent on a static site with no
// backend, not real access control - a plain "view source" doesn't hand
// someone the real passcode (it's a SHA-256 hash, not plaintext), but it's
// still crackable offline by anyone motivated enough. Don't rely on this
// alone for anything you wouldn't be okay with a determined person
// eventually finding.
//
// To change your passcode: open a browser console anywhere and run
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-new-passcode'))
//     .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')))
// then paste the result in below (and keep login.js's copy of the same
// email/hash pair in sync - see the note over there).
const Auth = {
    PERSONAL_PASSWORD_HASH: '11ada1226bd5231a3b45a5f5132bd27f989daea4eaab2d8fee809012133f3ea7',
    // (default passcode is "hivekeeper" - change it, see instructions above)

    async sha256Hex(text) {
        const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async checkPersonalPasscode(password) {
        const hash = await Auth.sha256Hex(password);
        return hash === Auth.PERSONAL_PASSWORD_HASH;
    }
};
