// Happiness counts (Nov 21 2026, Craft: "happiness is not included in the auto rotate").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';   // Nov 24 2026 (Craft): .pathname gave "/C:/..." on Windows, so every test here failed on the PC

// reuse the hive-tend harness
const src = readFileSync(new URL('./hive-tend.test.mjs', import.meta.url), 'utf8');
const harness = src.slice(src.indexOf('const today'), src.indexOf("test('tend:"));
const mod = await import('data:text/javascript,' + encodeURIComponent(`import { readFileSync } from 'node:fs'; import vm from 'node:vm';\n${harness.replace(/new URL\('\.\.\/src\/core\/db\.js', import\.meta\.url\)/, JSON.stringify(fileURLToPath(new URL('../src/core/db.js', import.meta.url))))}\nexport { bee, life, world, B, noon };`));
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

// Nov 24 2026 (Craft): Grimzy (The Reaper) could not be rested at all, so a tired one never cleared.
test('title-locked bees: can Recuperate, keep their job, and go back to it', async () => {
    const { v } = world([bee('grim', { rarity: 'Named', title: 'reaper', class: 'undertaker', life: life({ stamina: 20, happiness: 80 }) })]);
    await v.init();
    const g = () => B(v, 'grim');
    g().class = 'undertaker';
    assert.ok(v.assignBeeClass('grim', 'recuperate'), 'rest is allowed');
    assert.equal(g().life.recuperate, true);
    assert.equal(g().class, 'undertaker');                       // the job is kept
    assert.equal(v.assignBeeClass('grim', 'cleaner'), null);    // still no other job
    assert.ok(v.assignBeeClass('grim', 'undertaker'));           // picking its job sends it back
    assert.equal(g().life.recuperate, undefined);
});

test('title-locked bees: too tired -> rests in place by itself; Auto-swap sends it back at Return at', async () => {
    const { v } = world([bee('grim', { rarity: 'Named', title: 'reaper', class: 'undertaker', life: life({ stamina: 5, happiness: 80 }) })]);
    await v.init();
    const g = () => B(v, 'grim');
    g().class = 'undertaker';
    const at = noon(), day = at.toLocaleDateString('sv-SE');
    v._careHour(at, day);
    assert.equal(g().life.recuperate, true); assert.equal(g().class, 'undertaker');
    v.state.hive.autoSwap = { on: true, pct: 30, returnPct: 80, mode: 'auto', pool: [] };
    v.autoSwapUnlocked = () => true;
    g().life.stamina = 50; v._careHour(at, day);
    assert.equal(g().life.recuperate, true);                     // not rested enough yet
    g().life.stamina = 85; v._careHour(at, day);
    assert.equal(g().life.recuperate, undefined);                // back at work
    assert.equal(g().class, 'undertaker');
});

test('title-locked bees: Auto-swap rests a tired one in place instead of skipping it', async () => {
    const { v } = world([bee('grim', { rarity: 'Named', title: 'reaper', class: 'undertaker', life: life({ stamina: 20, happiness: 80 }) })]);
    await v.init();
    B(v, 'grim').class = 'undertaker';
    v.state.hive.autoSwap = { on: true, pct: 30, returnPct: 80, mode: 'auto', pool: [] };
    v.autoSwapUnlocked = () => true;
    v.hiveOpenJobs = () => ['undertaker'];
    const notes = v._autoSwapHour();
    assert.ok(notes.some(n => /resting/.test(n)), notes.join(' | '));
    assert.equal(B(v, 'grim').life.recuperate, true); assert.equal(B(v, 'grim').class, 'undertaker');
});

// Nov 24 2026 (Craft): fixes from the review of the title-locked rest rules.
test('title-locked bees: swap % above Return at does not flip it between rest and work', async () => {
    const { v } = world([bee('grim', { rarity: 'Named', title: 'reaper', class: 'undertaker', life: life({ stamina: 55, happiness: 80 }) })]);
    await v.init();
    B(v, 'grim').class = 'undertaker';
    v.state.hive.autoSwap = { on: true, pct: 60, returnPct: 50, mode: 'auto', pool: [] };
    v.autoSwapUnlocked = () => true;
    v.hiveOpenJobs = () => ['undertaker'];
    assert.equal(v._autoSwapHour().length, 0);                   // 55 is above Return at: it keeps working
    assert.equal(B(v, 'grim').life.recuperate, undefined);
    B(v, 'grim').life.stamina = 45;
    assert.equal(v._autoSwapHour().length, 1);                   // below both: it rests
    const at = noon(), day = at.toLocaleDateString('sv-SE');
    v._careHour(at, day);
    assert.equal(B(v, 'grim').life.recuperate, true);            // and stays resting until Return at
});

test('title-locked bees: resting one with no job does not hand it the job', async () => {
    const { v } = world([bee('grim', { rarity: 'Named', title: 'reaper', life: life({ stamina: 20, happiness: 80 }) })]);
    await v.init();
    B(v, 'grim').class = null;
    assert.ok(v.assignBeeClass('grim', 'recuperate'));
    assert.equal(B(v, 'grim').class, null);
    assert.equal(B(v, 'grim').life.recuperate, true);
});

test('title-locked bees: Return / Work ends the rest by hand and keeps the job', async () => {
    const { v } = world([bee('grim', { rarity: 'Named', title: 'reaper', class: 'undertaker', life: life({ stamina: 80, happiness: 80 }) })]);
    await v.init();
    B(v, 'grim').class = 'undertaker';
    v.assignBeeClass('grim', 'recuperate');
    assert.ok(v.returnBeeToWork('grim'));
    assert.equal(B(v, 'grim').life.recuperate, undefined);
    assert.equal(B(v, 'grim').class, 'undertaker');
});

test('title-locked bees: not sent back to work while it must still rest after exhaustion', async () => {
    const { v } = world([bee('grim', { rarity: 'Named', title: 'reaper', class: 'undertaker', life: life({ stamina: 90, happiness: 80 }) })]);
    await v.init();
    const g = B(v, 'grim');
    g.class = 'undertaker'; g.life.recuperate = true;
    v.state.hive.autoSwap = { on: true, pct: 30, returnPct: 80, mode: 'auto', pool: [] };
    v.autoSwapUnlocked = () => true;
    const at = noon(), day = at.toLocaleDateString('sv-SE');
    g.life.restUntil = new Date(at.getTime() + 2 * 86400000).toLocaleDateString('sv-SE');
    v._careHour(at, day);
    assert.equal(B(v, 'grim').life.recuperate, true);
    delete B(v, 'grim').life.restUntil;
    v._careHour(at, day);
    assert.equal(B(v, 'grim').life.recuperate, undefined);
});
