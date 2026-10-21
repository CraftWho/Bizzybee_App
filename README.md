# 🐝 Bizzybee

A gamified productivity app with a gold-and-black honeycomb look. You finish real tasks, earn Experience Points (XP), level up, and grow a hive of collectible bees.

It is a static web app: plain HTML, CSS and JavaScript, no framework and no build step. It installs on a phone as a Progressive Web App (PWA). Saves live in the browser, with optional encrypted Cloud Sync.

For what's built and what's next, see [ROADMAP.md](ROADMAP.md). For Cloud Sync setup, see [CLOUD_SETUP.md](CLOUD_SETUP.md).

## Run it locally

You only need a static file server. From the project folder:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

Any static server works (VS Code Live Server, `npx serve`, etc.).

On `localhost` you can sign in with the local dev login (see `src/local/admin.local.js`). It gives a plain on-device save and a 🛠 dev panel on every page. It never loads on the live site.

Cloud Sync, password reset, push reminders and the Terminal use Netlify Functions, so they only work on a Netlify deploy (or `netlify dev`).

## Run the checks

```bash
npm install
npm run check
```

`npm run check` checks every JavaScript file's syntax, checks the Settings page wiring, then runs the tests in `tests/`. Run it before every commit.

## Folder layout

```
index.html            the login page (the site's front door)
sw.js                 service worker: push reminders + downloaded packs
manifest.json         PWA install info
netlify.toml          Netlify config + redirects for moved pages
netlify/functions/    server functions (cloud save, backups, push, Terminal access)
netlify/lib/          code shared by those functions

src/core/             code every page shares
  boot.js             loads the shared files on every app page (see below)
  db.js               the Vault: the whole save, game rules and data helpers
  app.js              top bar, bottom dock, appearance settings, app start-up
  plugins.js          the plugin catalog and on/off switches
  global.css          base styles and theme colors
  data.json           the generic starter save
  crypto-lite.js      small crypto helpers
  login/              login page code, password reset, auth and recovery
  ui/                 shared interface pieces (bee card, toast, task rows,
                      pickers, Hive Mind menu, Eevee chat, page-v2 styles...)
  services/           background parts (cloud sync, push, reminders,
                      Habitica sync, folder backup, packs)
  dev-tools/          the local 🛠 panel

src/features/<page>/  one folder per page: <page>.html, .css, .js
src/plugins/<name>/   optional add-on pages (Calendar, Dictionary, Study, Terminal)
src/assets/           art: bees, icons, images, 3D model
src/local/            local-only dev login
tests/                automated tests (Node's built-in test runner)
tools/check.mjs       the `npm run check` script
```

## How a page is put together

Every app page loads the shared core with two lines:

```html
<head>
  <script src="../../core/boot.js" data-load="styles"></script>
  <!-- this page's extra styles, then its own .css -->
</head>
<body>
  ...
  <script src="../../core/boot.js"></script>
  <!-- this page's extra shared scripts, then its own .js -->
</body>
```

`boot.js` adds the shared styles and scripts in a fixed order: `db.js`, `plugins.js`, `app.js`, then the Hive Mind, toast, reminders and Eevee scripts. If a page needs another core file loaded before `app.js`, list it in `data-with`, using paths from `src/core/`:

```html
<script src="../../core/boot.js" data-with="crypto-lite.js login/auth.js"></script>
```

The pages that aren't part of the signed-in app load their files directly: the login page, onboarding, password reset, Request Access and Feedback.

## Adding a page

1. Make `src/features/<page>/` with `<page>.html`, `<page>.css` and `<page>.js`.
2. Copy the head and body pattern above from an existing page (Quests is a good one).
3. Put shared code in `src/core/ui/` or `src/core/services/`, not in a page folder.
4. Link to it from the Hive Mind menu (`src/core/ui/hive-mind/hive-mind.js`) or the home grid.

## Rules of the road

- **No personal data in the repo.** `src/core/data.json` is the generic starter save. Personal saves, notes and private docs are gitignored. Check `git status` before committing.
- **New UI gets a demo first.** Mock it up, get it reviewed, then build it into the app.
- **Keep pages self-contained.** Page code stays in its own folder. Only truly shared code goes in `src/core/`.
- **Original art and code.** Common UI patterns are fine; copying another app's art, code or overall look is not.
- **Zero cost.** Everything runs on free tiers (Netlify, Netlify Blobs, Netlify Identity).
- Run `npm run check` before committing.
