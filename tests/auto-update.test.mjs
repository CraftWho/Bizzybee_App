// Nov 24 2026 (Craft): the auto-update switch (src/core/services/web-update/web-update.js).
// On: a ready update loads by itself, safely. Off: it waits for the Update button, as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/core/services/web-update/web-update.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = src.replace(/\nWebUpdate\.start\(\);\s*$/, '\n') + '\nglobalThis.WU = WebUpdate;';

// A tiny Android app: the BeeWeb plugin, the site's version.json, storage, and one page.
function app({ mine = 'v1', remote = 'v2', auto, updateFails = false } = {}) {
    const store = new Map();
    if (auto !== undefined) store.set('bb_web_update_auto', auto ? 'true' : 'false');
    const calls = { update: 0, restart: 0, toasts: [] };
    const page = { active: null, bodyClass: '', overlay: false, visibility: 'visible' };
    const plugin = {
        info: async () => ({ version: mine }),
        update: async () => { calls.update++; if (updateFails) throw new Error('No connection'); return { version: remote, downloaded: 3 }; },
        restart: () => { calls.restart++; },
        confirm: async () => {},
    };
    const el = (sel) => ({ matches: (q) => q.split(',').some(s => sel.includes(s.trim())), isContentEditable: false });
    const ctx = vm.createContext({
        window: { Capacitor: { Plugins: { BeeWeb: plugin } }, BB_SITE: 'https://site.test', BB_PERSONAL: false, BB_APP_COPY: true },
        localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
        navigator: { onLine: true },
        location: { pathname: '/src/features/home/home.html' },
        document: {
            get visibilityState() { return page.visibility; },
            get activeElement() { return page.active ? el(page.active) : null; },
            get body() { return { matches: (q) => !!page.bodyClass && q.includes(page.bodyClass) }; },
            querySelector: () => (page.overlay ? {} : null),
            addEventListener() {},
        },
        fetch: async (url) => ({ json: async () => (String(url).startsWith('https://site.test') ? { version: remote, batch: 'Version 1.1.0' } : { version: mine }) }),
        Toast: { show: (m) => calls.toasts.push(m) },
        setTimeout: (fn) => { fn(); return 0; }, Date, JSON, Promise, Number, String, Array, console,
    });
    vm.runInContext(code, ctx);
    return { WU: ctx.WU, calls, page, store };
}

test('auto-update: on by default, a ready update downloads and restarts by itself', async () => {
    const a = app();
    assert.equal(a.WU.autoOn(), true);
    await a.WU.check({ force: true });
    assert.equal(await a.WU.autoApply(), true);
    assert.equal(a.calls.update, 1);
    assert.equal(a.calls.restart, 1);
    assert.ok(a.calls.toasts.some(t => /Updating to/.test(t)), a.calls.toasts.join(' | '));
    assert.ok(!a.calls.toasts.some(t => /Update ready/.test(t)));   // no "tap to update" nag when it does it itself
});

test('auto-update: off, the update waits for the button', async () => {
    const a = app({ auto: false });
    await a.WU.check({ force: true });
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(a.calls.update, 0);
    assert.ok(a.WU.ready());                                         // still offered on the Updates page
    assert.ok(a.calls.toasts.some(t => /Update ready/.test(t)));
});

test('auto-update: never restarts while you type, on a form, with a pop-up open, or in the background', async () => {
    const a = app();
    await a.WU.check({ force: true });
    a.page.active = 'input'; assert.equal(await a.WU.autoApply(), false);
    a.page.active = null; a.page.bodyClass = '.task-form-page'; assert.equal(await a.WU.autoApply(), false);
    a.page.bodyClass = ''; a.page.overlay = true; assert.equal(await a.WU.autoApply(), false);
    a.page.overlay = false; a.page.visibility = 'hidden'; assert.equal(await a.WU.autoApply(), false);
    assert.equal(a.calls.update, 0);
    a.page.visibility = 'visible';
    assert.equal(await a.WU.autoApply(), true);                      // free again: it goes
    assert.equal(a.calls.update, 1);
});

test('auto-update: gives up after 2 tries of the same version, and the button still works', async () => {
    const a = app({ updateFails: true });
    await a.WU.check({ force: true });
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(a.calls.update, 2);                                 // the third time it did not even try
    assert.ok(a.WU.ready());
});

test('auto-update: nothing to do when the app is already on the newest files', async () => {
    const a = app({ mine: 'v2', remote: 'v2' });
    await a.WU.check({ force: true });
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(a.calls.update, 0);
});

test('auto-update: turning the switch back on clears the give-up count', async () => {
    const a = app({ updateFails: true });
    await a.WU.check({ force: true });
    await a.WU.autoApply(); await a.WU.autoApply();
    a.WU.setAuto(false); assert.equal(a.WU.autoOn(), false);
    a.WU.setAuto(true);
    await a.WU.autoApply();
    assert.equal(a.calls.update, 3);
});
