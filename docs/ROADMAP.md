# 🐝 Bizzybee - Roadmap

A shareable overview for contributors. What the app is, what's built, and where it's going.

## What Bizzybee is

A gamified productivity app with a gold-and-black honeycomb look. You finish real tasks, earn Experience Points (XP), level up, and grow a hive of collectible bees.

- **Habits**: tap + when you do something good, − when you slip.
- **Dailies**: repeating tasks with a schedule.
- **To-Dos**: one-off tasks with due dates and steps.
- **Quests**: bigger goals made of tasks.
- Everything you finish feeds your level, your hive's honey and your bee collection.

It is a static web app (HTML, CSS, plain JavaScript, no build step). Saves live in the browser, with optional encrypted Cloud Sync for invited testers.

## Built so far

| Area | What it does |
|---|---|
| **The egg (onboarding)** | Every new player gets an egg and raises it through egg → larva → pupa by doing real habits and To-Dos. It hatches into their King or Queen, a one-of-a-kind Royal card. The app opens once it hatches. |
| **Top bar + bottom dock** | The top bar shows your King/Queen, name and level bar on every page. The bottom dock is Habits / Dailies / hex + / To-Dos / Quests. The + creates whatever the current tab makes. |
| **Home** | Hive strip (bees, honey, decay), a Today dropdown to check things off, and an app grid. |
| **Habits** | Hexagon + / − buttons in difficulty colours (Trivial grey, Easy green, Medium gold, Hard red). Hold to reorder. Create / edit screen with difficulty, reset counter and tags. |
| **Dailies, To-Dos, Quests** | Full create / edit flows, checklists, due dates, schedules, reminders. |
| **The hive** | A mechanical hive outside, honeycomb inside. Honey grows with your bees and level; missed tasks and bad habits make cells decay. New bees hatch from their cell. |
| **Bee cards** | Collectible cards with rarity, element, stats and class. Pollination Chamber (gacha), Inventory, KeeperDex. |
| **Bee Models** | Every kind of bee (royals, life cycle, rarities, elements, Named titles, hive bees) stays a silhouette until you've met it. |
| **Leveling** | Character level bar with a Level Up celebration and rewards. Skill matrix and skill tree on the Dashboard / Skills pages. |
| **Plugins** | Optional add-ons: Calendar, Dictionary, Study, Terminal. |
| **Accounts & saves** | Device saves with recovery copies, full save export / import, encrypted Cloud Sync with scheduled backups (see `CLOUD_SETUP.md`). |

## Next up

1. **Shared Hive** - hives that more than one player can contribute to.
2. **Favor system** - a reputation / challenge loop between players and their hive.
3. **Dailies and To-Dos create screens** in the same style as the new habit screen.
4. **Bee mechanics** - stats, elements and classes exist but don't do anything yet (no battles or hive jobs).
5. **3D bee model** - started, paused.
6. **Calendar connections** - Google Calendar first if it ever happens; health-app connections are much harder from a browser.

## Ideas parking lot

- Real currency for the Pollination Chamber (pulls cost tickets for now).
- Themes beyond gold-and-black.
- An in-app companion character that comments on your progress.

## How the code is laid out

```
index.html               the login page (project root)
src/core/                shared code (db.js = the save, app.js = top bar + dock, boot.js = page loader)
src/core/login/          login, password reset, auth
src/core/ui/             shared interface pieces (bee card, toast, task rows...)
src/core/services/       background parts (cloud sync, push, reminders, Habitica)
src/features/<page>/     one folder per page (html + css + js)
src/plugins/<plugin>/    optional add-on pages
src/assets/              art (bees, icons, 3D)
tests/                   automated checks (run: npm run check)
```

See `README.md` for details.

## Rules of the road

- **No personal data in the repo.** `src/core/data.json` is the generic starter save. Personal saves and notes are gitignored.
- **New UI gets a demo first** and is reviewed before it's built into the app.
- **Keep pages self-contained.** Page code stays in its own folder; only truly shared code goes in `src/core/`.
- Run `npm run check` before committing.
