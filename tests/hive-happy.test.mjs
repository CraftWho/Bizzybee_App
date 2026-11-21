// Happiness counts (Nov 21 2026, Craft: "happiness is not included in the auto rotate").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// reuse the hive-tend harness
const src = readFileSync(new URL('./hive-tend.test.mjs', import.meta.url), 'utf8');
const harness = src.slice(src.indexOf('const today'), src.indexOf("test('tend:"));
const mod = await import('data:text/javascript,' + encodeURIComponent(`import { readFileSync } from 'node:fs'; import vm from 'node:vm';\n${harness.replace(/new URL\('\.\.\/src\/core\/db\.js', import\.meta\.url\)/, JSON.stringify(new URL('../src/core/db.js', import.meta.url).pathname))}\nexport { bee, life, world, B, noon };`));
const { bee, life, world, B, noon } = mod;

test('happy: auto-swap sends an unhappy worker to play and brings in a happy one', async () => {
    const { v } = world([bee('sad', { class: 'cleaner', life: life({ happiness: 10, stamina: 90 }) }), bee('glad', { life: life({ happiness: 90, stamina: 100 }) })]);
    await v.init();
    v.state.hive.autoSwap = { on: true, pct: 30, returnPct: 80, mode: 'auto', pool: [] };
    v.autoSwapUnlocked = () => true;
    B(v, 'glad').talent = 'cleaner'; B(v, 'sad').talent = 'cleaner';   // start-up re-rolls test talents
    const notes = v._autoSwapHour();
    assert.ok(notes.some(n => /unhappy/.test(n)), notes.join(' | '));
    assert.equal(B(v, 'sad').class, null);
    assert.equal(B(v, 'sad').life.playFor, 'happy');
    assert.ok(B(v, 'sad').life.playUntil);
    assert.equal(B(v, 'glad').class, 'cleaner');
});

test('happy: an unhappy bee is never picked to fill in', async () => {
    const { v } = world([bee('tired', { class: 'cleaner', life: life({ happiness: 80, stamina: 5 }) }), bee('gloomy', { life: life({ happiness: 20, stamina: 100 }) })]);
    await v.init();
    v.state.hive.autoSwap = { on: true, pct: 30, returnPct: 80, mode: 'auto', pool: [] };
    v.autoSwapUnlocked = () => true;
    B(v, 'gloomy').talent = 'cleaner'; B(v, 'tired').talent = 'cleaner';
    v._autoSwapHour();
    assert.notEqual(B(v, 'gloomy').class, 'cleaner');
});

test('happy: without auto-swap a very unhappy worker plays on its own, and stays until it cheers up', async () => {
    const { v } = world([bee('sad', { class: 'cleaner', life: life({ happiness: 5, stamina: 90 }) })]);
    await v.init();
    const at = noon();
    v._careHour(at, at.toLocaleDateString('sv-SE'));
    const L = B(v, 'sad').life;
    assert.equal(B(v, 'sad').class, null);
    assert.equal(L.restFrom, 'cleaner');
    // break time is up but still unhappy -> keeps playing
    const later = new Date(at.getTime() + 5 * 3600000);
    L.happiness = 30;
    v._careHour(later, later.toLocaleDateString('sv-SE'));
    assert.ok(Date.parse(L.playUntil) > later.getTime());
    // happy again -> back to work
    const after = new Date(Date.parse(L.playUntil) + 60000);
    L.happiness = 70;
    v._careHour(after, after.toLocaleDateString('sv-SE'));
    assert.equal(B(v, 'sad').class, 'cleaner');
});

test('happy: a bee on a play break does not count as working', async () => {
    const { v } = world([bee('p', { class: 'cleaner', life: life({}) })]);
    await v.init();
    assert.equal(v._workers('cleaner').length, 1);
    B(v, 'p').life.playUntil = new Date(Date.now() + 3600000).toISOString();
    assert.equal(v._workers('cleaner').length, 0);
});
