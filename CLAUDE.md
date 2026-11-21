# BizzyBee: notes for Claude

- **Theme rules are required for every UI change:** read `docs/THEME-RULES.md`.
  Short version: the standard box is black with a gold outline and a red top border;
  no text on the honeycomb; no see-through backgrounds; headings are their box's
  title bar; Courier Prime for titles/buttons/numbers, plain font for reading text;
  pop-ups are centered cards.
- **Privacy:** the repo is public. Never commit personal info (names, emails, places,
  health data). `tests/privacy.test.mjs` guards it; add private words with
  `node tools/privacy-add.mjs "word"`.
- Run the tests before every commit:
  `node --experimental-test-module-mocks --test tests/*.test.mjs`
