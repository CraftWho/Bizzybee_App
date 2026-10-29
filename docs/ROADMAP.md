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
| **Home** | Stat strip (bees, XP today, streak, focus quest, steps, weather), a Today dropdown to check things off, Done today with times, and an app grid. History shows any past day. |
| **Habits** | Hexagon + / − buttons in difficulty colours (Trivial grey, Easy green, Medium gold, Hard red). Hold to reorder. Create / edit screen with difficulty, reset counter and tags. |
| **Dailies, To-Dos, Quests** | Full create / edit flows, checklists, due dates, schedules, reminders. |
| **The hive** | A mechanical hive outside, honeycomb inside. Honey grows with your bees and level; missed tasks and bad habits make cells decay. New bees hatch from their cell. |
| **Bee cards** | Collectible cards with rarity, element, stats and class. Pollination Chamber (gacha), Inventory, KeeperDex. |
| **Bee Models** | Every kind of bee (royals, life cycle, rarities, elements, Named titles, hive bees) stays a silhouette until you've met it. |
| **Leveling** | Character level bar with a Level Up celebration and rewards. Smart skills from plain words (no `#`), a honeycomb Skills page, real vs estimated time, and a path of milestones with rewards for each skill. |
| **Plugins** | Optional add-ons: Calendar, Dictionary, Study, Terminal. |
| **Look** | Themes (Halloween turns on by itself on Oct 31), comb-shaped buttons and hex icons. |
| **Social** | Visit friends' hives (look only) and read letters from the creator in the Mailbox. |
| **Accounts & saves** | Device saves with recovery copies, full save export / import, encrypted Cloud Sync with scheduled backups (see `CLOUD_SETUP.md`). |

## Next up

1. **One text system** - one place for fonts, sizes and colours, with simple presets in Settings.
2. **Hive Life management** - pick bees for each job from a simple list, see how each bee helps the hive, and get a red dot when a role is empty.
3. **Daily bonus and Claim All** - a honeycomb calendar of daily rewards and one button to claim everything waiting.
4. **Honey Store revamp** - item cards, tabs, search, buying more than one at a time, and gifts between friends.
5. **Titles** - earned titles shown on your profile, chosen for your header.
6. **Tester site** - a simple page to download the Android app or add BizzyBee to an iPhone home screen.
7. **Thumb pad** - pull the gold + out to use it as a one-handed controller.

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
