# Cloud Sync - how it works

Cloud Sync lets invited testers keep their progress across devices. It's optional; without it, saves stay in the browser.

## Pieces

- **Netlify Identity** - invite-only sign-in (no public sign-up).
- **Netlify Functions** in `netlify/functions/`: `save-state`, `load-state`, `backups`, `scheduled-backups`.
- **Netlify Blobs** - where the encrypted saves live.

## Security

- The client sends a sign-in token; the server checks it with Netlify Identity and uses the verified account ID to pick the save. Nobody can ask for someone else's save.
- Each save is encrypted with AES-256-GCM on the server before it's stored (a fresh IV every write, account ID authenticated with the data). This is encryption at rest managed by the server, not end-to-end.
- The encryption key is a Netlify environment variable (`BIZZYBEE_SAVE_KEY`, Functions only). It is never in git, `netlify.toml` or client code. Losing it makes existing saves unreadable.
- If the key is missing, cloud writes fail with a visible error. They never fall back to plain text.

## Behaviour

- Changes upload about 1.5 seconds after you make them, retry every 30 seconds while the app is open, and retry when the connection comes back.
- If two devices changed the save differently, the app pauses and asks which copy to keep instead of overwriting.
- Automatic cloud backups every 24 hours by default (4 / 8 / 12 / 24 hours in Settings), plus manual backups and restore. The latest 30 snapshots are kept.
- The device also keeps up to three local recovery copies before imports, resets and upgrades.
- Password reset is available from the login page and Settings → Account Security.

## Setting up a new deploy

1. Generate a random 32-byte key (64 hex characters) and add it in Netlify as `BIZZYBEE_SAVE_KEY`, available to Functions. Keep a safe copy.
2. Keep Netlify Identity on, with invite-only registration.
3. Deploy, then check the four functions above appear in Netlify.

## Testing

`npm run check` runs syntax checks, a Settings wiring check and the regression tests. The tests use synthetic saves, real AES-GCM and mocked Netlify responses. They never touch live accounts.

References: [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/), [scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/), [Identity](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/).
