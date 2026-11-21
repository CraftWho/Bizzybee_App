# BizzyBee theme rules

Set by Craft, Nov 21 2026. Every page, pop-up and new feature follows these.

## 1. The standard box (the backplate)
Anything that holds text sits on the app's standard box:
- **black background**: `linear-gradient(var(--bb-surface-2), var(--bb-surface))`
- **gold outline**: `1px solid var(--bb-edge)`
- **red top border**: `2px solid var(--bb-alt)`

Use `.bb-plate` (or `.bb-box.bb-box--frame`). Inner pieces (rows, chips, fields)
inside a box may be tinted, but must be solid colors.

**Never** put text right on the honeycomb, and **never** give a box a
see-through background (`rgba(..., .05)`, `transparent`, a faded gradient).
The honeycomb lines show through and make the text hard to read.

## 2. Headings
A section heading is the **title bar of its box** (heading inside its box,
"option B"). A heading with no box after it gets its own plate.

## 3. Fonts
- **Courier Prime** (`var(--font-main)`): titles, labels, buttons, numbers.
- **Plain font** (`system-ui`): reading text (sentences, notes, descriptions).
- Monospace text only for code and the Terminal.

## 4. Pop-ups
Centered card over a dark screen (`rgba(0,0,0,.86)`), standard box look,
scrolls inside if tall. No sheets sliding up from the bottom.
(Hive Life comb rooms are full-screen on purpose.)

## 5. Buttons do what they say
A "Card" button opens the card itself, not a step before it.

## The safety net
`src/core/ui/title-bars/title-bars.js` runs on every app page and enforces 1 and
2 automatically: a see-through box on the honeycomb gets the standard box look
(`[data-bb-plated]`), headings become title bars, loose text gets a plate. It
also catches things that only appear later (unlocks, pop-ups).

The guard is a safety net, not the fix: new styles should follow the rules
directly. Check with `node tools/theme-check.mjs` (needs a local server and
Playwright) and `node --test tests/theme-rules.test.mjs`.
