// Theme rules (Nov 21 2026, Craft): see docs/THEME-RULES.md.
// The safety net must stay in place, and the standard box must stay solid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('theme: the backplate guard loads on every app page', () => {
    const app = read('src/core/app.js');
    assert.match(app, /title-bars\/title-bars\.js/);
    assert.match(app, /title-bars\/title-bars\.css/);
    const g = read('src/core/ui/title-bars/title-bars.js');
    assert.match(g, /data-bb-plated/);
    assert.match(g, /MutationObserver/);
});

test('theme: the standard box is black with a gold outline and a red top border', () => {
    const css = read('src/core/global.css');
    const rule = css.split('\n').find(l => l.startsWith('.bb-plate, [data-bb-plated]'));
    assert.ok(rule, 'standard box rule missing');
    assert.match(rule, /--bb-surface/);
    assert.match(rule, /border: 1px solid var\(--bb-edge/);
    assert.match(rule, /border-top: 2px solid var\(--bb-alt/);
    // the surface colors themselves are solid
    for (const k of ['--bb-surface', '--bb-surface-2', '--bb-plate']) assert.match(css, new RegExp(`${k}: #[0-9a-f]{6};`, 'i'), `${k} must be a solid color`);
    // shared panel colors are solid too (they were 85-94% see-through)
    assert.doesNotMatch(css, /--panel-bg: rgba/);
});

test('theme: pop-ups are centered, not bottom sheets', () => {
    const css = read('src/core/global.css');
    assert.match(css, /POP-UPS ARE CENTERED CARDS/);
    assert.match(css, /align-items: center !important/);
});
